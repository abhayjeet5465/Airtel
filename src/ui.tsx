import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ kind = "primary", className = "", busy, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "quiet"; busy?: boolean }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const kinds = {
    primary: "bg-marigold text-ink hover:bg-marigold-deep px-5 py-3 text-[17px] shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]",
    secondary: "border border-ink/25 text-ink hover:border-ink px-4 py-2.5",
    quiet: "text-ink-soft underline underline-offset-4 hover:text-ink px-1 py-1",
  };
  return (
    <button className={`${base} ${kinds[kind]} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy && <span className="size-4 rounded-full border-2 border-ink/30 border-t-ink animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-semibold mb-1">{label}</span>
      {children}
      {help && !error && <span className="block text-sm text-ink-soft mt-1">{help}</span>}
      {error && <span className="block text-sm text-alert mt-1" role="alert">{error}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-line bg-white px-3.5 py-3 text-[17px] focus:border-ink focus:outline-none";

export function Counter({ value, onChange, min = 0, max = 500, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white" role="group" aria-label={label}>
      <button type="button" className="px-3 py-2 text-xl leading-none disabled:opacity-30" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} −`}>−</button>
      <span className="num w-10 text-center font-semibold">{value}</span>
      <button type="button" className="px-3 py-2 text-xl leading-none disabled:opacity-30" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} +`}>+</button>
    </div>
  );
}

const tones = {
  ok: "border-leaf/30 bg-leaf/5 text-leaf",
  warn: "border-amber/30 bg-amber/5 text-amber",
  bad: "border-alert/30 bg-alert/5 text-alert",
  info: "border-line bg-white text-ink-soft",
};
export function Notice({ tone = "info", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`}>{children}</div>;
}

export function Steps({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <ol className="flex gap-1.5" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className="flex-1 min-w-0" aria-current={i === current ? "step" : undefined}>
          <div className={`h-1 rounded-full ${i < current ? "bg-ink" : i === current ? "bg-marigold" : "bg-line"}`} />
          <span className={`mt-1.5 block truncate text-xs ${i === current ? "text-ink font-semibold" : "text-ink-soft"}`}>{l}</span>
        </li>
      ))}
    </ol>
  );
}
