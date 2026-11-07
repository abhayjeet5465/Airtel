/** Applies supabase/migrations/*.sql. Needs ONE of these in .env (never commit them):
 *   SUPABASE_ACCESS_TOKEN  personal access token (sbp_…) → Supabase Management API (works on any network)
 *   SUPABASE_DB_URL        full Postgres connection string (e.g. the "Session pooler" URI from Project Settings → Database)
 *   SUPABASE_DB_PASSWORD   database password → direct connection to db.<ref>.supabase.co (needs IPv6 on newer projects)
 * Usage: npx tsx scripts/migrate.ts */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const ref = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
const dir = resolve("supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

async function viaManagementApi(sql: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`Management API ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function viaPostgres(sql: string) {
  const { default: pg } = await import("pg");
  const connectionString = process.env.SUPABASE_DB_URL
    ?? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD!)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { await client.query(sql); } finally { await client.end(); }
}

const run = process.env.SUPABASE_ACCESS_TOKEN ? viaManagementApi : process.env.SUPABASE_DB_URL || process.env.SUPABASE_DB_PASSWORD ? viaPostgres : null;
if (!run) {
  console.error("Add SUPABASE_ACCESS_TOKEN, SUPABASE_DB_URL or SUPABASE_DB_PASSWORD to .env first.");
  process.exit(1);
}
for (const f of files) {
  await run(readFileSync(resolve(dir, f), "utf8"));
  console.log("applied", f);
}
// PostgREST caches the schema; ask it to reload so the new tables are visible immediately.
await run("notify pgrst, 'reload schema';");
console.log("schema reload requested");
