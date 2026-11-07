/** Udyam Digital API (Hono). Runs on Node locally (server/dev.ts) and as a Vercel Function (api/[[...route]].ts).
 *  Every price, eligibility decision, KYC verdict and order status is computed here — never in the browser. */
import { resolve as resolvePath } from "node:path";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { PRODUCTS, product } from "./core/catalogue.ts";
import { PRODUCT_DESCRIPTION_HI, t } from "./core/i18n.ts";
import { assess, DOC_TYPES, KYC_ENGINE_VERSION, verdictOf, type Fields } from "./core/kyc.ts";
import { leadScore, route } from "./core/leadScore.ts";
import { quote } from "./core/pricing.ts";
import { defaultQuantity, recommend, validateCustomBundle } from "./core/recommend.ts";
import type { Bundle, DocType, GstStatus, KycFinding, Lang, Needs, Segment } from "./core/types.ts";
import { maskId, normaliseGstinStructure, repairGstinOcr, validateGstin, validateUdyam } from "./core/validators.ts";
import { dataset, loadDataset, localDatasetAvailable, SEGMENT_CODE } from "./data/dataset.ts";
import { MemoryStore, type OrderRecord, type OrderStatus, type Profile, type Store } from "./data/store.ts";
import { extractNeeds, llmConfigured, phraseExplanation } from "./services/llm.ts";
import { ocrServiceUp, readDocument, sha256 } from "./services/ocr.ts";

export const KYC_REFERENCE_DATE = process.env.KYC_REFERENCE_DATE ?? "2026-07-15"; // README: use 2026-07-15 as "today"
const NOTICE_VERSION = "kyc-notice-v1";
// Supabase when configured; otherwise local memory, snapshotted to a git-ignored file so a dev-server restart
// doesn't wipe a demo in progress. STORE=memory forces the local store (tests, offline demo).
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.STORE !== "memory";
const store: Store = useSupabase
  ? new (await import("./data/supabaseStore.ts")).SupabaseStore()
  : new MemoryStore(process.env.VERCEL ? undefined : resolvePath(import.meta.dirname, "data/private/store.local.json"));

export const app = new Hono().basePath("/api");
// Reference data must load before any route can work; say exactly what is missing instead of a bare 500.
let datasetError: string | null = null;
app.use(async (c, next) => {
  try {
    await loadDataset();
    datasetError = null;
  } catch (e) {
    datasetError = (e as Error).message;
    if (!c.req.path.endsWith("/health")) return c.json({ error: "dataset_unavailable", detail: datasetError }, 503);
  }
  await next();
});

// ---------------------------------------------------------------- helpers
const lang = (c: Context): Lang => (c.req.header("accept-language")?.startsWith("hi") ? "hi" : "en");

async function session(c: Context): Promise<string> {
  const s = c.req.header("x-session-id");
  if (!s || !/^[0-9a-f-]{36}$/.test(s)) throw new HttpError(401, "missing_session");
  if (!(await store.hasSession(s))) throw new HttpError(401, "unknown_session");
  return s;
}

class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 429, public code: string, public detail?: unknown) { super(code); }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.code, detail: err.detail }, err.status);
  if (err instanceof z.ZodError) return c.json({ error: "invalid_input", detail: err.issues.map((i) => i.path.join(".") + ": " + i.message) }, 400);
  console.error(err);
  return c.json({ error: "server_error" }, 500);
});

// Simple per-session rate limit for registry lookups so the simulated registry cannot be enumerated.
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t0) => now - t0 < windowMs);
  if (arr.length >= max) throw new HttpError(429, "too_many_lookups");
  arr.push(now);
  hits.set(key, arr);
}

function explainFailure(f: { rule: string; productId: string; params: Record<string, string | number> }, l: Lang) {
  const name = f.productId.includes(",") ? f.productId : (PRODUCTS.find((p) => p.id === f.productId)?.name ?? f.productId);
  return t(`rule.${f.rule}`, l, { ...f.params, product: name });
}
const explainFinding = (f: KycFinding, l: Lang) => ({ ...f, message: t(`kyc.${f.code}`, l, { ...f.params, document: t(`doc.${f.document}`, l) }) });

