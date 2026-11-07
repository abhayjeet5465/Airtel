import { describe, expect, it } from "vitest";
import { checkBundle, eligibleProducts } from "./eligibility.ts";
import type { Bundle, EligibilityProfile } from "./types.ts";

const base: EligibilityProfile = { cityTier: 1, employees: 12, sites: 1, gstStatus: "Active" };

// Same 21 cases as analysis/scripts/catalogue_intelligence.py::eligibility_test_cases
const cases: [string, EligibilityProfile, Bundle, boolean, string[]][] = [
  ["Valid fibre + email", base, { P02: 1, P16: 8 }, true, []],
  ["1 Gbps fibre in a tier-2 city", { ...base, cityTier: 2 }, { P03: 1 }, false, ["city_tier"]],
  ["1 Gbps fibre with 3 employees", { ...base, employees: 3 }, { P03: 1 }, false, ["min_employees"]],
  ["SD-WAN at a single site", base, { P02: 1, P10: 1 }, false, ["min_sites"]],
  ["SD-WAN at 3 sites, no link", { ...base, sites: 3 }, { P10: 3 }, false, ["dependency"]],
  ["SD-WAN at 3 sites with fibre", { ...base, sites: 3 }, { P02: 3, P10: 3 }, true, []],
  ["WhatsApp API without GSTIN", { ...base, gstStatus: "No GSTIN" }, { P15: 1 }, false, ["gstin_missing"]],
  ["WhatsApp API with cancelled GSTIN", { ...base, gstStatus: "Cancelled" }, { P15: 1 }, false, ["gstin_cancelled"]],
  ["WhatsApp API with suspended GSTIN", { ...base, gstStatus: "Suspended" }, { P15: 1 }, false, ["gstin_suspended"]],
  ["No-GSTIN micro starter", { cityTier: 2, employees: 2, sites: 1, gstStatus: "No GSTIN" }, { P04: 1, P19: 1, P18: 1 }, true, []],
  ["CCTV without any internet", base, { P23: 4 }, false, ["dependency"]],
  ["CCTV on 5G FWA", base, { P04: 1, P23: 4 }, true, []],
  ["Failover on 5G FWA", base, { P04: 1, P09: 1 }, false, ["dependency"]],
  ["Static IP on a leased line", base, { P05: 1, P11: 1 }, false, ["dependency"]],
  ["Secure Wi-Fi on a leased line", base, { P05: 1, P22: 1 }, false, ["dependency"]],
  ["Leased line 100 with 20 employees", { ...base, employees: 20 }, { P06: 1 }, false, ["min_employees"]],
  ["Firewall on FWA only", base, { P04: 1, P21: 1 }, false, ["dependency"]],
  ["Cloud telephony with 2 employees", { ...base, employees: 2 }, { P02: 1, P12: 2 }, false, ["min_employees"]],
  ["Unknown product", base, { P99: 1 }, false, ["unknown_product"]],
  ["Zero quantity", base, { P02: 0 }, false, ["quantity"]],
  ["Redundant fibre plans (advisory only)", base, { P01: 1, P02: 1 }, true, []],
];

describe("eligibility engine (parity with Python suite)", () => {
  it.each(cases)("%s", (_name, prof, bundle, ok, rules) => {
    const r = checkBundle(prof, bundle);
    expect(r.eligible).toBe(ok);
    expect([...new Set(r.failures.map((f) => f.rule))].sort()).toEqual([...rules].sort());
  });

  it("redundant fibre plans raise a non-blocking advisory", () => {
    expect(checkBundle(base, { P01: 1, P02: 1 }).advisories.map((a) => a.rule)).toEqual(["redundant"]);
  });

  it("no-GSTIN tier-2 micro business can buy exactly the 15 non-GST products (minus size-gated ones)", () => {
    const ids = eligibleProducts({ cityTier: 2, employees: 3, sites: 1, gstStatus: "No GSTIN" }).map((p) => p.id);
    expect(ids).toEqual(["P01", "P02", "P04", "P07", "P08", "P09", "P11", "P16", "P17", "P18", "P19", "P20", "P22", "P23", "P25"]);
  });
});
