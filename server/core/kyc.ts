/** KYC verdict engine. Port of analysis/scripts/kyc_forensics.py::assess (same checks, same severities).
 *  Inputs are extracted fields (from OCR or cache), image quality, SIMULATED registry lookups and the applicant record. */
import type { DocType, KycFinding, KycResult, Severity, Verdict } from "./types.ts";
import {
  canon, nameSimilarity, normaliseGstinStructure, proprietorOf, repairGstinOcr, sameAddress, validateGstin, validateUdyam,
} from "./validators.ts";

export const DOC_TYPES: DocType[] = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"];
export const BLUR_THRESHOLD = 150; // variance of Laplacian; every legible specimen scores > 800, the blurred one 32
export const ADDRESS_PROOF_MAX_AGE_DAYS = 90;
export const KYC_ENGINE_VERSION = "kyc-v1";

export type Fields = Record<string, string>;
export interface GstRecord { gstin: string; legal_name: string; trade_name: string; constitution: string; principal_place_of_business: string; state: string; registration_date: string; status: string }
export interface UdyamRecord { udyam_number: string; enterprise_name: string; enterprise_type: string; major_activity: string; nic_description: string; state: string; city: string; date_of_registration: string }
export interface Applicant { contactName?: string; gstin?: string; udyamNumber?: string }
export interface Registry { gst(gstin: string): GstRecord | null; udyam(n: string): UdyamRecord | null }

const AUTHORISED: Record<string, string[]> = {
  Proprietorship: ["owner", "proprietor"],
  "Limited Liability Partnership": ["partner", "designatedpartner"],
  "Private Limited Company": ["director", "managingdirector"],
};

