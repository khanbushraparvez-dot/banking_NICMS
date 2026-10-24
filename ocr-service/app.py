import base64
import io
import os
import re
from typing import Optional

import fitz
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from paddleocr import PaddleOCR

app = FastAPI(title="ARSKEIL Open OCR", version="2.0.0")
allowed = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed or ["*"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"]
)

# PaddleOCR 2.10 uses language code "mr" for Marathi/Devanagari.
# The service remains usable for English-only documents if Marathi model loading fails.
ocr_en = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
try:
    ocr_mr = PaddleOCR(use_angle_cls=True, lang="mr", show_log=False)
    MARATHI_MODEL_READY = True
except Exception as exc:
    ocr_mr = None
    MARATHI_MODEL_READY = False
    print("Marathi OCR model unavailable; English OCR remains active:", str(exc)[:300])

class ExtractRequest(BaseModel):
    fileName: str = "document.pdf"
    mimeType: str = "application/pdf"
    fileBase64: str
    bankCode: str = "OTHERS"
    ownerNames: list[str] = Field(default_factory=list)
    prompt: str = ""


def pdf_pages(raw: bytes, mime: str):
    pages = []
    if mime.lower().split(";")[0].strip() == "application/pdf" or raw[:4] == b"%PDF":
        doc = fitz.open(stream=raw, filetype="pdf")
        if len(doc) > 30:
            raise ValueError("PDF has more than 30 pages. Split it into smaller PDFs and retry.")
        if len(doc) == 0:
            raise ValueError("The PDF contains no pages.")
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(2.4, 2.4), alpha=False)
            pages.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
    else:
        pages.append(Image.open(io.BytesIO(raw)).convert("RGB"))
    return pages


def pdf_text_layer(raw: bytes, mime: str) -> str:
    if mime.lower().split(";")[0].strip() != "application/pdf" and raw[:4] != b"%PDF":
        return ""
    try:
        doc = fitz.open(stream=raw, filetype="pdf")
        return "\n".join(page.get_text("text") or "" for page in doc).strip()
    except Exception:
        return ""


def has_devanagari(text: str) -> bool:
    return bool(re.search(r"[\u0900-\u097F]", text or ""))


def run_ocr(engine, image: Image.Image):
    arr = np.asarray(image.convert("RGB"))
    results = engine.ocr(arr, cls=True)
    lines = []
    for block in results or []:
        for item in block or []:
            try:
                value = str(item[1][0]).strip()
                if value and value not in lines:
                    lines.append(value)
            except Exception:
                continue
    return lines


def ocr_pages(pages, file_name: str, text_hint: str = "") -> str:
    # Use the Marathi-capable model for Index 2 / Devanagari; always run English too.
    name = (file_name or "").lower()
    likely_index = any(k in name for k in ("index", "index2", "index_2", "index ii", "suchi", "7-12"))
    devanagari_hint = has_devanagari(text_hint)
    all_pages = []
    for page in pages:
        lines = []
        if ocr_mr is not None and (likely_index or devanagari_hint):
            lines.extend(run_ocr(ocr_mr, page))
        lines.extend(run_ocr(ocr_en, page))
        # Preserve original reading order as much as possible while removing exact duplicates.
        seen = set()
        cleaned = []
        for line in lines:
            key = re.sub(r"\W+", "", line.lower())
            if key and key not in seen:
                seen.add(key)
                cleaned.append(line)
        all_pages.append("\n".join(cleaned))
    return "\n\n".join(all_pages).strip()


def field(value, confidence=0, missing=None):
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip(" \t\r\n:;-|,.")
    absent = (value is None or value == "" or value == []) if missing is None else missing
    return {
        "value": None if absent else value,
        "confidence": 0 if absent else int(confidence),
        "doubtful": False if absent else int(confidence) < 72,
        "missing": bool(absent),
    }


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", (line or "").replace("\u00a0", " ")).strip(" \t\r\n")


