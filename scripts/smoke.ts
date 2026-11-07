/** End-to-end API smoke test against the in-process app (no server needed). Runs two specimen journeys:
 *  K12 (clean -> order + tracker) and K11 (stale bill -> NEEDS_ACTION, order refused). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// BASE_URL=https://… runs the same journeys against a deployed site; otherwise in-process.
const BASE = process.env.BASE_URL?.replace(/\/$/, "");
const app = BASE ? null : (await import("../server/app.ts")).app;

const KYC = resolve(import.meta.dirname, "../../YTL_TrackA_Udyam_Digital_Data/kyc_documents");
let sid = "";
async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const isForm = body instanceof FormData;
  const send = (url: string, init: RequestInit) => (BASE ? fetch(`${BASE}${url}`, init) : app!.request(url, init));
  const res = await send(`/api${path}`, {
    method,
    headers: { ...(sid ? { "x-session-id": sid } : {}), ...(isForm || !body ? {} : { "content-type": "application/json" }), ...extra },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function journey(app_id: string, gstin: string, city: string, contact: string, business: string, segment: string, wants: object) {
  console.log(`\n=== ${app_id}: ${business}`);
  sid = (await call("POST", "/session")).json.sessionId;
  const g = await call("POST", "/registry/gstin", { gstin });
  console.log("gstin lookup:", g.status, g.json.record?.status, g.json.record?.tradeName);
  const p = await call("PUT", "/profile", { businessName: business, contactName: contact, city, gstin, language: "en" });
  console.log("profile:", p.status, p.json.gstStatus, p.json.cityTier, p.json.gstin);
  const needs = { segment, employees: 25, sites: 3, priority: "reliability", wants };
  const r = await call("POST", "/recommend", needs);
  console.log("recommend:", r.status, r.json.recommendation?.bundle, "unmet:", r.json.recommendation?.unmet.map((u: any) => u.want), "₹/mo incl GST:", r.json.quote?.monthlyInclGst);
  console.log("summary:", r.json.recommendation?.summarySource, r.json.recommendation?.summary ?? "");
  const addOn = r.json.addOns?.[0];
  if (addOn) {
    const t = await call("POST", "/quote", { needs, bundle: { ...r.json.recommendation.bundle, [addOn.id]: addOn.defaultQuantity } });
    console.log(`toggle +${addOn.id}:`, t.status, t.json.quote?.monthlyInclGst);
  }
  const bad = await call("POST", "/quote", { needs, bundle: { P23: 4 } });
  console.log("invalid bundle (CCTV without internet):", bad.status, bad.json.failures?.[0]?.message);
  const saved = await call("POST", "/quote", { needs, bundle: r.json.recommendation.bundle, save: true });
  await call("POST", `/quote/${saved.json.quoteId}/accept`);
  const noConsent = await call("POST", "/kyc/upload", new FormData());
  console.log("upload without consent:", noConsent.status, noConsent.json.error);
  await call("POST", "/consent", { purpose: "kyc_verification", noticeVersion: "kyc-notice-v1" });
  for (const dt of ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"]) {
    const f = new FormData();
    f.set("doc_type", dt);
    f.set("file", new Blob([readFileSync(resolve(KYC, `${app_id}_${dt}.png`))], { type: "image/png" }), `${dt}.png`);
    const u = await call("POST", "/kyc/upload", f);
    console.log(`  upload ${dt}:`, u.status, u.json.source, Object.keys(u.json.fields ?? {}).length, "fields");
  }
  const k = await call("POST", "/kyc/submit");
  console.log("KYC:", k.json.verdict, k.json.findings?.filter((f: any) => f.severity !== "info").map((f: any) => f.message));
  const o = await call("POST", "/orders", { quoteId: saved.json.quoteId });
  console.log("order:", o.status, o.json.status ?? o.json.error, o.json.expectedActivationDate ?? o.json.detail);
  if (o.status === 200) console.log("tracker:", (await call("GET", "/orders")).json[0].history.map((h: any) => h.status));
}

console.log((await call("GET", "/health")).json);
await journey("K12", "37NBLXS1145E1ZU", "Visakhapatnam", "Pooja Agarwal", "Star Electronics", "multi", { payments: true, cctvCameras: 6, backupInternet: true, phoneLines: 3 });
await journey("K11", "03KGZXT1320R1ZZ", "Ludhiana", "Vikram Pillai", "Trinity Bake House Pvt Ltd", "multi", { payments: true, whatsapp: true });
const bo = await call("GET", "/backoffice/kyc-queue", undefined, { "x-backoffice-key": "demo-backoffice" });
console.log("\nback-office queue:", bo.json.map((x: any) => [x.business, x.verdict, x.gstin]));
const leads = await call("GET", "/backoffice/leads", undefined, { "x-backoffice-key": "demo-backoffice" });
console.log("leads: live", leads.json.live.length, "historical top:", leads.json.historical.slice(0, 2).map((l: any) => [l.business, l.score, l.dropReason]));
