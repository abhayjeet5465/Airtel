/** Checks the configured LLM and Supabase credentials without printing them. */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const { extractNeeds, phraseExplanation } = await import("../server/services/llm.ts");

const probe = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: process.env.LLM_MODEL, messages: [{ role: "user", content: "Reply with OK" }], max_tokens: 5 }),
});
console.log("Groq probe:", probe.status, (await probe.text()).slice(0, 240));
const models = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` } });
const ids = ((await models.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
console.log("Groq models:", ids.join(", "));

const t0 = Date.now();
const r = await extractNeeds("Hamari 2 dukan hai, 8 log kaam karte hain. UPI billing aur 4 CCTV camera chahiye, WhatsApp pe customers se baat karte hain.");
console.log(`LLM extract (${Date.now() - t0} ms):`, r.mode, JSON.stringify(r.parsed));
const s = await phraseExplanation("hi", ["Biz Fibre 100: steady wired internet for UPI, billing and calls.", "Cloud CCTV: You asked for this."], { segment: "micro", cityTier: 2, employees: 8, sites: 2, wants: {} });
console.log("LLM explain:", s ?? "(rejected or unavailable -> template)");

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  console.log("Supabase REST:", res.status, res.ok ? "reachable" : await res.text());
}