def label_value(lines, patterns, min_len=2, max_len=180, allow_next=True):
    """Read label/value pairs even when OCR splits the label and value across lines."""
    compiled = [re.compile(p, re.I) for p in patterns]
    for i, original in enumerate(lines):
        line = clean_line(original)
        if not line:
            continue
        for rx in compiled:
            m = rx.search(line)
            if not m:
                continue
            # Many patterns capture the value themselves; otherwise use the text after the label.
            value = (m.group(1) if m.lastindex else line[m.end():]).strip(" \t:：=-|#")
            # Remove common OCR separators and a repeated label fragment.
            value = re.sub(r"^(?:[:：=\-|#]|\s)+", "", value).strip()
            if len(value) >= min_len:
                value = value[:max_len]
                if not looks_like_other_label(value):
                    return value
            if allow_next:
                for nxt in lines[i + 1:min(i + 3, len(lines))]:
                    nxt = clean_line(nxt)
                    if not nxt:
                        continue
                    if looks_like_other_label(nxt):
                        break
                    if len(nxt) >= min_len:
                        return nxt[:max_len]
    return None


def looks_like_other_label(line: str) -> bool:
    return bool(re.match(
        r"^(?:name of|applicant|co.?applicant|co.?borrower|borrower|customer|loan|application|proposal|sanction|amount|rate of interest|roi|interest rate|branch|bank|lender|property|security|address|details of property|total amount|date|term|tenure|emi|contact|mobile|pan|aadhaar|sro|document no|village|taluka|district)\b\s*[:：=-]?\s*$",
        clean_line(line), re.I
    ))


def value_after_label(text: str, patterns, min_len=2, max_len=180):
    return label_value(text.splitlines(), patterns, min_len=min_len, max_len=max_len)


def extract_amount(text: str) -> Optional[str]:
    # Prefer explicit sanctioned amount labels; never use requested amount/property value by fallback.
    lines = text.splitlines()
    priorities = [
        r"(?:total\s+)?amount\s+sanctioned\b",
        r"sanctioned\s+(?:loan\s+)?amount\b",
        r"loan\s+amount\s+sanctioned\b",
        r"sanction\s+(?:loan\s+)?amount\b",
        r"approved\s+(?:loan\s+)?amount\b",
        r"amount\s+of\s+loan\s+sanctioned\b",
        r"loan\s+amount\s*\(?(?:including|incl\.?)(?:\s+insurance)?\)?\b",
    ]
    money = r"(?:₹|INR\b|RS\.?\s*)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)"
    for pat in priorities:
        rx = re.compile(pat, re.I)
        for i, rawline in enumerate(lines):
            line = clean_line(rawline)
            m = rx.search(line)
            if not m:
                continue
            tail = line[m.end():]
            amt = re.search(money, tail, re.I)
            if amt:
                return amt.group(1).replace(",", "")
            # Some forms print label and value on adjacent line.
            for nxt in lines[i + 1:min(i + 3, len(lines))]:
                amt = re.search(money, clean_line(nxt), re.I)
                if amt:
                    return amt.group(1).replace(",", "")
    return None


def extract_roi(text: str) -> Optional[str]:
    patterns = [
        r"(?:rate\s+of\s+interest|interest\s+rate|ROI|annual\s+interest\s+rate|applicable\s+rate)\s*(?:\([^)]*\))?\s*[:：=\-]?\s*([0-9]{1,2}(?:\.[0-9]{1,3})?\s*%?)",
    ]
    val = value_after_label(text, patterns, min_len=1, max_len=30)
    if not val:
        return None
    m = re.search(r"\d{1,2}(?:\.\d{1,3})?\s*%?", val)
    if not m:
        return None
    out = m.group(0).replace(" ", "")
    return out if out.endswith("%") else out + "%"


def extract_property_address(text: str) -> Optional[str]:
    lines = [clean_line(x) for x in text.splitlines()]
    anchors = re.compile(
        r"(?:details\s+of\s+(?:the\s+)?property|property\s*/\s*security\s+address|property\s+and\s+security\s+address|security\s+address|address\s+of\s+(?:the\s+)?property|property\s+address|property\s+offered\s+as\s+security|description\s+of\s+(?:the\s+)?property|security\s+details|collateral\s+address|mortgaged\s+property)", re.I)
    stop = re.compile(r"^(?:applicant|borrower|co.?applicant|customer\s+address|residential\s+address|correspondence\s+address|present\s+address|permanent\s+address|loan|application|sanction|rate of interest|ROI|branch|bank|lender|amount|EMI|tenure|term|signature|date|contact|mobile|PAN|Aadhaar|declaration|witness)\b", re.I)
    for i, line in enumerate(lines):
        m = anchors.search(line)
        if not m:
            continue
        pieces = []
        tail = line[m.end():].strip(" :：=-|#")
        if tail and not re.match(r"^(?:details|address)\s*$", tail, re.I):
            pieces.append(tail)
        for nxt in lines[i + 1:min(i + 5, len(lines))]:
            if not nxt:
                continue
            if stop.search(nxt):
                break
            # Avoid swallowing table labels unrelated to property.
            if re.match(r"^(?:loan amount|amount sanctioned|total amount|interest rate|ROI|branch name|bank name|application no|application number)\b", nxt, re.I):
                break
            pieces.append(nxt)
            if len(" ".join(pieces)) >= 240:
                break
        value = re.sub(r"\s+", " ", " ".join(pieces)).strip(" :;,-")
        if len(value) >= 8 and not looks_like_other_label(value):
            return value[:240]
    return None


