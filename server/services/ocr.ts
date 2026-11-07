/** Document reading: the local PaddleOCR service when reachable, otherwise the cached OCR of the 47 specimen
 *  images (matched by SHA-256). Anything else is "unrecognised" and goes to human review. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Fields } from "../core/kyc.ts";
import type { DocType } from "../core/types.ts";

export interface OcrResult { fields: Fields; sharpness?: number; skew?: number; source: "ocr_service" | "cached_specimen" | "unrecognised"; specimen?: string }

const CACHE_PATH = resolve(import.meta.dirname, "../data/private/ocr_cache.json");
let cache: Record<string, { specimen: string; doc_type: DocType; fields: Fields; sharpness: number; skew: number }> | null = null;
const specimenCache = () => (cache ??= existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {});

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export async function ocrServiceUp(): Promise<boolean> {
  const url = process.env.OCR_SERVICE_URL;
  if (!url) return false;
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function readDocument(docType: DocType, file: Buffer, mimeType: string): Promise<OcrResult> {
  const url = process.env.OCR_SERVICE_URL;
  if (url && (await ocrServiceUp())) {
    const form = new FormData();
    form.set("doc_type", docType);
    form.set("file", new Blob([new Uint8Array(file)], { type: mimeType }), "upload");
    try {
      const r = await fetch(`${url}/extract`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
      if (r.ok) {
        const j = (await r.json()) as { fields: Fields; sharpness: number; skew: number };
        return { ...j, source: "ocr_service" };
      }
    } catch { /* fall back to cache */ }
  }
  const hash = sha256(file);
  let hit = specimenCache()[hash];
  if (!hit && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Hosted: the cache file isn't deployed, so look the hash up in Supabase.
    const { supabaseAdmin } = await import("../data/supabaseStore.ts");
    const { data } = await supabaseAdmin().from("ocr_specimen_cache").select("*").eq("sha256", hash).maybeSingle();
    if (data) hit = { specimen: data.specimen, doc_type: data.doc_type, fields: data.fields, sharpness: Number(data.sharpness), skew: Number(data.skew) };
  }
  if (hit && hit.doc_type === docType) return { fields: hit.fields, sharpness: hit.sharpness, skew: hit.skew, source: "cached_specimen", specimen: hit.specimen };
  return { fields: {}, source: "unrecognised" };
}