export function assess(
  docs: Partial<Record<DocType, Fields>>,
  sharpness: Partial<Record<DocType, number>>,
  registry: Registry,
  applicant: Applicant,
  referenceDate: string,
  required: DocType[] = DOC_TYPES,
): KycResult {
  const F: KycFinding[] = [];
  const add = (severity: Severity, document: DocType, code: string, params: Record<string, string | number> = {}) => F.push({ severity, document, code, params });
  const present = new Set(DOC_TYPES.filter((d) => docs[d]));
  for (const d of required) if (!present.has(d)) add("action", d, "missing_document");
  const unreadable = new Set<DocType>();
  for (const d of present) {
    const s = sharpness[d];
    if (s !== undefined && s < BLUR_THRESHOLD) {
      unreadable.add(d);
      add("action", d, "unreadable_image", { sharpness: Math.round(s), threshold: BLUR_THRESHOLD });
    }
  }
  const gst = docs.gst_certificate ?? {}, ud = docs.udyam_certificate ?? {}, idd = docs.signatory_id ?? {}, bill = docs.address_proof ?? {};

  // --- GST certificate
  let greg: GstRecord | null = null;
  if (present.has("gst_certificate") && !unreadable.has("gst_certificate")) {
    const raw = gst.gstin ?? "";
    const g = repairGstinOcr(raw) ?? normaliseGstinStructure(raw);
    const rules = Object.fromEntries(validateGstin(g).map((r) => [r.rule, r]));
    if (!rules.present?.ok) add("action", "gst_certificate", "gstin_blank");
    else if (!rules.format?.ok) add("review", "gst_certificate", "gstin_format", { value: raw });
    else if (!rules.checksum.ok) add("reject", "gst_certificate", "gstin_checksum", { gstin: g, expected: rules.checksum.detail ?? "", found: g[14] });
    else {
      greg = registry.gst(g);
      if (!greg) add("reject", "gst_certificate", "gstin_not_found", { gstin: g });
      else {
        if (greg.status !== "Active") add("reject", "gst_certificate", `gstin_${greg.status.toLowerCase()}`, { gstin: g, status: greg.status });
        for (const [field, regVal] of [["legal_name", greg.legal_name], ["trade_name", greg.trade_name]] as const) {
          const v = gst[field];
          if (v && canon(v) !== canon(regVal)) add("reject", "gst_certificate", `${field}_mismatch_registry`, { onDocument: v, registry: regVal });
        }
        if (gst.address && !sameAddress(gst.address, greg.principal_place_of_business)) add("review", "gst_certificate", "address_mismatch_registry");
        if (gst.date_of_liability && gst.date_of_liability !== greg.registration_date) add("info", "gst_certificate", "date_mismatch_registry", { onDocument: gst.date_of_liability, registry: greg.registration_date });
      }
    }
  }

  // --- Udyam certificate
  let ureg: UdyamRecord | null = null;
  if (present.has("udyam_certificate") && !unreadable.has("udyam_certificate")) {
    const num = (ud.udyam_number ?? "").replace(/\s/g, "").toUpperCase();
    const rules = Object.fromEntries(validateUdyam(num).map((r) => [r.rule, r]));
    if (!num) add("review", "udyam_certificate", "udyam_blank");
    else if (!rules.format?.ok) add("review", "udyam_certificate", "udyam_format", { value: num });
    else {
      ureg = registry.udyam(num);
      if (!ureg) add("reject", "udyam_certificate", "udyam_not_found", { udyam: num });
      else {
        if (ud.enterprise_name && canon(ud.enterprise_name) !== canon(ureg.enterprise_name)) add("reject", "udyam_certificate", "enterprise_name_mismatch_registry", { onDocument: ud.enterprise_name, registry: ureg.enterprise_name });
        for (const f of ["state", "city"] as const) if (ud[f] && canon(ud[f]) !== canon(ureg[f])) add("review", "udyam_certificate", `${f}_mismatch_registry`, { onDocument: ud[f], registry: ureg[f] });
        // Known dataset artefact: every specimen's date (and most activity labels) differ from the mock registry -> info only.
        if (ud.date_of_registration && ud.date_of_registration !== ureg.date_of_registration) add("info", "udyam_certificate", "date_mismatch_registry", { onDocument: ud.date_of_registration, registry: ureg.date_of_registration });
        if (ud.major_activity && canon(ud.major_activity) !== canon(ureg.major_activity)) add("info", "udyam_certificate", "activity_mismatch_registry", { onDocument: ud.major_activity, registry: ureg.major_activity });
      }
    }
  }
  if (!present.has("udyam_certificate") && applicant.udyamNumber) add("info", "udyam_certificate", "udyam_available_via_lookup", { udyam: applicant.udyamNumber });
  if (!greg && unreadable.has("gst_certificate") && applicant.gstin) add("info", "gst_certificate", "gstin_resolved_via_record", { gstin: applicant.gstin });

  // --- Signatory ID
  const constitution = greg?.constitution ?? gst.constitution ?? "";
  if (present.has("signatory_id")) {
    if (idd.valid_till && idd.valid_till < referenceDate) add("action", "signatory_id", "id_expired", { validTill: idd.valid_till });
    const prop = proprietorOf(greg?.legal_name ?? gst.legal_name);
    if (prop && idd.name && canon(prop) !== canon(idd.name)) add("review", "signatory_id", "signatory_not_proprietor", { holder: idd.name, proprietor: prop });
    if (applicant.contactName && idd.name && canon(applicant.contactName) !== canon(idd.name)) add("review", "signatory_id", "signatory_not_applicant", { holder: idd.name, applicant: applicant.contactName });
    const allowed = AUTHORISED[constitution];
    const des = canon(idd.designation);
    if (allowed && des && !allowed.includes(des)) add("info", "signatory_id", "designation_atypical", { designation: idd.designation, constitution });
    if (idd.for_business && greg && nameSimilarity(idd.for_business, greg.trade_name) < 0.9) add("review", "signatory_id", "id_business_mismatch", { onDocument: idd.for_business, registry: greg.trade_name });
  }

  // --- Address proof
  if (present.has("address_proof") && !unreadable.has("address_proof")) {
    const bd = bill.bill_date ?? "";
    const age = /^\d{4}-\d{2}-\d{2}$/.test(bd) ? Math.round((Date.parse(referenceDate) - Date.parse(bd)) / 86_400_000) : NaN;
    if (Number.isNaN(age)) add("review", "address_proof", "bill_date_unreadable", { value: bd });
    else if (age > ADDRESS_PROOF_MAX_AGE_DAYS) add("action", "address_proof", "address_proof_stale", { billDate: bd, ageDays: age, limit: ADDRESS_PROOF_MAX_AGE_DAYS });
    else if (age < 0) add("review", "address_proof", "address_proof_future_dated", { billDate: bd });
    const refAddr = greg?.principal_place_of_business ?? gst.address;
    if (refAddr && bill.address && !sameAddress(bill.address, refAddr)) add("review", "address_proof", "address_mismatch");
    const refName = greg?.trade_name ?? gst.trade_name;
    if (refName && bill.billed_to && nameSimilarity(bill.billed_to, refName) < 0.9) add("review", "address_proof", "billed_to_mismatch", { billedTo: bill.billed_to, expected: refName });
  }

  // --- Cross-document name consistency
  const names = ([["gst_certificate", gst.trade_name], ["udyam_certificate", ud.enterprise_name], ["signatory_id", idd.for_business], ["address_proof", bill.billed_to]] as const)
    .filter(([d, v]) => v && !unreadable.has(d));
  const base = names[0]?.[1];
  for (const [d, v] of names) if (base && v && nameSimilarity(v, base) < 0.9) add("review", d, "cross_doc_name_mismatch", { onDocument: v, expected: base });
  const inner = /\(prop\.?\s*([^)]+)\)/i.exec(gst.legal_name ?? "");
  if (inner && gst.trade_name && canon(inner[1]) !== canon(gst.trade_name)) add("review", "gst_certificate", "legal_vs_trade_name_internal", { legalRefers: inner[1], tradeName: gst.trade_name });

  const sev = new Set(F.map((f) => f.severity));
  const verdict: Verdict = sev.has("reject") ? "REJECT" : sev.has("review") ? "REVIEW" : sev.has("action") ? "NEEDS_ACTION" : "PASS";
  return { verdict, findings: F, resolvedGstin: greg?.gstin };
}