def extract_bank(text: str) -> Optional[str]:
    labeled = value_after_label(text, [
        r"(?:bank\s*/\s*financial\s+institution|bank\s+name|lender\s+name|name\s+of\s+(?:the\s+)?bank|name\s+of\s+(?:the\s+)?lender|financier)\s*[:：=\-]?\s*(.*)"
    ], min_len=3, max_len=100)
    if labeled and not re.search(r"account|branch address|ifsc", labeled, re.I):
        return labeled
    # Bank-independent candidates: use lender/financial institution names, not every line containing "bank".
    for raw in text.splitlines()[:45]:
        line = clean_line(raw)
        if not line or len(line) > 110:
            continue
        if re.search(r"\b(?:bank|finance|financial services|housing finance|capital|credit|lending|microfinance|cooperative|co-operative|nbfc)\b", line, re.I):
            if re.search(r"\b(?:account|balance|transfer|statement|IFSC|MICR|borrower bank account)\b", line, re.I):
                continue
            if not re.search(r"\b(?:sanction letter|bank name|branch name|bank account)\b", line, re.I):
                return line[:100]
    return None


def extract_branch(text: str) -> Optional[str]:
    return value_after_label(text, [
        r"(?:branch\s+name|name\s+of\s+(?:the\s+)?branch|sanctioning\s+branch|loan\s+branch|branch)\s*[:：=\-]?\s*(.*)"
    ], min_len=2, max_len=90)


def guess_type(name: str, text: str) -> str:
    n = os.path.basename(name or "").lower()
    t = (text or "").lower()
    if any(k in n for k in ("index", "index2", "index_2", "index ii", "suchi")) or re.search(r"index\s*(?:ii|2)\b|सूची\s*(?:क्रमांक|२|2)|दुय्यम\s+निबंधक|document\s+no.{0,20}registration", t):
        return "IndexII"
    if "pan" in n or "permanent account number" in t or re.search(r"\b[A-Z]{5}\d{4}[A-Z]\b", text or "", re.I):
        return "PAN"
    if "aadhaar" in n or "aadhar" in n or "unique identification authority" in t or "आधार" in t:
        return "Aadhaar"
    sl_filename = bool(re.search(r"(?:^|[^a-z])sl(?:[ _-]?\d+)?(?:$|[^a-z])", n)) or any(k in n for k in ("sanction", "loan_letter", "loanletter"))
    sl_labels = sum(bool(re.search(p, t, re.I)) for p in [r"rate\s+of\s+interest", r"borrower", r"applicant", r"amount\s+sanctioned", r"loan\s+amount", r"property\s+address", r"sanction\s+letter"])
    if sl_filename or sl_labels >= 2:
        return "SanctionLetter"
    if "ना हरकत प्रमाणपत्र" in t or "no objection certificate" in t:
        return "MAHADA"
    return "Unknown"