const publicGst = (r: ReturnType<typeof dataset>["gst"] extends Map<string, infer V> ? V : never) => ({
  gstin: r.gstin, legalName: r.legal_name, tradeName: r.trade_name, constitution: r.constitution,
  address: r.principal_place_of_business, state: r.state, registrationDate: r.registration_date, status: r.status, source: "SIMULATED",
});

// ---------------------------------------------------------------- system
app.get("/health", async (c) =>
  c.json({
    ok: !datasetError, store: store.mode, dataset: datasetError ? `unavailable: ${datasetError}` : dataset().source,
    supabaseConfigured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    llm: llmConfigured() ? "configured" : "structured_fallback", ocr: (await ocrServiceUp()) ? "service" : "cached_specimens", kycReferenceDate: KYC_REFERENCE_DATE,
  }, datasetError ? 503 : 200),
);
app.post("/session", async (c) => c.json({ sessionId: await store.createSession() }));

app.get("/catalogue", (c) =>
  c.json(PRODUCTS.map(({ id, category, name, description, unit, listPrice, setupFee, minContractMonths, installDays }) => ({ id, category, name, description, unit, listPrice, setupFee, minContractMonths, installDays }))),
);

let citiesCache: { city: string; state: string; tier: number }[] | null = null;
app.get("/cities", (c) => {
  citiesCache ??= [...new Map(dataset().leads.map((l) => [l.city, { city: l.city, state: l.state, tier: Number(l.city_tier) }])).values()].sort((a, b) => a.city.localeCompare(b.city));
  return c.json(citiesCache);
});

// ---------------------------------------------------------------- identity-first: simulated registry lookups
app.post("/registry/gstin", async (c) => {
  const s = await session(c);
  rateLimit(s);
  const { gstin } = z.object({ gstin: z.string().max(40) }).parse(await c.req.json());
  const g = repairGstinOcr(gstin) ?? normaliseGstinStructure(gstin);
  const rules = validateGstin(g);
  const failed = rules.filter((r) => !r.ok).map((r) => r.rule);
  if (failed.length) return c.json({ valid: false, gstin: g, failed, source: "SIMULATED" }, 422);
  const rec = dataset().gst.get(g);
  if (!rec) return c.json({ valid: true, found: false, gstin: g, source: "SIMULATED" }, 404);
  return c.json({ valid: true, found: true, record: publicGst(rec) });
});

app.post("/registry/udyam", async (c) => {
  const s = await session(c);
  rateLimit(s);
  const { udyam } = z.object({ udyam: z.string().max(40) }).parse(await c.req.json());
  const u = udyam.replace(/\s/g, "").toUpperCase();
  const failed = validateUdyam(u).filter((r) => !r.ok).map((r) => r.rule);
  if (failed.length) return c.json({ valid: false, udyam: u, failed, source: "SIMULATED" }, 422);
  const r = dataset().udyam.get(u);
  if (!r) return c.json({ valid: true, found: false, udyam: u, source: "SIMULATED" }, 404);
  return c.json({ valid: true, found: true, record: { udyamNumber: r.udyam_number, enterpriseName: r.enterprise_name, enterpriseType: r.enterprise_type, majorActivity: r.major_activity, state: r.state, city: r.city, source: "SIMULATED" } });
});

// ---------------------------------------------------------------- profile
const ProfileIn = z.object({
  businessName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(80),
  phoneLast4: z.string().regex(/^\d{4}$/).optional(),
  city: z.string().min(2).max(60),
  gstin: z.string().max(20).optional().nullable(),
  udyamNumber: z.string().max(25).optional().nullable(),
  language: z.enum(["en", "hi"]).default("en"),
});

