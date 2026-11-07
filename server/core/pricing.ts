/** Deterministic quote. Rules recovered from all 368 real activated bundles (analysis/PRODUCT_CATALOGUE_INTELLIGENCE.md §3):
 *  setup = Σ qty × unit setup fee; contract = max of products' minimum contracts. Prices are GST-exclusive (assumption A-GST). */
import { CATALOGUE_VERSION, PRICE_POLICY, product } from "./catalogue.ts";
import type { Bundle, Quote, QuoteLine } from "./types.ts";

export const GST_RATE = 0.18;

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;

export function quote(bundle: Bundle): Quote {
  const lines: QuoteLine[] = Object.entries(bundle).map(([id, quantity]) => {
    const p = product(id);
    return {
      productId: id,
      name: p.name,
      unit: p.unit,
      quantity,
      unitPrice: p.listPrice,
      monthly: p.listPrice * quantity,
      setup: p.setupFee * quantity,
      minContractMonths: p.minContractMonths,
      installDays: p.installDays,
    };
  });
  const monthly = lines.reduce((s, l) => s + paise(l.monthly), 0);
  const setup = lines.reduce((s, l) => s + paise(l.setup), 0);
  const monthlyGst = Math.round(monthly * GST_RATE);
  const setupGst = Math.round(setup * GST_RATE);
  const contractMonths = lines.length ? Math.max(...lines.map((l) => l.minContractMonths)) : 0;
  return {
    lines,
    monthlyExGst: rupees(monthly),
    gstRate: GST_RATE,
    monthlyGst: rupees(monthlyGst),
    monthlyInclGst: rupees(monthly + monthlyGst),
    setupExGst: rupees(setup),
    setupGst: rupees(setupGst),
    // Assumption A-BILL: first month's rental and setup are collected together at checkout.
    firstPaymentInclGst: rupees(monthly + monthlyGst + setup + setupGst),
    contractMonths,
    contractValueExGst: rupees(monthly * contractMonths + setup),
    // Assumption A-ETA: products install in parallel, so the slowest product sets the date.
    activationEtaDays: lines.length ? Math.max(...lines.map((l) => l.installDays)) : 0,
    pricePolicy: PRICE_POLICY,
    catalogueVersion: CATALOGUE_VERSION,
  };
}