def extract_index_fields(text: str):
    return {
        "sroOfficeName": field(value_after_label(text, [r"(?:SUB\.?\s*REGISTRAR|SRO\s*OFFICE|दुय्यम निबंधक|सह दुय्यम निबंधक)\s*[:：\-]?\s*(.*)"], 2, 100), 65),
        "documentNumber": field(value_after_label(text, [r"(?:DOCUMENT\s*(?:NO\.?|NUMBER)|DOC\.?\s*NO\.?|दस्त क्रमांक|दस्त क्र\.?)\s*[:：\-]?\s*([A-Z0-9\-/]{3,40})"], 3, 40), 70),
        "villageName": field(value_after_label(text, [r"(?:VILLAGE(?:\s*NAME)?|गावाचे नाव|गाव)\s*[:：\-]?\s*(.*)"], 2, 80), 60),
        "talukaName": field(value_after_label(text, [r"(?:TALUKA|तालुका)\s*[:：\-]?\s*(.*)"], 2, 80), 60),
        "districtName": field(value_after_label(text, [r"(?:DISTRICT|जिल्हा)\s*[:：\-]?\s*(.*)"], 2, 80), 60),
        "propertyAddress": field(value_after_label(text, [r"(?:PROPERTY ADDRESS|PROPERTY DESCRIPTION|मिळकतीचे वर्णन|मिळकत वर्णन|मिळकतीचा तपशील)\s*[:：\-]?\s*(.*)"], 5, 220), 60),
        "surveyNumbers": field(value_after_label(text, [r"(?:SURVEY\s*(?:NO\.?|NUMBER)|CTS\s*(?:NO\.?|NUMBER)?|GAT\s*(?:NO\.?|NUMBER)?|सर्वे नं|गट नं|सी\.?टी\.?एस\.?)\s*[:：\-]?\s*(.*)"], 1, 100), 60),
        "areaConstructed": field(value_after_label(text, [r"(?:CARPET AREA|BUILT.?UP AREA|AREA|क्षेत्रफळ|बांधकाम क्षेत्रफळ)\s*[:：\-]?\s*([0-9,.]+\s*(?:SQ\.?\s*M\.?|SQ\.?\s*FT\.?|SQUARE MET(?:ER|RE)S?)?)"], 1, 80), 60),
        "documentDate": field(value_after_label(text, [r"(?:DOCUMENT DATE|DATE OF DOCUMENT|REGISTRATION DATE|DATE)\s*[:：\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})"], 6, 20), 65),
        "ownerNames": field(extract_owner_names(text), 55),
    }


def extract_owner_names(text: str):
    names = []
    for line in text.splitlines():
        line = clean_line(line)
        if re.search(r"(?:PURCHASER|BUYER|OWNER|TRANSFEREE|खरेदीदार|मिळकतधारक|धारकाचे नाव)", line, re.I) and not re.search(r"(?:SELLER|VENDOR|GIVER|TRANSFEROR|देणार)", line, re.I):
            candidate = re.split(r"[:：]", line, maxsplit=1)[-1].strip(" .:-")
            if 2 <= len(candidate.split()) <= 7 and len(candidate) <= 90:
                if not re.search(r"PURCHASER|BUYER|OWNER|TRANSFEREE", candidate, re.I):
                    names.append(candidate)
    unique = list(dict.fromkeys(names))
    return unique or None


def extract_sl_fields(text: str):
    applicant = value_after_label(text, [
        r"^\s*(?:name\s+of\s+(?:the\s+)?applicant|applicant\s+name|name\s+of\s+(?:the\s+)?borrower|borrower\s+name|primary\s+borrower|customer\s+name|applicant|borrower)\b\s*[:：=\-]?\s*(.*)"
    ], min_len=3, max_len=100)
    coapp = value_after_label(text, [
        r"^\s*(?:name\s+of\s+(?:the\s+)?co[ -]?applicant|co[ -]?applicant\s+name|co[ -]?borrower\s+name|joint\s+applicant\s+name|co[ -]?borrower|co[ -]?applicant)\b\s*[:：=\-]?\s*(.*)"
    ], min_len=3, max_len=100)
    app_no = value_after_label(text, [
        r"(?:application\s*(?:/\s*loan\s*)?(?:form\s*)?(?:no\.?|number|#|id)|loan\s+(?:account\s+|agreement\s+)?(?:no\.?|number|#)|proposal\s*(?:no\.?|number|#)|finnone\s*(?:id|no\.?|number)|reference\s*(?:no\.?|number|#)|loan\s+id|application\s+reference|\bLAN\b)\s*[:：=\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,39})"
    ], min_len=3, max_len=50)
    amount = extract_amount(text)
    roi = extract_roi(text)
    bank = extract_bank(text)
    branch = extract_branch(text)
    property_address = extract_property_address(text)

    # Store only the required fields plus existing internal aliases used by the app's Case/NOI flow.
    return {
        "applicantName": field(applicant, 78 if applicant else 0),
        "coApplicantName": field(coapp, 72 if coapp else 0),
        "coApplicantNames": field([{"name": coapp, "isOwner": False}] if coapp else None, 72 if coapp else 0),
        "applicationNumber": field(app_no, 72 if app_no else 0),
        "loanAmountSanctioned": field(amount, 82 if amount else 0),
        "rateOfInterest": field(roi, 78 if roi else 0),
        "bankName": field(bank, 65 if bank else 0),
        "branchName": field(branch, 65 if branch else 0),
        "propertyAddress": field(property_address, 70 if property_address else 0),
    }