app.put("/profile", async (c) => {
  const s = await session(c);
  const p = ProfileIn.parse(await c.req.json());
  const city = dataset().leads.find((l) => l.city.toLowerCase() === p.city.toLowerCase());
  if (!city) throw new HttpError(422, "unknown_city");
  // GST status is set ONLY from the registry, server-side.
  let gstStatus: GstStatus = "No GSTIN";
  let gstin: string | undefined, constitution: string | undefined;
  if (p.gstin) {
    gstin = repairGstinOcr(p.gstin) ?? normaliseGstinStructure(p.gstin);
    const rec = validateGstin(gstin).every((r) => r.ok) ? dataset().gst.get(gstin) : undefined;
    gstStatus = rec ? (rec.status as GstStatus) : "NotFound";
    constitution = rec?.constitution;
  }
  const udyamNumber = p.udyamNumber?.replace(/\s/g, "").toUpperCase() || undefined;
  const profile: Profile = {
    businessName: p.businessName, contactName: p.contactName, phoneLast4: p.phoneLast4, city: city.city, cityTier: Number(city.city_tier) as 1 | 2,
    state: city.state, constitution, gstin, gstStatus, udyamNumber, udyamVerified: !!(udyamNumber && dataset().udyam.get(udyamNumber)), language: p.language,
  };
  await store.saveProfile(s, profile);
  return c.json({ ...profile, gstin: profile.gstin ? maskId(profile.gstin) : undefined });
});

app.get("/profile", async (c) => {
  const p = await store.getProfile(await session(c));
  if (!p) throw new HttpError(404, "no_profile");
  return c.json({ ...p, gstin: p.gstin ? maskId(p.gstin) : undefined });
});

// ---------------------------------------------------------------- advisor
app.post("/advisor/parse", async (c) => {
  await session(c);
  const { text } = z.object({ text: z.string().min(2).max(1500) }).parse(await c.req.json());
  const { parsed, mode } = await extractNeeds(text);
  return c.json({ parsed, mode }); // the UI shows these as pre-filled answers the owner confirms
});

const NeedsIn = z.object({
  businessType: z.string().max(60).optional(),
  segment: z.enum(["micro", "prof", "multi", "mfg"]),
  employees: z.number().int().min(1).max(5000),
  sites: z.number().int().min(1).max(200),
  currentInternet: z.enum(["none", "mobile_hotspot", "home_broadband", "business_broadband", "leased_line", "mixed"]).optional(),
  priority: z.enum(["lowest_price", "reliability"]).optional(),
  wants: z.record(z.string(), z.union([z.boolean(), z.number().int().min(0).max(500)])).default({}),
});

async function needsFor(s: string, body: unknown): Promise<{ needs: Needs; profile: Profile }> {
  const profile = await store.getProfile(s);
  if (!profile) throw new HttpError(409, "profile_required");
  const n = NeedsIn.parse(body);
  return { profile, needs: { ...n, cityTier: profile.cityTier, city: profile.city, wants: n.wants as Needs["wants"] } };
}

const describe = (id: string, l: Lang) => (l === "hi" && PRODUCT_DESCRIPTION_HI[id]) || product(id).description;

function quoteView(bundle: Bundle, l: Lang) {
  const q = quote(bundle);
  return { ...q, lines: q.lines.map((x) => ({ ...x, description: describe(x.productId, l) })), language: l };
}

app.post("/recommend", async (c) => {
  const s = await session(c);
  const l = lang(c);
  const { needs, profile } = await needsFor(s, await c.req.json());
  const rec = recommend(needs, profile.gstStatus);
  await store.saveAdvisor({ sessionId: s, needs, recommendation: rec, mode: llmConfigured() ? "llm" : "structured", at: new Date().toISOString() });
  const items = rec.items.map((i) => ({ ...i, name: product(i.productId).name, reasonsText: i.reasons.map((r) => t(r, l)) }));
  const unmet = rec.unmet.map((u) => ({ ...u, reasonsText: [...new Set(u.failures.map((f) => explainFailure(f, l)))] }));
  // Exclusions and notes are shown verbatim on the plan screen; the summary covers only what is in the plan.
  const lines = items.map((i) => ({ name: i.name, quantity: i.quantity, reasons: i.reasonsText.join(" ") }));
  const summary = lines.length ? (await phraseExplanation(l, lines, needs)) ?? null : null;
  return c.json({
    recommendation: { ...rec, items, unmet, notesText: rec.notes.map((n) => t(n, l)), summary, summarySource: summary ? "llm" : "template" },
    addOns: rec.optionalAddOns.map((id) => ({ id, name: product(id).name, description: describe(id, l), defaultQuantity: defaultQuantity(id, needs), listPrice: product(id).listPrice, unit: product(id).unit })),
    quote: quoteView(rec.bundle, l),
    gstStatus: profile.gstStatus,
  });
});

