"""Local OCR service for Udyam Digital (PaddleOCR PP-OCRv5 mobile, CPU).

Run:  <venv>/python -m uvicorn app:app --port 8790     (from this folder)
POST /extract (multipart: doc_type, file) -> {fields, sharpness, skew}
Images are processed in memory and never written to disk.
"""
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from extract import doc_frame, extract_fields, preprocess, sharpness

DOC_TYPES = {"gst_certificate", "udyam_certificate", "signatory_id", "address_proof"}
BLUR_THRESHOLD = 150
app = FastAPI(title="Udyam Digital OCR")
_reader = None


def reader():
    global _reader
    if _reader is None:
        from paddleocr import PaddleOCR
        _reader = PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False,
                            text_detection_model_name="PP-OCRv5_mobile_det", text_recognition_model_name="en_PP-OCRv5_mobile_rec")
    return _reader


def _box(poly):
    pts = np.asarray(poly, dtype=float).reshape(-1, 2)
    return [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())]


@app.get("/health")
def health():
    return {"ok": True, "engine": "paddleocr-pp-ocrv5-mobile"}


@app.post("/extract")
async def extract(doc_type: str = Form(...), file: UploadFile = File(...)):
    if doc_type not in DOC_TYPES:
        raise HTTPException(422, "unknown doc_type")
    buf = np.frombuffer(await file.read(), np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(422, "not an image (PDF pages must be converted first)")
    t0 = time.perf_counter()
    sharp = sharpness(img)
    frame = doc_frame(img)
    if sharp < BLUR_THRESHOLD:
        return {"fields": {}, "sharpness": sharp, "skew": frame["angle"], "seconds": round(time.perf_counter() - t0, 2)}
    res = reader().predict(preprocess(img))[0]
    lines = [{"text": t, "conf": float(c), "box": [v / 1.5 for v in _box(p)]} for t, c, p in zip(res["rec_texts"], res["rec_scores"], res["rec_polys"])]
    return {"fields": extract_fields(doc_type, lines, frame), "sharpness": sharp, "skew": frame["angle"], "seconds": round(time.perf_counter() - t0, 2)}
