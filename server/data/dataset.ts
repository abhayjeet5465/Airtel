/** Server-only loaders for the synthetic dataset. Registries and leads are never sent to the browser in bulk. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { GstRecord, UdyamRecord } from "../core/kyc.ts";

export const DATASET_DIR = resolve(process.env.DATASET_DIR ?? resolve(import.meta.dirname, "../../../YTL_TrackA_Udyam_Digital_Data"));

const read = <T>(file: string): T[] => parse(readFileSync(resolve(DATASET_DIR, file)), { columns: true, skip_empty_lines: true }) as T[];

export interface Lead {
  lead_id: string; created_date: string; lead_source: string; business_name: string; business_type: string; segment: string;
  city: string; city_tier: string; state: string; preferred_language: string; employee_count: string; num_sites: string;
  annual_turnover_band: string; has_gstin: string; gstin: string; has_udyam: string; udyam_number: string; current_internet: string;
  current_provider: string; monthly_telecom_spend_inr: string; products_of_interest: string; contact_name: string; contact_role: string;
  stage_reached: string; outcome: string; drop_reason: string; bundle_products: string;
}

let cache: { gst: Map<string, GstRecord>; udyam: Map<string, UdyamRecord>; leads: Lead[] } | null = null;

export function dataset() {
  if (!cache) {
    const gst = read<GstRecord>("mock_gstin_registry.csv");
    const udyam = read<UdyamRecord>("mock_udyam_registry.csv");
    cache = {
      gst: new Map(gst.map((r) => [r.gstin, r])),
      udyam: new Map(udyam.map((r) => [r.udyam_number, r])),
      leads: read<Lead>("smb_leads.csv"),
    };
  }
  return cache;
}

export const SEGMENT_CODE: Record<string, "micro" | "prof" | "multi" | "mfg"> = {
  "Micro retail & services": "micro",
  "Professional offices": "prof",
  "Small multi-site businesses": "multi",
  "Small manufacturers": "mfg",
};