/** Re-price a customer-edited bundle (add-on toggles). Invalid bundles are refused with explained reasons. */
app.post("/quote", async (c) => {
  const s = await session(c);
  const l = lang(c);
  const body = (await c.req.json()) as { needs: unknown; bundle: Bundle; save?: boolean };
  const { needs, profile } = await needsFor(s, body.needs);
  const bundle = z.record(z.string().regex(/^P\d{2}$/), z.number().int().min(1).max(500)).parse(body.bundle);
  const v = validateCustomBundle(needs, profile.gstStatus, bundle);
  if (!v.eligible) return c.json({ error: "ineligible_bundle", failures: v.failures.map((f) => ({ ...f, message: explainFailure(f, l) })) }, 422);
  const q = quoteView(bundle, l);
  if (!body.save) return c.json({ quote: q });
  const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const rec = await store.saveQuote({ sessionId: s, needs, bundle, quote: q, status: "draft", validUntil });
  return c.json({ quoteId: rec.id, quote: q, validUntil });
});

app.post("/quote/:id/accept", async (c) => {
  const s = await session(c);
  const q = await store.getQuote(c.req.param("id"));
  if (!q || q.sessionId !== s) throw new HttpError(404, "quote_not_found");
  // Re-check eligibility at acceptance (e.g. GSTIN cancelled after quoting).
  const profile = (await store.getProfile(s))!;
  const v = validateCustomBundle(q.needs, profile.gstStatus, q.bundle);
  if (!v.eligible) { await store.setQuoteStatus(q.id, "invalidated"); throw new HttpError(409, "quote_invalidated", v.failures); }
  await store.setQuoteStatus(q.id, "accepted");
  return c.json({ quoteId: q.id, status: "accepted" });
});

// ---------------------------------------------------------------- consent (DPDP: purpose-bound, versioned, withdrawable)
app.post("/consent", async (c) => {
  const s = await session(c);
  const { purpose, noticeVersion } = z.object({ purpose: z.enum(["registry_lookup", "kyc_verification", "order_communication"]), noticeVersion: z.literal(NOTICE_VERSION) }).parse(await c.req.json());
  return c.json(await store.addConsent({ sessionId: s, purpose, noticeVersion, lang: lang(c) }));
});
app.delete("/consent/:purpose", async (c) => {
  const s = await session(c);
  await store.withdrawConsent(s, c.req.param("purpose") as never);
  return c.json({ withdrawn: true });
});
app.get("/consent", async (c) => c.json(await store.activeConsents(await session(c))));

// ---------------------------------------------------------------- KYC
const MAGIC: [string, number[]][] = [["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["application/pdf", [0x25, 0x50, 0x44, 0x46]]];
const RETENTION_DAYS = 30; // prototype policy; production must follow DoT/TRAI KYC record-keeping rules

app.post("/kyc/upload", async (c) => {
  const s = await session(c);
  if (!(await store.activeConsents(s)).some((x) => x.purpose === "kyc_verification")) throw new HttpError(403, "consent_required");
  const form = await c.req.parseBody();
  const docType = z.enum(["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"]).parse(form.doc_type);
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "file_required");
  if (file.size > 4 * 1024 * 1024) throw new HttpError(422, "file_too_large"); // Vercel request limit is 4.5 MB
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!mime) throw new HttpError(422, "unsupported_file_type");
  const ocr = await readDocument(docType, buf, mime);
  // Data minimisation: in memory mode the image itself is not kept; only its hash and the fields the checks need.
  const keep = KEEP_FIELDS[docType];
  const fields = Object.fromEntries(Object.entries(ocr.fields).filter(([k]) => keep.includes(k)));
  if (fields.id_no) fields.id_no = maskId(fields.id_no);
  // Supabase mode keeps the image in a private bucket so a reviewer can look at REVIEW cases; deleted at retention.
  const storagePath = store.putDocumentImage ? await store.putDocumentImage(s, docType, buf, mime) : undefined;
  const rec = await store.saveKycDoc({ sessionId: s, docType, sha256: sha256(buf), sizeBytes: buf.length, mimeType: mime, sharpness: ocr.sharpness, skew: ocr.skew, fields, source: ocr.source, storagePath, retentionUntil: new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString() });
  return c.json({ id: rec.id, docType, source: ocr.source, sharpness: ocr.sharpness, skew: ocr.skew, fields });
});

