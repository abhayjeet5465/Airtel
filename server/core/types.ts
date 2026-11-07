export type Lang = "en" | "hi";
export type Segment = "micro" | "prof" | "multi" | "mfg";
export type GstStatus = "Active" | "Cancelled" | "Suspended" | "No GSTIN" | "NotFound" | "Unchecked";
export type DocType = "gst_certificate" | "udyam_certificate" | "signatory_id" | "address_proof";
export type Verdict = "PASS" | "NEEDS_ACTION" | "REVIEW" | "REJECT";
export type Severity = "info" | "action" | "review" | "reject";

export interface Product {
  id: string;
  category: string;
  name: string;
  description: string;
  unit: string;
  priceMin: number;
  priceMax: number;
  listPrice: number;
  setupFee: number;
  minContractMonths: number;
  cityTiers: number[];
  minEmployees: number;
  minSites: number;
  requiresGstin: boolean;
  requiresOneOf: string[];
  installDays: number;
  targetSegments: Segment[];
}

export interface EligibilityProfile {
  cityTier: 1 | 2;
  employees: number;
  sites: number;
  gstStatus: GstStatus;
}

export type Rule =
  | "city_tier"
  | "min_employees"
  | "min_sites"
  | "gstin_missing"
  | "gstin_cancelled"
  | "gstin_suspended"
  | "gstin_not_active"
  | "dependency"
  | "unknown_product"
  | "quantity"
  | "redundant";

export interface Failure {
  rule: Rule;
  productId: string;
  params: Record<string, string | number>;
  blocking: boolean;
}

export type Bundle = Record<string, number>;

export interface QuoteLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  monthly: number;
  setup: number;
  minContractMonths: number;
  installDays: number;
}

export interface Quote {
  lines: QuoteLine[];
  monthlyExGst: number;
  gstRate: number;
  monthlyGst: number;
  monthlyInclGst: number;
  setupExGst: number;
  setupGst: number;
  firstPaymentInclGst: number;
  contractMonths: number;
  contractValueExGst: number;
  activationEtaDays: number;
  pricePolicy: string;
  catalogueVersion: string;
}

/** Structured needs collected by the advisor (LLM or tap-to-answer). */
export interface Needs {
  businessType?: string;
  segment: Segment;
  cityTier: 1 | 2;
  city?: string;
  employees: number;
  sites: number;
  currentInternet?: "none" | "mobile_hotspot" | "home_broadband" | "business_broadband" | "leased_line" | "mixed";
  priority?: "lowest_price" | "reliability";
  wants: {
    payments?: boolean;
    whatsapp?: boolean;
    sms?: boolean;
    website?: boolean;
    cctvCameras?: number;
    guestWifi?: boolean;
    phoneLines?: number;
    emailUsers?: number;
    backupInternet?: boolean;
    securityDevices?: number;
    centralManagement?: boolean;
    dedicatedBandwidth?: boolean;
    machineDevices?: number;
    fleetVehicles?: number;
    cloudBackup?: boolean;
    tollFree?: boolean;
    callChannels?: number;
    staticIp?: boolean;
    firewall?: boolean;
  };
}

export type Want = keyof Needs["wants"] | "internet";

export interface RecommendedItem {
  productId: string;
  quantity: number;
  want: Want;
  reasons: string[];
}

export interface Recommendation {
  bundle: Bundle;
  items: RecommendedItem[];
  unmet: { want: Want; productIds: string[]; failures: Failure[] }[];
  optionalAddOns: string[];
  notes: string[];
  engineVersion: string;
}

export interface KycFinding {
  severity: Severity;
  document: DocType;
  code: string;
  params: Record<string, string | number>;
}

export interface KycResult {
  verdict: Verdict;
  findings: KycFinding[];
  resolvedGstin?: string;
}
