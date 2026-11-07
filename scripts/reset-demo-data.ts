/** Deletes all application data (sessions cascade to profiles, quotes, consents, KYC, orders) and uploaded KYC images,
 *  so a demo starts clean. Reference data (registries, leads, OCR cache, specimen images) is untouched.
 *  Usage: npx tsx scripts/reset-demo-data.ts */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const { supabaseAdmin, BUCKET } = await import("../server/data/supabaseStore.ts");
const db = supabaseAdmin();

const { error } = await db.from("app_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (error) throw new Error(error.message);

let removed = 0;
const { data: folders } = await db.storage.from(BUCKET).list("", { limit: 1000 });
for (const f of folders ?? []) {
  const { data: files } = await db.storage.from(BUCKET).list(f.name, { limit: 1000 });
  const paths = (files ?? []).map((x) => `${f.name}/${x.name}`);
  if (paths.length) { await db.storage.from(BUCKET).remove(paths); removed += paths.length; }
}
console.log(`cleared application data and ${removed} uploaded images`);
