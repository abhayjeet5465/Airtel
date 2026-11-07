/** Builds server/core/catalogue.json from product_catalogue.csv with the agreed midpoint list price. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import type { Product, Segment } from "../server/core/types.ts";

const dataset = resolve(process.env.DATASET_DIR ?? "../YTL_TrackA_Udyam_Digital_Data");
const rows: Record<string, string>[] = parse(readFileSync(resolve(dataset, "product_catalogue.csv")), { columns: true });

const products: Product[] = rows.map((r) => {
  const priceMin = Number(r.price_min_inr_per_month);
  const priceMax = Number(r.price_max_inr_per_month);
  return {
    id: r.product_id,
    category: r.category,
    name: r.product_name,
    description: r.description,
    unit: r.unit,
    priceMin,
    priceMax,
    listPrice: Math.round((priceMin + priceMax) / 2),
    setupFee: Number(r.one_time_setup_inr),
    minContractMonths: Number(r.min_contract_months),
    cityTiers: r.available_city_tiers.split(";").map(Number),
    minEmployees: Number(r.min_employees),
    minSites: Number(r.min_sites),
    requiresGstin: r.requires_gstin === "Y",
    requiresOneOf: r.requires_one_of ? r.requires_one_of.split("|") : [],
    installDays: Number(r.typical_install_days),
    targetSegments: r.target_segments.split(";") as Segment[],
  };
});

const out = { version: "catalogue-2026-10-04+midpoint-v1", pricePolicy: "midpoint-v1", products };
writeFileSync(resolve("server/core/catalogue.json"), JSON.stringify(out, null, 2));
console.log(`wrote ${products.length} products`);