const KEEP_FIELDS: Record<DocType, string[]> = {
  gst_certificate: ["gstin", "legal_name", "trade_name", "constitution", "address", "date_of_liability"],
  udyam_certificate: ["udyam_number", "enterprise_name", "major_activity", "city", "state", "date_of_registration"],
  signatory_id: ["name", "designation", "for_business", "id_no", "valid_till"],
  address_proof: ["billed_to", "address", "bill_date"],
};

app.post("/kyc/submit", async (c) => {
  const s = await session(c);
  const l = lang(c);
  const profile = await store.getProfile(s);
  if (!profile) throw new HttpError(409, "profile_required");
  const uploaded = await store.kycDocs(s);
  const docs: Partial<Record<DocType, Fields>> = {};
  const sharp: Partial<Record<DocType, number>> = {};
  const extra: KycFinding[] = [];
  for (const d of uploaded) {
    if (d.source === "unrecognised") { extra.push({ severity: "review", document: d.docType, code: "unrecognised_document", params: {} }); continue; }
    docs[d.docType] = d.fields;
    if (d.sharpness !== undefined) sharp[d.docType] = d.sharpness;
  }
  // Udyam fetched by lookup (with registry-lookup consent) instead of an upload.
  const lookupConsent = (await store.activeConsents(s)).some((x) => x.purpose === "registry_lookup");
  const ud = profile.udyamNumber ? dataset().udyam.get(profile.udyamNumber) : undefined;
  if (!docs.udyam_certificate && ud && lookupConsent) docs.udyam_certificate = { udyam_number: ud.udyam_number, enterprise_name: ud.enterprise_name, city: ud.city, state: ud.state };
  const required: DocType[] = ["signatory_id", "address_proof", ...(profile.gstin ? ["gst_certificate" as const] : []), ...(profile.udyamNumber && !docs.udyam_certificate ? ["udyam_certificate" as const] : [])];
  const registry = { gst: (g: string) => dataset().gst.get(g) ?? null, udyam: (u: string) => dataset().udyam.get(u) ?? null };
  const result = assess(docs, sharp, registry, { contactName: profile.contactName, gstin: profile.gstin, udyamNumber: profile.udyamNumber }, KYC_REFERENCE_DATE, required);
  for (const f of extra) result.findings = result.findings.filter((x) => !(x.document === f.document && x.code === "missing_document")).concat(f);
  result.verdict = verdictOf(result.findings);
  const kc = await store.saveKycCase({ sessionId: s, result, decidedBy: "engine" });
  return c.json({ kycCaseId: kc.id, verdict: result.verdict, findings: result.findings.map((f) => explainFinding(f, l)), engineVersion: KYC_ENGINE_VERSION, registrySource: "SIMULATED", referenceDate: KYC_REFERENCE_DATE });
});

app.get("/kyc", async (c) => {
  const s = await session(c);
  const kc = await store.latestKycCase(s);
  const docs = (await store.kycDocs(s)).map(({ docType, source, sharpness, uploadedAt }) => ({ docType, source, sharpness, uploadedAt }));
  return c.json({ docs, case: kc ? { ...kc, result: { ...kc.result, findings: kc.result.findings.map((f) => explainFinding(f, lang(c))) } } : null });
});

// ---------------------------------------------------------------- orders and tracker
const STEPS: OrderStatus[] = ["placed", "kyc_verified", "installation_scheduled", "installed", "activated"];
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);

