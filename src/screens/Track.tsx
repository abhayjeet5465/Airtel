import { useEffect, useState } from "react";
import { api, inr } from "../api.ts";
import { tr } from "../i18n.ts";
import { useJourney } from "../state.tsx";
import { Button } from "../ui.tsx";

const fmt = (d: string, lang: string) => new Date(d).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });

export function Track() {
  const { j, set, reset, lang } = useJourney();
  const [order, setOrder] = useState<any>(j.order);

  useEffect(() => {
    const load = () => api<any[]>("GET", "/orders").then((os) => { const o = os.find((x) => x.id === j.order?.id) ?? os[0]; if (o) { setOrder(o); set({ order: o }); } }).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!order) return null;
  const steps: string[] = order.steps ?? ["placed", "kyc_verified", "installation_scheduled", "installed", "activated"];
  const labels = tr("orderSteps", lang) as Record<string, string>;
  const doneAt = Object.fromEntries((order.history ?? []).map((h: any) => [h.status, h.at]));
  const current = steps.indexOf(order.status);

  return (
    <div className="space-y-6">
      <h1 className="text-[1.75rem] leading-tight font-bold">{tr("trackTitle", lang)}</h1>
      <div className="rounded-xl border border-line bg-white p-5">
        <p className="text-sm text-ink-soft">{tr("expected", lang)}</p>
        <p className="text-[2rem] leading-tight font-bold">{fmt(order.expectedActivationDate, lang)}</p>
        <p className="mt-1 text-ink-soft">{tr("technician", lang)}: {fmt(order.slot.date, lang)}, {order.slot.window.replace("-", ":00–")}:00</p>
        {order.quote && <p className="mt-1 text-ink-soft num">{inr(order.quote.monthlyInclGst, 2)} {tr("perMonth", lang)}</p>}
      </div>

      <ol className="relative ml-3 border-l-2 border-line">
        {steps.map((s, i) => {
          const done = i <= current;
          return (
            <li key={s} className="relative pl-6 pb-5 last:pb-0">
              <span className={`absolute -left-[9px] top-1.5 size-4 rounded-full border-2 ${done ? "bg-leaf border-leaf" : i === current + 1 ? "bg-white border-marigold" : "bg-white border-line"}`} aria-hidden />
              <p className={done ? "font-semibold" : "text-ink-soft"}>{labels[s]}</p>
              {doneAt[s] && <p className="text-sm text-ink-soft">{new Date(doneAt[s]).toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}
            </li>
          );
        })}
      </ol>
      <p className="text-ink-soft">{tr("noCallNeeded", lang)}</p>
      <Button kind="quiet" onClick={reset}>{tr("startOver", lang)}</Button>
    </div>
  );
}
