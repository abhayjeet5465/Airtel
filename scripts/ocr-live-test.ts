/** Proves the live OCR path: re-encodes K11's specimens as JPEG (new hashes, so the cache cannot match) and runs
 *  them through the API with the local OCR service. Expected verdict: NEEDS_ACTION (stale bill). */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

process.env.OCR_SERVICE_URL ??= "http://127.0.0.1:8790";
process.env.STORE = "memory";
const { app } = await import("../server/app.ts");

const src = resolve(import.meta.dirname, "../../YTL_TrackA_Udyam_Digital_Data/kyc_documents");
const out = mkdtempSync(join(tmpdir(), "udyam-"));
const py = "C:/Users/abhay/.venvs/udyam-ocr/Scripts/python.exe";
const docs = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"];
for (const d of docs) execFileSync(py, ["-c", `import cv2;cv2.imwrite(r"${join(out, d + ".jpg")}", cv2.imread(r"${join(src, "K11_" + d + ".png")}"), [cv2.IMWRITE_JPEG_QUALITY, 90])`]);

let sid = "";
const call = async (m: string, p: string, body?: unknown) => {
  const form = body instanceof FormData;
  const r = await app.request(`/api${p}`, { method: m, headers: { ...(sid ? { "x-session-id": sid } : {}), ...(body && !form ? { "content-type": "application/json" } : {}) }, body: form ? body : body ? JSON.stringify(body) : undefined });
  return (await r.json()) as any;
};
sid = (await call("POST", "/session")).sessionId;
await call("PUT", "/profile", { businessName: "Trinity Bake House Pvt Ltd", contactName: "Vikram Pillai", city: "Ludhiana", gstin: "03KGZXT1320R1ZZ" });
await call("POST", "/consent", { purpose: "kyc_verification", noticeVersion: "kyc-notice-v1" });
for (const d of docs) {
  const f = new FormData();
  f.set("doc_type", d);
  f.set("file", new Blob([readFileSync(join(out, d + ".jpg"))], { type: "image/jpeg" }), d + ".jpg");
  const t0 = Date.now();
  const u = await call("POST", "/kyc/upload", f);
  console.log(d, u.source, `${Date.now() - t0} ms`, JSON.stringify(u.fields));
}
const k = await call("POST", "/kyc/submit");
console.log("verdict:", k.verdict, k.findings.filter((f: any) => f.severity !== "info").map((f: any) => f.message));
