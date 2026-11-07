import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api.ts";
import { tr } from "../i18n.ts";
import { useJourney } from "../state.tsx";
import { Button, Notice } from "../ui.tsx";

const DOC_LABEL: Record<string, { en: string; hi: string }> = {
  gst_certificate: { en: "GST certificate", hi: "GST प्रमाणपत्र" },
  udyam_certificate: { en: "Udyam certificate", hi: "उद्यम प्रमाणपत्र" },
  signatory_id: { en: "ID of the person signing", hi: "हस्ताक्षर करने वाले की ID" },
  address_proof: { en: "Electricity bill from the last 3 months", hi: "पिछले 3 महीनों का बिजली बिल" },
};
const SAMPLES = Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`);
const verdictTone = { PASS: "ok", NEEDS_ACTION: "warn", REVIEW: "info", REJECT: "bad" } as const;

export function Documents() {
  const { j, set, lang } = useJourney();
  const p = j.profile;
  const [consented, setConsented] = useState<boolean | null>(null);
  const [agreeKyc, setAgreeKyc] = useState(false);
  const [agreeLookup, setAgreeLookup] = useState(true);
  const [lookupOk, setLookupOk] = useState(false);
  const [docs, setDocs] = useState<Record<string, { state: "idle" | "reading" | "read" | "error"; name?: string }>>({});
  const [result, setResult] = useState<any>(j.kyc ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("GET", "/consent").then((cs: any[]) => {
      setConsented(cs.some((c) => c.purpose === "kyc_verification"));
      setLookupOk(cs.some((c) => c.purpose === "registry_lookup"));
    }).catch(() => setConsented(false));
    // After a reload, show documents already uploaded in this session instead of empty slots.
    api("GET", "/kyc").then((k: any) => {
      setDocs(Object.fromEntries(k.docs.map((d: any) => [d.docType, { state: "read" }])));
    }).catch(() => {});
  }, []);

  const udyamFetched = !!(p?.udyamVerified && lookupOk);
  const slots = ["signatory_id", "address_proof", ...(p?.gstin ? ["gst_certificate"] : []), ...(p?.udyamNumber && !udyamFetched ? ["udyam_certificate"] : [])].sort(
    (a, b) => ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"].indexOf(a) - ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"].indexOf(b),
  );

  async function giveConsent() {
    setBusy(true);
    try {
      await api("POST", "/consent", { purpose: "kyc_verification", noticeVersion: "kyc-notice-v1" });
      if (agreeLookup && p?.udyamNumber) { await api("POST", "/consent", { purpose: "registry_lookup", noticeVersion: "kyc-notice-v1" }); setLookupOk(true); }
      setConsented(true);
    } catch { setError(tr("errorGeneric", lang)); } finally { setBusy(false); }
  }

  async function upload(docType: string, file: File) {
    setDocs((d) => ({ ...d, [docType]: { state: "reading", name: file.name } }));
    setResult(null);
    const f = new FormData();
    f.set("doc_type", docType);
    f.set("file", file);
    try {
      await api("POST", "/kyc/upload", f);
      setDocs((d) => ({ ...d, [docType]: { state: "read", name: file.name } }));
    } catch (e) {
      setDocs((d) => ({ ...d, [docType]: { state: "error", name: e instanceof ApiError ? e.code : "error" } }));
    }
  }

  async function useSample(k: string) {
    for (const dt of slots) {
      const r = await fetch(`/api/demo/specimens/${k}/${dt}`);
      if (r.ok) await upload(dt, new File([await r.blob()], `${k}_${dt}.png`, { type: "image/png" }));
      else setDocs((d) => ({ ...d, [dt]: { state: "idle" } }));
    }
  }

  async function check() {
    setBusy(true);
    setError("");
    try {
      const r = await api("POST", "/kyc/submit");
      setResult(r);
      set({ kyc: r });
    } catch { setError(tr("errorGeneric", lang)); } finally { setBusy(false); }
  }

  async function order() {
    setBusy(true);
    try {
      const o = await api("POST", "/orders", { quoteId: j.quoteId });
      set({ order: o, step: 4 });
    } catch { setError(tr("errorGeneric", lang)); } finally { setBusy(false); }
  }

  if (consented === null) return null;
  if (!consented) {
    return (
      <div className="space-y-5">
        <h1 className="text-[1.75rem] leading-tight font-bold">{tr("consentTitle", lang)}</h1>
        <p className="text-lg leading-relaxed max-w-[60ch]">{tr("consentBody", lang)}</p>
        <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1 size-5 accent-[#1b2a4a]" checked={agreeKyc} onChange={(e) => setAgreeKyc(e.target.checked)} /><span>{tr("consentKyc", lang)}</span></label>
        {p?.udyamNumber && <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1 size-5 accent-[#1b2a4a]" checked={agreeLookup} onChange={(e) => setAgreeLookup(e.target.checked)} /><span>{tr("consentLookup", lang)}</span></label>}
        {error && <Notice tone="bad">{error}</Notice>}
        <Button className="w-full" disabled={!agreeKyc} busy={busy} onClick={giveConsent}>{tr("agree", lang)}</Button>
      </div>
    );
  }

  const allRead = slots.every((s) => docs[s]?.state === "read");
  const findings = (result?.findings ?? []).filter((f: any) => f.severity !== "info");
  const verdicts = tr("verdict", lang) as Record<string, string>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.75rem] leading-tight font-bold">{tr("docsTitle", lang)}</h1>
        <label className="text-sm text-ink-soft">
          {tr("sampleFrom", lang)}{" "}
          <select className="ml-1 rounded border border-line bg-white px-2 py-1" defaultValue="" onChange={(e) => e.target.value && useSample(e.target.value)}>
            <option value="">—</option>
            {SAMPLES.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
      </div>

      <ul className="space-y-3">
        {slots.map((dt) => <Slot key={dt} docType={dt} label={DOC_LABEL[dt][lang]} state={docs[dt]} onFile={(f) => upload(dt, f)} findings={findings.filter((f: any) => f.document === dt)} />)}
        {udyamFetched && <li><Notice tone="ok">{DOC_LABEL.udyam_certificate[lang]}: {tr("notNeeded", lang)}</Notice></li>}
      </ul>

      {result && (
        <section className="space-y-2" aria-live="polite">
          <Notice tone={verdictTone[result.verdict as keyof typeof verdictTone]}>
            <p className="font-semibold text-lg">{verdicts[result.verdict]}</p>
            {result.verdict === "REVIEW" && <p className="text-sm mt-1">{tr("reviewEta", lang)}</p>}
            {findings.filter((f: any) => !slots.includes(f.document)).map((f: any) => <p key={f.code} className="mt-1 text-ink">{f.message}</p>)}
          </Notice>
          <p className="text-xs text-ink-soft">{tr("simulated", lang)}</p>
        </section>
      )}

      {error && <Notice tone="bad">{error}</Notice>}
      {result?.verdict === "PASS" ? (
        <div className="space-y-2">
          <Button className="w-full" onClick={order} busy={busy}>{tr("payAndOrder", lang)}</Button>
          <p className="text-xs text-ink-soft text-center">{tr("paySimulated", lang)}</p>
        </div>
      ) : (
        <Button className="w-full" onClick={check} busy={busy} disabled={!allRead}>{tr("checkDocs", lang)}</Button>
      )}
    </div>
  );
}

function Slot({ docType, label, state, onFile, findings }: { docType: string; label: string; state?: { state: string; name?: string }; onFile: (f: File) => void; findings: any[] }) {
  const { lang } = useJourney();
  const ref = useRef<HTMLInputElement>(null);
  const s = state?.state ?? "idle";
  const tone = findings.some((f) => f.severity === "reject") ? "border-alert/50" : findings.length ? "border-amber/50" : s === "read" ? "border-leaf/40" : "border-line";
  return (
    <li className={`rounded-xl border bg-white px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-ink-soft truncate">
            {s === "reading" ? tr("reading", lang) : s === "read" ? [tr("read", lang), state?.name].filter(Boolean).join(" · ") : s === "error" ? state?.name : ""}
          </p>
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,application/pdf" capture="environment" className="sr-only" id={`f-${docType}`} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button kind="secondary" onClick={() => ref.current?.click()} busy={s === "reading"}>{s === "read" ? tr("replace", lang) : tr("upload", lang)}</Button>
      </div>
      {findings.map((f) => <p key={f.code} className={`mt-2 text-[15px] ${f.severity === "reject" ? "text-alert" : "text-amber"}`}>{f.message}</p>)}
    </li>
  );
}
