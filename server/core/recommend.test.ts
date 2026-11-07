import { describe, expect, it } from "vitest";
import { dataset, SEGMENT_CODE } from "../data/dataset.ts";
import { checkBundle } from "./eligibility.ts";
import { profileOf, recommend } from "./recommend.ts";
import type { GstStatus, Needs } from "./types.ts";

/** Turn a lead's profile + products_of_interest into the structured needs the advisor would collect. */
function needsFromLead(l: ReturnType<typeof dataset>["leads"][number]): Needs {
  const asked = new Set(l.products_of_interest.split(";"));
  const emp = Number(l.employee_count);
  const w: Needs["wants"] = {};
  if (asked.has("P05") || asked.has("P06")) w.dedicatedBandwidth = true;
  if (asked.has("P07") || asked.has("P08")) w.phoneLines = 2;
  if (asked.has("P09")) w.backupInternet = true;
  if (asked.has("P10")) w.centralManagement = true;
  if (asked.has("P11")) w.staticIp = true;
  if (asked.has("P12")) w.callChannels = 2;
  if (asked.has("P13")) w.tollFree = true;
  if (asked.has("P14")) w.sms = true;
  if (asked.has("P15")) w.whatsapp = true;
  if (asked.has("P16")) w.emailUsers = emp;
  if (asked.has("P17")) w.cloudBackup = true;
  if (asked.has("P18")) w.website = true;
  if (asked.has("P19")) w.payments = true;
  if (asked.has("P20")) w.securityDevices = Math.ceil(emp / 4);
  if (asked.has("P21")) w.firewall = true;
  if (asked.has("P22")) w.guestWifi = true;
  if (asked.has("P23")) w.cctvCameras = 4;
  if (asked.has("P24")) w.machineDevices = 5;
  if (asked.has("P25")) w.fleetVehicles = 2;
  return { segment: SEGMENT_CODE[l.segment], cityTier: Number(l.city_tier) as 1 | 2, employees: emp, sites: Number(l.num_sites), wants: w };
}

describe("recommendation engine on all 5,000 real lead profiles", () => {
  const { leads, gst } = dataset();
  const runs = leads.map((l) => {
    const status = (gst.get(l.gstin)?.status ?? "No GSTIN") as GstStatus;
    const n = needsFromLead(l);
    return { l, n, status, rec: recommend(n, status) };
  });

  it("never returns an ineligible bundle (today: 15.2% of sold bundles break rules)", () => {
    const bad = runs.filter(({ n, status, rec }) => !checkBundle(profileOf(n, status), rec.bundle).eligible);
    expect(bad).toEqual([]);
  });

  it("always includes an internet link when one is eligible", () => {
    const linkIds = ["P01", "P02", "P03", "P04", "P05", "P06"];
    expect(runs.filter(({ rec }) => !rec.items.some((i) => linkIds.includes(i.productId)))).toEqual([]);
  });

  it("every stated need is either included or explained with the blocking rule", () => {
    for (const { n, rec } of runs) {
      const covered = new Set([...rec.items.map((i) => i.want), ...rec.unmet.map((u) => u.want)]);
      for (const [k, v] of Object.entries(n.wants)) if (v) expect(covered.has(k as never)).toBe(true);
      for (const u of rec.unmet) expect(u.failures.length).toBeGreaterThan(0);
    }
  });

  it("adds nothing the owner did not ask for (no forced template products)", () => {
    for (const { rec } of runs) {
      const wants = new Set(rec.items.map((i) => i.want));
      expect(rec.items.length).toBe(wants.size);
    }
  });

  it("a cancelled GSTIN blocks WhatsApp API with an explained reason", () => {
    const n: Needs = { segment: "micro", cityTier: 2, employees: 3, sites: 1, wants: { whatsapp: true, payments: true } };
    const rec = recommend(n, "Cancelled");
    expect(rec.bundle).toEqual({ P04: 1, P19: 1 });
    expect(rec.unmet[0].failures[0].rule).toBe("gstin_cancelled");
  });
});
