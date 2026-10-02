/**
 * ARSKEIL - FREE OCR & Document Extraction Service
 *
 * Uses Tesseract.js in the browser.
 * No OpenAI API key required.
 */

export const OCR_DOCUMENT_TYPES = Object.freeze({
  SL: "SL",
  INDEX2: "INDEX2",
  PAN: "PAN",
  AADHAAR: "AADHAAR",
});

export const EXTRACTION_FIELDS = Object.freeze({
  SL: [
    "borrowerName",
    "coBorrowerName",
    "loanAccountOrApplicationNumber",
    "sanctionedLoanAmount",
    "propertyAddress",
    "bankName",
    "branch",
    "roi",
  ],
  INDEX2: [
    "documentNumber",
    "sroName",
    "purchaserOwnerName",
    "propertyAddress",
    "surveyNumber",
    "ctsNumber",
    "plotNumber",
    "gatNumber",
    "village",
    "taluka",
    "district",
    "propertyArea",
  ],
  PAN: ["name", "panNumber", "dateOfBirth"],
  AADHAAR: [
    "name",
    "aadhaarNumber",
    "dateOfBirthOrYearOfBirth",
    "address",
  ],
});

export const EXTRACTION_RULES = Object.freeze({
  SL: [
    "Extract sanctioned loan amount, not processing fee, insurance, EMI, or another amount.",
    "Extract ROI/Rate of Interest specifically.",
    "Property address means the security/property address only.",
    "Extract borrower and co-borrower names separately.",
    "Return null when a field is missing or unreadable; never guess.",
  ],

  INDEX2: [
    "The document may be entirely or partly in Marathi.",
    "Return requested output fields in English.",
    "Transliterate personal names and proper place names.",
    "For purchaser/owner, select the receiving/buying party, not the selling party.",
    "Extract property address separately from party names.",
    "Extract Survey No., CTS No., Plot No., and Gat No. separately.",
    "Return null when a field is missing or unreadable.",
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

  if (!OCR_DOCUMENT_TYPES[type]) {
    throw new Error(
      `Unsupported OCR document type: ${documentType}`
    );
  }

  return [
    "ARSKEIL document extraction engine.",
    `Document type: ${type}`,
    `Requested fields: ${EXTRACTION_FIELDS[type].join(", ")}`,
    "",
    "Rules:",
    ...EXTRACTION_RULES[type].map(
      (rule) => `- ${rule}`
    ),
    "",
    "Accuracy:",
    "- Preserve numbers exactly as printed.",
    "- Do not guess.",
    "- Return null when unclear or absent.",
  ].join("\n");
}

/* -------------------------------------------------------
   FREE TESSERACT OCR
------------------------------------------------------- */

function getTesseract() {
  if (typeof window === "undefined") {
    throw new Error("OCR is available in the browser only.");
  }

  if (!window.Tesseract) {
    throw new Error(
      "Tesseract OCR is not loaded. Check the Tesseract script in index.html."
    );
  }

  return window.Tesseract;
}

async function runTesseractOCR(file) {
  const Tesseract = getTesseract();

  const result = await Tesseract.recognize(
    file,
    "eng+mar",
    {
      logger: () => {},
    }
  );

  return {
    text: result?.data?.text || "",
    confidence:
      typeof result?.data?.confidence === "number"
        ? result.data.confidence / 100
        : 0,
  };
}

/* -------------------------------------------------------
   SIMPLE FIELD EXTRACTION
------------------------------------------------------- */

function cleanText(value) {
  if (!value) return null;

  const cleaned = String(value)
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

function extractPAN(text) {
  const panNumber =
    text
      .toUpperCase()
      .match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/)?.[0] || null;

  const dateOfBirth =
    findFirst(text, [
      /DATE\s*OF\s*BIRTH\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /DOB\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ]);

  return {
    name: null,
    panNumber,
    dateOfBirth,
  };
}

function extractAadhaar(text) {
  const aadhaarNumber =
    text
      .replace(/[^0-9]/g, " ")
      .match(/\b\d{4}\s+\d{4}\s+\d{4}\b/)?.[0]
      ?.replace(/\s/g, "") || null;

  const dateOfBirthOrYearOfBirth =
    findFirst(text, [
      /DATE\s*OF\s*BIRTH\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /DOB\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /YEAR\s*OF\s*BIRTH\s*[:\-]?\s*(\d{4})/i,
    ]);

  return {
    name: null,
    aadhaarNumber,
    dateOfBirthOrYearOfBirth,
    address: null,
  };
}

function extractIndex2(text) {
  return {
    documentNumber: findFirst(text, [
      /DOCUMENT\s*(?:NO|NUMBER)\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
      /DOC(?:UMENT)?\s*NO\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),

    sroName: findFirst(text, [
      /SRO\s*[:\-]?\s*(.+)/i,
      /SUB\s*REGISTRAR\s*[:\-]?\s*(.+)/i,
    ]),

    purchaserOwnerName: null,

    propertyAddress: null,

    surveyNumber: findFirst(text, [
      /SURVEY\s*(?:NO|NUMBER)\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),

    ctsNumber: findFirst(text, [
      /CTS\s*(?:NO|NUMBER)\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),

    plotNumber: findFirst(text, [
      /PLOT\s*(?:NO|NUMBER)\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),

    gatNumber: findFirst(text, [
      /GAT\s*(?:NO|NUMBER)\.?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),

    village: findFirst(text, [
      /VILLAGE\s*[:\-]?\s*(.+)/i,
    ]),

    taluka: findFirst(text, [
      /TALUKA\s*[:\-]?\s*(.+)/i,
      /TALUK\s*[:\-]?\s*(.+)/i,
    ]),

    district: findFirst(text, [
      /DISTRICT\s*[:\-]?\s*(.+)/i,
    ]),

    propertyArea: findFirst(text, [
      /PROPERTY\s*AREA\s*[:\-]?\s*([0-9.,]+\s*(?:SQ\.?\s*FT|SQ\.?\s*M|SQM|HECTARE|ACRE)?)/i,
      /AREA\s*[:\-]?\s*([0-9.,]+\s*(?:SQ\.?\s*FT|SQ\.?\s*M|SQM|HECTARE|ACRE)?)/i,
    ]),
  };
}

function extractSanctionLetter(text) {
  const sanctionedLoanAmount = findFirst(text, [
    /SANCTIONED\s*LOAN\s*AMOUNT\s*[:\-]?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i,
    /LOAN\s*AMOUNT\s*[:\-]?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i,
    /SANCTION\s*AMOUNT\s*[:\-]?\s*(₹?\s*[\d,]+(?:\.\d+)?)/i,
  ]);

  const roi = findFirst(text, [
    /RATE\s*OF\s*INTEREST\s*[:\-]?\s*([\d.]+\s*%)/i,
    /ROI\s*[:\-]?\s*([\d.]+\s*%)/i,
    /INTEREST\s*RATE\s*[:\-]?\s*([\d.]+\s*%)/i,
  ]);

  const loanAccountOrApplicationNumber =
    findFirst(text, [
      /APPLICATION\s*(?:NO|NUMBER)\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
      /LOAN\s*(?:ACCOUNT|A\/C)\s*(?:NO|NUMBER)\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]);

  return {
    borrowerName: null,
    coBorrowerName: null,
    loanAccountOrApplicationNumber,
    sanctionedLoanAmount,
    propertyAddress: null,
    bankName: findFirst(text, [
      /BANK\s*NAME\s*[:\-]?\s*(.+)/i,
    ]),
    branch: findFirst(text, [
      /BRANCH\s*[:\-]?\s*(.+)/i,
    ]),
    roi,
  };
}

function extractFields(documentType, text) {
  switch (documentType) {
    case OCR_DOCUMENT_TYPES.SL:
      return extractSanctionLetter(text);

    case OCR_DOCUMENT_TYPES.INDEX2:
      return extractIndex2(text);

    case OCR_DOCUMENT_TYPES.PAN:
      return extractPAN(text);

    case OCR_DOCUMENT_TYPES.AADHAAR:
      return extractAadhaar(text);

    default:
      return {};
  }
}

/* -------------------------------------------------------
   MAIN EXTRACTION FUNCTION
------------------------------------------------------- */

export async function extractDocument(file, options = {}) {
  const {
    caseId = "",
    documentType,
  } = options;

  if (!(file instanceof File)) {
    throw new Error(
      "A valid PDF/image File is required."
    );
  }

  if (!caseId) {
    throw new Error("caseId is required for document extraction.");
  }

  const type = String(documentType || "").toUpperCase();

  if (!OCR_DOCUMENT_TYPES[type]) {
    throw new Error(
      `Unsupported OCR document type: ${documentType}`
    );
  }

  const ocr = await runTesseractOCR(file);

  const data = extractFields(type, ocr.text);

  const confidence = {};

  for (const field of EXTRACTION_FIELDS[type]) {
    confidence[field] = data[field] ? ocr.confidence : 0;
  }

  return {
    documentType: type,
    caseId,
    data,
    confidence,
    rawText: ocr.text,
    sourceFileName: file.name,
  };
}

/* -------------------------------------------------------
   MULTIPLE DOCUMENTS
------------------------------------------------------- */

export async function extractCaseDocuments(
  caseId,
  documents,
  options = {}
) {
  if (!caseId) {
    throw new Error("caseId is required.");
  }

  if (
    !Array.isArray(documents) ||
    documents.length === 0
  ) {
    throw new Error(
      "At least one document is required."
    );
  }

  const results = [];

  for (const item of documents) {
    if (!item?.file || !item?.documentType) {
      throw new Error(
        "Each document requires file and documentType."
      );
    }

    results.push(
      await extractDocument(
        item.file,
        {
          ...options,
          caseId,
          documentType: item.documentType,
        }
      )
    );
  }

  return {
    caseId,
    results,

    combinedSL: combineSanctionLetters(
      results.filter(
        (item) =>
          item.documentType ===
          OCR_DOCUMENT_TYPES.SL
      )
    ),
  };
}

/* -------------------------------------------------------
   MULTIPLE-SL RULE
------------------------------------------------------- */

export function combineSanctionLetters(
  slResults = []
) {
  const normalized = slResults
    .map((result, index) => ({
      index: index + 1,
      ...result,
      amount: parseMoney(
        result?.data?.sanctionedLoanAmount
      ),
      roi: result?.data?.roi ?? null,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.amount) &&
        item.amount >= 0
    );

  const totalSanctionedLoanAmount =
    normalized.reduce(
      (sum, item) => sum + item.amount,
      0
    );

  const largestSL = normalized.reduce(
    (largest, current) =>
      !largest ||
      current.amount > largest.amount
        ? current
        : largest,
    null
  );

  return {
    count: normalized.length,

    totalSanctionedLoanAmount,

    totalSanctionedLoanAmountDisplay:
      formatINR(totalSanctionedLoanAmount),

    largestLoanSLIndex:
      largestSL?.index ?? null,

    largestLoanAmount:
      largestSL?.amount ?? null,

    largestLoanAmountDisplay:
      largestSL
        ? formatINR(largestSL.amount)
        : null,

    roiFromLargestLoanSL:
      largestSL?.roi ?? null,

    roiRule:
      "ROI is taken only from the Sanction Letter with the largest sanctioned loan amount.",

    letters: normalized.map((item) => ({
      index: item.index,
      fileName: item.sourceFileName,
      loanAmount: item.amount,
      loanAmountDisplay:
        formatINR(item.amount),
      roi: item.roi,
      borrowerName:
        item.data?.borrowerName ?? null,
      coBorrowerName:
        item.data?.coBorrowerName ?? null,
      propertyAddress:
        item.data?.propertyAddress ?? null,
      confidence:
        item.confidence || {},
    })),
  };
}

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

export function parseMoney(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : NaN;
  }

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

  return Number.isFinite(number)
    ? number
    : NaN;
}

export function formatINR(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function maskAadhaar(value) {
  if (!value) return "";

  const digits = String(value).replace(
    /\D/g,
    ""
  );

  if (digits.length < 4) {
    return "XXXX";
  }

  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function buildFillData(extraction) {
  const results = extraction?.results || [];

  const combinedSL =
    extraction?.combinedSL || {};

  const sl =
    results.find(
      (item) =>
        item.documentType ===
        OCR_DOCUMENT_TYPES.SL
    )?.data || {};

  const index2 =
    results.find(
      (item) =>
        item.documentType ===
        OCR_DOCUMENT_TYPES.INDEX2
    )?.data || {};

  const pan =
    results.find(
      (item) =>
        item.documentType ===
        OCR_DOCUMENT_TYPES.PAN
    )?.data || {};

  const aadhaar =
    results.find(
      (item) =>
        item.documentType ===
        OCR_DOCUMENT_TYPES.AADHAAR
    )?.data || {};

  const largestSL =
    combinedSL.letters?.find(
      (item) =>
        item.index ===
        combinedSL.largestLoanSLIndex
    );

  return {
    borrowerName:
      largestSL?.borrowerName ??
      sl.borrowerName ??
      null,

    coBorrowerName:
      largestSL?.coBorrowerName ??
      sl.coBorrowerName ??
      null,

    loanAccountOrApplicationNumber:
      sl.loanAccountOrApplicationNumber ??
      null,

    sanctionedLoanAmount:
      combinedSL.totalSanctionedLoanAmount ??
      null,

    roi:
      combinedSL.roiFromLargestLoanSL ??
      null,

    propertyAddress:
      largestSL?.propertyAddress ??
      index2.propertyAddress ??
      null,

    bankName:
      sl.bankName ?? null,

    branch:
      sl.branch ?? null,

    index2: {
      documentNumber:
        index2.documentNumber ?? null,

      sroName:
        index2.sroName ?? null,

      purchaserOwnerName:
        index2.purchaserOwnerName ?? null,

      propertyAddress:
        index2.propertyAddress ?? null,

      surveyNumber:
        index2.surveyNumber ?? null,

      ctsNumber:
        index2.ctsNumber ?? null,

      plotNumber:
        index2.plotNumber ?? null,

      gatNumber:
        index2.gatNumber ?? null,

      village:
        index2.village ?? null,

      taluka:
        index2.taluka ?? null,

      district:
        index2.district ?? null,

      propertyArea:
        index2.propertyArea ?? null,
    },

    pan: {
      name:
        pan.name ?? null,

      panNumber:
        pan.panNumber ?? null,

      dateOfBirth:
        pan.dateOfBirth ?? null,
    },

    aadhaar: {
      name:
        aadhaar.name ?? null,

      aadhaarNumber:
        aadhaar.aadhaarNumber ?? null,

      dateOfBirthOrYearOfBirth:
        aadhaar.dateOfBirthOrYearOfBirth ??
        null,

      address:
        aadhaar.address ?? null,
    },
  };
}
