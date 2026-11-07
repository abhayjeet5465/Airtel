"""Image quality, cleanup and layout-based field extraction (same method as analysis/KYC_FORENSIC_REPORT.md).

Pipeline: watermark/colour cleanup + sharpen -> PaddleOCR -> map boxes into document-frame coordinates
(fixes rotation and scale) -> drop watermark fragments -> assign value tokens to calibrated field rows.
"""
import json
import re
from pathlib import Path

import cv2
import numpy as np

LAYOUTS = json.loads((Path(__file__).parent / "layouts.json").read_text())

WATERMARK_WORD = re.compile(r"^(no|do|not|a|valid\w*|vali|docu\w*|\w*specimen\w*|\w*thetic\w*|\w*cimen\w*|syn\w*|doz\w*|-)$", re.I)
CHROME = re.compile(r"specimen:|registration certificate|electricity bill|signatory id|format for|fictional|hackathon|identifiers|ocr testing|^certificate$|^registration$|^gst$|^udyam$", re.I)
ID_LABEL = re.compile(r"^(name|designation|for business|for|business|id no|id|no|valid till|valid|till)(\b|_)[\s._:]*", re.I)


def remove_watermark(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    out = bgr.copy()
    out[((h <= 12) | (h >= 160)) & (s >= 25) & (v >= 120)] = 255
    return out


def preprocess(bgr):
    gray = cv2.cvtColor(remove_watermark(bgr), cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    sharp = cv2.addWeighted(gray, 1.6, cv2.GaussianBlur(gray, (0, 0), 2), -0.6, 0)
    return cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)


def sharpness(bgr):
    gray = cv2.cvtColor(remove_watermark(bgr), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def doc_frame(bgr):
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, th = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    cnts, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h_img, w_img = gray.shape
    if not cnts:
        return dict(cx=w_img / 2, cy=h_img / 2, w=w_img, h=h_img, angle=0.0)
    (cx, cy), (w, h), raw = cv2.minAreaRect(max(cnts, key=cv2.contourArea))
    a = (raw + 45) % 90 - 45
    if round(abs(a - raw)) % 180 == 90:
        w, h = h, w
    if w * h < 0.25 * w_img * h_img:  # no clear frame (real photo): use the whole image
        return dict(cx=w_img / 2, cy=h_img / 2, w=w_img, h=h_img, angle=0.0)
    return dict(cx=cx, cy=cy, w=w, h=h, angle=round(float(a), 2))


def _to_frame(x, y, fr):
    t = np.deg2rad(-fr["angle"])
    dx, dy = x - fr["cx"], y - fr["cy"]
    return (dx * np.cos(t) - dy * np.sin(t)) / fr["w"] + 0.5, (dx * np.sin(t) + dy * np.cos(t)) / fr["h"] + 0.5


def _tokens(lines, fr):
    hs = [ln["box"][3] - ln["box"][1] for ln in lines if ln["text"].strip()]
    med_h = float(np.median(hs)) if hs else 0
    out = []
    for ln in lines:
        t = ln["text"].strip()
        x0, y0, x1, y1 = ln["box"]
        if not t or ln["conf"] < 0.3 or WATERMARK_WORD.match(t) or CHROME.search(t):
            continue
        if med_h and (y1 - y0) > 2.2 * med_h and fr["angle"] == 0:
            continue
        uc, v = _to_frame((x0 + x1) / 2, (y0 + y1) / 2, fr)
        half_w = (x1 - x0) / 2 / fr["w"] * np.cos(np.deg2rad(fr["angle"]))
        out.append(dict(text=t, u=uc - half_w, v=v, conf=ln["conf"]))
    return out


def _clean(field, value):
    v = re.sub(r"\s+", " ", value).strip()
    if "date" in field or field == "valid_till":
        d = re.sub(r"\D", "", v)
        return f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else v
    if field in {"gstin", "consumer_no"}:
        return re.sub(r"[^0-9A-Za-z]", "", v).upper()
    if field in {"udyam_number", "id_no"}:
        return re.sub(r"\s", "", v).upper().replace("--", "-")
    return v


def extract_fields(doc_type, lines, fr):
    layout = LAYOUTS[doc_type]
    split = 0.30 if doc_type == "signatory_id" else 0.38
    vals = [t for t in _tokens(lines, fr) if t["u"] >= split]
    if doc_type == "signatory_id":
        kept = []
        for t in vals:
            txt = ID_LABEL.sub("", t["text"]).strip()
            while txt and ID_LABEL.match(txt):
                txt = ID_LABEL.sub("", txt).strip()
            if txt:
                kept.append({**t, "text": txt})
        vals = kept
    pitch = float(np.median(np.diff(sorted(layout.values())))) if len(layout) > 1 else 0.04
    buckets = {}
    for t in vals:
        f, d = min(((f, abs(t["v"] - v)) for f, v in layout.items()), key=lambda x: x[1])
        if d < 0.45 * pitch:
            buckets.setdefault(f, []).append(t)
    fields = {f: " ".join(t["text"] for t in sorted(ts, key=lambda t: t["u"])) for f, ts in buckets.items()}
    if "address2" in fields:
        fields["address"] = (fields.get("address", "") + " " + fields.pop("address2")).strip()
    return {f: _clean(f, v) for f, v in fields.items()}
