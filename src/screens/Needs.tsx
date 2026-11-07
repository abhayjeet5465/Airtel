import { useState } from "react";
import { api } from "../api.ts";
import { tr, WANTS } from "../i18n.ts";
import { useJourney, type NeedsDraft } from "../state.tsx";
import { Button, Counter, Notice } from "../ui.tsx";

const SEGMENTS = ["micro", "prof", "multi", "mfg"] as const;
const DEFAULT_COUNT: Record<string, number> = { cctvCameras: 4, phoneLines: 2, emailUsers: 5, securityDevices: 3, callChannels: 2, machineDevices: 5, fleetVehicles: 2 };

export function Needs() {
  const { j, set, lang } = useJourney();
  const [n, setN] = useState<NeedsDraft>(j.needs ?? { segment: "micro", employees: 3, sites: 1, priority: "lowest_price", wants: { payments: true } });
  const [text, setText] = useState("");
  const [parsedNote, setParsedNote] = useState("");
  const [busy, setBusy] = useState<"" | "parse" | "plan">("");
  const [error, setError] = useState("");

  const upd = (p: Partial<NeedsDraft>) => setN((prev) => ({ ...prev, ...p }));
  const toggle = (key: string, count?: boolean) =>
    setN((prev) => {
      const wants = { ...prev.wants };
      if (wants[key]) delete wants[key];
      else wants[key] = count ? DEFAULT_COUNT[key] ?? 1 : true;
      return { ...prev, wants };
    });

  async function fill() {
    setBusy("parse");
    try {
      const { parsed } = await api("POST", "/advisor/parse", { text });
      setN((prev) => ({
        ...prev,
        ...(parsed.segment ? { segment: parsed.segment } : {}),
        ...(parsed.employees ? { employees: parsed.employees } : {}),
        ...(parsed.sites ? { sites: parsed.sites } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.businessType ? { businessType: parsed.businessType } : {}),
        wants: { ...prev.wants, ...Object.fromEntries(Object.entries(parsed.wants ?? {}).filter(([, v]) => v).map(([k, v]) => [k, v === true ? true : Number(v) || DEFAULT_COUNT[k] || 1])) },
      }));
      setParsedNote(tr("filledBy", lang));
    } catch {
      setError(tr("errorGeneric", lang));
    } finally {
      setBusy("");
    }
  }

  async function plan() {
    setBusy("plan");
    setError("");
    try {
      const r = await api("POST", "/recommend", n);
      set({ needs: n, rec: r, bundle: r.recommendation.bundle, quote: r.quote, quoteId: undefined, kyc: undefined, order: undefined, step: 2 });
    } catch {
      setError(tr("errorGeneric", lang));
    } finally {
      setBusy("");
    }
  }

  const kinds = tr("kinds", lang) as Record<string, string>;
  const prios = tr("priorities", lang) as Record<string, string>;

  return (
    <div className="space-y-7">
      <h1 className="text-[1.75rem] leading-tight font-bold">{tr("needsTitle", lang)}</h1>

      <section className="space-y-2">
        <label className="block font-semibold" htmlFor="free">{tr("freeTextLabel", lang)}</label>
        <textarea id="free" rows={3} className="w-full rounded-lg border border-line bg-white px-3.5 py-3 focus:border-ink focus:outline-none" placeholder={tr("freeTextPlaceholder", lang)} value={text} onChange={(e) => setText(e.target.value)} />
        <Button kind="secondary" onClick={fill} busy={busy === "parse"} disabled={text.trim().length < 5}>{tr("fillForMe", lang)}</Button>
        {parsedNote && <p className="text-sm text-leaf">{parsedNote}</p>}
      </section>

      <fieldset className="space-y-2">
        <legend className="font-semibold mb-2">{tr("kind", lang)}</legend>
        <div className="grid grid-cols-2 gap-2">
          {SEGMENTS.map((s) => (
            <button key={s} type="button" onClick={() => upd({ segment: s })} aria-pressed={n.segment === s}
              className={`rounded-lg border px-3 py-3 text-left leading-snug ${n.segment === s ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/50"}`}>
              {kinds[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-6">
        <div><p className="font-semibold mb-2">{tr("staff", lang)}</p><Counter label={tr("staff", lang)} value={n.employees} min={1} max={5000} onChange={(v) => upd({ employees: v })} /></div>
        <div><p className="font-semibold mb-2">{tr("sites", lang)}</p><Counter label={tr("sites", lang)} value={n.sites} min={1} max={200} onChange={(v) => upd({ sites: v })} /></div>
      </div>

      <fieldset>
        <legend className="font-semibold mb-2">{tr("priority", lang)}</legend>
        <div className="inline-flex rounded-lg border border-line bg-white p-1">
          {(["lowest_price", "reliability"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={n.priority === p} onClick={() => upd({ priority: p })}
              className={`rounded-md px-3 py-2 ${n.priority === p ? "bg-ink text-white" : "text-ink-soft"}`}>{prios[p]}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">{tr("whatNeed", lang)}</legend>
        <p className="text-sm text-ink-soft mb-3">{tr("needsInternetNote", lang)}</p>
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {WANTS.map((w) => {
            const on = !!n.wants[w.key];
            return (
              <li key={w.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input type="checkbox" className="size-5 accent-[#1b2a4a]" checked={on} onChange={() => toggle(w.key, w.count)} />
                  <span>{lang === "hi" ? w.hi : w.en}</span>
                </label>
                {w.count && on && (
                  <Counter label={w.en} value={Number(n.wants[w.key])} min={1} onChange={(v) => setN((prev) => ({ ...prev, wants: { ...prev.wants, [w.key]: v } }))} />
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex items-center gap-3">
        <Button kind="secondary" onClick={() => set({ step: 0 })}>{tr("back", lang)}</Button>
        <Button className="flex-1" onClick={plan} busy={busy === "plan"}>{tr("seePlan", lang)}</Button>
      </div>
    </div>
  );
}