def map_fields(name, text, owner_names):
    typ = guess_type(name, text)
    if typ == "IndexII":
        fields = extract_index_fields(text)
    elif typ == "SanctionLetter":
        fields = extract_sl_fields(text)
    elif typ == "PAN":
        fields = {
            "holderName": field(value_after_label(text, [r"(?:NAME|नाम)\s*[:：\-]?\s*(.*)"], 3, 80), 70),
            "panNumber": field((re.search(r"\b([A-Z]{5}\d{4}[A-Z])\b", text, re.I) or [None, None])[1], 88),
            "dateOfBirth": field(value_after_label(text, [r"(?:DATE OF BIRTH|DOB|जन्म तिथि)\s*[:：\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})"], 6, 20), 75),
        }
    elif typ == "Aadhaar":
        nums = re.findall(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}\b", text)
        fields = {
            "holderName": field(value_after_label(text, [r"(?:NAME|नाम)\s*[:：\-]?\s*(.*)"], 3, 80), 70),
            "aadhaarNumber": field(re.sub(r"\D", "", nums[-1]) if nums else None, 88),
            "dateOfBirth": field(value_after_label(text, [r"(?:DOB|DATE OF BIRTH|YEAR OF BIRTH)\s*[:：\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4}|\d{4})"], 4, 20), 75),
            "address": field(value_after_label(text, [r"ADDRESS\s*[:：\-]?\s*(.*)"], 10, 180), 65),
        }
    else:
        fields = {}
    found = sum(1 for v in fields.values() if isinstance(v, dict) and not v.get("missing"))
    expected = max(len(fields), 1)
    warnings = []
    if not text.strip():
        warnings.append("No text detected. Use a clear, upright scan and retry.")
    if typ == "Unknown":
        warnings.append("Document type could not be identified. Choose the correct type or use a clearer file.")
    if typ == "SanctionLetter" and found < 4:
        warnings.append("Some required SL fields were not confidently found. Check the source scan and review the missing fields.")
    return {
        "documentType": typ,
        "overallConfidence": int(round(100 * found / expected)) if text.strip() else 0,
        "isMultiProductSL": False,
        "applicantIsOwner": False,
        "fields": fields,
        "matchedOwnerName": "",
        "matchConfidence": 0,
        "isIndexIIOwner": False,
        "warnings": warnings,
        "rawText": text,
        "ocrEngine": "PaddleOCR",
        "marathiModelReady": MARATHI_MODEL_READY,
    }


@app.get("/health")
def health():
    return {"ok": True, "engine": "PaddleOCR", "openSource": True, "marathiModelReady": MARATHI_MODEL_READY}


@app.post("/extract")
def extract(req: ExtractRequest, authorization: str = Header(default="")):
    expected = os.getenv("OCR_SERVICE_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Unauthorized OCR request.")
    try:
        raw = base64.b64decode(req.fileBase64, validate=True)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError("File exceeds 20 MB limit.")
        if not raw:
            raise ValueError("Uploaded file is empty.")
        text_layer = pdf_text_layer(raw, req.mimeType)
        # Use text layer for digitally-generated PDFs, but OCR scans or weak text layers.
        if len(re.sub(r"\W", "", text_layer)) >= 80:
            text = text_layer
            # Some PDFs have a partial text layer; supplement with OCR when it is unusually short.
            if len(re.sub(r"\W", "", text_layer)) < 220:
                pages = pdf_pages(raw, req.mimeType)
                scanned = ocr_pages(pages, req.fileName, text_layer)
                if len(scanned) > len(text_layer):
                    text = scanned + "\n" + text_layer
        else:
            pages = pdf_pages(raw, req.mimeType)
            text = ocr_pages(pages, req.fileName, text_layer)
        result = map_fields(req.fileName, text, req.ownerNames)
        result["ok"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        print("OCR extraction failed:", repr(exc))
        raise HTTPException(status_code=422, detail=f"OCR could not process this file. Check file format/quality and retry. Details: {str(exc)[:250]}")
