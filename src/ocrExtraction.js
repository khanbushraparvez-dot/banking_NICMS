/**
 * ARSKEIL - Free browser OCR extraction
 * Uses Tesseract.js + PDF.js loaded from index.html CDN scripts.
 * No paid AI API and no API key is required.
 */

import { supabase } from "./supabaseClient";

export const OCR_DOCUMENT_TYPES = Object.freeze({ SL:"SL", INDEX2:"INDEX2", PAN:"PAN", AADHAAR:"AADHAAR" });

export const EXTRACTION_FIELDS = Object.freeze({
  SL:["borrowerName","coBorrowerName","loanAccountOrApplicationNumber","sanctionedLoanAmount","propertyAddress","bankName","branch","roi"],
  INDEX2:["documentNumber","sroName","purchaserOwnerName","propertyAddress","surveyNumber","ctsNumber","plotNumber","gatNumber","village","taluka","district","propertyArea"],
  PAN:["name","panNumber","dateOfBirth"],
  AADHAAR:["name","aadhaarNumber","dateOfBirthOrYearOfBirth","address"]
});

function getTesseract(){
  if(typeof window !== "undefined" && window.Tesseract) return window.Tesseract;
  throw new Error("OCR engine is still loading. Please wait a few seconds and try again.");
}

function getPdfJs(){
  if(typeof window !== "undefined" && window.pdfjsLib) return window.pdfjsLib;
  throw new Error("PDF OCR engine is still loading. Please wait a few seconds and try again.");
}

async function imageFromPdfPage(page, scale=1.8){
  const viewport=page.getViewport({scale});
  const canvas=document.createElement("canvas");
  canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  await page.render({canvasContext:ctx,viewport}).promise;
  return canvas;
}

async function runTesseract(image, onProgress){
  const Tesseract=getTesseract();
  const result=await Tesseract.recognize(image,"eng+mar",{
    logger:m=>{ if(m?.status && typeof m.progress==="number") onProgress?.(m); }
  });
  return { text:result?.data?.text || "", confidence:Number(result?.data?.confidence || 0) };
}

export async function runBrowserOCR(file,{onProgress}={}){
  if(!(file instanceof File)) throw new Error("A valid PDF/image File is required.");
  const type=(file.type||"").toLowerCase();
  if(type.includes("pdf") || /\.pdf$/i.test(file.name)){
    const pdfjs=getPdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const bytes=await file.arrayBuffer();
    const pdf=await pdfjs.getDocument({data:bytes}).promise;
    let text=""; let confidenceTotal=0;
    for(let p=1;p<=pdf.numPages;p++){
      onProgress?.({status:`OCR page ${p} of ${pdf.numPages}`,progress:(p-1)/pdf.numPages});
      const canvas=await imageFromPdfPage(await pdf.getPage(p));
      const r=await runTesseract(canvas,m=>onProgress?.({status:m.status,progress:((p-1)+m.progress)/pdf.numPages}));
      text += `\n\n--- PAGE ${p} ---\n${r.text}`;
      confidenceTotal += r.confidence;
    }
    return {text:text.trim(),confidence:pdf.numPages?confidenceTotal/pdf.numPages:0,pages:pdf.numPages};
  }
  const r=await runTesseract(file,onProgress);
  return {text:r.text.trim(),confidence:r.confidence,pages:1};
}

const clean=(v)=>v==null?null:String(v).replace(/\s+/g," ").trim()||null;
const upper=(v)=>clean(v)?.toUpperCase()||null;
const field=(value,confidence=0)=>({value:clean(value),confidence:Math.max(0,Math.min(100,Math.round(confidence))),doubtful:!value||confidence<60});
const first=(text,patterns)=>{ for(const p of patterns){const m=text.match(p);if(m&&m[1])return m[1].trim();} return null; };
const money=(v)=>{if(v==null)return null;const n=String(v).replace(/,/g,"").match(/\d+(?:\.\d+)?/);return n?Number(n[0]):null;};

