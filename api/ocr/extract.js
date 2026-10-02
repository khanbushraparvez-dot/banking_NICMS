export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("application/json")) {
      return res.status(400).json({
        ok: false,
        error: "OCR request must use JSON.",
      });
    }

    const { caseId, documentType, rawText } = req.body || {};

    if (!caseId) {
      return res.status(400).json({
        ok: false,
        error: "caseId is required.",
      });
    }

    const type = String(documentType || "").toUpperCase();

    const allowedTypes = ["SL", "INDEX2", "PAN", "AADHAAR"];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Unsupported document type: ${type}`,
      });
    }

    /*
     * The browser performs the free OCR using Tesseract.js.
     * This API receives the OCR text and prepares the response
     * expected by ocrExtraction.js.
     */

    const text = String(rawText || "").trim();

    return res.status(200).json({
      ok: true,
      caseId,
      documentType: type,
      data: {},
      confidence: {},
      rawText: text,
      message: text
        ? "OCR text received successfully."
        : "No OCR text was supplied.",
    });
  } catch (error) {
    console.error("OCR extraction error:", error);

    return res.status(500).json({
      ok: false,
      error: "OCR extraction failed.",
    });
  }
}
