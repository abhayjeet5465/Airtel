import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { dataset } from "../data/dataset.ts";
import { assess, type Fields, type Registry } from "./kyc.ts";
import type { DocType } from "./types.ts";
import { repairGstinOcr } from "./validators.ts";

const ANALYSIS = resolve(import.meta.dirname, "../../../analysis");
const quality = JSON.parse(readFileSync(resolve(ANALYSIS, "outputs/ocr/image_quality.json"), "utf8")) as Record<string, { laplacian_var: number }>;
const { gst, udyam, leads } = dataset();
const registry: Registry = { gst: (g) => gst.get(g) ?? null, udyam: (u) => udyam.get(u) ?? null };

// Ground-truth verdicts from analysis/KYC_FORENSIC_REPORT.md (Python pipeline on manual transcription).
const EXPECTED: Record<string, string> = {
  K01: "REJECT", K02: "PASS", K03: "PASS", K04: "NEEDS_ACTION", K05: "NEEDS_ACTION", K06: "REJECT",
  K07: "REJECT", K08: "PASS", K09: "PASS", K10: "REVIEW", K11: "NEEDS_ACTION", K12: "PASS",
};

function load(rows: { applicant: string; doc_type: string; field: string; value: string }[]) {
  const docs: Record<string, Partial<Record<DocType, Fields>>> = {};
  for (const r of rows) ((docs[r.applicant] ??= {})[r.doc_type as DocType] ??= {})[r.field] = r.value ?? "";
  return docs;
}

function applicantFor(docs: Partial<Record<DocType, Fields>>) {
  const g = repairGstinOcr(docs.gst_certificate?.gstin);
  const u = docs.udyam_certificate?.udyam_number;
  const lead = leads.find((l) => (g && l.gstin === g) || (u && l.udyam_number === u));
  return lead ? { contactName: lead.contact_name, gstin: lead.gstin || undefined, udyamNumber: lead.udyam_number || undefined } : {};
}

function run(docs: Record<string, Partial<Record<DocType, Fields>>>) {
  return Object.fromEntries(
    Object.entries(docs).map(([app, d]) => {
      const sharp = Object.fromEntries(Object.keys(d).map((dt) => [dt, quality[`${app}_${dt}`]?.laplacian_var]));
      return [app, assess(d, sharp, registry, applicantFor(d), "2026-07-15").verdict];
    }),
  );
}

describe("KYC verdict engine", () => {
  it("reproduces all 12 ground-truth verdicts from the manual transcription", () => {
    const rows = parse(readFileSync(resolve(ANALYSIS, "kyc_ground_truth.csv")), { columns: true }) as never[];
    expect(run(load(rows))).toEqual(EXPECTED);
  });

  it("reproduces the 11 non-calibration verdicts from PaddleOCR-extracted fields (preprocessed)", () => {
    const rows = (parse(readFileSync(resolve(ANALYSIS, "outputs/kyc_ocr_fields_paddle_pre.csv")), { columns: true }) as { applicant: string; doc_type: string; field: string; extracted: string }[])
      .map((r) => ({ applicant: r.applicant, doc_type: r.doc_type, field: r.field, value: r.extracted }));
    // K03 calibrated the OCR layout, so it is excluded from the OCR field table (and from this comparison).
    const { K03: _calibration, ...expected } = EXPECTED;
    expect(run(load(rows))).toEqual(expected);
  });
});