app.post("/orders", async (c) => {
  const s = await session(c);
  const { quoteId } = z.object({ quoteId: z.string().uuid() }).parse(await c.req.json());
  const q = await store.getQuote(quoteId);
  if (!q || q.sessionId !== s) throw new HttpError(404, "quote_not_found");
  if (q.status !== "accepted") throw new HttpError(409, "quote_not_accepted");
  const kc = await store.latestKycCase(s);
  if (!kc || kc.result.verdict !== "PASS") throw new HttpError(409, "kyc_not_passed", kc?.result.verdict ?? "none");
  const today = new Date();
  const eta = q.quote.activationEtaDays;
  const order = await store.saveOrder({
    sessionId: s, quoteId, kycCaseId: kc.id, status: "kyc_verified", expectedActivationDate: addDays(today, eta + 1), slot: { date: addDays(today, Math.max(1, eta - 1)), window: "12-15" },
    history: [
      { status: "placed", note: "order.placed", at: today.toISOString() },
      { status: "kyc_verified", note: "order.kyc_verified", at: today.toISOString() },
    ],
  });
  return c.json(order);
});

app.get("/orders", async (c) => {
  const s = await session(c);
  const list = await store.orders(s);
  return c.json(await Promise.all(list.map(async (o) => ({ ...o, steps: STEPS, quote: (await store.getQuote(o.quoteId))?.quote }))));
});

// ---------------------------------------------------------------- demo helper: serve synthetic specimen documents
// Lets the demo (and judges) pick K01–K12 specimens without hunting for files. Disabled unless DEMO_SPECIMENS != "0".
app.get("/demo/specimens/:applicant/:docType", async (c) => {
  if (process.env.DEMO_SPECIMENS === "0") throw new HttpError(404, "disabled");
  const a = c.req.param("applicant"), d = c.req.param("docType");
  if (!/^K(0[1-9]|1[0-2])$/.test(a) || !(DOC_TYPES as string[]).includes(d)) throw new HttpError(400, "bad_specimen");
  try {
    let buf: Uint8Array;
    if (localDatasetAvailable()) {
      const { readFile } = await import("node:fs/promises");
      const { DATASET_DIR } = await import("./data/dataset.ts");
      buf = new Uint8Array(await readFile(resolvePath(DATASET_DIR, "kyc_documents", `${a}_${d}.png`)));
    } else {
      // Hosted: specimens live in a private bucket uploaded by scripts/seed-supabase.ts.
      const { supabaseAdmin } = await import("./data/supabaseStore.ts");
      const { data, error } = await supabaseAdmin().storage.from("kyc-specimens").download(`${a}_${d}.png`);
      if (error || !data) throw new Error("missing");
      buf = new Uint8Array(await data.arrayBuffer());
    }
    return c.body(buf as Uint8Array<ArrayBuffer>, 200, { "content-type": "image/png", "cache-control": "no-store" });
  } catch {
    throw new HttpError(404, "no_such_specimen");
  }
});

// ---------------------------------------------------------------- back office (demo key; production: Supabase role claim)
function backoffice(c: Context) {
  if (c.req.header("x-backoffice-key") !== (process.env.BACKOFFICE_KEY ?? "demo-backoffice")) throw new HttpError(403, "backoffice_only");
}

app.get("/backoffice/kyc-queue", async (c) => {
  backoffice(c);
  const profiles = new Map(await store.allProfiles());
  // Only each applicant's latest decision; a reviewer's PASS or a successful re-upload clears them from the queue.
  const latest = new Map<string, Awaited<ReturnType<typeof store.allKycCases>>[number]>();
  for (const k of await store.allKycCases()) latest.set(k.sessionId, k);
  const cases = [...latest.values()].filter((k) => k.result.verdict !== "PASS");
  return c.json(cases.map((k) => ({ id: k.id, verdict: k.result.verdict, business: profiles.get(k.sessionId)?.businessName, gstin: maskId(profiles.get(k.sessionId)?.gstin), createdAt: k.createdAt, findings: k.result.findings.filter((f) => f.severity !== "info").map((f) => explainFinding(f, "en")) })));
});

