/** Need-faithful, eligibility-first bundle recommendation. Deterministic: the LLM never chooses products.
 *  One product per stated need, nothing the owner did not ask for, and the result always passes checkBundle(). */
import { product } from "./catalogue.ts";
import { checkBundle, checkLine, isEligible } from "./eligibility.ts";
import type { Bundle, EligibilityProfile, Failure, GstStatus, Needs, Recommendation, RecommendedItem, Want } from "./types.ts";

export const ENGINE_VERSION = "recommend-v1";

// Curated add-ons offered as toggles when relevant (never pre-selected).
const ADD_ON_POOL = ["P09", "P22", "P20", "P17", "P23", "P18", "P11", "P16"];

export const profileOf = (n: Needs, gstStatus: GstStatus): EligibilityProfile => ({
  cityTier: n.cityTier,
  employees: Math.max(1, Math.round(n.employees)),
  sites: Math.max(1, Math.round(n.sites)),
  gstStatus,
});

function chooseLink(n: Needs, prof: EligibilityProfile): { id: string; reasons: string[] }[] {
  const w = n.wants;
  if (w.dedicatedBandwidth) {
    const ll = [prof.employees >= 25 ? "P06" : null, "P05"].filter(Boolean) as string[];
    return ll.map((id) => ({ id, reasons: ["reason.link.dedicated"] }));
  }
  const needsWired = !!(w.backupInternet || w.centralManagement || w.staticIp || w.firewall);
  const cheap = n.priority === "lowest_price" || n.segment === "micro";
  const opts: { id: string; reasons: string[] }[] = [];
  if (!needsWired && cheap) opts.push({ id: "P04", reasons: ["reason.link.fwa"] });
  if (n.priority === "reliability" && prof.employees >= 25) opts.push({ id: "P03", reasons: ["reason.link.gigabit"] });
  if (prof.employees >= 10 || n.segment === "multi") opts.push({ id: "P02", reasons: ["reason.link.fibre300"] });
  opts.push({ id: "P01", reasons: [needsWired ? "reason.link.wired_needed" : "reason.link.fibre100"] });
  if (!needsWired) opts.push({ id: "P04", reasons: ["reason.link.fwa"] });
  return opts;
}

type WantSpec = { want: Want; candidates: string[]; qty: number; reason: string };

function wantSpecs(n: Needs, prof: EligibilityProfile): WantSpec[] {
  const w = n.wants;
  const s = prof.sites;
  const specs: WantSpec[] = [];
  const add = (want: Want, on: unknown, candidates: string[], qty: number, reason = "reason.requested") => {
    if (on) specs.push({ want, candidates, qty: Math.max(1, Math.round(qty)), reason });
  };
  add("payments", w.payments, ["P19"], s, "reason.per_site");
  add("whatsapp", w.whatsapp, ["P15"], 1);
  add("sms", w.sms, ["P14"], 1);
  add("website", w.website, ["P18"], 1);
  add("cctvCameras", (w.cctvCameras ?? 0) > 0, ["P23"], w.cctvCameras ?? 0, "reason.per_camera");
  add("guestWifi", w.guestWifi, ["P22"], s, "reason.per_site");
  const lineProduct = n.segment === "micro" || n.priority === "lowest_price" ? ["P07", "P08"] : ["P08", "P07"];
  add("phoneLines", (w.phoneLines ?? 0) > 0, lineProduct, w.phoneLines ?? 0, "reason.per_line");
  add("emailUsers", (w.emailUsers ?? 0) > 0, ["P16"], w.emailUsers ?? 0, "reason.per_user");
  add("backupInternet", w.backupInternet, ["P09"], s, "reason.per_site");
  add("securityDevices", (w.securityDevices ?? 0) > 0, ["P20"], w.securityDevices ?? 0, "reason.per_device");
  add("centralManagement", w.centralManagement, ["P10"], s, "reason.per_site");
  add("machineDevices", (w.machineDevices ?? 0) > 0, ["P24"], w.machineDevices ?? 0, "reason.per_device");
  add("fleetVehicles", (w.fleetVehicles ?? 0) > 0, ["P25"], w.fleetVehicles ?? 0, "reason.per_vehicle");
  add("cloudBackup", w.cloudBackup, ["P17"], 1);
  add("tollFree", w.tollFree, ["P13"], 1);
  add("callChannels", (w.callChannels ?? 0) > 0, ["P12"], w.callChannels ?? 0, "reason.per_channel");
  add("staticIp", w.staticIp, ["P11"], 1);
  add("firewall", w.firewall, ["P21"], s, "reason.per_site");
  return specs;
}

