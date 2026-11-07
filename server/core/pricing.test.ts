import { describe, expect, it } from "vitest";
import { dataset } from "../data/dataset.ts";
import { product } from "./catalogue.ts";
import { quote } from "./pricing.ts";

const parse = (b: string) => Object.fromEntries(b.split(";").map((x) => { const [id, q] = x.split("x"); return [id, Number(q)]; }));

describe("pricing engine", () => {
  it("list prices are midpoints within the catalogue range", () => {
    for (const id of ["P01", "P05", "P16", "P23"]) {
      const p = product(id);
      expect(p.listPrice).toBe(Math.round((p.priceMin + p.priceMax) / 2));
    }
  });

  it("reproduces the setup and contract rules of all 368 real activated bundles", () => {
    const sold = dataset().leads.filter((l) => l.outcome === "Activated");
    expect(sold.length).toBe(368);
    for (const l of sold) {
      const q = quote(parse(l.bundle_products));
      expect(q.setupExGst).toBe(Number((l as unknown as Record<string, string>).one_time_setup_inr));
      expect(q.contractMonths).toBe(Number((l as unknown as Record<string, string>).contract_months));
    }
  });

  it("computes GST, first payment and ETA exactly", () => {
    const q = quote({ P04: 1, P19: 1 }); // 999 + 749 = 1,748/mo; setup 2,500
    expect(q.monthlyExGst).toBe(1748);
    expect(q.monthlyGst).toBe(314.64);
    expect(q.monthlyInclGst).toBe(2062.64);
    expect(q.setupExGst).toBe(2500);
    expect(q.firstPaymentInclGst).toBeCloseTo(2062.64 + 2950, 2);
    expect(q.contractMonths).toBe(12);
    expect(q.contractValueExGst).toBe(1748 * 12 + 2500);
    expect(q.activationEtaDays).toBe(3);
    expect(q.monthlyExGst).toBe(q.lines.reduce((s, l) => s + l.monthly, 0));
  });
});
