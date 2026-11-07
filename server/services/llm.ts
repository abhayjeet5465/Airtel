/** Provider-agnostic LLM client (OpenAI-compatible chat API; Groq by default). Used ONLY to
 *  (1) turn free text into structured needs and (2) phrase explanations. Never chooses products or prices. */
import { z } from "zod";
import type { Lang, Needs, Segment } from "../core/types.ts";

const PROVIDERS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};
const TIMEOUT_MS = 6000;

export const llmConfigured = () => !!process.env.LLM_API_KEY;

async function chat(system: string, user: string, json: boolean): Promise<string | null> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const url = PROVIDERS[process.env.LLM_PROVIDER ?? "groq"] ?? process.env.LLM_PROVIDER!;
  const model = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1200,
        // gpt-oss models reason before answering; keep it short so the advisor stays under the timeout.
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? null;
  } catch {
    return null; // timeout / network / provider outage -> caller falls back
  } finally {
    clearTimeout(timer);
  }
}

const count = z.coerce.number().int().min(0).max(500).optional();
// Models sometimes answer a flag with a description ("UPI billing") instead of true.
const flag = z.preprocess((v) => (typeof v === "string" ? !/^(false|no|none|0|)$/i.test(v.trim()) : v), z.boolean()).optional();
const ParsedNeeds = z.object({
  businessType: z.string().max(60).optional(),
  segment: z.enum(["micro", "prof", "multi", "mfg"]).optional(),
  employees: z.coerce.number().int().min(1).max(5000).optional(),
  sites: z.coerce.number().int().min(1).max(200).optional(),
  currentInternet: z.enum(["none", "mobile_hotspot", "home_broadband", "business_broadband", "leased_line", "mixed"]).optional(),
  priority: z.enum(["lowest_price", "reliability"]).optional(),
  wants: z.object({
    payments: flag, whatsapp: flag, sms: flag, website: flag,
    cctvCameras: count, guestWifi: flag, phoneLines: count, emailUsers: count, backupInternet: flag,
    securityDevices: count, centralManagement: flag, dedicatedBandwidth: flag, machineDevices: count,
    fleetVehicles: count, cloudBackup: flag, tollFree: flag, callChannels: count,
    staticIp: flag, firewall: flag,
  }).partial().default({}),
});
export type ParsedNeeds = z.infer<typeof ParsedNeeds>;

const EXTRACT_PROMPT = `You extract facts about an Indian small business from the owner's message (English, Hindi or Hinglish).
Return ONLY JSON with these optional keys (omit anything not stated; never guess):
businessType (short English noun), segment ("micro" shop/salon/kirana | "prof" clinic/CA/coaching office | "multi" several outlets | "mfg" factory/unit),
employees (int), sites (int), currentInternet ("none"|"mobile_hotspot"|"home_broadband"|"business_broadband"|"leased_line"|"mixed"),
priority ("lowest_price"|"reliability"),
wants: { payments (UPI/POS/billing), whatsapp, sms, website, cctvCameras (int), guestWifi, phoneLines (int), emailUsers (int),
 backupInternet, securityDevices (int), centralManagement, dedicatedBandwidth, machineDevices (int), fleetVehicles (int), cloudBackup,
 tollFree, callChannels (int), staticIp, firewall }.
Do not mention products, brands or prices.`;