/** Reviewer view of a case's images: 60-second signed URLs from the private bucket (Supabase mode only). */
app.get("/backoffice/kyc/:id/documents", async (c) => {
  backoffice(c);
  const kc = (await store.allKycCases()).find((k) => k.id === c.req.param("id"));
  if (!kc) throw new HttpError(404, "case_not_found");
  const docs = await store.kycDocs(kc.sessionId);
  return c.json(await Promise.all(docs.map(async (d) => ({ docType: d.docType, source: d.source, url: d.storagePath && store.documentUrl ? await store.documentUrl(d.storagePath) : null }))));
});

app.post("/backoffice/kyc/:id/decide", async (c) => {
  backoffice(c);
  const { decision, note } = z.object({ decision: z.enum(["PASS", "REJECT"]), note: z.string().min(3).max(300) }).parse(await c.req.json());
  const kc = (await store.allKycCases()).find((k) => k.id === c.req.param("id"));
  if (!kc) throw new HttpError(404, "case_not_found");
  const saved = await store.saveKycCase({ sessionId: kc.sessionId, result: { ...kc.result, verdict: decision }, decidedBy: "reviewer", reviewerNote: note });
  return c.json(saved);
});

app.post("/backoffice/orders/:id/advance", async (c) => {
  backoffice(c);
  const o = await store.getOrder(c.req.param("id"));
  if (!o) throw new HttpError(404, "order_not_found");
  const next = STEPS[Math.min(STEPS.indexOf(o.status) + 1, STEPS.length - 1)];
  const updated: OrderRecord = { ...o, status: next, history: [...o.history, { status: next, note: `order.${next}`, at: new Date().toISOString() }] };
  await store.updateOrder(updated);
  return c.json(updated);
});

app.get("/backoffice/orders", async (c) => {
  backoffice(c);
  const profiles = new Map(await store.allProfiles());
  const all = await Promise.all([...profiles.keys()].map((s) => store.orders(s)));
  return c.json(all.flat().map((o) => ({ ...o, business: profiles.get(o.sessionId)?.businessName })));
});

/** Leads the advisor could not close (app sessions with unmet needs or no order) + the historical leads the rule
 *  score ranks highest among those lost to process friction. */
app.get("/backoffice/leads", async (c) => {
  backoffice(c);
  const profiles = new Map(await store.allProfiles());
  const sessionsWithOrders = new Set((await Promise.all([...profiles.keys()].map((s) => store.orders(s)))).flat().map((o) => o.sessionId));
  const live = (await store.listAdvisor())
    .filter((a) => a.recommendation.unmet.length || !sessionsWithOrders.has(a.sessionId))
    .map((a) => {
      const p = profiles.get(a.sessionId);
      const sc = leadScore({ gstStatus: p?.gstStatus ?? "No GSTIN", segment: a.needs.segment, employees: a.needs.employees });
      return { source: "app", business: p?.businessName, segment: a.needs.segment, route: route(a.needs.segment, a.needs.sites), score: sc.score, scoreReasons: sc.reasons, unmet: a.recommendation.unmet.map((u) => u.want), at: a.at };
    });
  const PROCESS = new Set(["Owner had no time for a visit", "Visit not scheduled by sales", "Quote took too long to arrive", "Quote too complex to understand", "Found paperwork too long", "Missing GST or Udyam document"]);
  const { leads, gst } = dataset();
  const historical = leads
    .filter((l) => PROCESS.has(l.drop_reason))
    .map((l) => {
      const segment = SEGMENT_CODE[l.segment] as Segment;
      const sc = leadScore({ gstStatus: gst.get(l.gstin)?.status ?? "No GSTIN", segment, employees: Number(l.employee_count), leadSource: l.lead_source });
      return { source: "dataset", leadId: l.lead_id, business: l.business_name, city: l.city, segment, route: route(segment, Number(l.num_sites)), score: sc.score, scoreReasons: sc.reasons, dropReason: l.drop_reason, leadSource: l.lead_source };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  return c.json({ live, historical });
});

export { DOC_TYPES };
