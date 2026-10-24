/**
 * ARSKEIL - OCR & AI Document Extraction Service
 *
 * Frontend-safe service module. NEVER put an OpenAI API key here.
 * Call a secure backend/Supabase Edge Function at /api/ocr/extract.
 */

export const OCR_DOCUMENT_TYPES = Object.freeze({
  SL: "SL",
  INDEX2: "INDEX2",
  PAN: "PAN",
  AADHAAR: "AADHAAR",
});

export const EXTRACTION_FIELDS = Object.freeze({
  SL: [
    "borrowerName", "coBorrowerName", "loanAccountOrApplicationNumber",
    "sanctionedLoanAmount", "propertyAddress", "bankName", "branch", "roi",
  ],
  INDEX2: [
    "documentNumber", "sroName", "purchaserOwnerName", "propertyAddress",
    "surveyNumber", "ctsNumber", "plotNumber", "gatNumber", "village",
    "taluka", "district", "propertyArea",
  ],
  PAN: ["name", "panNumber", "dateOfBirth"],
  AADHAAR: ["name", "aadhaarNumber", "dateOfBirthOrYearOfBirth", "address"],
});

export const EXTRACTION_RULES = Object.freeze({
  SL: [
    "Extract sanctioned loan amount, not processing fee, insurance, EMI, or another amount.",
    "Extract ROI/Rate of Interest specifically. Do NOT use processing-fee rate, APR, penal interest, overdue interest, or another interest rate.",
    "Property address means the security/property address only.",
    "Extract borrower and co-borrower names separately.",
    "Return null when a field is missing or unreadable; never guess.",
  ],
  INDEX2: [
    "The document may be entirely or partly in Marathi.",
    "Return every requested output field in English.",
    "Transliterate personal names and proper place names; do not translate their meaning.",
    "For purchaser/owner, select the receiving/buying party (घेणारा/घेणारे पक्षकार), NOT the giving/selling party (देणारा/देणारे पक्षकार).",
    "Extract property address separately from party names.",
    "Extract Survey No., CTS No., Plot No., and Gat No. separately when identifiable.",
    "If a property-number value appears in English in brackets immediately after the relevant address portion, capture it in the appropriate number field.",
    "Return null when a field is missing or unreadable; never guess.",
  ],
  PAN: [
    "Extract only printed PAN name, PAN number, and date of birth.",
    "Do not infer a date of birth that is not visible.",
  ],
  AADHAAR: [
    "Extract name, Aadhaar number, date/year of birth, and address.",
    "The UI should mask the Aadhaar number after extraction.",
    "Do not infer a date/year of birth that is not visible.",
  ],
});

export function buildExtractionPrompt(documentType) {
  const type = String(documentType || "").toUpperCase();
  if (!OCR_DOCUMENT_TYPES[type]) throw new Error(`Unsupported OCR document type: ${documentType}`);

  return [
    "You are the ARSKEIL document extraction engine.",
    `Document type: ${type}`,
    `Requested fields: ${EXTRACTION_FIELDS[type].join(", ")}`,
    "",
    "Rules:",
    ...EXTRACTION_RULES[type].map((rule) => `- ${rule}`),
    "",
    "Accuracy rules:",
    "- Preserve numbers exactly as printed.",
    "- Do not guess.",
    "- Return null when unclear or absent.",
    "- Return a confidence value from 0 to 1 for every extracted field.",
    "- Include a short evidence/snippet for difficult fields when available.",
    "- Return structured JSON only.",
  ].join("\n");
}

/** Calls the secure OCR backend. The OpenAI key must NEVER be in this file. */
export async function extractDocument(file, options = {}) {
  const { caseId = "", documentType, endpoint = "/api/ocr/extract", signal } = options;
  if (!(file instanceof File)) throw new Error("A valid PDF/image File is required.");
  if (!caseId) throw new Error("caseId is required for document extraction.");

  const type = String(documentType || "").toUpperCase();
  if (!OCR_DOCUMENT_TYPES[type]) throw new Error(`Unsupported OCR document type: ${documentType}`);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseId", caseId);
  formData.append("documentType", type);
  formData.append("prompt", buildExtractionPrompt(type));

  const response = await fetch(endpoint, { method: "POST", body: formData, signal });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`OCR server returned an invalid response (${response.status}).`); }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `OCR extraction failed (${response.status}).`);
  }

  return {
    documentType: type,
    caseId,
    data: payload?.data || {},
    confidence: payload?.confidence || {},
    rawText: payload?.rawText || "",
    sourceFileName: file.name,
  };
}

/** Extracts all documents for one Case ID and combines multiple SLs. */
export async function extractCaseDocuments(caseId, documents, options = {}) {
  if (!caseId) throw new Error("caseId is required.");
  if (!Array.isArray(documents) || documents.length === 0) throw new Error("At least one document is required.");

  const results = [];
  for (const item of documents) {
    if (!item?.file || !item?.documentType) throw new Error("Each document requires file and documentType.");
    results.push(await extractDocument(item.file, { ...options, caseId, documentType: item.documentType }));
  }

  return {
    caseId,
    results,
    combinedSL: combineSanctionLetters(results.filter((item) => item.documentType === OCR_DOCUMENT_TYPES.SL)),
  };
}

