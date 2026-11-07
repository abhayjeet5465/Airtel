/** Persistence interface + in-memory implementation (local fallback). A Supabase implementation plugs in behind
 *  the same interface when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set. Everything is scoped by session. */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Bundle, DocType, GstStatus, KycResult, Lang, Needs, Quote, Recommendation } from "../core/types.ts";
import type { Fields } from "../core/kyc.ts";

export interface Profile {
  businessName: string;
  contactName: string;
  phoneLast4?: string;
  city: string;
  cityTier: 1 | 2;
  state: string;
  constitution?: string;
  gstin?: string;
  gstStatus: GstStatus;
  udyamNumber?: string;
  udyamVerified?: boolean;
  language: Lang;
}

export interface QuoteRecord { id: string; sessionId: string; needs: Needs; bundle: Bundle; quote: Quote; status: "draft" | "accepted" | "invalidated"; createdAt: string; validUntil: string }
export interface ConsentRecord { id: string; sessionId: string; purpose: "registry_lookup" | "kyc_verification" | "order_communication"; noticeVersion: string; lang: Lang; grantedAt: string; withdrawnAt?: string }
export interface KycDocRecord { id: string; sessionId: string; docType: DocType; sha256: string; sizeBytes: number; mimeType: string; sharpness?: number; skew?: number; fields: Fields; source: "ocr_service" | "cached_specimen" | "unrecognised"; storagePath?: string; uploadedAt: string; retentionUntil: string }
export interface KycCaseRecord { id: string; sessionId: string; result: KycResult; decidedBy: "engine" | "reviewer"; reviewerNote?: string; createdAt: string }
export type OrderStatus = "placed" | "kyc_verified" | "installation_scheduled" | "installed" | "activated" | "on_hold" | "cancelled";
export interface OrderRecord { id: string; sessionId: string; quoteId: string; kycCaseId: string; status: OrderStatus; expectedActivationDate: string; slot: { date: string; window: string }; history: { status: OrderStatus; note: string; at: string }[]; createdAt: string }
export interface AdvisorRecord { sessionId: string; needs: Needs; recommendation: Recommendation; mode: string; at: string }

export interface Store {
  mode: "memory" | "supabase";
  createSession(): Promise<string>;
  hasSession(s: string): Promise<boolean>;
  /** Optional: keep the image in private storage (Supabase). Memory mode keeps only hash + fields. */
  putDocumentImage?(sessionId: string, docType: string, buf: Buffer, mime: string): Promise<string>;
  documentUrl?(path: string): Promise<string>;
  getProfile(s: string): Promise<Profile | null>;
  saveProfile(s: string, p: Profile): Promise<void>;
  saveAdvisor(r: AdvisorRecord): Promise<void>;
  listAdvisor(): Promise<AdvisorRecord[]>;
  saveQuote(q: Omit<QuoteRecord, "id" | "createdAt">): Promise<QuoteRecord>;
  getQuote(id: string): Promise<QuoteRecord | null>;
  setQuoteStatus(id: string, status: QuoteRecord["status"]): Promise<void>;
  addConsent(c: Omit<ConsentRecord, "id" | "grantedAt">): Promise<ConsentRecord>;
  activeConsents(s: string): Promise<ConsentRecord[]>;
  withdrawConsent(s: string, purpose: ConsentRecord["purpose"]): Promise<void>;
  saveKycDoc(d: Omit<KycDocRecord, "id" | "uploadedAt">): Promise<KycDocRecord>;
  kycDocs(s: string): Promise<KycDocRecord[]>;
  saveKycCase(c: Omit<KycCaseRecord, "id" | "createdAt">): Promise<KycCaseRecord>;
  latestKycCase(s: string): Promise<KycCaseRecord | null>;
  allKycCases(): Promise<KycCaseRecord[]>;
  saveOrder(o: Omit<OrderRecord, "id" | "createdAt">): Promise<OrderRecord>;
  orders(s: string): Promise<OrderRecord[]>;
  getOrder(id: string): Promise<OrderRecord | null>;
  updateOrder(o: OrderRecord): Promise<void>;
  allProfiles(): Promise<[string, Profile][]>;
}

const now = () => new Date().toISOString();

