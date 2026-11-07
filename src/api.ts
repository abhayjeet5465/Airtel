/** Thin API client. Session id lives in localStorage; every request carries the UI language. */
export type Lang = "en" | "hi";

let sessionId = localStorage.getItem("udyam.session") ?? "";
let language: Lang = (localStorage.getItem("udyam.lang") as Lang) ?? "en";

export const setLanguage = (l: Lang) => { language = l; localStorage.setItem("udyam.lang", l); };
export const getLanguage = () => language;

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: any) { super(code); }
}

async function ensureSession() {
  if (sessionId) return;
  const r = await fetch("/api/session", { method: "POST" });
  sessionId = (await r.json()).sessionId;
  localStorage.setItem("udyam.session", sessionId);
}

export function resetSession() {
  sessionId = "";
  localStorage.removeItem("udyam.session");
}

export async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  await ensureSession();
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "x-session-id": sessionId, "accept-language": language, ...(body && !isForm ? { "content-type": "application/json" } : {}), ...headers },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || json.error === "profile_required") {
      resetSession();
      window.dispatchEvent(new CustomEvent("udyam:session-lost"));
    }
    throw new ApiError(res.status, json.error ?? "error", json);
  }
  return json as T;
}

export const inr = (n: number, decimals = 0) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