function extractSL(text){
  const bank=first(text,[/for\s+([A-Za-z][A-Za-z .&()-]{4,80}(?:FINANCE|HOUSING|BANK|LIMITED|LTD))/i,/([A-Za-z][A-Za-z .&()-]{4,80}(?:FINANCE|HOUSING FINANCE|BANK))/i]);
  const borrower=first(text,[/(?:Applicant|Borrower|Customer|Name of Applicant)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,80})/i]);
  const co=first(text,[/(?:Co-Applicant|Co Applicant|Co-Borrower|Co Borrower)\s*[:\-]\s*([A-Za-z][A-Za-z .,'-]{2,100})/i]);
  const app=first(text,[/(?:Application No\.?|Application Number|Loan Application No\.?|Reference No\.?|Ref Application No\.?|Sanction ID|Finnone Neo ID No\.?)\s*[:\-]?\s*([A-Z0-9\/-]{5,40})/i]);
  const amountRaw=first(text,[/(?:Total Amount Sanctioned|Loan Amount including Insurance Premium|Loan Amount Sanctioned|Sanctioned Loan Amount|Loan Amount)\s*[:\-₹ ]*([0-9,]+(?:\.\d+)?)/i]);
  const roi=first(text,[/(?:Rate of Interest|ROI|Interest Rate)\s*[:\- ]*([0-9]+(?:\.[0-9]+)?\s*%[^\n]*)/i]);
  const branch=first(text,[/(?:Branch|Branch Name)\s*[:\-]\s*([^\n]{2,80})/i]);
  const address=first(text,[/(?:Property Address|Security Address|Address of Property)\s*[:\-]\s*([^\n]{10,250})/i]);
  const contact=first(text,[/(?:Contact No\.? \(M\)|Contact No\.?|Mobile|Phone)\s*[:\-]?\s*(\+?\d[\d -]{8,14})/i]);
  return {
    documentType:"SanctionLetter",
    overallConfidence:70,
    fields:{
      applicantName:field(upper(borrower),borrower?82:0),
      coApplicantNames:field(co?[{name:upper(co),isOwner:false}]:[],co?70:0),
      contactNumber:field(contact?.replace(/\D/g,""),contact?80:0),
      applicationNumber:field(upper(app),app?80:0),
      loanAmountSanctioned:field(amountRaw?money(amountRaw):null,amountRaw?82:0),
      rateOfInterest:field(upper(roi),roi?82:0),
      bankName:field(upper(bank),bank?65:0),
      branchName:field(upper(branch),branch?65:0),
      propertyAddress:field(upper(address),address?65:0)
    },warnings:[]
  };
}

function extractIndex2(text){
  const doc=first(text,[/(?:Document No\.?|Document Number|दस्त क्रमांक|दस्त क्रमांक\.)\s*[:\-]?\s*([0-9A-Z\/-]{3,30})/i]);
  const sro=first(text,[/(?:SRO|Sub Registrar|Sub-Registrar|दु\.नि\.|दु निं|दु.नि.)\s*[:\-]?\s*([^\n]{3,100})/i]);
  const survey=first(text,[/(?:Survey No\.?|Survey Number|सर्वे नं\.?|सर्वे क्र\.?)\s*[:\-]?\s*([^\n]{2,100})/i]);
  const cts=first(text,[/(?:CTS No\.?|CTS Number|सी\.टी\.एस\. नं\.?)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const plot=first(text,[/(?:Plot No\.?|Plot Number|प्लॉट नं\.?)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const gat=first(text,[/(?:Gat No\.?|Gat Number|गट नं\.?)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const village=first(text,[/(?:Village|गाव|मौजे)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const taluka=first(text,[/(?:Taluka|तालुका)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const district=first(text,[/(?:District|जिल्हा)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const area=first(text,[/(?:Area|Built[- ]?up Area|Carpet Area|क्षेत्रफळ)\s*[:\-]?\s*([^\n]{2,80})/i]);
  const address=first(text,[/(?:Property Address|Property Description|मिळकतीचे वर्णन|मालमत्ता)\s*[:\-]?\s*([^\n]{10,250})/i]);
  let purchaser=first(text,[/(?:Purchaser|Purchaser\/Transferee|Transferee|Buyer|खरेदीदार|घेणारा पक्षकार|घेणारे पक्षकार)\s*[:\-]?\s*([^\n]{3,100})/i]);
  if(!purchaser){
    const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    purchaser=lines.find(x=>/घेणारा|घेणारे|purchaser|transferee|buyer/i.test(x))?.replace(/.*?(?:घेणारा|घेणारे|purchaser|transferee|buyer)\s*[:\-]?\s*/i,"")||null;
  }
  return {documentType:"IndexII",overallConfidence:65,fields:{
    documentNumber:field(doc,doc?75:0),sroOfficeName:field(upper(sro),sro?65:0),
    ownerNames:field(purchaser?[upper(purchaser)]:[],purchaser?62:0),
    purchaserOwnerName:field(upper(purchaser),purchaser?62:0),
    propertyAddress:field(upper(address),address?60:0),surveyNumbers:field(upper(survey),survey?65:0),
    ctsNumber:field(upper(cts),cts?65:0),plotNumber:field(upper(plot),plot?65:0),gatNumber:field(upper(gat),gat?65:0),
    villageName:field(upper(village),village?60:0),talukaName:field(upper(taluka),taluka?60:0),districtName:field(upper(district),district?60:0),areaConstructed:field(upper(area),area?60:0)
  },warnings:["Marathi names/place names are OCR-transliterated only when Tesseract recognizes them; review the extracted Index II before saving."]};
}

function extractPAN(text){
  const pan=first(text,[/\b([A-Z]{5}[0-9]{4}[A-Z])\b/]);
  const dob=first(text,[/(?:Date of Birth|DOB|जन्म तारीख)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i]);
  const name=first(text,[/(?:Name|नाव)\s*[:\-]?\s*([A-Z][A-Z .'-]{2,80})/i]);
  return {documentType:"PAN",overallConfidence:85,fields:{holderName:field(upper(name),name?82:0),panNumber:field(pan,pan?98:0),dateOfBirth:field(dob,dob?92:0)},warnings:[]};
}

function extractAadhaar(text){
  const aad=first(text,[/\b(\d{4}[ -]\d{4}[ -]\d{4})\b/,/\b(\d{12})\b/]);
  const dob=first(text,[/(?:DOB|Date of Birth|Year of Birth|जन्म तारीख)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4})/i]);
  const name=first(text,[/(?:Name|नाव)\s*[:\-]?\s*([A-Z][A-Z .'-]{2,80})/i]);
  const address=first(text,[/(?:Address|पत्ता)\s*[:\-]?\s*([^\n]{10,250})/i]);
  return {documentType:"Aadhaar",overallConfidence:82,fields:{holderName:field(upper(name),name?78:0),aadhaarNumber:field(aad?.replace(/\D/g,""),aad?98:0),dateOfBirthOrYearOfBirth:field(dob,dob?90:0),address:field(upper(address),address?65:0)},warnings:[]};
}

export function detectDocumentType(file,text=""){
  const n=(file?.name||"").toLowerCase(); const t=text.toLowerCase();
  if(/pan/.test(n)||/income tax|permanent account number/.test(t)||/\b[a-z]{5}\d{4}[a-z]\b/i.test(t)) return OCR_DOCUMENT_TYPES.PAN;
  if(/aadhar|aadhaar/.test(n)||/unique identification|uidai/.test(t)||/\b\d{4}[ -]\d{4}[ -]\d{4}\b/.test(t)) return OCR_DOCUMENT_TYPES.AADHAAR;
  if(/index|index2|index ii|suchi|mahada|noc/.test(n)||/sub registrar|purchaser|खरेदीदार|घेणारा|दस्त क्रमांक/.test(t)) return OCR_DOCUMENT_TYPES.INDEX2;
  return OCR_DOCUMENT_TYPES.SL;
}

export function parseOCRText(file,text,documentType){
  const type=documentType||detectDocumentType(file,text);
  if(type===OCR_DOCUMENT_TYPES.PAN)return extractPAN(text);
  if(type===OCR_DOCUMENT_TYPES.AADHAAR)return extractAadhaar(text);
  if(type===OCR_DOCUMENT_TYPES.INDEX2)return extractIndex2(text);
  return extractSL(text);
}

export async function extractDocument(file,options={}){
  const {caseId="",documentType,onProgress}=options;
  if(!caseId) throw new Error("caseId is required for document extraction.");
  const ocr=await runBrowserOCR(file,{onProgress});
  const parsed=parseOCRText(file,ocr.text,documentType);
  const extractionResult={documentType:parsed.documentType,caseId,data:parsed.fields,confidence:Object.fromEntries(Object.entries(parsed.fields).map(([k,v])=>[k,(v?.confidence||0)/100])),rawText:ocr.text,sourceFileName:file.name,overallConfidence:Math.round(ocr.confidence||parsed.overallConfidence||0),warnings:parsed.warnings||[]};

  try{
    const {data:userData}=await supabase.auth.getUser();
    const uid=userData?.user?.id||null;
    if(uid){
      const {error}=await supabase.from("document_extractions").insert({case_id:caseId,document_type:parsed.documentType,source_file_name:file.name,extracted_data:parsed.fields,confidence:extractionResult.confidence,raw_text:ocr.text,created_by:uid});
      if(error) console.warn("OCR save error:",error.message);
    }
  }catch(e){console.warn("OCR Supabase save skipped:",e?.message||e);}
  return extractionResult;
}

export async function extractCaseDocuments(caseId,documents,options={}){
  if(!caseId)throw new Error("caseId is required.");
  if(!Array.isArray(documents)||!documents.length)throw new Error("At least one document is required.");
  const results=[];
  for(const item of documents) results.push(await extractDocument(item.file,{...options,caseId,documentType:item.documentType}));
  return {caseId,results,combinedSL:combineSanctionLetters(results.filter(x=>x.documentType===OCR_DOCUMENT_TYPES.SL))};
}

export function parseMoney(value){if(typeof value==="number")return Number.isFinite(value)?value:NaN;if(value==null)return NaN;const n=String(value).replace(/,/g,"").match(/\d+(?:\.\d+)?/);return n?Number(n[0]):NaN;}
export function formatINR(value){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n):"";}
export function maskAadhaar(value){const d=String(value||"").replace(/\D/g,"");return d.length<4?"XXXX":`XXXX XXXX ${d.slice(-4)}`;}

export function combineSanctionLetters(slResults=[]){
  const normalized=slResults.map((r,index)=>({index:index+1,...r,amount:parseMoney(r?.data?.loanAmountSanctioned?.value??r?.data?.sanctionedLoanAmount),roi:r?.data?.rateOfInterest?.value??r?.data?.roi??null})).filter(x=>Number.isFinite(x.amount)&&x.amount>=0);
  const total=normalized.reduce((s,x)=>s+x.amount,0); const largest=normalized.reduce((a,x)=>(!a||x.amount>a.amount?x:a),null);
  return {count:normalized.length,totalSanctionedLoanAmount:total,totalSanctionedLoanAmountDisplay:formatINR(total),largestLoanSLIndex:largest?.index??null,largestLoanAmount:largest?.amount??null,largestLoanAmountDisplay:largest?formatINR(largest.amount):null,roiFromLargestLoanSL:largest?.roi??null,roiRule:"ROI is taken only from the Sanction Letter with the largest sanctioned loan amount.",letters:normalized.map(x=>({index:x.index,fileName:x.sourceFileName,loanAmount:x.amount,loanAmountDisplay:formatINR(x.amount),roi:x.roi,borrowerName:x.data?.applicantName?.value??null,coBorrowerName:x.data?.coApplicantNames?.value??null,propertyAddress:x.data?.propertyAddress?.value??null,confidence:x.confidence||{}}))};
}

export function buildFillData(extraction){
  const results=extraction?.results||[]; const sl=results.filter(x=>x.documentType==="SL"); const combined=extraction?.combinedSL||combineSanctionLetters(sl);
  const primary=sl.find((x,i)=>i+1===combined.largestLoanSLIndex)||sl[0]; const idx=results.find(x=>x.documentType==="INDEX2")?.data||{}; const pan=results.find(x=>x.documentType==="PAN")?.data||{}; const aad=results.find(x=>x.documentType==="AADHAAR")?.data||{};
  const val=(o,k)=>o?.[k]?.value??null;
  return {borrowerName:val(primary?.data,"applicantName"),coBorrowerName:val(primary?.data,"coApplicantNames"),loanAccountOrApplicationNumber:val(primary?.data,"applicationNumber"),sanctionedLoanAmount:combined.totalSanctionedLoanAmount,roi:combined.roiFromLargestLoanSL,propertyAddress:val(primary?.data,"propertyAddress")||val(idx,"propertyAddress"),bankName:val(primary?.data,"bankName"),branch:val(primary?.data,"branchName"),index2:{documentNumber:val(idx,"documentNumber"),sroName:val(idx,"sroOfficeName"),purchaserOwnerName:val(idx,"purchaserOwnerName"),propertyAddress:val(idx,"propertyAddress"),surveyNumber:val(idx,"surveyNumbers"),ctsNumber:val(idx,"ctsNumber"),plotNumber:val(idx,"plotNumber"),gatNumber:val(idx,"gatNumber"),village:val(idx,"villageName"),taluka:val(idx,"talukaName"),district:val(idx,"districtName"),propertyArea:val(idx,"areaConstructed")},pan:{name:val(pan,"holderName"),panNumber:val(pan,"panNumber"),dateOfBirth:val(pan,"dateOfBirth")},aadhaar:{name:val(aad,"holderName"),aadhaarNumber:val(aad,"aadhaarNumber"),dateOfBirthOrYearOfBirth:val(aad,"dateOfBirthOrYearOfBirth"),address:val(aad,"address")}};
}
