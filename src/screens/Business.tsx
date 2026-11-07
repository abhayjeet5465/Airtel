import { useEffect, useState } from "react";
import { api, ApiError } from "../api.ts";
import { tr } from "../i18n.ts";
import { useJourney } from "../state.tsx";
import { Button, Field, inputCls, Notice } from "../ui.tsx";

type City = { city: string; state: string; tier: number };

const cityFromAddress = (address: string, cities: City[]) => {
  const parts = address.split(",").map((s) => s.trim());
  return cities.find((c) => parts.some((p) => p.toLowerCase() === c.city.toLowerCase()))?.city ?? "";
};

export function Business() {
  const { j, set, lang } = useJourney();
  const [cities, setCities] = useState<City[]>([]);
  const [gstin, setGstin] = useState(j.gstin ?? "");
  const [noGst, setNoGst] = useState(!!j.profile && !j.profile.gstin);
  const [record, setRecord] = useState<any>(j.registry ?? null);
  const [lookupError, setLookupError] = useState("");
  const [busy, setBusy] = useState(false);
  const [businessName, setBusinessName] = useState(j.profile?.businessName ?? "");
  const [contactName, setContactName] = useState(j.profile?.contactName ?? "");
  const [city, setCity] = useState(j.profile?.city ?? "");
  const [udyam, setUdyam] = useState(j.udyam ?? "");
  const [error, setError] = useState("");

  useEffect(() => { api<City[]>("GET", "/cities").then(setCities).catch(() => setError(tr("errorGeneric", lang))); }, [lang]);

  async function lookup() {
    setBusy(true);
    setLookupError("");
    try {
      const r = await api("POST", "/registry/gstin", { gstin });
      setRecord(r.record);
      setBusinessName(r.record.tradeName);
      setCity(cityFromAddress(r.record.address, cities));
      setGstin(r.record.gstin);
    } catch (e) {
      setRecord(null);
      setLookupError(e instanceof ApiError && e.status === 404 ? tr("gstinNotFound", lang) : tr("gstinInvalid", lang));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const profile = await api("PUT", "/profile", {
        businessName, contactName, city, language: lang,
        gstin: noGst ? null : gstin || null,
        udyamNumber: udyam || null,
      });
      set({ profile, registry: noGst ? null : record, gstin: noGst ? undefined : gstin, udyam, step: 1 });
    } catch (e) {
      setError(e instanceof ApiError && e.code === "unknown_city" ? tr("chooseCity", lang) : tr("errorGeneric", lang));
    } finally {
      setBusy(false);
    }
  }

  const statusTone = record?.status === "Active" ? "ok" : record ? "warn" : "info";
  const canSave = businessName.length > 1 && contactName.length > 1 && city && (noGst || record || lookupError);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-[2.1rem] leading-[1.1] font-bold tracking-tight">{tr("heroTitle", lang)}</h1>
        <p className="text-ink-soft max-w-[34ch]">{tr("heroBody", lang)}</p>
      </header>

      {!noGst && (
        <section className="space-y-3">
          <Field label={tr("gstinLabel", lang)} help={tr("gstinHelp", lang)} error={lookupError}>
            <div className="flex gap-2">
              <input
                className={`${inputCls} uppercase tracking-[0.12em] num`}
                value={gstin}
                maxLength={15}
                autoComplete="off"
                spellCheck={false}
                placeholder="27AAAXA0000A1Z5"
                onChange={(e) => { setGstin(e.target.value.toUpperCase().replace(/\s/g, "")); setRecord(null); }}
                onKeyDown={(e) => e.key === "Enter" && gstin.length === 15 && lookup()}
              />
              <Button kind="secondary" className="whitespace-nowrap" onClick={lookup} busy={busy && !record} disabled={gstin.length !== 15}>{tr("findBusiness", lang)}</Button>
            </div>
          </Field>
          <Button kind="quiet" onClick={() => { setNoGst(true); setRecord(null); setLookupError(""); }}>{tr("noGst", lang)}</Button>
        </section>
      )}

      {record && (
        <section className="rounded-xl border border-line bg-white p-4 space-y-2">
          <p className="text-sm text-ink-soft">{tr("weFound", lang)}</p>
          <p className="text-xl font-semibold leading-tight">{record.tradeName}</p>
          <p className="text-ink-soft">{record.legalName} · {record.constitution}</p>
          <p className="text-ink-soft">{record.address}</p>
          <Notice tone={statusTone as "ok" | "warn"}>
            <span className="font-semibold">{tr("status", lang)}: </span>
            {record.status === "Active" ? tr("statusActive", lang) : record.status === "Cancelled" ? tr("statusCancelled", lang) : tr("statusSuspended", lang)}
          </Notice>
          <p className="text-xs text-ink-soft">{tr("simulated", lang)}</p>
        </section>
      )}

      {(record || noGst || lookupError) && (
        <section className="space-y-4">
          <Field label={tr("businessName", lang)}>
            <input className={inputCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
          <Field label={tr("yourName", lang)} help={tr("yourNameHelp", lang)}>
            <input className={inputCls} value={contactName} autoComplete="name" onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label={tr("city", lang)}>
            <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{tr("chooseCity", lang)}</option>
              {cities.map((c) => <option key={c.city} value={c.city}>{c.city}, {c.state}</option>)}
            </select>
          </Field>
          <Field label={tr("udyamOptional", lang)}>
            <input className={`${inputCls} uppercase num`} value={udyam} placeholder="UDYAM-MH-00-0000000" onChange={(e) => setUdyam(e.target.value.toUpperCase())} />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button onClick={save} busy={busy} disabled={!canSave} className="w-full">{tr("continue", lang)}</Button>
        </section>
      )}
    </div>
  );
}
