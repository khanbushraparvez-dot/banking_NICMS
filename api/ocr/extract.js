const clean = (s) => String(s ?? "").replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").trim().replace(/^[:：=\-|#\s]+|[\s,.;:：=\-]+$/g, "");
const linesOf = (text) => String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
function first(text, patterns) {
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const m = lines[i].match(new RegExp(pattern, "i"));
      if (!m) continue;
      const value = clean(m[m.length - 1] || "");
      if (value && value.length >= 2 && !/^[.:：=\-]+$/.test(value) && !/^(applicant|borrower|loan|amount|branch|bank|property|address|date|roi|rate of interest)$/i.test(value)) return value.slice(0, 500);
      if (i + 1 < lines.length && lines[i + 1].length >= 2 && !/\b(?:application|finnone|name|branch|loan amount|term of loan|rate of interest|contact no|property|sanction date|processing fee|emi)\b.*[:：]/i.test(lines[i + 1])) return lines[i + 1].slice(0, 500);
    }
  }
  return "";
}
function labeled(text, labels, opts = {}) {
  const label = labels.join("|");
  return first(text, [String.raw`(?:${label})\s*(?:\([^)]*\))?\s*[:：=\-]?\s*(?:INR\s*|Rs\.?\s*|₹\s*)?(.{2,500})`]);
}
function asField(value, confidence = 72) {
  const v = value == null ? "" : value;
  const missing = Array.isArray(v) ? v.length === 0 : !String(v).trim();
  return { value: missing ? "" : v, confidence: missing ? 0 : confidence, doubtful: !missing && confidence < 0.75, missing };
}
function inferType(text, fileName = "") {
  const t = String(text || "").toLowerCase();
  const f = String(fileName || "").toLowerCase();
  if (/\b(uidai|unique identification authority of india|aadhaar|aadhar)\b/.test(t)) return "Aadhaar";
  if (/\b(permanent account number|income tax department|pan card)\b/.test(t) || /\b[A-Z]{5}\d{4}[A-Z]\b/.test(text)) return "PAN";
  if (/\bmahada\b|म्हाडा|ना हरकत प्रमाणपत्र|no objection certificate/.test(t)) return "MAHADA";
  if (/सूची\s*(?:क्र\.?\s*)?2|दुय्यम निबंधक|सह दुय्यम निबंधक|दस्त क्रमांक|index\s*[- ]?ii|index\s*[- ]?2|sub registrar/.test(t) || /index|suchi|suchi/.test(f)) return "IndexII";
  if (/loan sanction letter|sanction letter|loan amount|rate of interest|sanction date|finnone neo id|application form no/.test(t)) return "SanctionLetter";
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(text) && /date of birth|year of birth|gender|address/.test(t)) return "Aadhaar";
  return "Unknown";
}
function normalizeName(value) { return String(value || "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim(); }
function nameScore(a, b) {
  const aa = normalizeName(a).split(" ").filter(x => x.length > 1);
  const bb = normalizeName(b).split(" ").filter(x => x.length > 1);
  if (!aa.length || !bb.length) return 0;
  const shared = aa.filter(x => bb.includes(x)).length;
  return Math.round(100 * shared / Math.max(aa.length, bb.length));
}
function bestOwner(name, owners = []) {
  let best = { name: "", score: 0 };
  for (const owner of owners) { const score = nameScore(name, owner); if (score > best.score) best = { name: String(owner), score }; }
  return best;
}
function extractFields(text, type, owners = []) {
  const t = String(text || "");
  const out = {};
  if (type === "SanctionLetter") {
    const applicantName = labeled(t, ["name of the applicant", "applicant name", "borrower's name", "borrower name", "customer name", "primary borrower", "applicant"]).replace(/^(?:MR\.?|MRS\.?|MS\.?|SHRI|SMT\.?)\s+/i, "");
    const coApplicantNames = labeled(t, ["coapplicant names?", "co-applicant(?:'s)? names?", "co-borrower(?:'s)? names?", "joint applicant name"]).replace(/^(?:MR\.?|MRS\.?|MS\.?|SHRI|SMT\.?)\s+/i, "");
    const applicationNumber = labeled(t, ["finnone neo id no\\.?", "application form no\\.?", "loan application no\\.?", "ref application no\\.?", "application no\\.?", "application number", "sanction id", "loan account no\\.?", "loan agreement no\\.?", "proposal no\\.?", "reference no\\.?", "loan id", "\\bLAN\\b"]);
    let loanAmountSanctioned = labeled(t, ["total amount sanctioned", "loan amount sanctioned", "sanctioned loan amount", "sanction loan amount(?: without insurance)?", "loan amount", "approved amount", "facility amount", "sanctioned amount"]);
    loanAmountSanctioned = (loanAmountSanctioned.match(/[0-9][0-9,]*(?:\.\d{1,2})?/) || [""])[0].replace(/,/g, "");
    let rateOfInterest = labeled(t, ["rate of interest", "floating rate of interest", "interest rate", "annual interest rate", "ROI"]);
    const rateMatch = rateOfInterest.match(/[0-9]{1,2}(?:\.[0-9]{1,3})?\s*%?/);
    rateOfInterest = rateMatch ? rateMatch[0].replace(/\s/g, "") + (rateMatch[0].includes("%") ? "" : "%") : "";
    const branchName = labeled(t, ["branch name", "branch"]);
    const bankName = /mahindra\s*(?:&\s*mahindra\s*)?(?:rural housing finance|finance)/i.test(t) ? "MAHINDRA FINANCE" : /niwas housing finance/i.test(t) ? "NIWAS HOUSING FINANCE" : /tata capital/i.test(t) ? "TATA CAPITAL" : /axis finance/i.test(t) ? "AXIS FINANCE" : /hdfc/i.test(t) ? "HDFC" : /state bank of india|\bSBI\b/i.test(t) ? "STATE BANK OF INDIA" : labeled(t, ["bank name", "lender name", "bank / financial institution", "financier"]);
    const propertyAddress = labeled(t, ["details of the property(?: \(for which loan is sanctioned\))?", "description of the property", "property address", "address of the property", "property / security address", "security address", "mortgaged property", "collateral address"]);
    const sanctionDate = labeled(t, ["sanction date", "date of sanction"]);
    const termMonths = labeled(t, ["term of loan", "loan tenure", "tenure", "tenor", "repayment period"]);
    const emiAmount = labeled(t, ["approximate EMI amount", "amount of EMI", "monthly installment(?: \(EMI\))?", "EMI"]);
    const contactNumber = labeled(t, ["contact no\\.? \\(M\\)", "contact no\\.?", "mobile", "phone"]);
    const loanPurpose = labeled(t, ["loan purpose", "purpose of the loan", "type of loan"]);
    const processingFee = labeled(t, ["total processing fees applicable", "total processing fees", "processing fee", "mortgage origination fees"]);
    const coNames = coApplicantNames ? coApplicantNames.split(/\s*(?:;|\band\b)\s*/).filter(Boolean).map(name => {
      const match = bestOwner(name, owners);
      return { name: name.toUpperCase(), isOwner: match.score >= 60 };
    }) : [];
    const applicantMatch = bestOwner(applicantName, owners);
    Object.assign(out, { applicantName, coApplicantName: coApplicantNames, coApplicantNames: coNames, applicationNumber, bankName, branchName, sanctionDate, loanAmountSanctioned, rateOfInterest, termMonths, emiAmount, contactNumber, loanPurpose, processingFee, propertyAddress, applicantIsOwner: applicantMatch.score >= 60 });
    // These fields are referenced by the downstream UI; return them even when OCR did not find them.
    for (const k of ["addr_flatNo", "addr_floor", "addr_wing", "addr_buildingName", "addr_buildingNo", "addr_roadNo", "addr_towerNo", "addr_landmark", "addr_village", "addr_taluka", "addr_district", "applicantIsOwner", "isMultiProductSL"]) if (!(k in out)) out[k] = "";
  } else if (type === "PAN") {
    const panNumber = ((t.match(/\b[A-Z]{5}\d{4}[A-Z]\b/) || [""])[0]).toUpperCase();
    const holderName = labeled(t, ["name", "name of holder", "holder name"]);
    const dateOfBirth = labeled(t, ["date of birth", "DOB"]);
    Object.assign(out, { holderName, fatherName: labeled(t, ["father's name", "father name"]), panNumber, dateOfBirth, isIndexIIOwner: "", matchedOwnerName: "", matchConfidence: "" });
  } else if (type === "Aadhaar") {
    const digits = (t.match(/\b(?:\d[ -]?){11}\d\b/) || [""])[0].replace(/\D/g, "");
    const masked = digits.length === 12 ? `XXXX XXXX ${digits.slice(-4)}` : "";
    Object.assign(out, { holderName: labeled(t, ["name", "name of resident"]), dateOfBirth: labeled(t, ["date of birth", "DOB", "year of birth"]), gender: labeled(t, ["gender", "male", "female"]), aadhaarNumber: masked, address: labeled(t, ["address"]), isIndexIIOwner: "", matchedOwnerName: "", matchConfidence: "" });
  } else if (type === "IndexII" || type === "MAHADA") {
    const documentNumber = labeled(t, ["document number", "document no\\.?", "registration number", "registration no\\.?", "दस्त क्रमांक", "अर्ज क्रमांक"]);
    const sroOfficeName = labeled(t, ["sub registrar", "sro office", "sro name", "दुय्यम निबंधक", "सह दुय्यम निबंधक", "योजनेचे ठिकाण"]);
    const ownerNames = labeled(t, ["owner name", "name of owner", "purchaser name", "purchaser/owner", "applicant name", "अर्जदाराचे नाव"]);
    Object.assign(out, { documentNumber, sroOfficeName, ownerNames: ownerNames ? ownerNames.split(/\s*(?:,|;|\band\b)\s*/).filter(Boolean) : [], propertyAddress: labeled(t, ["property address", "property description", "details of property", "flat details", "description of property"]), surveyNumbers: labeled(t, ["survey number", "survey no\\.?", "cts number", "cts no\\.?", "gat number", "gat no\\.?", "सर्वे नं", "गट नं"]), villageName: labeled(t, ["village name", "village", "गावाचे नाव", "गाव"]), talukaName: labeled(t, ["taluka", "तालुका"]), districtName: labeled(t, ["district", "जिल्हा"]), areaConstructed: labeled(t, ["area constructed", "carpet area", "built-up area", "area", "क्षेत्रफळ"]), documentDate: labeled(t, ["document date", "date of registration", "date", "दिनांक"]), bankName: labeled(t, ["bank name", "lender name"]), isIndexIIOwner: "" });
  }
  return Object.fromEntries(Object.entries(out).map(([key, value]) => [key, asField(typeof value === "string" ? value.toUpperCase() : value)]));
}
async function callOCR(apiKey, base64, mimeType, language) {
  const form = new URLSearchParams();
  form.set("base64Image", `data:${mimeType};base64,${base64}`);
  form.set("filetype", mimeType.toLowerCase().includes("pdf") ? "PDF" : (mimeType.toLowerCase().includes("png") ? "PNG" : "JPG"));
  form.set("OCREngine", "2");
  form.set("language", language);
  form.set("scale", "true");
  form.set("isTable", "true");
  const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.IsErroredOnProcessing || !Array.isArray(result.ParsedResults)) {
    const detail = result.ErrorMessage || result.ErrorDetails || result.ParsedResults?.[0]?.ErrorMessage || `OCR provider failed (${response.status}).`;
    throw new Error(String(Array.isArray(detail) ? detail.join("; ") : detail).slice(0, 400));
  }
  return result.ParsedResults.map(p => p.ParsedText || "").join("\n\n").trim();
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const apiKey = process.env.OCR_SPACE_API_KEY || "";
  if (!apiKey) return res.status(503).json({ ok: false, error: "OCR is not configured. Add OCR_SPACE_API_KEY in Vercel Environment Variables and redeploy." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const fileBase64 = String(body.fileBase64 || "");
    const mimeType = String(body.mimeType || "application/pdf");
    const fileName = String(body.fileName || "document.pdf");
    if (!fileBase64) return res.status(400).json({ ok: false, error: "No file data received. Please upload the document again." });
    const cleanBase64 = fileBase64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
    const estimatedBytes = Math.floor(cleanBase64.length * 3 / 4);
    if (estimatedBytes > 1024 * 1024) return res.status(413).json({ ok: false, error: "OCR.space free API accepts files up to 1 MB. Please compress this PDF or use a clear JPG/PNG under 1 MB for the demo." });
    let rawText = await callOCR(apiKey, cleanBase64, mimeType, "eng");
    let type = inferType(rawText, fileName);
    // Marathi Index II may be unreadable under English OCR. Retry in Marathi when the first pass gives no useful type/text.
    if (!rawText || type === "Unknown" || (/index|suchi|suchi|mahada|noc/i.test(fileName) && !/document number|owner name|property|index/i.test(rawText))) {
      try {
        const marathiText = await callOCR(apiKey, cleanBase64, mimeType, "mar");
        if (marathiText.length > rawText.length) rawText = marathiText;
        type = inferType(rawText, fileName);
      } catch (_) { /* Keep the successful English pass; final response explains if no text was readable. */ }
    }
    if (!rawText) return res.status(422).json({ ok: false, error: "OCR completed but found no readable text. Try a clearer scan or a higher-resolution image." });
    if (type === "Unknown") return res.status(422).json({ ok: false, error: "Text was read, but document type could not be identified. Rename the file with SL, Index2, PAN, Aadhaar, or MAHADA and retry." , rawText: rawText.slice(0, 12000) });
    const ownerNames = Array.isArray(body.ownerNames) ? body.ownerNames : [];
    const fields = extractFields(rawText, type, ownerNames);
    const hasAnyValue = Object.values(fields).some(f => f && f.value !== "" && (!Array.isArray(f.value) || f.value.length));
    if (!hasAnyValue) return res.status(422).json({ ok: false, error: "OCR read text but could not map it to document fields. Please use a clearer file or check the document labels.", rawText: rawText.slice(0, 12000) });
    const warnings = [];
    if (type === "SanctionLetter" && !fields.loanAmountSanctioned?.value) warnings.push("Loan amount was not confidently found. Verify it manually before saving.");
    if (type === "SanctionLetter" && !fields.applicantName?.value) warnings.push("Applicant name was not found. Verify it manually.");
    if (type === "IndexII" && !fields.ownerNames?.value?.length) warnings.push("Owner names were not reliably extracted; enter/verify them manually.");
    const holder = fields.holderName?.value || "";
    const identityMatch = (type === "PAN" || type === "Aadhaar") ? bestOwner(holder, ownerNames) : { name: "", score: 0 };
    return res.status(200).json({ ok: true, documentType: type, overallConfidence: 65, isMultiProductSL: false, applicantIsOwner: Boolean(fields.applicantIsOwner?.value), fields, matchedOwnerName: identityMatch.score >= 50 ? identityMatch.name : "", matchConfidence: identityMatch.score, isIndexIIOwner: identityMatch.score >= 50, warnings, rawText: rawText.slice(0, 12000), sourceFileName: fileName, provider: "OCR.space" });
  } catch (e) {
    const message = String(e?.message || "OCR request failed.");
    return res.status(502).json({ ok: false, error: message.includes("API key") ? message : `OCR request failed: ${message.slice(0, 300)}` });
  }
}
