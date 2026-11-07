/** Reports whether the Supabase migration has been applied and how many rows each table holds. Prints no secrets. */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const { supabaseAdmin } = await import("../server/data/supabaseStore.ts");
const db = supabaseAdmin();
for (const t of ["registry_gstin", "registry_udyam", "leads", "ocr_specimen_cache", "app_sessions", "kyc_cases", "orders"]) {
  const { data, error } = await db.from(t).select("*").limit(1);
  console.log(t.padEnd(20), error ? `missing (${error.code} ${error.message.slice(0, 70)})` : `exists, ${data.length ? "has rows" : "empty"}`);
}
