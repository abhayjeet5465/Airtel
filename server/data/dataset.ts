/** Server-only reference data: SIMULATED registries and synthetic leads. Never sent to the browser in bulk.
 *  Source: local CSVs when the dataset folder exists (development), otherwise Supabase (hosted). */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { GstRecord, UdyamRecord } from "../core/kyc.ts";

export const DATASET_DIR = resolve(process.env.DATASET_DIR ?? resolve(import.meta.dirname, "../../../YTL_TrackA_Udyam_Digital_Data"));

export interface Lead {
  lead_id: string; created_date: string; lead_source: string; business_name: string; business_type: string; segment: string;
  city: string; city_tier: string; state: string; preferred_language: string; employee_count: string; num_sites: string;
  annual_turnover_band: string; has_gstin: string; gstin: string; has_udyam: string; udyam_number: string; current_internet: string;
  current_provider: string; monthly_telecom_spend_inr: string; products_of_interest: string; contact_name: string; contact_role: string;
  stage_reached: string; outcome: string; drop_reason: string; bundle_products: string;
}

type Data = { gst: Map<string, GstRecord>; udyam: Map<string, UdyamRecord>; leads: Lead[]; source: "csv" | "supabase" };
let cache: Data | null = null;
let loading: Promise<Data> | null = null;

const readCsv = <T>(file: string): T[] => parse(readFileSync(resolve(DATASET_DIR, file)), { columns: true, skip_empty_lines: true }) as T[];
export const localDatasetAvailable = () => existsSync(resolve(DATASET_DIR, "mock_gstin_registry.csv"));

function fromCsv(): Data {
  return {
    gst: new Map(readCsv<GstRecord>("mock_gstin_registry.csv").map((r) => [r.gstin, r])),
    udyam: new Map(readCsv<UdyamRecord>("mock_udyam_registry.csv").map((r) => [r.udyam_number, r])),
    leads: readCsv<Lead>("smb_leads.csv"),
    source: "csv",
  };
}

async function fromSupabase(): Promise<Data> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("no local dataset and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  }
  const { supabaseAdmin } = await import("./supabaseStore.ts");
  const db = supabaseAdmin();
  const all = async <T>(table: string, cols = "*"): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(`supabase ${table}: ${error.message}`);
      out.push(...(data as T[]));
      if (data.length < 1000) return out;
    }
  };
  const [gst, udyam, leads] = await Promise.all([all<GstRecord>("registry_gstin"), all<UdyamRecord>("registry_udyam"), all<{ data: Lead }>("leads", "data")]);
  return { gst: new Map(gst.map((r) => [r.gstin, r])), udyam: new Map(udyam.map((r) => [r.udyam_number, r])), leads: leads.map((r) => r.data), source: "supabase" };
}

/** Load once per process (cold start). */
export async function loadDataset(): Promise<Data> {
  if (cache) return cache;
  loading ??= (async () => (cache = localDatasetAvailable() ? fromCsv() : await fromSupabase()))();
  try {
    return await loading;
  } catch (e) {
    loading = null; // retry on the next request (e.g. once the migration has been run)
    throw e;
  }
}

/** Synchronous accessor for request handlers; loadDataset() runs as middleware first. Tests use local CSVs. */
export function dataset(): Data {
  if (!cache) {
    if (!localDatasetAvailable()) throw new Error("dataset not loaded");
    cache = fromCsv();
  }
  return cache;
}

export const SEGMENT_CODE: Record<string, "micro" | "prof" | "multi" | "mfg"> = {
  "Micro retail & services": "micro",
  "Professional offices": "prof",
  "Small multi-site businesses": "multi",
  "Small manufacturers": "mfg",
};