export async function extractNeeds(text: string): Promise<{ parsed: ParsedNeeds; mode: "llm" | "keywords" }> {
  const raw = await chat(EXTRACT_PROMPT, text.slice(0, 1500), true);
  if (raw) {
    try {
      const parsed = ParsedNeeds.safeParse(dropNulls(JSON.parse(raw)));
      if (parsed.success) return { parsed: parsed.data, mode: "llm" };
      if (!process.env.VERCEL) console.warn("LLM needs rejected by schema:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    } catch { /* fall through */ }
  }
  return { parsed: keywordNeeds(text), mode: "keywords" };
}

/** Models often send null for "not mentioned"; treat that as absent. */
function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
  return v;
}

/** Deterministic fallback parser (English + Hindi keywords). */
export function keywordNeeds(text: string): ParsedNeeds {
  const s = text.toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  const num = (re: RegExp) => { const m = re.exec(s); return m ? Number(m[1]) : undefined; };
  const wants: ParsedNeeds["wants"] = {};
  if (has("upi", "pos", "billing", "bill ", "payment", "बिलिंग", "भुगतान", "यूपीआई")) wants.payments = true;
  if (has("whatsapp", "व्हाट्सएप", "वॉट्सऐप")) wants.whatsapp = true;
  if (has("sms", "एसएमएस")) wants.sms = true;
  if (has("website", "वेबसाइट", "online shop")) wants.website = true;
  if (has("cctv", "camera", "कैमरा", "सीसीटीवी")) wants.cctvCameras = num(/(\d+)\s*(?:cctv|camera|कैमरा)/) ?? 4;
  if (has("wifi", "wi-fi", "वाईफाई", "वाई-फाई")) wants.guestWifi = true;
  if (has("email", "ईमेल")) wants.emailUsers = num(/(\d+)\s*(?:email|ईमेल)/);
  if (has("backup internet", "failover", "बैकअप")) wants.backupInternet = true;
  if (has("antivirus", "security", "ransomware", "सुरक्षा")) wants.securityDevices = num(/(\d+)\s*(?:pc|computer|laptop|कंप्यूटर)/);
  if (has("leased line", "dedicated", "लीज़्ड")) wants.dedicatedBandwidth = true;
  if (has("phone line", "sim", "mobile line", "सिम")) wants.phoneLines = num(/(\d+)\s*(?:sim|phone|line|सिम)/) ?? 1;
  if (has("toll free", "toll-free", "1800")) wants.tollFree = true;
  if (has("cloud backup", "backup data", "डेटा बैकअप")) wants.cloudBackup = true;
  if (has("firewall", "फ़ायरवॉल")) wants.firewall = true;
  if (has("gps", "fleet", "vehicle", "गाड़ी")) wants.fleetVehicles = num(/(\d+)\s*(?:vehicle|truck|गाड़ी)/) ?? 1;
  const employees = num(/(\d+)\s*(?:staff|employees|people|log|कर्मचारी|लोग)/);
  const sites = num(/(\d+)\s*(?:branches|outlets|stores|shops|sites|locations|शाखा|दुकान)/);
  let segment: Segment | undefined;
  if (has("factory", "manufactur", "unit", "कारखाना", "फैक्ट्री")) segment = "mfg";
  else if (sites && sites > 1) segment = "multi";
  else if (has("clinic", "ca firm", "coaching", "office", "lab", "agency", "क्लिनिक", "ऑफिस", "कोचिंग")) segment = "prof";
  else if (has("shop", "store", "kirana", "salon", "pharmacy", "bakery", "दुकान", "किराना", "सैलून")) segment = "micro";
  return {
    ...(segment ? { segment } : {}),
    ...(employees ? { employees } : {}),
    ...(sites ? { sites } : {}),
    ...(has("cheap", "budget", "सस्ता", "कम कीमत") ? { priority: "lowest_price" as const } : {}),
    ...(has("reliable", "uptime", "never down", "भरोसेमंद") ? { priority: "reliability" as const } : {}),
    wants,
  };
}

/** Optional plain-language summary. Rejected (-> template) if it contains digits or product codes: prices and
 *  quantities must only ever come from the deterministic engine. */
export async function phraseExplanation(lang: Lang, bullets: string[], needs: Needs): Promise<string | null> {
  const sys = `Rewrite the bullet points as 2-3 short, warm sentences for a small business owner, in ${lang === "hi" ? "simple Hindi (Devanagari)" : "simple English"}.
Do not add any product, feature, number, price or promise that is not in the bullets. Do not use digits.`;
  const out = await chat(sys, `Business: ${needs.businessType ?? needs.segment}\n- ${bullets.join("\n- ")}`, false);
  if (!out || /[0-9₹]|P\d\d/.test(out) || out.length > 600) return null;
  return out.trim();
}
