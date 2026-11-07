/** Transparent lead score (analysis/LEAD_INTELLIGENCE.md §3): matched a random forest (AUC 0.685 vs 0.678–0.694),
 *  so no ML model is used. Top 30% of leads by this score held ~53% of activations. */
export interface ScoreInput { gstStatus: string; segment: string; employees: number; leadSource?: string }

export function leadScore(x: ScoreInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (x.gstStatus === "Active") { score += 2; reasons.push("Active GSTIN (+2)"); }
  if (x.segment !== "micro") { score += 2; reasons.push("Not a micro business (+2)"); }
  if (x.employees >= 11) { score += 1; reasons.push("11+ staff (+1)"); }
  if (x.leadSource === "Referral") { score += 1; reasons.push("Referral (+1)"); }
  else if (x.leadSource === "Inbound call") { score += 0.5; reasons.push("Inbound call (+0.5)"); }
  return { score, reasons };
}

/** Routing policy (our recommendation): self-serve where a human visit cannot pay back; assisted where it does. */
export function route(segment: string, sites: number): "self_serve" | "assisted" {
  return segment === "micro" || segment === "prof" ? (sites >= 3 ? "assisted" : "self_serve") : "assisted";
}
