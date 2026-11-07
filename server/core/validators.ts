/** GSTIN / Udyam validators and name/address matching. Port of analysis/scripts/validators.py.
 *  Registry data in this project is SIMULATED; passing these checks is not government verification. */

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
// Derived from the mock Udyam registry and verified one-to-one there.
export const UDYAM_STATE_CODES: Record<string, string> = {
  AP: "Andhra Pradesh", BR: "Bihar", DL: "Delhi", GJ: "Gujarat", KL: "Kerala", KR: "Karnataka", MH: "Maharashtra", MP: "Madhya Pradesh",
  PB: "Punjab", RJ: "Rajasthan", TN: "Tamil Nadu", TS: "Telangana", UP: "Uttar Pradesh", WB: "West Bengal",
};
// Real PAN 4th-character entity types, plus 'X' which every synthetic GSTIN uses (README).
const PAN_ENTITY_TYPES = new Set([..."PCHFATBLJG", "X"]);

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const UDYAM_RE = /^UDYAM-([A-Z]{2})-([0-9]{2})-([0-9]{7})$/;

const SLOTS = "ddaaaaaddddanzx";
const TO_DIGIT: Record<string, string> = { O: "0", D: "0", Q: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6", T: "7" };
const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G", "7": "T" };
const CONFUSABLE: Record<string, string> = { "0": "O", O: "0", "1": "I", I: "1", "5": "S", S: "5", "8": "B", B: "8", "2": "Z", Z: "2" };

export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    total += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (total % 36)) % 36];
}

export type RuleResult = { rule: string; ok: boolean; detail?: string };

export function validateGstin(input: string | null | undefined, expectedState?: string): RuleResult[] {
  const g = (input ?? "").trim().toUpperCase();
  if (!g) return [{ rule: "present", ok: false }];
  const out: RuleResult[] = [{ rule: "present", ok: true }];
  const fmt = GSTIN_RE.test(g);
  out.push({ rule: "format", ok: fmt });
  if (!fmt) return out;
  const expected = gstinCheckChar(g.slice(0, 14));
  out.push({ rule: "checksum", ok: expected === g[14], detail: expected });
  const state = GST_STATE_CODES[g.slice(0, 2)];
  out.push({ rule: "state_code_known", ok: !!state });
  if (expectedState && state) out.push({ rule: "state_code_matches", ok: normText(state) === normText(expectedState) });
  out.push({ rule: "pan_entity_type", ok: PAN_ENTITY_TYPES.has(g[5]) });
  return out;
}

export const gstinValid = (g: string) => validateGstin(g).every((r) => r.ok);

export function normaliseGstinStructure(text: string | null | undefined): string {
  const t = (text ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (t.length !== 15) return t;
  return [...t]
    .map((ch, i) => {
      const slot = SLOTS[i];
      if (slot === "d" && !/[0-9]/.test(ch)) return TO_DIGIT[ch] ?? ch;
      if (slot === "a" && /[0-9]/.test(ch)) return TO_LETTER[ch] ?? ch;
      if (slot === "z") return ch === "2" ? "Z" : ch;
      return ch;
    })
    .join("");
}

/** OCR repair that is accepted ONLY if the result passes the checksum. Never invents a different valid GSTIN
 *  unless the checksum also happens to match (1 in 36). */
export function repairGstinOcr(text: string | null | undefined): string | null {
  const g = normaliseGstinStructure(text);
  if (g.length !== 15 || !GSTIN_RE.test(g)) return null;
  if (gstinCheckChar(g.slice(0, 14)) === g[14]) return g;
  const ambiguous = [12, 14].filter((i) => g[i] in CONFUSABLE);
  for (let mask = 1; mask < 1 << ambiguous.length; mask++) {
    const c = [...g];
    ambiguous.forEach((i, bit) => {
      if ((mask >> bit) & 1) c[i] = CONFUSABLE[c[i]];
    });
    const cand = c.join("");
    if (GSTIN_RE.test(cand) && gstinCheckChar(cand.slice(0, 14)) === cand[14]) return cand;
  }
  return null;
}

export function validateUdyam(input: string | null | undefined, expectedState?: string): RuleResult[] {
  const u = (input ?? "").replace(/\s/g, "").toUpperCase();
  if (!u) return [{ rule: "present", ok: false }];
  const out: RuleResult[] = [{ rule: "present", ok: true }];
  const m = UDYAM_RE.exec(u);
  out.push({ rule: "format", ok: !!m });
  if (!m) return out;
  const st = UDYAM_STATE_CODES[m[1]];
  out.push({ rule: "state_code_known", ok: !!st });
  if (expectedState && st) out.push({ rule: "state_code_matches", ok: normText(st) === normText(expectedState) });
  out.push({ rule: "district_code", ok: m[2] === "00" });
  return out;
}

// ---------------------------------------------------------------- matching

export function normText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SUFFIXES = /\b(pvt|private|ltd|limited|llp|co|company|and)\b/g;

/** Business name for comparison: strip '(Prop. X)', legal suffixes and punctuation. */
export function normName(name: unknown): string {
  let s = String(name ?? "");
  const prop = /\(prop\.?\s*([^)]+)\)/i.exec(s);
  if (prop) s = prop[1];
  return normText(s.replace(/&/g, " ")).replace(SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

export function proprietorOf(legalName: unknown): string | null {
  const m = /^\s*([^()]+?)\s*\(prop\./i.exec(String(legalName ?? ""));
  return m ? m[1].trim() : null;
}

export const normAddress = (a: unknown) => String(a ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const canon = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Ratcliff/Obershelp similarity — the algorithm behind Python's difflib.SequenceMatcher.ratio(). */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = (lo1: number, hi1: number, lo2: number, hi2: number): number => {
    let best = 0, bi = lo1, bj = lo2;
    let prev = new Array(hi2 - lo2 + 1).fill(0);
    for (let i = lo1; i < hi1; i++) {
      const cur = new Array(hi2 - lo2 + 1).fill(0);
      for (let j = lo2; j < hi2; j++) {
        if (a[i] === b[j]) {
          const k = prev[j - lo2] + 1;
          cur[j - lo2 + 1] = k;
          if (k > best) [best, bi, bj] = [k, i - k + 1, j - k + 1];
        }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + matches(lo1, bi, lo2, bj) + matches(bi + best, hi1, bj + best, hi2);
  };
  return (2 * matches(0, a.length, 0, b.length)) / (a.length + b.length);
}

export const nameSimilarity = (a: unknown, b: unknown) => similarity(normName(a), normName(b));

export const ADDRESS_MATCH_THRESHOLD = 0.92;

/** Numbers (unit no., PIN) must match exactly; the text may differ by OCR noise ('ShoplUnit', dropped hyphen). */
export function sameAddress(a: unknown, b: unknown): boolean {
  const nums = (s: unknown) => (String(s ?? "").replace(/[\s-]/g, "").match(/\d+/g) ?? []).join("|");
  return nums(a) === nums(b) && similarity(normAddress(a), normAddress(b)) >= ADDRESS_MATCH_THRESHOLD;
}

export function maskId(v: string | null | undefined, keep = 4): string {
  if (!v) return "";
  return v.length <= keep ? v : "•".repeat(v.length - keep) + v.slice(-keep);
}
