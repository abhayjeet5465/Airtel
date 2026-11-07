/** Deterministic eligibility engine. Port of analysis/scripts/eligibility.py; same rules, same test cases. */
import { PRODUCT_BY_ID, PRODUCTS } from "./catalogue.ts";
import type { Bundle, EligibilityProfile, Failure, Product } from "./types.ts";

const GSTIN_RULE = { "No GSTIN": "gstin_missing", Cancelled: "gstin_cancelled", Suspended: "gstin_suspended" } as const;

// Advisory only (our inference): products that serve the same purpose at one site.
const SAME_ROLE_GROUPS: Record<string, string[]> = { primary_fibre: ["P01", "P02", "P03"], leased_line: ["P05", "P06"] };

export function checkLine(p: Product, profile: EligibilityProfile, bundleIds: Set<string>): Failure[] {
  const out: Failure[] = [];
  if (!p.cityTiers.includes(profile.cityTier)) {
    out.push({ rule: "city_tier", productId: p.id, params: { tiers: p.cityTiers.join("/"), tier: profile.cityTier }, blocking: true });
  }
  if (profile.employees < p.minEmployees) {
    out.push({ rule: "min_employees", productId: p.id, params: { min: p.minEmployees, actual: profile.employees }, blocking: true });
  }
  if (profile.sites < p.minSites) {
    out.push({ rule: "min_sites", productId: p.id, params: { min: p.minSites, actual: profile.sites }, blocking: true });
  }
  if (p.requiresGstin && profile.gstStatus !== "Active") {
    const rule = GSTIN_RULE[profile.gstStatus as keyof typeof GSTIN_RULE] ?? "gstin_not_active";
    out.push({ rule, productId: p.id, params: { status: profile.gstStatus }, blocking: true });
  }
  if (p.requiresOneOf.length && !p.requiresOneOf.some((d) => bundleIds.has(d))) {
    out.push({ rule: "dependency", productId: p.id, params: { needsOneOf: p.requiresOneOf.join(", ") }, blocking: true });
  }
  return out;
}

export function advisories(bundle: Bundle): Failure[] {
  return Object.entries(SAME_ROLE_GROUPS).flatMap(([role, group]) => {
    const present = group.filter((g) => g in bundle);
    return present.length > 1 ? [{ rule: "redundant" as const, productId: present.join(","), params: { role }, blocking: false }] : [];
  });
}

export function checkBundle(profile: EligibilityProfile, bundle: Bundle) {
  const ids = new Set(Object.keys(bundle));
  const failures: Failure[] = [];
  for (const [id, qty] of Object.entries(bundle)) {
    const p = PRODUCT_BY_ID.get(id);
    if (!p) {
      failures.push({ rule: "unknown_product", productId: id, params: {}, blocking: true });
      continue;
    }
    if (!Number.isInteger(qty) || qty < 1) failures.push({ rule: "quantity", productId: id, params: { qty }, blocking: true });
    failures.push(...checkLine(p, profile, ids));
  }
  return { eligible: failures.length === 0, failures, advisories: advisories(bundle) };
}

/** Products the business may buy at all (dependencies are bundle-level, so excluded here). */
export function eligibleProducts(profile: EligibilityProfile): Product[] {
  return PRODUCTS.filter((p) => checkLine(p, profile, new Set([p.id])).every((f) => f.rule === "dependency"));
}

export function isEligible(id: string, profile: EligibilityProfile): boolean {
  const p = PRODUCT_BY_ID.get(id);
  return !!p && checkLine(p, profile, new Set([id])).every((f) => f.rule === "dependency");
}
