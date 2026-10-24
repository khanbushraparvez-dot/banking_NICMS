function clean(s) { return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().replace(/^[:：=\-|#\s]+|[\s,.;]+$/g, ""); }
function firstMatch(text, patterns) {
  const lines = String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const rx = new RegExp(pattern, "i");
      const m = lines[i].match(rx);
      if (m) {
        let value = clean(m[1] || lines[i].slice(m[0].length));
        if (value && value.length >= 2 && !/^(applicant|borrower|loan|amount|branch|bank|property|address|date|roi|rate of interest)$/i.test(value)) return value.slice(0, 240);
        if (i + 1 < lines.length && lines[i + 1].length >= 2) return lines[i + 1].slice(0, 240);
      }
    }
  }
  return null;
}
function extractSL(text) {
  const amountPatterns = [
    String.raw`(?:total\s+)?amount\s+sanctioned\s*[:：=\-]?\s*(?:₹|INR\s*|Rs\.?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)`,
    String.raw`sanctioned\s+(?:loan\s+)?amount\s*[:：=\-]?\s*(?:₹|INR\s*|Rs\.?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)`,
    String.raw`loan\s+amount\s+sanctioned\s*[:：=\-]?\s*(?:₹|INR\s*|Rs\.?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)`,
    String.raw`sanction\s+(?:loan\s+)?amount\s*[:：=\-]?\s*(?:₹|INR\s*|Rs\.?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?)`
  ];
  const borrowerName = firstMatch(text, [String.raw`(?:name\s+of\s+(?:the\s+)?applicant|applicant\s+name|name\s+of\s+(?:the\s+)?borrower|borrower(?:'s)?\s+name|primary\s+borrower|customer\s+name|applicant|borrower)\s*[:：=\-]\s*(.+)`]);
  const coBorrowerName = firstMatch(text, [String.raw`(?:name\s+of\s+(?:the\s+)?co[ -]?applicant|co[ -]?applicant(?:'s)?\s+name|co[ -]?borrower(?:'s)?\s+name|joint\s+applicant\s+name|co[ -]?borrower|co[ -]?applicant)\s*[:：=\-]\s*(.+)`]);
  const loanAccountOrApplicationNumber = firstMatch(text, [String.raw`(?:application\s*(?:/\s*loan\s*)?(?:form\s*)?(?:no\.?|number|#|id)|loan\s+(?:account\s+|agreement\s+)?(?:no\.?|number|#)|proposal\s*(?:no\.?|number|#)|reference\s*(?:no\.?|number|#)|loan\s+id|\bLAN\b)\s*[:：=\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,39})`]);
  let sanctionedLoanAmount = null;
  for (const p of amountPatterns) { sanctionedLoanAmount = firstMatch(text, [p]); if (sanctionedLoanAmount) { sanctionedLoanAmount = sanctionedLoanAmount.replace(/,/g, ""); break; } }
  let roi = firstMatch(text, [String.raw`(?:rate\s+of\s+interest|interest\s+rate|ROI|annual\s+interest\s+rate|applicable\s+rate)\s*(?:\([^)]*\))?\s*[:：=\-]?\s*([0-9]{1,2}(?:\.[0-9]{1,3})?\s*%?)`]);
  if (roi && !roi.includes('%')) roi += '%';
  const bankName = firstMatch(text, [String.raw`(?:bank\s*/\s*financial\s+institution|bank\s+name|lender\s+name|name\s+of\s+(?:the\s+)?bank|name\s+of\s+(?:the\s+)?lender|financier)\s*[:：=\-]?\s*(.+)`]);
  const branch = firstMatch(text, [String.raw`(?:branch\s+name|name\s+of\s+(?:the\s+)?branch|sanctioning\s+branch|loan\s+branch|branch)\s*[:：=\-]?\s*(.+)`]);
  const propertyAddress = firstMatch(text, [String.raw`(?:details\s+of\s+(?:the\s+)?property|property\s*/\s*security(?:\s+address)?|property\s+and\s+security(?:\s+address)?|address\s+of\s+(?:the\s+)?property|property\s+address|sanctioned\s+property|collateral\s+address|mortgaged\s+property)\s*[:：=\-]?\s*(.+)`]);
  const data = { borrowerName, coBorrowerName, loanAccountOrApplicationNumber, sanctionedLoanAmount, propertyAddress, bankName, branch, roi };
  const confidence = Object.fromEntries(Object.entries(data).map(([k,v]) => [k, v ? 0.72 : 0]));
  return { data, confidence };
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const apiKey = process.env.OCR_SPACE_API_KEY || "";
  if (!apiKey) return res.status(503).json({ ok: false, error: "OCR is not configured. Add OCR_SPACE_API_KEY in Vercel Environment Variables, then redeploy." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const fileBase64 = String(body.fileBase64 || "");
    const mimeType = String(body.mimeType || "application/pdf");
    const fileName = String(body.fileName || "document.pdf");
    if (!fileBase64) return res.status(400).json({ ok: false, error: "No file data received. Please upload the document again." });
    const cleanBase64 = fileBase64.replace(/^data:[^,]+,/, "");
    const estimatedBytes = Math.floor(cleanBase64.length * 3 / 4);
    if (estimatedBytes > 1024 * 1024) return res.status(413).json({ ok: false, error: "This free OCR API accepts files up to 1 MB. Please use a compressed PDF or a clear JPG/PNG under 1 MB for the demo." });
    const form = new URLSearchParams();
    form.set("base64Image", `data:${mimeType};base64,${cleanBase64}`);
    form.set("filetype", mimeType.toLowerCase().includes("pdf") ? "PDF" : (mimeType.toLowerCase().includes("png") ? "PNG" : "JPG"));
    form.set("OCREngine", "3");
    form.set("language", "auto");
    form.set("scale", "true");
    form.set("isTable", "true");
    const upstream = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "apikey": apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.IsErroredOnProcessing || !Array.isArray(result.ParsedResults)) {
      const detail = result.ErrorMessage || result.ErrorDetails || result.ParsedResults?.[0]?.ErrorMessage || "OCR provider could not read this file.";
      return res.status(502).json({ ok: false, error: String(detail).slice(0, 400) });
    }
    const rawText = result.ParsedResults.map(p => p.ParsedText || "").join("\n\n").trim();
    if (!rawText) return res.status(422).json({ ok: false, error: "No readable text found. Try a clearer image or a better-quality PDF." });
    const type = String(body.documentType || "SL").toUpperCase();
    const { data, confidence } = type === "SL" ? extractSL(rawText) : { data: {}, confidence: {} };
    return res.status(200).json({ ok: true, documentType: type, caseId: body.caseId || "", data, confidence, rawText, sourceFileName: fileName, provider: "OCR.space" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "OCR request failed. Check the API key and try again." });
  }
}
