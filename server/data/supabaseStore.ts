/** Supabase-backed Store. Uses the service-role key server-side only; tables have RLS on with no policies,
 *  so the browser (publishable key) can read nothing directly. */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorRecord, ConsentRecord, KycCaseRecord, KycDocRecord, OrderRecord, Profile, QuoteRecord, Store } from "./store.ts";

export const BUCKET = "kyc-private";

export function supabaseAdmin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`supabase: ${r.error.message}`);
  return r.data;
}
/** List queries: no error means data is an array. */
function rows<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(`supabase: ${r.error.message}`);
  return r.data ?? [];
}

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  private db = supabaseAdmin();

  async createSession() { const id = randomUUID(); check(await this.db.from("app_sessions").insert({ id })); return id; }
  async hasSession(s: string) { return !!check(await this.db.from("app_sessions").select("id").eq("id", s).maybeSingle()); }

  async getProfile(s: string) { return (check(await this.db.from("business_profiles").select("data").eq("session_id", s).maybeSingle())?.data as Profile) ?? null; }
  async saveProfile(s: string, p: Profile) { check(await this.db.from("business_profiles").upsert({ session_id: s, gst_status: p.gstStatus, data: p, updated_at: new Date().toISOString() })); }
  async allProfiles() { return rows(await this.db.from("business_profiles").select("session_id, data")).map((r) => [r.session_id, r.data] as [string, Profile]); }

  async saveAdvisor(r: AdvisorRecord) { check(await this.db.from("advisor_runs").upsert({ session_id: r.sessionId, data: r })); }
  async listAdvisor() { return rows(await this.db.from("advisor_runs").select("data")).map((r) => r.data as AdvisorRecord); }

  async saveQuote(q: Omit<QuoteRecord, "id" | "createdAt">) {
    const rec: QuoteRecord = { ...q, id: randomUUID(), createdAt: new Date().toISOString() };
    check(await this.db.from("quotes").insert({ id: rec.id, session_id: q.sessionId, status: q.status, valid_until: q.validUntil, data: rec }));
    return rec;
  }
  async getQuote(id: string) {
    const r = check(await this.db.from("quotes").select("status, data").eq("id", id).maybeSingle());
    return r ? ({ ...(r.data as QuoteRecord), status: r.status } as QuoteRecord) : null;
  }
  async setQuoteStatus(id: string, status: QuoteRecord["status"]) { check(await this.db.from("quotes").update({ status }).eq("id", id)); }

  async addConsent(c: Omit<ConsentRecord, "id" | "grantedAt">) {
    const rec: ConsentRecord = { ...c, id: randomUUID(), grantedAt: new Date().toISOString() };
    check(await this.db.from("consent_records").insert({ id: rec.id, session_id: c.sessionId, purpose: c.purpose, notice_version: c.noticeVersion, lang: c.lang, granted_at: rec.grantedAt }));
    return rec;
  }
  async activeConsents(s: string) {
    return rows(await this.db.from("consent_records").select("*").eq("session_id", s).is("withdrawn_at", null)).map(
      (r) => ({ id: r.id, sessionId: r.session_id, purpose: r.purpose, noticeVersion: r.notice_version, lang: r.lang, grantedAt: r.granted_at }) as ConsentRecord,
    );
  }
  async withdrawConsent(s: string, purpose: ConsentRecord["purpose"]) {
    check(await this.db.from("consent_records").update({ withdrawn_at: new Date().toISOString() }).eq("session_id", s).eq("purpose", purpose).is("withdrawn_at", null));
  }

  async saveKycDoc(d: Omit<KycDocRecord, "id" | "uploadedAt">) {
    const rec: KycDocRecord = { ...d, id: randomUUID(), uploadedAt: new Date().toISOString() };
    check(await this.db.from("kyc_documents").upsert({
      id: rec.id, session_id: d.sessionId, doc_type: d.docType, sha256: d.sha256, size_bytes: d.sizeBytes, mime_type: d.mimeType,
      sharpness: d.sharpness ?? null, skew: d.skew ?? null, fields: d.fields, source: d.source, storage_path: d.storagePath ?? null,
      uploaded_at: rec.uploadedAt, retention_until: d.retentionUntil,
    }, { onConflict: "session_id,doc_type" }));
    return rec;
  }
  async kycDocs(s: string) {
    return rows(await this.db.from("kyc_documents").select("*").eq("session_id", s)).map((r) => ({
      id: r.id, sessionId: r.session_id, docType: r.doc_type, sha256: r.sha256, sizeBytes: r.size_bytes, mimeType: r.mime_type,
      sharpness: r.sharpness === null ? undefined : Number(r.sharpness), skew: r.skew === null ? undefined : Number(r.skew),
      fields: r.fields, source: r.source, storagePath: r.storage_path ?? undefined, uploadedAt: r.uploaded_at, retentionUntil: r.retention_until,
    }) as KycDocRecord);
  }

  async saveKycCase(c: Omit<KycCaseRecord, "id" | "createdAt">) {
    const rec: KycCaseRecord = { ...c, id: randomUUID(), createdAt: new Date().toISOString() };
    check(await this.db.from("kyc_cases").insert({ id: rec.id, session_id: c.sessionId, verdict: c.result.verdict, decided_by: c.decidedBy, reviewer_note: c.reviewerNote ?? null, result: c.result, created_at: rec.createdAt }));
    return rec;
  }
  private mapCase = (r: any): KycCaseRecord => ({ id: r.id, sessionId: r.session_id, result: { ...r.result, verdict: r.verdict }, decidedBy: r.decided_by, reviewerNote: r.reviewer_note ?? undefined, createdAt: r.created_at });
  async latestKycCase(s: string) {
    const r = check(await this.db.from("kyc_cases").select("*").eq("session_id", s).order("created_at", { ascending: false }).limit(1).maybeSingle());
    return r ? this.mapCase(r) : null;
  }
  async allKycCases() { return rows(await this.db.from("kyc_cases").select("*").order("created_at")).map(this.mapCase); }

  async saveOrder(o: Omit<OrderRecord, "id" | "createdAt">) {
    const rec: OrderRecord = { ...o, id: randomUUID(), createdAt: new Date().toISOString() };
    check(await this.db.from("orders").insert({ id: rec.id, session_id: o.sessionId, quote_id: o.quoteId, kyc_case_id: o.kycCaseId, status: o.status, data: rec }));
    return rec;
  }
  async orders(s: string) { return rows(await this.db.from("orders").select("status, data").eq("session_id", s)).map((r) => ({ ...(r.data as OrderRecord), status: r.status })); }
  async getOrder(id: string) {
    const r = check(await this.db.from("orders").select("status, data").eq("id", id).maybeSingle());
    return r ? ({ ...(r.data as OrderRecord), status: r.status } as OrderRecord) : null;
  }
  async updateOrder(o: OrderRecord) { check(await this.db.from("orders").update({ status: o.status, data: o }).eq("id", o.id)); }

  async putDocumentImage(sessionId: string, docType: string, buf: Buffer, mime: string) {
    const path = `${sessionId}/${docType}-${randomUUID()}`;
    const { error } = await this.db.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (error) throw new Error(`storage: ${error.message}`);
    return path;
  }
  async documentUrl(path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) throw new Error(`storage: ${error.message}`);
    return data.signedUrl;
  }
}