export function recommend(n: Needs, gstStatus: GstStatus): Recommendation {
  const prof = profileOf(n, gstStatus);
  const items: RecommendedItem[] = [];
  const unmet: Recommendation["unmet"] = [];

  let link = chooseLink(n, prof).find((o) => isEligible(o.id, prof));
  if (!link && n.wants.dedicatedBandwidth) {
    // Leased line not allowed (size or GSTIN): explain why, then fall back to the best shared link.
    const ll = ["P06", "P05"];
    unmet.push({ want: "dedicatedBandwidth", productIds: ll, failures: ll.flatMap((c) => checkLine(product(c), prof, new Set([c])).filter((f) => f.rule !== "dependency")) });
    link = chooseLink({ ...n, wants: { ...n.wants, dedicatedBandwidth: false } }, prof).find((o) => isEligible(o.id, prof));
  }
  if (link) items.push({ productId: link.id, quantity: prof.sites, want: n.wants.dedicatedBandwidth && ["P05", "P06"].includes(link.id) ? "dedicatedBandwidth" : "internet", reasons: [...link.reasons, "reason.per_site"] });

  for (const spec of wantSpecs(n, prof)) {
    const id = spec.candidates.find((c) => isEligible(c, prof));
    if (id) {
      items.push({ productId: id, quantity: spec.qty, want: spec.want, reasons: spec.reason === "reason.requested" ? [spec.reason] : ["reason.requested", spec.reason] });
    } else {
      const failures = spec.candidates.flatMap((c) => checkLine(product(c), prof, new Set([c])).filter((f) => f.rule !== "dependency"));
      unmet.push({ want: spec.want, productIds: spec.candidates, failures });
    }
  }

  // Dependencies: an add-on whose required link is absent is moved to `unmet` with the reason (never silently upgraded).
  let bundle: Bundle = Object.fromEntries(items.map((i) => [i.productId, i.quantity]));
  const ids = new Set(Object.keys(bundle));
  for (const it of [...items]) {
    const deps = checkLine(product(it.productId), prof, ids).filter((f) => f.rule === "dependency");
    if (deps.length) {
      items.splice(items.indexOf(it), 1);
      unmet.push({ want: it.want, productIds: [it.productId], failures: deps });
    }
  }
  bundle = Object.fromEntries(items.map((i) => [i.productId, i.quantity]));

  // Safety net: the returned bundle must pass every rule.
  const check = checkBundle(prof, bundle);
  if (!check.eligible) {
    for (const f of check.failures) {
      const idx = items.findIndex((i) => i.productId === f.productId);
      if (idx >= 0) unmet.push({ want: items[idx].want, productIds: [f.productId], failures: [f] }), items.splice(idx, 1);
    }
    bundle = Object.fromEntries(items.map((i) => [i.productId, i.quantity]));
  }

  const optionalAddOns = ADD_ON_POOL.filter((id) => {
    if (id in bundle) return false;
    const p = product(id);
    if (!p.targetSegments.includes(n.segment)) return false;
    return checkLine(p, prof, new Set([...Object.keys(bundle), id])).length === 0;
  });

  const notes = ["note.nothing_unrequested"];
  if (gstStatus !== "Active") notes.push(gstStatus === "No GSTIN" || gstStatus === "Unchecked" ? "note.no_gstin_path" : "note.gstin_inactive");
  return { bundle, items, unmet: dedupeUnmet(unmet), optionalAddOns, notes, engineVersion: ENGINE_VERSION };
}

function dedupeUnmet(u: Recommendation["unmet"]) {
  const seen = new Set<string>();
  return u.filter((x) => (seen.has(x.want) ? false : (seen.add(x.want), true)));
}

/** Re-validate a customer-edited bundle (add-on toggles). Returns the failures to show; the API refuses invalid bundles. */
export function validateCustomBundle(n: Needs, gstStatus: GstStatus, bundle: Bundle): { eligible: boolean; failures: Failure[] } {
  const { eligible, failures } = checkBundle(profileOf(n, gstStatus), bundle);
  return { eligible, failures };
}

/** Default quantity for an add-on toggled on by the customer. */
export function defaultQuantity(id: string, n: Needs): number {
  const unit = product(id).unit;
  if (unit === "per site" || unit === "per counter") return Math.max(1, n.sites);
  if (unit === "per device") return Math.max(1, Math.ceil(n.employees / 4));
  if (unit === "per user") return Math.max(1, n.employees);
  if (unit === "per camera") return Math.max(2, n.sites * 2);
  return 1;
}