/** In-memory store, optionally snapshotted to a git-ignored JSON file so local sessions survive dev-server restarts. */
export class MemoryStore implements Store {
  mode = "memory" as const;
  private sessions = new Set<string>();
  private profiles = new Map<string, Profile>();
  private advisor: AdvisorRecord[] = [];
  private quotes = new Map<string, QuoteRecord>();
  private consents: ConsentRecord[] = [];
  private docs: KycDocRecord[] = [];
  private cases: KycCaseRecord[] = [];
  private ordersById = new Map<string, OrderRecord>();

  constructor(private persistPath?: string) {
    if (persistPath && existsSync(persistPath)) {
      const d = JSON.parse(readFileSync(persistPath, "utf8"));
      this.sessions = new Set(d.sessions);
      this.profiles = new Map(d.profiles);
      this.advisor = d.advisor;
      this.quotes = new Map(d.quotes);
      this.consents = d.consents;
      this.docs = d.docs;
      this.cases = d.cases;
      this.ordersById = new Map(d.orders);
    }
  }

  private save<T>(v: T): T {
    if (this.persistPath) {
      writeFileSync(this.persistPath, JSON.stringify({
        sessions: [...this.sessions], profiles: [...this.profiles], advisor: this.advisor, quotes: [...this.quotes],
        consents: this.consents, docs: this.docs, cases: this.cases, orders: [...this.ordersById],
      }));
    }
    return v;
  }

  async createSession() { const id = randomUUID(); this.sessions.add(id); return this.save(id); }
  async hasSession(s: string) { return this.sessions.has(s); }
  async getProfile(s: string) { return this.profiles.get(s) ?? null; }
  async saveProfile(s: string, p: Profile) { this.profiles.set(s, p); this.save(0); }
  async allProfiles() { return [...this.profiles.entries()]; }
  async saveAdvisor(r: AdvisorRecord) { this.advisor = this.advisor.filter((a) => a.sessionId !== r.sessionId); this.advisor.push(r); this.save(0); }
  async listAdvisor() { return [...this.advisor]; }
  async saveQuote(q: Omit<QuoteRecord, "id" | "createdAt">) { const r = { ...q, id: randomUUID(), createdAt: now() }; this.quotes.set(r.id, r); return this.save(r); }
  async getQuote(id: string) { return this.quotes.get(id) ?? null; }
  async setQuoteStatus(id: string, status: QuoteRecord["status"]) { const q = this.quotes.get(id); if (q) q.status = status; this.save(0); }
  async addConsent(c: Omit<ConsentRecord, "id" | "grantedAt">) { const r = { ...c, id: randomUUID(), grantedAt: now() }; this.consents.push(r); return this.save(r); }
  async activeConsents(s: string) { return this.consents.filter((c) => c.sessionId === s && !c.withdrawnAt); }
  async withdrawConsent(s: string, purpose: ConsentRecord["purpose"]) { for (const c of this.consents) if (c.sessionId === s && c.purpose === purpose && !c.withdrawnAt) c.withdrawnAt = now(); this.save(0); }
  async saveKycDoc(d: Omit<KycDocRecord, "id" | "uploadedAt">) {
    // Re-upload of the same document type replaces the previous one.
    this.docs = this.docs.filter((x) => !(x.sessionId === d.sessionId && x.docType === d.docType));
    const r = { ...d, id: randomUUID(), uploadedAt: now() }; this.docs.push(r); return this.save(r);
  }
  async kycDocs(s: string) { return this.docs.filter((d) => d.sessionId === s); }
  async saveKycCase(c: Omit<KycCaseRecord, "id" | "createdAt">) { const r = { ...c, id: randomUUID(), createdAt: now() }; this.cases.push(r); return this.save(r); }
  async latestKycCase(s: string) { return [...this.cases].reverse().find((c) => c.sessionId === s) ?? null; }
  async allKycCases() { return [...this.cases]; }
  async saveOrder(o: Omit<OrderRecord, "id" | "createdAt">) { const r = { ...o, id: randomUUID(), createdAt: now() }; this.ordersById.set(r.id, r); return this.save(r); }
  async orders(s: string) { return [...this.ordersById.values()].filter((o) => o.sessionId === s); }
  async getOrder(id: string) { return this.ordersById.get(id) ?? null; }
  async updateOrder(o: OrderRecord) { this.ordersById.set(o.id, o); this.save(0); }
}
