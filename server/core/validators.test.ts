import { describe, expect, it } from "vitest";
import { dataset } from "../data/dataset.ts";
import { gstinCheckChar, gstinValid, repairGstinOcr, sameAddress, similarity, validateGstin, validateUdyam } from "./validators.ts";

const { gst, udyam } = dataset();

describe("GSTIN validator", () => {
  it("passes every record in the simulated registry (3,534)", () => {
    const failed = [...gst.values()].filter((r) => !validateGstin(r.gstin, r.state).every((x) => x.ok));
    expect(gst.size).toBe(3534);
    expect(failed).toEqual([]);
  });

  it("rejects corrupted identifiers", () => {
    const good = "32TTNXB7384T1ZW";
    expect(gstinValid(good)).toBe(true);
    expect(gstinValid("32TTNXB8384T1ZW")).toBe(false); // one digit changed
    expect(gstinValid("32TTNXB7834T1ZW")).toBe(false); // transposition
    expect(gstinValid(good.slice(0, 14))).toBe(false);
    expect(gstinValid("32TTNXB7384T1YW")).toBe(false); // 14th char not Z
    const bad99 = "99TTNXB7384T1Z" + gstinCheckChar("99TTNXB7384T1Z");
    expect(validateGstin(bad99).find((r) => r.rule === "state_code_known")?.ok).toBe(false);
  });

  it("K06 as printed fails the checksum and is never 'repaired' into a valid GSTIN", () => {
    expect(validateGstin("08YKZXS8189L1Z0").find((r) => r.rule === "checksum")?.ok).toBe(false);
    expect(repairGstinOcr("08YKZXS8189L1Z0")).toBeNull();
  });

  it("repairs OCR confusions only when the checksum confirms", () => {
    expect(repairGstinOcr("19E0GXH4115Y1ZL")).toBe("19EOGXH4115Y1ZL"); // K02: zero read for letter O
    expect(repairGstinOcr("37IHKXVSI67LIZS")).toBe("37IHKXV5167L1ZS"); // K01 as read by EasyOCR
    // Simulated confusions on every registry GSTIN must be recovered exactly (Python: 2,649/2,649).
    const corrupt = (g: string) => [...g].map((c, i) => (c === "O" ? "0" : c === "0" && i < 2 ? "O" : c === "1" && i >= 7 && i <= 10 ? "I" : c === "5" && i >= 7 && i <= 10 ? "S" : c)).join("");
    const changed = [...gst.keys()].filter((g) => corrupt(g) !== g);
    expect(changed.length).toBe(2649);
    expect(changed.filter((g) => repairGstinOcr(corrupt(g)) !== g)).toEqual([]);
  });
});

describe("Udyam validator", () => {
  it("passes every record in the simulated registry (2,723)", () => {
    const failed = [...udyam.values()].filter((r) => !validateUdyam(r.udyam_number, r.state).every((x) => x.ok));
    expect(failed).toEqual([]);
  });
  it("flags blank, malformed and unexpected values", () => {
    const fails = (u: string) => validateUdyam(u).filter((r) => !r.ok).map((r) => r.rule);
    expect(fails("")).toEqual(["present"]);
    expect(fails("KL-00-3078801")).toEqual(["format"]);
    expect(fails("UDYAM-KL-00-307880")).toEqual(["format"]);
    expect(fails("UDYAM-KL-01-3078801")).toEqual(["district_code"]);
    expect(fails("UDYAM-ZZ-00-1234567")).toEqual(["state_code_known"]);
  });
});

describe("matching helpers", () => {
  it("similarity matches difflib on simple cases", () => {
    expect(similarity("abcd", "bcde")).toBeCloseTo(0.75);
    expect(similarity("", "")).toBe(1);
  });
  it("tolerates OCR noise but not a different unit number or PIN", () => {
    const a = "Shop/Unit 71, Market Yard, Jaipur, Rajasthan - 194057";
    expect(sameAddress(a, "ShoplUnit 71, Market Yard, Jaipur, Rajasthan 194057")).toBe(true);
    expect(sameAddress(a, "Shop/Unit 72, Market Yard, Jaipur, Rajasthan - 194057")).toBe(false);
    expect(sameAddress(a, "Shop/Unit 71, Market Yard, Jaipur, Rajasthan - 194058")).toBe(false);
  });
});
