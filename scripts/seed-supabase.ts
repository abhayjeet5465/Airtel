/** Loads the SIMULATED registries, synthetic leads, specimen OCR cache and the 47 specimen images into Supabase.
 *  Idempotent (upserts). Requires the migration in supabase/migrations to have been run first.
 *  Usage: npx tsx scripts/seed-supabase.ts */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const { DATASET_DIR, loadDataset } = await import("../server/data/dataset.ts");
const { supabaseAdmin } = await import("../server/data/supabaseStore.ts");

const db = supabaseAdmin();
const data = await loadDataset();
if (data.source !== "csv") throw new Error(`Dataset not found at ${DATASET_DIR}`);

async function upsert(table: string, rows: object[], key: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: key });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`${table}: ${rows.length}`);
}

await upsert("registry_gstin", [...data.gst.values()], "gstin");
await upsert("registry_udyam", [...data.udyam.values()], "udyam_number");
await upsert("leads", data.leads.map((l) => ({ lead_id: l.lead_id, data: l })), "lead_id");

const cachePath = resolve("server/data/private/ocr_cache.json");
const cache = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, { specimen: string; doc_type: string; fields: object; sharpness: number; skew: number }>;
await upsert("ocr_specimen_cache", Object.entries(cache).map(([sha256, v]) => ({ sha256, specimen: v.specimen, doc_type: v.doc_type, fields: v.fields, sharpness: v.sharpness, skew: v.skew })), "sha256");

const { data: buckets } = await db.storage.listBuckets();
if (!buckets?.some((b) => b.id === "kyc-specimens")) {
  const { error } = await db.storage.createBucket("kyc-specimens", { public: false });
  if (error) throw new Error(`bucket: ${error.message}`);
}
const dir = resolve(DATASET_DIR, "kyc_documents");
const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
for (const f of files) {
  const { error } = await db.storage.from("kyc-specimens").upload(f, readFileSync(resolve(dir, f)), { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload ${f}: ${error.message}`);
}
console.log(`kyc-specimens: ${files.length} images`);
