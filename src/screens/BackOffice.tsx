import { useEffect, useState } from "react";
import { Button, Notice } from "../ui.tsx";

const KEY = "demo-backoffice";
const bo = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`/api/backoffice${path}`, { method, headers: { "x-backoffice-key": localStorage.getItem("udyam.bokey") ?? KEY, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.json();
};

export function BackOffice() {
  const [queue, setQueue] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [leads, setLeads] = useState<{ live: any[]; historical: any[] }>({ live: [], historical: [] });
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([bo("GET", "/kyc-queue"), bo("GET", "/orders"), bo("GET", "/leads")])
      .then(([q, o, l]) => { setQueue(q); setOrders(o); setLeads(l); setError(""); })
      .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: "PASS" | "REJECT") => { await bo("POST", `/kyc/${id}/decide`, { decision, note: `Reviewer ${decision.toLowerCase()} in back office` }); load(); };
  const advance = async (id: string) => { await bo("POST", `/orders/${id}/advance`); load(); };

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-bold leading-tight">Back office</h1>
          <p className="text-ink-soft">For Accel sales, partners and KYC reviewers</p>
        </div>
        <Button kind="secondary" onClick={load}>Refresh</Button>
      </header>
      {error && <Notice tone="bad">{error}</Notice>}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">KYC cases needing a person ({queue.length})</h2>
        {queue.length === 0 && <p className="text-ink-soft">No open cases. Applications that pass checks never reach this list.</p>}
        <ul className="space-y-3">
          {queue.map((k) => (
            <li key={k.id} className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{k.business} <span className="font-normal text-ink-soft num">{k.gstin}</span></p>
                <span className={`rounded px-2 py-0.5 text-sm font-semibold ${k.verdict === "REJECT" ? "bg-alert/10 text-alert" : k.verdict === "REVIEW" ? "bg-ink/10" : "bg-amber/10 text-amber"}`}>{k.verdict.replace("_", " ").toLowerCase()}</span>
              </div>
              <ul className="mt-2 space-y-1 text-[15px]">{k.findings.map((f: any, i: number) => <li key={i}>{f.message}</li>)}</ul>
              {k.verdict === "REVIEW" && (
                <div className="mt-3 flex gap-2">
                  <Button kind="secondary" onClick={() => decide(k.id, "PASS")}>Approve</Button>
                  <Button kind="quiet" onClick={() => decide(k.id, "REJECT")}>Reject</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Orders ({orders.length})</h2>
        <table className="w-full text-left text-[15px]">
          <thead className="text-ink-soft"><tr><th className="py-1 font-normal">Business</th><th className="font-normal">Status</th><th className="font-normal">Promised by</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {orders.map((o) => (
              <tr key={o.id}><td className="py-2">{o.business}</td><td>{o.status.replaceAll("_", " ")}</td><td className="num">{o.expectedActivationDate}</td>
                <td className="text-right">{o.status !== "activated" && <Button kind="quiet" onClick={() => advance(o.id)}>Advance (demo)</Button>}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Leads the advisor could not close</h2>
        <p className="text-ink-soft max-w-[70ch]">Score is a transparent rule (active GSTIN, business size, source), not a black box. It matched a trained model on last quarter's leads. Micro and single-site offices route to self-serve; multi-site and manufacturers route to a person.</p>
        <table className="w-full text-left text-[15px]">
          <thead className="text-ink-soft"><tr><th className="py-1 font-normal">Business</th><th className="font-normal">Route</th><th className="font-normal">Score</th><th className="font-normal">Why it stalled</th></tr></thead>
          <tbody className="divide-y divide-line">
            {[...leads.live, ...leads.historical.slice(0, 15)].map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-2">{l.business}<span className="block text-xs text-ink-soft">{l.source === "app" ? "This app" : `${l.leadId} · ${l.city}`}</span></td>
                <td>{l.route === "assisted" ? "Assisted" : "Self-serve"}</td>
                <td className="num" title={l.scoreReasons.join(", ")}>{l.score}</td>
                <td>{l.source === "app" ? (l.unmet.length ? `Wanted ${l.unmet.join(", ")}` : "Did not order") : l.dropReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
