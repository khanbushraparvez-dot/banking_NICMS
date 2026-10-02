export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const { caseId, documentType } = req.body || {};

    if (!caseId || !documentType) {
      return res.status(400).json({
        ok: false,
        error: "caseId and documentType are required.",
      });
    }

    const allowedTypes = ["SL", "INDEX2", "PAN", "AADHAAR"];

    if (!allowedTypes.includes(String(documentType).toUpperCase())) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported document type.",
      });
    }

    return res.status(200).json({
      ok: true,
      caseId,
      documentType: String(documentType).toUpperCase(),
      data: {},
      confidence: {},
      rawText: "",
      message: "OCR endpoint is connected. Free OCR engine will be connected next.",
    });
  } catch (error) {
    console.error("OCR error:", error);

    return res.status(500).json({
      ok: false,
      error: "OCR service failed.",
    });
  }
}
