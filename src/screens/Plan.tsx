import { useState } from "react";
import { api, ApiError, inr } from "../api.ts";
import { tr } from "../i18n.ts";
import { useJourney } from "../state.tsx";
import { Button, Notice } from "../ui.tsx";

export function Plan() {
  const { j, set, lang } = useJourney();
  const rec = j.rec.recommendation;
  const addOns: any[] = j.rec.addOns;
  const [bundle, setBundle] = useState<Record<string, number>>(j.bundle ?? rec.bundle);
  const [quote, setQuote] = useState<any>(j.quote);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const reasonsFor = (id: string): string[] => rec.items.find((i: any) => i.productId === id)?.reasonsText ?? [];
  const isAddOn = (id: string) => !rec.items.some((i: any) => i.productId === id);

  async function toggle(a: any) {
    const next = { ...bundle };
    if (next[a.id]) delete next[a.id];
    else next[a.id] = a.defaultQuantity;
    setBlocked([]);
    try {
      const r = await api("POST", "/quote", { needs: j.needs, bundle: next });
      setBundle(next);
      setQuote(r.quote);
      setTick((t) => t + 1);
      set({ bundle: next, quote: r.quote });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setBlocked(e.body.failures.map((f: any) => f.message));
      else setError(tr("errorGeneric", lang));
    }
  }

  async function accept() {
    setBusy(true);
    try {
      const saved = await api("POST", "/quote", { needs: j.needs, bundle, save: true });
      await api("POST", `/quote/${saved.quoteId}/accept`);
      set({ quoteId: saved.quoteId, quote: saved.quote, bundle, step: 3 });
    } catch {
      setError(tr("errorGeneric", lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
    <h1 className="text-[1.75rem] leading-tight font-bold">{tr("planTitle", lang)}</h1>
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="order-2 lg:order-1 space-y-6">
        {rec.summary && (
          <div className="space-y-1">
            <p className="text-lg leading-relaxed">{rec.summary}</p>
            <p className="text-xs text-ink-soft">{(tr("explainedBy", lang) as any).llm}</p>
          </div>
        )}
        <p className="text-ink-soft">{rec.notesText[0]}</p>

        {rec.unmet.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{tr("notPossible", lang)}</h2>
            <ul className="space-y-2">
              {rec.unmet.map((u: any) => (
                <li key={u.want}><Notice tone="warn">{u.reasonsText.join(" ")}</Notice></li>
              ))}
            </ul>
          </section>
        )}
        {rec.notesText.slice(1).map((t: string) => <Notice key={t}>{t}</Notice>)}

        {addOns.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-semibold">{tr("extras", lang)}</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {addOns.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-1 size-5 accent-[#1b2a4a]" checked={!!bundle[a.id]} onChange={() => toggle(a)} />
                    <span className="flex-1">
                      <span className="flex justify-between gap-2 font-semibold"><span>{a.name}</span><span className="num">+{inr(a.listPrice * a.defaultQuantity)}</span></span>
                      <span className="block text-sm text-ink-soft">{a.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {blocked.map((b) => <Notice key={b} tone="bad">{b}</Notice>)}
          </section>
        )}
      </div>

      <aside className="order-1 lg:order-2 lg:sticky lg:top-6">
        <div className="bill rounded-t-xl px-5 pt-5 pb-6">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">{j.profile?.businessName}</p>
            <p className="text-xs text-ink-soft num">{new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN")}</p>
          </div>
          <ul className="mt-4 space-y-3">
            {quote.lines.map((l: any) => (
              <li key={l.productId}>
                <div className="flex justify-between gap-3">
                  <span className="font-semibold leading-snug">{l.name}{isAddOn(l.productId) && <span className="ml-1.5 text-xs font-normal text-ink-soft">+</span>}</span>
                  <span className="num">{inr(l.monthly)}</span>
                </div>
                <div className="flex justify-between gap-3 text-sm text-ink-soft">
                  <span>{reasonsFor(l.productId).join(" ") || l.description}</span>
                  <span className="num shrink-0">{l.quantity} × {inr(l.unitPrice)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="bill-rule my-4" />
          <dl className="space-y-1 text-[15px]">
            <div className="flex justify-between"><dt className="text-ink-soft">{tr("monthly", lang)}</dt><dd className="num">{inr(quote.monthlyExGst)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{tr("gst", lang)}</dt><dd className="num">{inr(quote.monthlyGst, 2)}</dd></div>
          </dl>
          <div key={tick} className={`mt-3 -mx-2 rounded px-2 py-1 ${tick ? "total-changed" : ""}`}>
            <p className="text-sm text-ink-soft">{tr("monthlyTotal", lang)}</p>
            <p className="num text-[2.4rem] leading-none font-bold">{inr(quote.monthlyInclGst, 2)}</p>
          </div>
          <div className="bill-rule my-4" />
          <dl className="grid grid-cols-2 gap-y-2 text-[15px]">
            <dt className="text-ink-soft">{tr("setup", lang)}</dt><dd className="num text-right">{inr(quote.setupExGst + quote.setupGst, 2)}</dd>
            <dt className="text-ink-soft">{tr("firstPayment", lang)}</dt><dd className="num text-right font-semibold">{inr(quote.firstPaymentInclGst, 2)}</dd>
            <dt className="text-ink-soft">{tr("contract", lang)}</dt><dd className="num text-right">{quote.contractMonths} {tr("months", lang)}</dd>
            <dt className="text-ink-soft">{tr("readyIn", lang)}</dt><dd className="num text-right">{quote.activationEtaDays} {tr("days", lang)}</dd>
          </dl>
          <p className="mt-4 text-xs text-ink-soft">{tr("priceNote", lang)}</p>
        </div>
        <div className="mt-6 space-y-3">
          {error && <Notice tone="bad">{error}</Notice>}
          <Button className="w-full" onClick={accept} busy={busy}>{tr("acceptPlan", lang)}</Button>
          <Button kind="quiet" onClick={() => set({ step: 1 })}>{tr("back", lang)}</Button>
        </div>
      </aside>
    </div>
    </div>
  );
}