/**
 * MULTIPLE-SL RULE:
 * 1. Add every valid sanctioned loan amount.
 * 2. Find the SL with the largest sanctioned loan amount.
 * 3. Use ROI ONLY from that largest-loan SL.
 * No weighted-average ROI is calculated.
 */
export function combineSanctionLetters(slResults = []) {
  const normalized = slResults.map((result, index) => ({
    index: index + 1,
    ...result,
    amount: parseMoney(result?.data?.sanctionedLoanAmount),
    roi: result?.data?.roi ?? null,
  })).filter((item) => Number.isFinite(item.amount) && item.amount >= 0);

  const totalSanctionedLoanAmount = normalized.reduce((sum, item) => sum + item.amount, 0);
  const largestSL = normalized.reduce((largest, current) => (!largest || current.amount > largest.amount ? current : largest), null);

  return {
    count: normalized.length,
    totalSanctionedLoanAmount,
    totalSanctionedLoanAmountDisplay: formatINR(totalSanctionedLoanAmount),
    largestLoanSLIndex: largestSL?.index ?? null,
    largestLoanAmount: largestSL?.amount ?? null,
    largestLoanAmountDisplay: largestSL ? formatINR(largestSL.amount) : null,
    roiFromLargestLoanSL: largestSL?.roi ?? null,
    roiRule: "ROI is taken only from the Sanction Letter with the largest sanctioned loan amount.",
    letters: normalized.map((item) => ({
      index: item.index,
      fileName: item.sourceFileName,
      loanAmount: item.amount,
      loanAmountDisplay: formatINR(item.amount),
      roi: item.roi,
      borrowerName: item.data?.borrowerName ?? null,
      coBorrowerName: item.data?.coBorrowerName ?? null,
      propertyAddress: item.data?.propertyAddress ?? null,
      confidence: item.confidence || {},
    })),
  };
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value == null) return NaN;
  const cleaned = String(value)
    .replace(/₹/g, "")
    .replace(/Rs\.?/gi, "")
    .replace(/INR/gi, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return NaN;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

export function formatINR(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);
}

export function maskAadhaar(value) {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return "XXXX";
  return `XXXX XXXX ${digits.slice(-4)}`;
}

/** Builds editable AI Extraction-page data. Nothing is pushed to Challan/NOI automatically. */
export function buildFillData(extraction) {
  const results = extraction?.results || [];
  const combinedSL = extraction?.combinedSL || {};
  const sl = results.find((item) => item.documentType === OCR_DOCUMENT_TYPES.SL)?.data || {};
  const index2 = results.find((item) => item.documentType === OCR_DOCUMENT_TYPES.INDEX2)?.data || {};
  const pan = results.find((item) => item.documentType === OCR_DOCUMENT_TYPES.PAN)?.data || {};
  const aadhaar = results.find((item) => item.documentType === OCR_DOCUMENT_TYPES.AADHAAR)?.data || {};
  const largestSL = combinedSL.letters?.find((item) => item.index === combinedSL.largestLoanSLIndex);

  return {
    borrowerName: largestSL?.borrowerName ?? sl.borrowerName ?? null,
    coBorrowerName: largestSL?.coBorrowerName ?? sl.coBorrowerName ?? null,
    loanAccountOrApplicationNumber: sl.loanAccountOrApplicationNumber ?? null,
    sanctionedLoanAmount: combinedSL.totalSanctionedLoanAmount ?? null,
    roi: combinedSL.roiFromLargestLoanSL ?? null,
    propertyAddress: largestSL?.propertyAddress ?? index2.propertyAddress ?? null,
    bankName: sl.bankName ?? null,
    branch: sl.branch ?? null,
    index2: {
      documentNumber: index2.documentNumber ?? null,
      sroName: index2.sroName ?? null,
      purchaserOwnerName: index2.purchaserOwnerName ?? null,
      propertyAddress: index2.propertyAddress ?? null,
      surveyNumber: index2.surveyNumber ?? null,
      ctsNumber: index2.ctsNumber ?? null,
      plotNumber: index2.plotNumber ?? null,
      gatNumber: index2.gatNumber ?? null,
      village: index2.village ?? null,
      taluka: index2.taluka ?? null,
      district: index2.district ?? null,
      propertyArea: index2.propertyArea ?? null,
    },
    pan: {
      name: pan.name ?? null,
      panNumber: pan.panNumber ?? null,
      dateOfBirth: pan.dateOfBirth ?? null,
    },
    aadhaar: {
      name: aadhaar.name ?? null,
      aadhaarNumber: aadhaar.aadhaarNumber ?? null,
      dateOfBirthOrYearOfBirth: aadhaar.dateOfBirthOrYearOfBirth ?? null,
      address: aadhaar.address ?? null,
    },
  };
}
