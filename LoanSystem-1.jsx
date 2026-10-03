import { useState, useEffect, useRef } from "react";
import { supabase } from "./src/supabaseClient";

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  dark: "#1a1f2e", darker: "#141824", gold: "#c9a84c", goldLight: "#e0c068",
  goldBg: "#c9a84c22", green: "#22c55e", greenBg: "#22c55e18", amber: "#f59e0b",
  white: "#ffffff", gray100: "#f8f9fa", gray200: "#e9ecef", gray300: "#dee2e6",
  gray400: "#adb5bd", gray500: "#6c757d", gray600: "#495057", red: "#ef4444",
  sidebar: "#1a1f2e", sidebarActive: "#c9a84c22", border: "#2d3448",
  cardBg: "#ffffff", pageBg: "#f4f6f9", indigo: "#6366f1", indigoBg: "#eef2ff",
  sky: "#0ea5e9", skyBg: "#e0f2fe",
};

const inputStyle = {
  width: "100%", padding: "9px 12px", border: `1px solid ${C.gray300}`,
  borderRadius: 6, fontSize: 14, outline: "none", background: C.white,
  color: C.dark, boxSizing: "border-box",
};
const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 600, color: C.gold,
  marginBottom: 4, letterSpacing: 0.3,
};
const SectionTitle = ({ children }) => (
  <h3 style={{ color: C.gold, fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
    {children}
  </h3>
);

// ─── DATA LAYER ──────────────────────────────────────────────────────────────
// Production: Supabase-backed app_records table.  StackBlitz demo: localStorage
// is used ONLY when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not present.
const DEMO_MODE = !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const DB = {
  _cache: {},
  _demoKey: t => `ark_demo_${t}`,
  _loadDemo: t => { try { return JSON.parse(localStorage.getItem(DB._demoKey(t)) || "[]"); } catch { return []; } },
  _saveDemo: (t,d) => { try { localStorage.setItem(DB._demoKey(t), JSON.stringify(d)); } catch {} },
  get: t => DEMO_MODE ? DB._loadDemo(t) : (DB._cache[t] || []),
  set: (t,d) => {
    DB._cache[t] = d;
    if (DEMO_MODE) DB._saveDemo(t,d);
    else DB._replaceRemote(t,d);
  },
  getOne: (t,id) => DB.get(t).find(r => r.id === id) || null,
  insert: (t,rec) => {
    const rows = [...DB.get(t), rec]; DB._cache[t] = rows;
    if (DEMO_MODE) DB._saveDemo(t,rows); else DB._upsertRemote(t,rec);
    return rec;
  },
  update: (t,id,patch) => {
    const rows = DB.get(t).map(r => r.id === id ? { ...r, ...patch } : r); DB._cache[t] = rows;
    if (DEMO_MODE) DB._saveDemo(t,rows); else { const row=rows.find(r=>r.id===id); if(row) DB._upsertRemote(t,row); }
  },
  findBy: (t,k,v) => DB.get(t).filter(r => r[k] === v),
  nextCaseSeq: () => {
    const n = DB.get("cases").reduce((m,c) => Math.max(m, Number(String(c.caseId||"").split("-").pop())||0), 0) + 1;
    return n;
  },
  generateCaseId: () => `ARS-${new Date().getFullYear()}-${String(DB.nextCaseSeq()).padStart(6,"0")}`,
  hashPassword: async pwd => { const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(pwd+"ark_salt_v1")); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join(""); },
  audit: (action,userId,detail={}) => DB.insert("audit_logs",{id:`log_${Date.now()}_${Math.random()}`,action,userId,detail,ts:new Date().toISOString()}),
  session: null,
  async hydrateRemote(){
    if(DEMO_MODE || !supabase) return;
    const {data,error}=await supabase.from("app_records").select("table_name,record_id,payload");
    if(error) { console.warn("ARS data hydrate:",error.message); return; }
    const grouped={}; (data||[]).forEach(r=>{(grouped[r.table_name] ||= []).push({...r.payload,id:r.record_id});});
    Object.entries(grouped).forEach(([k,v])=>DB._cache[k]=v);
  },
  _upsertRemote: async (table,rec) => { if(!supabase || DEMO_MODE) return; try { await supabase.from("app_records").upsert({table_name:table,record_id:String(rec.id),payload:rec},{onConflict:"table_name,record_id"}); } catch(e){ console.warn("ARS save:",e.message); } },
  _replaceRemote: async (table,rows) => { if(!supabase || DEMO_MODE) return; try { for(const r of rows) await DB._upsertRemote(table,r); } catch(e){ console.warn("ARS save:",e.message); } },
};

// ─── LOGIN PAGE BRANDING ASSETS ─────────────────────────────────────────────
const LOGIN_ASSET_DEFAULTS = {
  logo: "/assets/ar-skeil.jpg",
  secureLogin: "/assets/secure-login.jpg",
  roleAccess: "/assets/role-access.jpg",
  noiLifecycle: "/assets/noi-lifecycle.jpg",
};

async function loadLoginAssets() {
  if (DEMO_MODE || !supabase) {
    try {
      return { ...LOGIN_ASSET_DEFAULTS, ...(JSON.parse(localStorage.getItem("ark_login_assets") || "{}")) };
    } catch { return { ...LOGIN_ASSET_DEFAULTS }; }
  }
  try {
    const { data, error } = await supabase.from("login_page_assets").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return { ...LOGIN_ASSET_DEFAULTS };
    return { ...LOGIN_ASSET_DEFAULTS, ...data };
  } catch { return { ...LOGIN_ASSET_DEFAULTS }; }
}

async function saveLoginAsset(key, file, session) {
  if (!file) return null;
  if (session?.role !== "Vendor Admin") throw new Error("Only Vendor Admins can change login-page images.");
  if (DEMO_MODE || !supabase) {
    const dataUrl = await fileToDataUrl(file);
    const current = await loadLoginAssets();
    const next = { ...current, [key]: dataUrl };
    try { localStorage.setItem("ark_login_assets", JSON.stringify(next)); } catch {}
    return dataUrl;
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `login/${key}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext || "jpg"}`;
  const { error: uploadError } = await supabase.storage.from("platform-assets").upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
  if (uploadError) throw uploadError;
  const { data: publicData } = supabase.storage.from("platform-assets").getPublicUrl(path);
  const url = publicData?.publicUrl;
  if (!url) throw new Error("Unable to create public image URL.");
  const patch = { id: 1, [key]: url, updated_at: new Date().toISOString(), updated_by: session.id };
  const { error: dbError } = await supabase.from("login_page_assets").upsert(patch, { onConflict: "id" });
  if (dbError) throw dbError;
  return url;
}

// ─── CASE / DOCUMENT HELPERS ────────────────────────────────────────────────
const DOC_TYPES = {
  SL: { label: "Sanction Letter", icon: "📜" },
  INDEX2: { label: "Index 2", icon: "📑" },
  ADHAR: { label: "Aadhaar", icon: "🪪" },
  PAN: { label: "PAN", icon: "💳" },
  NOI: { label: "NOI", icon: "ℹ️" },
  SD: { label: "SD Receipt", icon: "🧾" },
  SDR: { label: "SDR Receipt", icon: "🧾" },
  RF: { label: "Registration Fee Receipt", icon: "🧾" },
  NOI_RECEIPT: { label: "NOI Receipt", icon: "🧾" },
  DEFACED_CHALLAN: { label: "Defaced Challan", icon: "📄" },
};

function caseDocuments(caseId) {
  return DB.get("case_documents").filter(d => d.caseId === caseId);
}

function getVisibleCases(session) {
  const all = DB.get("cases");
  if (!session || session.role === "Vendor Admin") return all;
  if (session.permissions?.viewAllCases === true) return all;
  if (session.role === "Vendor Employee") return all.filter(c => c.employeeId === session.id || c.employeeEmail === session.email || c.createdBy === session.id || c.createdByEmail === session.email);
  if (session.role === "Banker") return all.filter(c => c.createdBy === session.id || c.createdByEmail === session.email);
  if (session.role === "Admin" || session.role === "Operations") return all;
  if (session.role === "Sales Manager") {
    return all.filter(c => c.salesManagerId === session.id || c.salesManagerEmail === session.email || c.createdBy === session.id);
  }
  return [];
}

function syncCaseStatus(caseId) {
  if (!caseId) return null;
  const rec = DB.get("cases").find(c => c.caseId === caseId);
  if (!rec) return null;
  const docs = caseDocuments(caseId);
  // Challan is complete when either SDR is uploaded OR both SD + RF are uploaded.
  // This means SDR is an alternative to the SD/RF combination.
  const hasSDR = docs.some(d => d.type === "SDR");
  const hasSD = docs.some(d => d.type === "SD");
  const hasRF = docs.some(d => d.type === "RF");
  const challanReady = !!rec.challanData || hasSDR || (hasSD && hasRF);
  const hasDefaced = docs.some(d => d.type === "DEFACED_CHALLAN");
  const status = {
    challanDone: challanReady,
    sdrDone: hasSDR,
    sdDone: hasSD,
    rfDone: hasRF,
    defacedChallanDone: hasDefaced,
    noiDone: !!rec.noiData || docs.some(d => d.type === "NOI"),
    index2Done: docs.some(d => d.type === "INDEX2"),
    noiReceiptDone: docs.some(d => d.type === "NOI_RECEIPT"),
  };
  // Final completion: (SD + RF) OR (SDR + Defaced Challan), in both cases
  // requiring Index 2 and NOI Receipt.
  const completed = ((status.sdDone && status.rfDone) || (status.sdrDone && status.defacedChallanDone)) && status.index2Done && status.noiReceiptDone;
  DB.update("cases", rec.id, { documentStatus: status, status: completed ? "Completed" : "Active" });
  return status;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, name, type = "application/octet-stream") {
  const parts = String(dataUrl || "").split(",");
  const mime = (parts[0].match(/data:([^;]+);/) || [])[1] || type;
  const binary = atob(parts[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || "document", { type: mime });
}

function downloadDataUrl(dataUrl, fileName) {
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ensureCaseDocumentStore() {
  if (!Array.isArray(DB.get("case_documents"))) DB.set("case_documents", []);
  if (!Array.isArray(DB.get("received_documents"))) DB.set("received_documents", []);
  if (!Array.isArray(DB.get("ai_documents"))) DB.set("ai_documents", []);
}
ensureCaseDocumentStore();

// Authentication is handled by Supabase. Local DB remains only for legacy case/document UI data.


// Backfill bankCode on cases created by older prototype versions.
(() => {
  try {
    const cases = DB.get("cases");
    let changed = false;
    const updated = cases.map(c => {
      const bankCode = c.bankCode || inferBankCode(c.bankName);
      if (c.bankCode !== bankCode) { changed = true; return { ...c, bankCode }; }
      return c;
    });
    if (changed) { DB._cache.cases = updated; if (DEMO_MODE) DB._saveDemo("cases", updated); }
  } catch {}
})();

// ─── GLOBAL CASE STORE (persists across tab switches) ─────────────────────────
// Single source of truth for extracted + user-edited data, keyed by caseId
const STORE = {
  _data: (() => { try { return JSON.parse(sessionStorage.getItem("ark_store") || "{}"); } catch { return {}; } })(),
  _save() { try { sessionStorage.setItem("ark_store", JSON.stringify(this._data)); } catch {} },
  get(caseId) { return this._data[caseId] || null; },
  set(caseId, patch) {
    this._data[caseId] = { ...(this._data[caseId] || {}), ...patch };
    this._save();
    // Also persist to DB
    const rec = DB.get("cases").find(c => c.caseId === caseId);
    if (rec) DB.update("cases", rec.id, { storeData: this._data[caseId] });
  },
  // Load from DB into session (called when page refreshes)
  hydrate(caseId) {
    const rec = DB.get("cases").find(c => c.caseId === caseId);
    if (rec?.storeData && !this._data[caseId]) {
      this._data[caseId] = rec.storeData;
      this._save();
    }
    return this._data[caseId] || null;
  },
  // Get active case (most recent)
  getActive() {
    const cases = DB.get("cases");
    if (!cases.length) return null;
    const recent = [...cases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return this.hydrate(recent.caseId);
  },
};

// ─── ADDRESS FORMATTER ────────────────────────────────────────────────────────
// Strips survey/CTS/gat numbers from Index II address, returns clean building address
function cleanPropertyAddress(raw) {
  if (!raw) return "";
  let addr = String(raw)
    .replace(/\bsur(?:vey)?\s*(?:no\.?|number|नं|क्र)\.?\s*[\d/,\s]+/gi, " ")
    .replace(/\bnew\s+sur(?:vey)?\s*(?:no\.?|number)?\s*[\d/,\s]+/gi, " ")
    .replace(/\bnaveen\s+sarve\s*no\.?\s*[\d/,\s]+/gi, " ")
    .replace(/\bg(?:at|ata)\s*(?:no\.?)?\s*[\d/,\s]+/gi, " ")
    .replace(/\bcts\s*(?:no\.?)?\s*[\d/,\s]+/gi, " ")
    .replace(/\bc\.t\.s\.?\s*(?:no\.?)?\s*[\d/,\s]+/gi, " ")
    .replace(/\bhissa\s*(?:no\.?)?\s*[\d/,\s]+/gi, " ")
    .replace(/\bhissa\s+no\.?\s*[\d/a-z,\s]+/gi, " ")
    .replace(/\(survey\s+number[^)]*\)/gi, "")
    .replace(/survey\s+number\s*:\s*[^,\n]*/gi, "")
    .replace(/\bregn?\s*:\s*\w+/gi, "")
    .replace(/\s{2,}/g, " ").trim();
  return addr.replace(/\b\w/g, c => c.toUpperCase()).trim();
}

// Build the standard address from structured components (preferred — comes from AI).
// Format order: Flat No, Floor, Wing, Building Name, Building/Road/Tower No, Landmark, Village, Taluka, District
// Excludes State, PIN, Country.
function buildAddressFromComponents(c = {}) {
  const lines = [];
  if (c.flatNo) lines.push(`FLAT NO. ${String(c.flatNo).toUpperCase()}`);
  if (c.floor) lines.push(`${String(c.floor).toUpperCase()}${/floor/i.test(c.floor) ? "" : " FLOOR"}`);
  if (c.wing) lines.push(`WING ${String(c.wing).toUpperCase()}`);
  if (c.buildingName) lines.push(String(c.buildingName).toUpperCase());
  if (c.buildingNo) lines.push(`BLDG NO. ${String(c.buildingNo).toUpperCase()}`);
  if (c.roadNo) lines.push(`ROAD NO. ${String(c.roadNo).toUpperCase()}`);
  if (c.towerNo) lines.push(`TOWER ${String(c.towerNo).toUpperCase()}`);
  if (c.landmark) lines.push(String(c.landmark).toUpperCase());
  if (c.village) lines.push(String(c.village).toUpperCase());
  if (c.taluka) lines.push(String(c.taluka).toUpperCase());
  if (c.district) lines.push(String(c.district).toUpperCase());
  return lines.filter(Boolean).join(",\n");
}

// Fallback: parse a free-text address into the standard format (used if AI doesn't supply components).
function formatStandardAddress(rawSL, rawIndex, components = null) {
  // If AI gave us structured components, use them (most reliable)
  if (components && (components.flatNo || components.buildingName || components.village)) {
    return buildAddressFromComponents(components);
  }
  // Fallback regex parse of SL address + Index II
  const sl = String(rawSL || "").replace(/\s+/g, " ").trim();
  const idx = cleanPropertyAddress(rawIndex);
  const flatMatch = sl.match(/flat\s*(?:no\.?)?\s*([\w/-]+)/i);
  const floorMatch = sl.match(/(\d+(?:st|nd|rd|th)?)\s*floor/i);
  const bldgNoMatch = sl.match(/(?:building|bldg|bl\.?)\s*(?:no\.?)?\s*([\w-]+)/i);
  const bldgNameMatch = sl.match(/([A-Z][A-Za-z\s]+(?:towers?|heights?|residency|park|arcade|complex|society|apartments?|style|plaza|life\s*style))/i);
  const wingMatch = sl.match(/(?:wing|block)\s*([A-Z0-9-]+)/i);
  return buildAddressFromComponents({
    flatNo: flatMatch?.[1], floor: floorMatch?.[1], wing: wingMatch?.[1],
    buildingName: bldgNameMatch?.[1]?.trim(), buildingNo: bldgNoMatch?.[1],
    village: idx || "", district: "",
  }) || (sl.toUpperCase());
}

// ─── ONEDRIVE / EXCEL PUSH ────────────────────────────────────────────────────
// OneDrive shared link converted to API endpoint via Graph (anonymous read-only)
// For real-time write we use the Workbook Sessions API with the share item
const EXCEL_SHARE_URL = "https://1drv.ms/x/c/a76b1b9413807f8f/IQBbt1MU9sE9RKBXv8SUn16UAROIQFYqChCZkrX1G_mqvzw?e=G5xV8G";

async function pushRowToExcel(rowData) {
  // Convert OneDrive share URL to Graph API driveItem URL
  // Encode the share URL as base64url
  const encoded = btoa(EXCEL_SHARE_URL).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const graphBase = `https://graph.microsoft.com/v1.0/shares/u!${encoded}/driveItem`;

  // NOTE: Writing to OneDrive requires OAuth2 authentication (Microsoft account).
  // Since this runs in the browser without a backend OAuth flow, we use a
  // two-step approach: open the Excel file, then append via Graph API if user
  // has granted consent, otherwise fall back to CSV download.
  try {
    // Try Graph API (works if user is signed into Microsoft in the same browser session)
    const sessionRes = await fetch(`${graphBase}/workbook/createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persistChanges: true })
    });

    if (!sessionRes.ok) throw new Error("No Graph session");

    const { id: sessionId } = await sessionRes.json();
    // Find next empty row (append after last used row)
    const rangeRes = await fetch(`${graphBase}/workbook/worksheets/Sheet1/usedRange`, {
      headers: { "workbook-session-id": sessionId }
    });
    const rangeData = await rangeRes.json();
    const nextRow = (rangeData.rowCount || 1) + 1;

    // Use the shared field mapping so every populated DB field reaches Excel
    const values = [MIS_KEYS.map(k => rowData[k] ?? "")];
    const endCol = colLetter(MIS_KEYS.length - 1);

    await fetch(`${graphBase}/workbook/worksheets/Sheet1/range(address='A${nextRow}:${endCol}${nextRow}')`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "workbook-session-id": sessionId },
      body: JSON.stringify({ values })
    });

    await fetch(`${graphBase}/workbook/closeSession`, {
      method: "POST",
      headers: { "workbook-session-id": sessionId }
    });
    return { ok: true, method: "graph" };
  } catch {
    // Fallback: download as CSV row for manual paste
    return { ok: false, method: "fallback" };
  }
}

// ─── MIS → EXCEL FIELD MAPPING (single source of truth for column order) ──────
const MIS_FIELDS = [
  ["srNo", "Case ID / Sr No"],
  ["docReceivedDate", "Doc Received Date"],
  ["fiName", "FI Name"],
  ["bankName", "Bank Name"],
  ["branchName", "Branch"],
  ["customerName", "Customer Name"],
  ["coApplicant", "Co-Applicant"],
  ["mobNo", "Mobile No"],
  ["applicationNo", "Application No"],
  ["loanAmt", "Loan Amount"],
  ["roi", "ROI"],
  ["termMonths", "Tenure (Months)"],
  ["sanctionDate", "Sanction Date"],
  ["amt030", "0.30% Amt"],
  ["amt050", "0.50% Amt"],
  ["dhcAmt", "DHC Amt"],
  ["challanTotal", "Challan Total"],
  ["paymentDate", "Payment Date"],
  ["amtReceived", "Amt Received"],
  ["netFees", "Net Fees"],
  ["platformFee", "Platform Fee"],
  ["extraAmt", "Extra Amt"],
  ["propertyAddress", "Property Address"],
  ["village", "Village"],
  ["taluka", "Taluka"],
  ["district", "District"],
  ["pincode", "Pincode"],
  ["areaConstructed", "Area Constructed"],
  ["sroName", "SRO Name"],
  ["sroNo", "Document No"],
  ["noiSubmit", "NOI Submit Date"],
  ["noiReceipt", "NOI Receipt Date"],
  ["tat", "TAT (Days)"],
  ["challanBy", "Challan By"],
  ["noiBy", "NOI By"],
  ["fsf", "FSF"],
  ["remarks", "Remarks"],
];
const MIS_KEYS = MIS_FIELDS.map(f => f[0]);
const MIS_HEADERS = MIS_FIELDS.map(f => f[1]);
const MIS_DB_MAP = Object.fromEntries(MIS_FIELDS.map(([k]) => [k, k.replace(/[A-Z]/g, m => "_" + m.toLowerCase())]));
const misToDb = row => Object.fromEntries(MIS_KEYS.map(k => [MIS_DB_MAP[k], row[k] ?? ""]));
const dbToMis = row => Object.fromEntries(MIS_KEYS.map(k => [k, row[MIS_DB_MAP[k]] ?? ""]));

// Excel column letter from 0-based index (handles A..Z, AA..AZ)
function colLetter(i) {
  let s = ""; i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function downloadCSV(rows) {
  const csv = [MIS_HEADERS.join(","), ...rows.map(r => MIS_KEYS.map(k => `"${(r[k] ?? "").toString().replace(/"/g, '""')}"`).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `MIS_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── AUTH PAGES ───────────────────────────────────────────────────────────────
const AUTH_ROLES = ["Banker", "Vendor Admin", "Vendor Employee"];
const VENDOR_ADMIN_EMAILS = ["founder@arskeil.in", "khanbushraparvez@gmail.com"];

// Bank list used by the registration/login flow. Bank selection is retained for
// case processing so the document extractor can apply the correct bank pattern.
const BANKS = [
  { code: "MRHFL", name: "Mahindra Rural Housing Finance Ltd", short: "MRHFL", fullName: "Mahindra Rural Housing Finance Ltd", icon: "🏦", pattern: [1,2,5,8,9], emailDomain: "@mahindrafinance.com" },
  { code: "MMFSL", name: "Mahindra and Mahindra Financial Services Ltd", short: "MMFSL", fullName: "Mahindra and Mahindra Financial Services Ltd", icon: "🏦", pattern: [1,4,5,6,9], emailDomain: "@mahindrafinance.com" },
  { code: "AFL", name: "Axis Finance Ltd", short: "AFL", fullName: "Axis Finance Ltd", icon: "🏦", pattern: [3,2,5,8,7], emailDomain: "@axisfinance.in" },
  { code: "NIWAS", name: "Niwas Housing Finance Ltd", short: "NIWAS", fullName: "Niwas Housing Finance Ltd", icon: "🏠", pattern: [1,4,5,8,9], emailDomain: "@niwashfc.com" },
  { code: "TATA", name: "Tata Capital Housing Finance Ltd", short: "TATA", fullName: "Tata Capital Housing Finance Ltd", icon: "🏦", pattern: [2,1,5,9,8], emailDomain: "@tatacapital.com" },
  { code: "OTHERS", name: "OTHERS", short: "OTHERS", fullName: "Other / New Bank", icon: "➕", pattern: [1,5,9,6,3] },
];

const BANK_EXTRACTION_RULES = {
  MRHFL: `SELECTED BANK = MRHFL. Prioritise MRHFL sanction-letter layouts.
- MRHFL may issue more than one Sanction Letter for the same applicant, including Prime HL and Prime VAP/insurance products.
- For multiple MRHFL SL files, mark later/product SLs with isMultiProductSL=true and extract each SL amount separately; the application will sum them.
- Do not borrow field labels or loan-amount rules from MMFSL, AFL or TATA documents.`,
  MMFSL: `SELECTED BANK = MMFSL. Prioritise MMFSL sanction-letter layouts and exact financial-table labels visible in the supplied document.
- Extract the sanctioned loan amount from the bank's actual sanctioned/total loan amount field.
- Do not assume MRHFL, AFL or TATA insurance-summing rules unless the MMFSL document itself clearly shows those components.`,
  AFL: `SELECTED BANK = AFL (AXIS FINANCE). Prioritise Axis Finance sanction-letter layouts.
- When the document explicitly provides Loan Amount including Insurance Premium, use that total.
- If the document instead separates base sanction and insurance, follow the explicit total/including-insurance field rather than blindly summing unrelated rows.
- Do not use MRHFL multi-product assumptions unless multiple AFL SLs are actually supplied.`,
  NIWAS: `SELECTED BANK = NIWAS. Prioritise Niwas Housing Finance document labels and native sanction/Index layouts.`,
  TATA: `SELECTED BANK = TATA. Prioritise Tata Capital Housing Finance document labels and native sanction/Index layouts.`,
  OTHERS: `SELECTED BANK = OTHERS. Use the document's own labels and layout. Do not force another bank template. Identify the bank from the document when possible and still extract the exact visible values.`,
};

const getBank = code => BANKS.find(b => b.code === code) || BANKS[BANKS.length - 1];
const inferBankCode = bankName => {
  const n = String(bankName || "").toUpperCase();
  if (n.includes("MRHFL") || n.includes("MAHINDRA RURAL HOUSING")) return "MRHFL";
  if (n.includes("MMFSL") || n.includes("MAHINDRA AND MAHINDRA FINANCIAL") || n.includes("MAHINDRA & MAHINDRA FINANCIAL")) return "MMFSL";
  if (n.includes("AFL") || n.includes("AXIS FINANCE")) return "AFL";
  if (n.includes("NIWAS")) return "NIWAS";
  if (n.includes("TATA")) return "TATA";
  return "OTHERS";
};

const EMAIL_DOMAINS = {
  MRHFL: "@mahindrafinance.com",
  MMFSL: "@mahindrafinance.com",
  AFL: "@axisfinance.in",
  NIWAS: "@niwashfc.com",
  TATA: "@tatacapital.com",
  VENDOR: "@arskeil.in",
};
const verticals = ["Home Loan", "Loan Against Property", "Working Capital", "Overdraft / Cash Credit"];
const emailMatchesDomain = (email, domain) => String(email || "").trim().toLowerCase().endsWith(String(domain || "").toLowerCase());
const makeOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const hashText = async (value) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};
const requestEmailOtp = async (email, purpose = "verification") => {
  const res = await fetch("/api/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send", email: String(email || "").trim().toLowerCase(), purpose }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to send OTP right now.");
  return data.token;
};
const verifyEmailOtp = async (email, otp, token, purpose = "verification") => {
  const res = await fetch("/api/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", email: String(email || "").trim().toLowerCase(), otp: String(otp || "").trim(), token, purpose }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Invalid or expired OTP.");
  return data;
};

const resetPasswordWithToken = async (email, password, resetToken) => {
  const res = await fetch("/api/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset-password", email: String(email || "").trim().toLowerCase(), password, resetToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to reset password.");
  return data;
};

function PatternLock({ pattern, onChange, disabled=false }) {
  const [drawing, setDrawing] = useState(false);
  const [sequence, setSequence] = useState(pattern || []);
  useEffect(() => setSequence(pattern || []), [pattern]);
  useEffect(() => {
    const stop = () => setDrawing(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  const addNode = n => {
    if (disabled) return;
    setSequence(prev => {
      if (prev.includes(n)) return prev;
      const next = [...prev, n]; onChange?.(next); return next;
    });
  };
  const clear = () => { if (!disabled) { setSequence([]); onChange?.([]); } };
  return <div>
    <div onPointerLeave={() => setDrawing(false)} style={{ width:250,height:250,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gridTemplateRows:"repeat(3,1fr)",gap:22,padding:24,borderRadius:22,background:C.gray100,border:`1px solid ${C.gray200}`,boxSizing:"border-box",touchAction:"none",userSelect:"none" }}>
      {Array.from({length:9},(_,i)=>{ const n=i+1,active=sequence.includes(n),order=sequence.indexOf(n)+1; return <div key={n} onPointerDown={e=>{e.preventDefault();setDrawing(true);addNode(n)}} onPointerEnter={()=>drawing&&addNode(n)} style={{width:50,height:50,borderRadius:"50%",background:active?C.gold:C.white,border:`3px solid ${active?C.gold:C.gray300}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:disabled?"not-allowed":"pointer",color:active?C.dark:C.gray500,fontWeight:900,fontSize:active?15:12,boxShadow:active?`0 0 0 5px ${C.goldBg}`:"none",transition:"all .12s"}}>{active?order:n}</div> })}
    </div>
    <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:12}}><button type="button" onClick={clear} disabled={disabled} style={{padding:"7px 12px",border:`1px solid ${C.gray300}`,background:C.white,borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontWeight:700}}>Clear</button><div style={{padding:"7px 12px",borderRadius:7,background:C.gray100,color:C.gray600,fontSize:12,fontWeight:700}}>Nodes: {sequence.length}</div></div>
  </div>;
}

function BankSelector({ selected, onSelect }) {
  return <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{BANKS.map(bank=>{const active=selected===bank.code;return <button key={bank.code} type="button" onClick={()=>onSelect(bank.code)} style={{textAlign:"left",padding:13,border:`2px solid ${active?C.gold:C.gray200}`,borderRadius:12,background:active?C.goldBg:C.white,cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:9}}><div style={{fontSize:22}}>{bank.icon}</div><div><div style={{fontWeight:900,color:C.dark,fontSize:14}}>{bank.name}</div>{bank.emailDomain&&<div style={{fontSize:10,color:C.gray500,marginTop:2}}>{bank.emailDomain}</div>}</div></div>{active&&<div style={{marginTop:7,fontSize:10,color:C.gold,fontWeight:800}}>✓ SELECTED</div>}</button>})}</div>;
}

function BrandPanel({ loginAssets = LOGIN_ASSET_DEFAULTS }) {
  const features = [
    { image: loginAssets.secureLogin || LOGIN_ASSET_DEFAULTS.secureLogin, title: "Secure Login", text: "Verified email and protected account access." },
    { image: loginAssets.noiLifecycle || LOGIN_ASSET_DEFAULTS.noiLifecycle, title: "NOI Lifecycle Management", text: "Document → Processing → NOI → Registration → Completion." },
    { image: loginAssets.roleAccess || LOGIN_ASSET_DEFAULTS.roleAccess, title: "Role Based Access", text: "Each user sees only the tools they are authorized to use." },
  ];
  return <div style={{flex:1,background:`linear-gradient(135deg, ${C.dark} 0%, #080d18 100%)`,display:"flex",flexDirection:"column",justifyContent:"center",padding:"46px 56px",position:"relative",overflow:"hidden",minWidth:0}}>
    <div style={{position:"absolute",top:-150,right:-110,width:420,height:420,borderRadius:"50%",background:`${C.gold}10`,border:`1px solid ${C.gold}20`}} />
    <div style={{position:"absolute",bottom:-170,left:-150,width:420,height:420,borderRadius:"50%",background:"#0ea5e912"}} />
    <div style={{position:"relative",zIndex:1,maxWidth:760}}>
      <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:28,flexWrap:"wrap"}}>
        <img src="/assets/shree-dinesh-enterprises.jpg" alt="Shree Dinesh Enterprises" style={{height:78,width:145,objectFit:"cover",objectPosition:"center",borderRadius:12,background:"#111",boxShadow:"0 10px 30px #0005"}} />
        <div style={{width:1,height:62,background:"#ffffff2b"}} />
        <img src={loginAssets.logo || LOGIN_ASSET_DEFAULTS.logo} alt="AR SKEIL" style={{height:78,width:128,objectFit:"cover",objectPosition:"center",borderRadius:12,background:"#111",boxShadow:"0 10px 30px #0005"}} />
      </div>
      <div style={{marginBottom:18}}>
        <div style={{color:C.gold,fontWeight:900,fontSize:13,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Powered by</div>
        <div style={{color:C.white,fontWeight:900,fontSize:22,lineHeight:1.25,letterSpacing:.4,textShadow:`0 0 18px ${C.gold}45, 0 3px 16px #0008`,display:"inline-block"}}>श्री दिनेश एंटरप्राइजेज</div>
      </div>
      <h1 style={{color:C.white,fontWeight:900,fontSize:40,lineHeight:1.12,margin:"0 0 12px"}}>AI-Driven NOI<br/><span style={{color:C.gold}}>Integration Platform</span></h1>
      <p style={{color:C.gray400,fontSize:15,lineHeight:1.7,maxWidth:560,margin:"0 0 28px"}}>A unified platform for bank-wise document processing, NOI lifecycle management, challans and case tracking.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12}}>
        {features.map(f=><div key={f.title} style={{minWidth:0,padding:"14px 12px",borderRadius:14,background:"linear-gradient(145deg,#ffffff0d,#ffffff05)",border:"1px solid #ffffff16",boxShadow:"0 12px 28px #0003",backdropFilter:"blur(6px)"}}>
          <div style={{height:58,display:"flex",alignItems:"center",justifyContent:"flex-start",marginBottom:7}}><img src={f.image} alt="" style={{height:58,width:"100%",maxWidth:145,objectFit:"contain",objectPosition:"left center",borderRadius:8}} /></div>
          <div style={{color:C.white,fontSize:12,fontWeight:900,lineHeight:1.25}}>{f.title}</div>
          <div style={{color:C.gray400,fontSize:10,lineHeight:1.45,marginTop:4}}>{f.text}</div>
        </div>)}
      </div>
    </div>
  </div>;
}
function LoginInfoPage({title,icon,onBack,children}){return <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',sans-serif"}}><div style={{background:C.white,borderRadius:16,padding:32,width:520,maxWidth:"100%",boxShadow:"0 8px 32px #0002"}}><button onClick={onBack} style={{border:"none",background:"transparent",color:C.gold,fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:12}}>← Back to Login</button><h2 style={{margin:"0 0 18px",color:C.dark,fontWeight:900}}>{icon} {title}</h2><div style={{color:C.gray600,fontSize:14,lineHeight:1.7}}>{children}</div></div></div>}
function HelpPage({onBack}){const [name,setName]=useState("");const [email,setEmail]=useState("");const [query,setQuery]=useState("");const [sent,setSent]=useState(false);const submit=async()=>{if(!email||!query){alert("Please enter email and your query.");return;}const rec={id:`help_${Date.now()}_${Math.random()}`,name,email:email.trim().toLowerCase(),query,status:"Open",createdAt:new Date().toISOString()};DB.insert("help_queries",rec);if(supabase&&!DEMO_MODE){try{await supabase.from("app_records").upsert({table_name:"help_queries",record_id:rec.id,payload:rec},{onConflict:"table_name,record_id"});}catch{}}setSent(true)};return <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',sans-serif"}}><div style={{background:C.white,borderRadius:16,padding:32,width:520,maxWidth:"100%",boxShadow:"0 8px 32px #0002"}}><button onClick={onBack} style={{border:"none",background:"transparent",color:C.gold,fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:12}}>← Back to Login</button><h2 style={{margin:"0 0 6px",color:C.dark,fontWeight:900}}>❓ Help</h2><p style={{color:C.gray500,fontSize:13}}>Send a query to the Vendor Admin. It will appear in the Admin Panel.</p>{sent?<div style={{background:C.greenBg,color:C.green,padding:14,borderRadius:9,fontWeight:800}}>✓ Your query has been sent to the Vendor Admin.</div>:<><label style={labelStyle}>Name</label><input style={inputStyle} value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/><label style={{...labelStyle,marginTop:12}}>Email</label><input style={inputStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Your email"/><label style={{...labelStyle,marginTop:12}}>Query</label><textarea style={{...inputStyle,minHeight:120,resize:"vertical"}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Describe your issue or question..."/><button onClick={submit} style={{width:"100%",marginTop:14,padding:12,background:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,cursor:"pointer"}}>Send Query</button></>}</div></div>}

function LoginPage({ onLogin }) {
  const [authView, setAuthView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginAssets, setLoginAssets] = useState(LOGIN_ASSET_DEFAULTS);
  const [loginPicture, setLoginPicture] = useState(null);

  useEffect(() => { loadLoginAssets().then(setLoginAssets); }, []);

  const resetLogin = () => { setError(""); setEmail(""); setPassword(""); setLoading(false); };

  const finishLogin = async (authUser, profile) => {
    if (!profile) throw new Error("Your profile is not configured. Please contact the Vendor Admin.");
    if (profile.active === false) throw new Error("Your account has been deactivated. Please contact the Vendor Admin.");
    if (profile.approved !== true) throw new Error("Your account is waiting for Vendor Admin approval.");
    if (profile.email_verified === false) throw new Error("Your official email is not verified.");
    const code = profile.bank_code || inferBankCode(profile.bank_name);
    const bank = BANKS.find(b => b.code === code);
    // Supabase stores roles as snake_case in the production profile table.
    // Normalize them here so the existing UI consistently receives its display role.
    const normalizedRole = ({
      vendor_admin: "Vendor Admin",
      vendor_employee: "Vendor Employee",
      banker: "Banker",
      "Vendor Admin": "Vendor Admin",
      "Vendor Employee": "Vendor Employee",
      Banker: "Banker",
    })[String(profile.role || "").trim()] || String(profile.role || "Banker");
    const user = { ...profile, id: authUser.id, email: authUser.email || profile.email, username: (authUser.email || profile.email || "").split("@")[0], role: normalizedRole, bankName: bank?.name || profile.bank_name || "", branch: profile.branch || "", active: profile.active !== false, approved: profile.approved === true, emailVerified: profile.email_verified !== false, permissions: profile.permissions || {}, loginAt: new Date().toISOString() };
    DB.session = user; DB.audit("LOGIN", user.id, { email: user.email, role: user.role, bankCode: user.bankCode, branch: user.branch });
    try { if(supabase&&!DEMO_MODE) await supabase.from("audit_logs").insert({ user_id: user.id, action: "LOGIN", details: { email: user.email, role: user.role, bankCode: user.bankCode, branch: user.branch } }); } catch {}
    onLogin(user);
  };

  const doLogin = async () => {
    setError(""); const e = email.trim().toLowerCase();
    if (!password) { setError("Please enter your password."); return; }
    setLoading(true);
    try {
      if (!/^\S+@\S+\.\S+$/.test(e)) { setError("Please enter your valid official email address."); return; }
      if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email:e, password });
      if (authError) throw authError;
      if (!data?.user) throw new Error("Login failed. Please try again.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id",data.user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) { await supabase.auth.signOut(); throw new Error("No profile found for this account. Please contact Vendor Admin."); }
      if (profile.active === false) { await supabase.auth.signOut(); throw new Error("Your account has been deactivated. Please contact the Vendor Admin."); }
      if (profile.approved !== true) { await supabase.auth.signOut(); throw new Error("Your account is waiting for Vendor Admin approval."); }
      if (profile.email_verified === false) { await supabase.auth.signOut(); throw new Error("Your official email is not verified."); }
      if (profile.role === "Vendor Admin" && !VENDOR_ADMIN_EMAILS.includes(e)) { await supabase.auth.signOut(); throw new Error("This email is not authorized for Vendor Admin login."); }
      await DB.hydrateRemote(); await finishLogin(data.user,profile);
    } catch (err) { setError(err.message || "Unable to login."); try { if(supabase) await supabase.auth.signOut(); } catch {} }
    finally { setLoading(false); }
  };

  if (authView === "settings") return <LoginInfoPage title="Settings" icon="⚙️" onBack={()=>setAuthView("login")}><p>Account settings are available after sign-in. Vendor Admins can manage the login-page logo and feature images from the Settings page.</p><p>Profile picture, password, notification preferences, security information and platform information are available there.</p></LoginInfoPage>;
  if (authView === "terms") return <LoginInfoPage title="Terms" icon="📄" onBack={()=>setAuthView("login")}><p>This platform is intended for authorized loan/document processing users only.</p><p>Uploaded documents and case information should be handled only for legitimate business purposes and according to your organization's policies.</p></LoginInfoPage>;
  if (authView === "help") return <HelpPage onBack={()=>setAuthView("login")} />;
  if (authView === "signup") return <SignupPage onBack={() => { resetLogin(); setAuthView("login"); }} />;
  if (authView === "forgot") return <ForgotPage onBack={() => { resetLogin(); setAuthView("login"); }} />;

  return <div style={{minHeight:"100vh",fontFamily:"'Inter','Segoe UI',sans-serif",background:C.pageBg,display:"flex",flexDirection:"column"}}>
    <header style={{height:78,background:C.white,borderBottom:`1px solid ${C.gray200}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 34px",boxSizing:"border-box",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <label title="Upload profile picture" style={{width:46,height:46,borderRadius:"50%",background:C.white,border:`3px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",boxShadow:"0 4px 18px #0003",flexShrink:0,position:"relative"}}>
          {loginPicture ? <img src={loginPicture} alt="Profile preview" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontSize:19,color:C.dark}}>👤</span>}
          <span style={{position:"absolute",right:-1,bottom:-1,width:17,height:17,borderRadius:"50%",background:C.gold,color:C.dark,fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${C.white}`}}>↑</span>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{setLoginPicture(await fileToDataUrl(f));setError("");}catch{setError("Unable to load the selected picture.");}}}/>
        </label>
        <img src={loginAssets.logo || LOGIN_ASSET_DEFAULTS.logo} alt="AR SKEIL" style={{height:48,width:78,objectFit:"cover",objectPosition:"center",borderRadius:8}} />
        <div><div style={{fontWeight:900,color:C.dark,fontSize:16}}>ARSKEIL SERVICES LLP</div><div style={{fontSize:13,color:C.gold,fontWeight:800,letterSpacing:.3}}>Powered by श्री दिनेश एंटरप्राइजेज</div></div>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",background:C.gray100,padding:5,borderRadius:10,flexWrap:"wrap"}}>{[["Login","login"],["Create New User","signup"],["⚙ Settings","settings"],["❓ Help","help"],["Terms","terms"]].map(([label,v])=><button key={v} type="button" onClick={()=>{setError("");setAuthView(v)}} style={{padding:"9px 13px",borderRadius:7,border:"none",background:authView===v?C.dark:"transparent",color:authView===v?C.white:C.dark,fontWeight:800,cursor:"pointer"}}>{label}</button>)}</div>
    </header>
    <main style={{flex:1,display:"flex",minHeight:0,position:"relative"}}><BrandPanel loginAssets={loginAssets}/><div style={{width:500,maxWidth:"100%",background:C.white,display:"flex",flexDirection:"column",justifyContent:"center",padding:"42px 46px",boxSizing:"border-box"}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:11,fontWeight:800,color:C.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>SECURE ACCESS</div><h2 style={{color:C.dark,fontWeight:900,fontSize:29,margin:"0 0 6px"}}>Welcome back</h2><p style={{color:C.gray500,fontSize:13,margin:0}}>Sign in using your verified official email.</p></div>
      {error&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",marginBottom:16,color:C.red,fontSize:13,fontWeight:600}}>⚠️ {error}</div>}
      <div style={{marginBottom:18}}><label style={labelStyle}>Official Email</label><input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("")}} style={inputStyle} placeholder="your.official@email.com" autoComplete="email" /><label style={{...labelStyle,marginTop:15}}>Password</label><div style={{position:"relative"}}><input type={showPwd?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} style={{...inputStyle,paddingRight:44}} placeholder="Enter password" autoComplete="current-password"/><span onClick={()=>setShowPwd(!showPwd)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",cursor:"pointer"}}>{showPwd?"🙈":"👁️"}</span></div><button onClick={doLogin} disabled={loading} style={{width:"100%",padding:13,marginTop:18,background:loading?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,fontSize:15,cursor:loading?"not-allowed":"pointer"}}>{loading?"⏳ Signing in…":"Login →"}</button></div>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,marginTop:16,flexWrap:"wrap"}}><span onClick={()=>{setError("");setAuthView("forgot")}} style={{color:C.gold,fontSize:13,cursor:"pointer",fontWeight:700}}>Forgot password?</span><span onClick={()=>{setError("");setAuthView("signup")}} style={{fontSize:13,cursor:"pointer",fontWeight:800}}><span style={{color:"#111"}}>Don't have an account?</span> <span style={{color:C.gold}}>Sign up</span></span></div>
    </div></main>
  </div>;
}
function SignupPage({ onBack }) {
  const [userType,setUserType]=useState("");
  const [form,setForm]=useState({name:"",bankCode:"",vertical:"",branch:"",email:"",otp:"",password:"",confirm:"",specialCode:""});
  const [otpSent,setOtpSent]=useState(false); const [verified,setVerified]=useState(false); const [otpToken,setOtpToken]=useState("");
  const [error,setError]=useState(""); const [success,setSuccess]=useState(false); const [loading,setLoading]=useState(false);
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const selectedBank=getBank(form.bankCode);
  const isBanker=userType==="Banker";
  const isVendorEmployee=userType==="Vendor Employee";
  const domain=isBanker?selectedBank?.emailDomain:(isVendorEmployee?EMAIL_DOMAINS.VENDOR:"");
  const domainValid=!!form.email.trim() && !!domain && emailMatchesDomain(form.email,domain);

  const resetVerification=()=>{
    setOtpSent(false);setVerified(false);setOtpToken("");setForm(f=>({...f,otp:""}));
  };

  const sendOtp=async()=>{
    setError("");
    if(!userType){setError("Please select Banker or Vendor Employee first.");return;}
    if(!form.email.trim()){setError("Please enter your official email.");return;}
    if(!domainValid){setError(`Please use an official email ending with ${domain||"the required domain"}.`);return;}
    const duplicate=DB.get("users").some(u=>u.email?.toLowerCase()===form.email.trim().toLowerCase())||DB.get("access_requests").some(r=>r.status==="Pending"&&r.email?.toLowerCase()===form.email.trim().toLowerCase());
    if(duplicate){setError("An account or pending request already exists for this email.");return;}
    setLoading(true);
    try {
      const token=await requestEmailOtp(form.email,"registration");
      setOtpToken(token); setOtpSent(true); setVerified(false); setForm(f=>({...f,otp:""}));
    } catch(err){setError(err.message);}
    finally{setLoading(false);}
  };

  const verifyOtp=async()=>{
    setError("");
    if(!otpSent||form.otp.trim().length!==6){setError("Please enter the 6-digit OTP.");return;}
    setLoading(true);
    try { await verifyEmailOtp(form.email,form.otp,otpToken); setVerified(true); }
    catch(err){setError(err.message);}
    finally{setLoading(false);}
  };

  const doSignup=async()=>{
    setError("");
    if(!userType){setError("Please select Banker or Vendor Employee.");return;}
    if(!form.email.trim()||!domainValid){setError(`Official email must end with ${domain||"the required domain"}.`);return;}
    if(!verified){setError("Please verify your official email with OTP first.");return;}
    if(form.password.length<8){setError("Password must be at least 8 characters.");return;}
    if(form.password!==form.confirm){setError("Passwords do not match.");return;}
    if(isBanker){
      if(!form.name.trim()){setError("Please enter your full name.");return;}
      if(!form.bankCode){setError("Please select a bank.");return;}
      if(!form.vertical){setError("Please select a vertical.");return;}
      if(!form.branch.trim()){setError("Please enter your branch.");return;}
    }
    setLoading(true);
    try {
      const email=form.email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password: form.password });
      if(authError) throw authError;
      const authUser=authData?.user;
      if(!authUser) throw new Error("Supabase could not create the account. Please try again.");
      const now=new Date().toISOString();
      const needsApproval = isVendorEmployee;
      const profile={
        id:authUser.id, name:isBanker?form.name.trim():"", email, role:userType,
        bank_code:isBanker?form.bankCode:"", bank_name:isBanker?(selectedBank?.name||""):"",
        vertical:isBanker?form.vertical:"", branch:isBanker?form.branch.trim():"",
        approved:!needsApproval, active:true, email_verified:true,
        permissions:isBanker?{receivedDocuments:false,aiDocuments:false,challan:false,noi:false,mis:false}:{},
        created_at:now, approved_at:needsApproval?null:now
      };
      const { error: profileError } = await supabase.from("profiles").upsert(profile,{onConflict:"id"});
      if(profileError) throw profileError;

      if (needsApproval) {
        const { error: requestError } = await supabase.from("access_requests").insert({
          user_id:authUser.id,
          name:form.name.trim() || email.split("@")[0],
          email,
          role:"Vendor Employee",
          bank_code:"",
          bank_name:"",
          vertical:"",
          branch:"",
          status:"Pending",
          requested_at:now
        });
        if(requestError) throw requestError;
      }

      try { await supabase.from("audit_logs").insert({user_id:authUser.id,action:"ACCOUNT_CREATED",details:{email,role:userType,bankCode:profile.bank_code,branch:profile.branch,approvalRequired:needsApproval}}); } catch {}
      setSuccess(true);
    } catch(err){setError(err.message||"Unable to create account.");}
    finally{setLoading(false);}
  };

  if(success) return <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter','Segoe UI',sans-serif",padding:24}}>
    <div style={{background:C.white,borderRadius:16,padding:40,width:540,maxWidth:"100%",boxShadow:"0 8px 32px #0002",textAlign:"center"}}>
      <div style={{fontSize:45}}>✅</div>
      <h2 style={{margin:"10px 0 8px",color:C.dark}}>Registration successful</h2>
      <p style={{color:C.gray500,fontSize:14,lineHeight:1.6}}>
        {userType === "Vendor Employee"
          ? "Your official email has been verified. Your registration request has been sent to the Vendor Admin for approval. You can log in after the request is approved."
          : "Your official email has been verified. Your Banker account is ready for login."}
      </p>
      <button onClick={onBack} style={{width:"100%",padding:13,background:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:800,cursor:"pointer",marginTop:12}}>← Back to Login</button>
    </div>
  </div>;

  return <div style={{minHeight:"100vh",background:C.pageBg,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
    <header style={{height:72,background:C.white,borderBottom:`1px solid ${C.gray200}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 34px",boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <img src="/assets/ar-skeil.jpg" alt="AR SKEIL" style={{height:48,width:78,objectFit:"cover",borderRadius:8}} />
        <div><div style={{fontWeight:900,color:C.dark,fontSize:16}}>ARSKEIL SERVICES LLP</div><div style={{fontSize:13,color:C.gold,fontWeight:800}}>Powered by श्री दिनेश एंटरप्राइजेज</div></div>
      </div>
      <button type="button" onClick={onBack} style={{padding:"9px 18px",borderRadius:7,border:"none",background:C.dark,color:C.white,fontWeight:800,cursor:"pointer"}}>← Login</button>
    </header>

    <div style={{maxWidth:920,margin:"28px auto",padding:"0 18px",boxSizing:"border-box"}}>
      <div style={{background:C.white,borderRadius:16,padding:"30px 34px",boxShadow:"0 8px 32px #0001",border:`1px solid ${C.gray200}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>
          <span onClick={onBack} style={{cursor:"pointer",color:C.gold,fontSize:22,fontWeight:700}}>←</span>
          <div><h2 style={{margin:0,fontWeight:900,fontSize:25,color:C.dark}}>Create New User</h2><p style={{margin:"4px 0 0",color:C.gray500,fontSize:12}}>Choose your user type and verify your official email.</p></div>
        </div>
        {error&&<div style={{background:"#fee2e2",color:C.red,padding:"10px 14px",borderRadius:8,marginBottom:16,fontSize:13,fontWeight:600}}>⚠️ {error}</div>}

        <div style={{marginBottom:22}}>
          <label style={labelStyle}>Sign in as *</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {["Banker","Vendor Employee"].map(t=><button type="button" key={t} onClick={()=>{setUserType(t);setError("");setForm(f=>({...f,name:"",bankCode:"",vertical:"",branch:"",email:"",otp:"",password:"",confirm:"",specialCode:""}));resetVerification()}} style={{padding:"15px 10px",border:`2px solid ${userType===t?C.gold:C.gray200}`,borderRadius:10,background:userType===t?C.goldBg:C.white,cursor:"pointer",fontWeight:900,color:C.dark}}>{t}</button>)}
          </div>
        </div>

        {!userType ? <div style={{padding:"28px 16px",borderRadius:12,background:C.gray100,textAlign:"center",color:C.gray500,fontSize:13}}>Select <b>Banker</b> or <b>Vendor Employee</b> to open the registration form.</div> :
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:15}}>
          {isBanker && <>
            <div style={{gridColumn:"span 2"}}><label style={labelStyle}>Full Name *</label><input style={inputStyle} value={form.name} onChange={set("name")} placeholder="Full name"/></div>
            <div style={{gridColumn:"span 2"}}><label style={labelStyle}>Bank Name *</label><select style={inputStyle} value={form.bankCode} onChange={e=>{setForm(f=>({...f,bankCode:e.target.value,email:"",otp:""}));resetVerification();setError("")}}><option value="">Select bank</option>{BANKS.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}</select></div>
            <div><label style={labelStyle}>Vertical *</label><select style={inputStyle} value={form.vertical} onChange={set("vertical")}><option value="">Select vertical</option>{verticals.map(v=><option key={v}>{v}</option>)}</select></div>
            <div><label style={labelStyle}>Branch *</label><input style={inputStyle} value={form.branch} onChange={set("branch")} placeholder="Branch / location"/></div>
          </>}

          <div style={{gridColumn:"span 2"}}>
            <label style={labelStyle}>Official Email *</label>
            <div style={{display:"flex",gap:8}}>
              <input style={{...inputStyle,flex:1}} type="email" value={form.email} onChange={e=>{setForm(f=>({...f,email:e.target.value}));setOtpSent(false);setVerified(false);setOtpToken("")}} placeholder={domain||"your.official@email.com"}/>
              <button type="button" onClick={sendOtp} disabled={loading} style={{padding:"0 16px",background:domainValid&&!loading?C.gold:C.gray200,color:domainValid&&!loading?C.dark:C.gray500,border:"none",borderRadius:7,fontWeight:800,cursor:domainValid&&!loading?"pointer":"not-allowed",whiteSpace:"nowrap"}}>{loading?"Sending…":"Send OTP"}</button>
            </div>
            {domain&&<div style={{fontSize:11,color:domainValid?C.green:C.gray500,marginTop:5}}>{domainValid?"✓ Official domain verified":"Required domain: "+domain}</div>}
          </div>

          {otpSent&&<div style={{gridColumn:"span 2",background:C.gray100,borderRadius:9,padding:13}}>
            <label style={labelStyle}>Enter OTP *</label>
            <div style={{display:"flex",gap:8}}>
              <input style={{...inputStyle,flex:1,letterSpacing:4}} inputMode="numeric" maxLength={6} value={form.otp} onChange={e=>setForm(f=>({...f,otp:e.target.value.replace(/\D/g,"")}))} placeholder="6-digit OTP" autoComplete="one-time-code"/>
              <button type="button" onClick={verifyOtp} disabled={loading} style={{padding:"0 16px",background:verified?C.green:C.dark,color:C.white,border:"none",borderRadius:7,fontWeight:800,cursor:"pointer"}}>{verified?"✓ Verified":"Verify OTP"}</button>
            </div>
            <div style={{fontSize:11,color:C.gray500,marginTop:7}}>OTP expires automatically. A new OTP can be requested if needed.</div>
          </div>}

          {verified&&<>
            <div><label style={labelStyle}>Set Password *</label><input style={inputStyle} type="password" value={form.password} onChange={set("password")} placeholder="Minimum 8 characters" autoComplete="new-password"/></div>
            <div><label style={labelStyle}>Confirm Password *</label><input style={inputStyle} type="password" value={form.confirm} onChange={set("confirm")} placeholder="Re-enter password" autoComplete="new-password"/></div>
          </>}

          <div style={{gridColumn:"span 2"}}>
            <button type="button" onClick={doSignup} disabled={loading||!verified} style={{width:"100%",padding:14,background:loading||!verified?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,fontSize:15,cursor:loading||!verified?"not-allowed":"pointer"}}>{loading?"Creating account…":"Create Account →"}</button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}
function ForgotPage({ onBack }) {
  const [email,setEmail]=useState("");
  const [otp,setOtp]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [otpToken,setOtpToken]=useState("");
  const [resetToken,setResetToken]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [step,setStep]=useState("email");
  const [done,setDone]=useState(false);

  const send=async()=>{
    setError("");
    const e=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)){setError("Please enter a valid official email address.");return;}
    setLoading(true);
    try {
      const token=await requestEmailOtp(e,"reset");
      setOtpToken(token); setOtp(""); setStep("otp");
    } catch(err){setError(err.message||"Unable to send reset OTP.");}
    finally{setLoading(false);}
  };

  const verify=async()=>{
    setError("");
    if(otp.trim().length!==6){setError("Please enter the 6-digit OTP.");return;}
    setLoading(true);
    try {
      const data=await verifyEmailOtp(email,otp,otpToken,"reset");
      setResetToken(data.resetToken||"");
      if(!data.resetToken) throw new Error("Reset verification token was not returned.");
      setStep("password");
    } catch(err){setError(err.message||"Invalid or expired OTP.");}
    finally{setLoading(false);}
  };

  const reset=async()=>{
    setError("");
    if(password.length<8){setError("Password must be at least 8 characters.");return;}
    if(password!==confirm){setError("Passwords do not match.");return;}
    if(!resetToken){setError("Please verify the OTP first.");return;}
    setLoading(true);
    try {
      await resetPasswordWithToken(email,password,resetToken);
      setDone(true);
    } catch(err){setError(err.message||"Unable to reset password.");}
    finally{setLoading(false);}
  };

  return <div style={{minHeight:"100vh",background:C.pageBg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter','Segoe UI',sans-serif",padding:20}}>
    <div style={{background:C.white,borderRadius:16,padding:38,width:430,maxWidth:"100%",boxShadow:"0 8px 32px #0002"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}><span onClick={onBack} style={{cursor:"pointer",color:C.gold,fontSize:22,fontWeight:700}}>←</span><h2 style={{margin:0,fontWeight:900,fontSize:22,color:C.dark}}>Forgot Password</h2></div>
      {error&&<div style={{background:"#fee2e2",color:C.red,padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:13}}>⚠️ {error}</div>}
      {done ? <><div style={{background:C.greenBg,color:C.green,padding:16,borderRadius:10,marginBottom:18,fontWeight:700}}>✓ Password reset successfully. You can now login with your new password.</div><button onClick={onBack} style={{width:"100%",padding:13,background:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:800,cursor:"pointer"}}>Back to Login</button></>
      : step==="email" ? <><label style={labelStyle}>Official Email</label><input style={inputStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your.official@email.com" autoComplete="email"/><button onClick={send} disabled={loading} style={{width:"100%",padding:13,background:loading?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:800,cursor:loading?"not-allowed":"pointer",marginTop:14}}>{loading?"Sending…":"Send Reset OTP"}</button></>
      : step==="otp" ? <><label style={labelStyle}>Reset OTP</label><input style={{...inputStyle,letterSpacing:5,textAlign:"center",fontWeight:800,fontSize:18}} inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} placeholder="6-digit OTP" autoComplete="one-time-code"/><div style={{fontSize:11,color:C.gray500,marginTop:7}}>RESET PASSWORD — Use the OTP sent to your official email. OTP expires in 10 minutes.</div><button onClick={verify} disabled={loading} style={{width:"100%",padding:13,background:loading?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,cursor:loading?"not-allowed":"pointer",marginTop:14}}>{loading?"Verifying…":"Verify OTP"}</button></>
      : <><label style={labelStyle}>New Password</label><input style={inputStyle} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters" autoComplete="new-password"/><label style={{...labelStyle,marginTop:12}}>Confirm Password</label><input style={inputStyle} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter password" autoComplete="new-password"/><button onClick={reset} disabled={loading} style={{width:"100%",padding:13,background:loading?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,cursor:loading?"not-allowed":"pointer",marginTop:14}}>{loading?"Resetting…":"Reset Password"}</button></>}
    </div>
  </div>;
}
function ProfileSettings({session,onSessionChange}){
  const [saving,setSaving]=useState(false), [msg,setMsg]=useState(""), [loginAssets,setLoginAssets]=useState(LOGIN_ASSET_DEFAULTS);
  const [notifications,setNotifications]=useState(session.notification_preferences||{email:true,documents:true,completion:true});
  const [passwords,setPasswords]=useState({current:"",next:"",confirm:""});
  const [passwordMsg,setPasswordMsg]=useState("");
  useEffect(()=>{ if(session.role==="Vendor Admin") loadLoginAssets().then(setLoginAssets); },[session.role]);
  const uploadProfile=async e=>{const f=e.target.files?.[0];if(!f)return;setSaving(true);try{const url=await fileToDataUrl(f);const next={...session,profile_pic_url:url};onSessionChange(next);if(DEMO_MODE){const rows=DB.get("demo_profiles").filter(x=>x.id!==session.id);DB.set("demo_profiles",[...rows,{id:session.id,profile_pic_url:url}]);}else if(supabase){await supabase.from("profiles").update({avatar_url:url}).eq("id",session.id);}setMsg("Profile picture updated.");}catch(e){setMsg(e.message||"Unable to update picture.");}finally{setSaving(false)}};
  const changePassword=async()=>{setPasswordMsg("");if(passwords.next.length<8||passwords.next!==passwords.confirm){setPasswordMsg("Use a new password of at least 8 characters and make both fields match.");return;}if(DEMO_MODE){setPasswordMsg("Password changes are disabled in demo mode.");return;}try{const {error}=await supabase.auth.updateUser({password:passwords.next});if(error)throw error;setPasswords({current:"",next:"",confirm:""});setPasswordMsg("Password updated successfully.");}catch(e){setPasswordMsg(e.message||"Unable to update password.");}};
  const saveNotifications=async(next)=>{setNotifications(next);const updated={...session,notification_preferences:next};onSessionChange(updated);if(!DEMO_MODE&&supabase)await supabase.from("profiles").update({notification_preferences:next}).eq("id",session.id);setMsg("Notification preferences saved.");};
  const uploadBranding=async(key,e)=>{const f=e.target.files?.[0];if(!f)return;setSaving(true);setMsg("");try{const url=await saveLoginAsset(key,f,session);const next={...loginAssets,[key]:url};setLoginAssets(next);setMsg("Login-page image updated. Refresh the login page to see it.");}catch(e){setMsg(e.message||"Unable to update login-page image.");}finally{setSaving(false)}};
  const Asset=({label,keyName})=><div style={{background:C.gray100,border:`1px solid ${C.gray200}`,borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:800,color:C.dark,marginBottom:8}}>{label}</div><label style={{display:"block",cursor:"pointer"}}><div style={{height:74,borderRadius:8,overflow:"hidden",background:C.white,border:`1px solid ${C.gray300}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}><img src={loginAssets[keyName]} alt={label} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/><span style={{position:"absolute",right:7,bottom:7,padding:"4px 7px",borderRadius:6,background:C.dark,color:C.white,fontSize:10,fontWeight:800}}>Change image</span></div><input type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadBranding(keyName,e)}/></label></div>;
  return <div><h2 style={{fontWeight:800,fontSize:22,color:C.dark,margin:"0 0 6px"}}>⚙️ Settings</h2><p style={{color:C.gray500,fontSize:13,marginTop:0}}>Manage your profile, account preferences and security.</p>
    <div style={{display:"grid",gap:14,maxWidth:900}}>
      <div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:24}}><SectionTitle>Profile</SectionTitle><div style={{display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}><label style={{width:90,height:90,borderRadius:"50%",border:`3px solid ${C.gold}`,background:C.goldBg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",cursor:"pointer"}}>{session.profile_pic_url?<img src={session.profile_pic_url} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:34}}>📷</span>}<input type="file" accept="image/*" style={{display:"none"}} onChange={uploadProfile}/></label><div style={{display:"grid",gap:4}}><div style={{fontWeight:900,color:C.dark,fontSize:17}}>{session.name||session.username}</div><div style={{fontSize:13,color:C.gray500}}>{session.email}</div><div style={{fontSize:12,color:C.gold,fontWeight:800}}>{session.role} · {session.branch||"—"}</div></div></div><div style={{marginTop:18}}><button onClick={()=>document.getElementById("security-password")?.scrollIntoView({behavior:"smooth"})} style={{padding:"9px 13px",border:`1px solid ${C.gray300}`,background:C.white,borderRadius:7,fontWeight:800,cursor:"pointer"}}>Change password</button></div></div>
      {session.role==="Vendor Admin"&&<div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:24}}><SectionTitle>Appearance — Login Page Branding</SectionTitle><p style={{fontSize:12,color:C.gray500,marginTop:-8,marginBottom:14}}>Only Vendor Admins can change these login-page images. The existing layout, colours, titles and text remain unchanged.</p><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}><Asset label="Logo image" keyName="logo"/><Asset label="Secure Login" keyName="secureLogin"/><Asset label="Role Based Access" keyName="roleAccess"/><Asset label="NOI Lifecycle Management" keyName="noiLifecycle"/></div></div>}
      <div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:24}}><SectionTitle>Notifications</SectionTitle><div style={{display:"grid",gap:10}}>{[["email","Email notifications"],["documents","Document received notifications"],["completion","Completion notifications"]].map(([k,l])=><label key={k} style={{display:"flex",alignItems:"center",gap:10,fontSize:13,color:C.dark,cursor:"pointer"}}><input type="checkbox" checked={notifications[k]!==false} onChange={e=>saveNotifications({...notifications,[k]:e.target.checked})}/>{l}</label>)}</div></div>
      <div id="security-password" style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:24}}><SectionTitle>Security</SectionTitle><div style={{fontSize:13,color:C.gray600,marginBottom:12}}>Current session: <b style={{color:C.green}}>Active</b></div><div style={{fontSize:13,color:C.gray600,marginBottom:14}}>Login activity is recorded in the Vendor Admin audit logs.</div><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}><input type="password" style={inputStyle} placeholder="New password" value={passwords.next} onChange={e=>setPasswords(p=>({...p,next:e.target.value}))}/><input type="password" style={inputStyle} placeholder="Confirm password" value={passwords.confirm} onChange={e=>setPasswords(p=>({...p,confirm:e.target.value}))}/><button onClick={changePassword} style={{padding:10,background:C.gold,color:C.dark,border:"none",borderRadius:7,fontWeight:900,cursor:"pointer"}}>Update Password</button></div>{passwordMsg&&<div style={{marginTop:10,padding:10,borderRadius:8,background:passwordMsg.includes("success")?C.greenBg:"#fff7ed",color:passwordMsg.includes("success")?C.green:C.amber,fontWeight:700}}>{passwordMsg}</div>}</div>
      <div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:24}}><SectionTitle>System & Information</SectionTitle><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,fontSize:13,color:C.gray600}}><div><b style={{color:C.dark}}>About ARSKEIL</b><div style={{marginTop:4}}>AI-Driven NOI Integration Platform for bank-wise document processing and NOI lifecycle management.</div></div><div><b style={{color:C.dark}}>Account security</b><div style={{marginTop:4}}>Your role, branch and account status are controlled through the production authentication system.</div></div><div><b style={{color:C.dark}}>Terms</b><div style={{marginTop:4}}>Use the platform only for authorized loan/document processing.</div></div><div><b style={{color:C.dark}}>Privacy</b><div style={{marginTop:4}}>Case and document information should be handled according to your organization's privacy and retention policies.</div></div></div></div>
      {msg&&<div style={{padding:10,borderRadius:8,background:C.greenBg,color:C.green,fontWeight:700}}>{saving?"Saving…":msg}</div>}
    </div>
  </div>;
}
function Sidebar({ active, setPage, session, onLogout }) {
  const role=session?.role;
  const NAV=[{id:"dashboard",icon:"⊞",label:"Dashboard"},{id:"cases",icon:"📁",label:"Cases"}];
  const TOOLS= role==="Banker" ? [{id:"calculator",icon:"🖩",label:"Calculator"},{id:"uploadDocuments",icon:"⬆️",label:"Upload Documents"},{id:"allDocuments",icon:"📂",label:"All Documents"}] : role==="Vendor Employee" ? [{id:"calculator",icon:"🖩",label:"Calculator"},{id:"receivedDocuments",icon:"📥",label:"Received Documents"},{id:"allDocuments",icon:"📂",label:"All Documents"},{id:"aiDocuments",icon:"🤖",label:"AI Extraction"},{id:"challan",icon:"📄",label:"Challan"},{id:"noi",icon:"ℹ️",label:"NOI"}] : [];
  const REPORTS= role==="Vendor Admin" ? [{id:"mis",icon:"📋",label:"MIS Report"},{id:"payment",icon:"💳",label:"Payment Tracking"},{id:"admin",icon:"⚙️",label:"Admin Panel"}] : role==="Vendor Employee" ? [{id:"mis",icon:"📋",label:"MIS Report"},{id:"payment",icon:"💳",label:"Payment Tracking"}] : [];
  const roleColor={Banker:C.sky,"Vendor Employee":C.green,"Vendor Admin":C.indigo}[role]||C.gray400;
  const Item=({item})=><div onClick={()=>setPage(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 16px",borderRadius:7,cursor:"pointer",marginBottom:2,background:active===item.id?C.sidebarActive:"transparent",color:active===item.id?C.gold:C.gray400,fontWeight:active===item.id?700:400,fontSize:14,transition:"all .15s",borderLeft:active===item.id?`3px solid ${C.gold}`:"3px solid transparent"}}><span style={{fontSize:16}}>{item.icon}</span>{item.label}</div>;
  return <div style={{width:224,minWidth:224,background:C.sidebar,minHeight:"100vh",display:"flex",flexDirection:"column",padding:"0 0 24px"}}><div style={{padding:"20px 16px 14px",borderBottom:`1px solid ${C.border}`}}><div style={{color:C.gold,fontWeight:800,fontSize:18,letterSpacing:.5}}>ARSKEIL SERVICES LLP</div><div style={{color:C.gray500,fontSize:10,marginTop:2}}>powered by श्री दिनेश एंटरप्राइजेज</div></div><div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}><div style={{width:52,height:52,borderRadius:"50%",background:C.goldBg,border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>{session?.profile_pic_url?<img src={session.profile_pic_url} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span>📷</span>}</div><div style={{minWidth:0}}><div style={{color:C.white,fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{session?.name||session?.username}</div><div style={{color:roleColor,fontSize:10,fontWeight:700}}>{role}</div><div style={{color:C.gold,fontSize:9,fontWeight:800,marginTop:2}}>🏦 {session?.bankCode||"OTHERS"}</div></div></div><div style={{padding:"12px 10px",flex:1}}><div style={{color:C.gray600,fontSize:10,fontWeight:800,padding:"4px 16px 7px",letterSpacing:1}}>MAIN</div>{NAV.map(i=><Item key={i.id} item={i}/>)}{TOOLS.length>0&&<><div style={{color:C.gray600,fontSize:10,fontWeight:800,padding:"14px 16px 7px",letterSpacing:1}}>TOOLS</div>{TOOLS.map(i=><Item key={i.id} item={i}/>)}</>}{REPORTS.length>0&&<><div style={{color:C.gray600,fontSize:10,fontWeight:800,padding:"14px 16px 7px",letterSpacing:1}}>REPORTS</div>{REPORTS.map(i=><Item key={i.id} item={i}/>)}</>}<div style={{color:C.gray600,fontSize:10,fontWeight:800,padding:"14px 16px 7px",letterSpacing:1}}>ACCOUNT</div><Item item={{id:"settings",icon:"⚙️",label:"Settings"}}/></div><div style={{padding:"0 10px"}}><div onClick={onLogout} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",color:C.red,cursor:"pointer",fontWeight:700,fontSize:14}}>↪ Logout</div></div></div>}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ setPage, session }) {
  const [query, setQuery] = useState("");
  const [bankFilter,setBankFilter]=useState("");
  const [branchFilter,setBranchFilter]=useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  const isAdmin = session?.role === "Vendor Admin";
  const cases = getVisibleCases(session);
  // Always calculate the latest document status so Dashboard updates immediately
  // after SDR/SD/RF/Index 2/NOI Receipt uploads.
  const statusMap = {};
  cases.forEach(c => { statusMap[c.caseId] = syncCaseStatus(c.caseId) || c.documentStatus || {}; });
  const statusOf = c => statusMap[c.caseId] || {};
  const q = query.trim().toLowerCase();
  const filteredCases = cases.filter(c => (!q || String(c.caseId || "").toLowerCase().includes(q) || String(c.applicantName || "").toLowerCase().includes(q)) && (!bankFilter || String(c.bankCode||c.bankName||"").toLowerCase().includes(bankFilter.toLowerCase())) && (!branchFilter || String(c.branch||"").toLowerCase().includes(branchFilter.toLowerCase())));
  const completed = cases.filter(c => { const st = statusOf(c); return ((st.sdDone && st.rfDone) || (st.sdrDone && st.defacedChallanDone)) && st.index2Done && st.noiReceiptDone; }).length;
  const pending = cases.length - completed;
  const downloadFor = (caseId, type) => {
    const doc = caseDocuments(caseId).find(d => d.type === type);
    if (doc?.dataUrl) downloadDataUrl(doc.dataUrl, doc.fileName);
  };
  const downloadChallan = c => {
    const docs = caseDocuments(c.caseId).filter(d => ["SDR","SD","RF"].includes(d.type));
    if (docs.length) { const doc = docs[0]; downloadDataUrl(doc.dataUrl, doc.fileName); return; }
    if (c.challanData) {
      const text = [`Case ID: ${c.caseId}`, `Applicant: ${c.applicantName || ""}`, `Bank: ${c.bankName || ""}`, `Loan Amount: ${c.loanAmount || ""}`, `Challan Status: ${statusOf(c).challanDone ? "DONE" : "PENDING"}`, `Generated: ${c.challanData.createdAt || c.createdAt || ""}`].join("\n");
      const blob = new Blob([text], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${c.caseId}-Challan.txt`; a.click(); URL.revokeObjectURL(a.href);
    }
  };
  const statCard = (label, value, icon, color) => (
    <div style={{ flex: 1, background: C.white, borderRadius: 10, padding: "20px 24px", border: `1px solid ${C.gray200}`, borderTop: `3px solid ${color}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><div><div style={{ color: C.gray500, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div><div style={{ color: C.dark, fontSize: 28, fontWeight: 800 }}>{value}</div></div><span style={{ fontSize: 22 }}>{icon}</span></div></div>
  );
  const challanLabel = st => st.sdrDone ? "SDR" : (st.sdDone && st.rfDone ? "SD + RF" : st.challanDone ? "Done" : "Pending");
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,gap:14,flexWrap:"wrap"}}><div><h2 style={{fontWeight:800,fontSize:22,color:C.dark,margin:"0 0 4px"}}>Dashboard</h2><div style={{color:C.gray500,fontSize:13}}>Welcome, <strong>{session?.username}</strong> · {isAdmin?"All cases, branches and banks":"Your cases"}</div></div>{session?.role==="Banker"&&<button onClick={()=>setPage("uploadDocuments")} style={{background:C.gold,color:C.dark,border:"none",borderRadius:8,padding:"10px 20px",fontWeight:700,cursor:"pointer"}}>+ Upload Documents</button>}</div>
      <div style={{ display: "flex", gap: 16, marginBottom: 22 }}>{statCard("Total Cases", cases.length, "📈", C.gold)}{statCard("Completed", completed, "✅", C.green)}{statCard("Pending / Active", pending, "⏰", C.amber)}</div>
      <div style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.gray200}`, overflow: "auto" }}>
        <div style={{padding:"16px 24px",borderBottom:`1px solid ${C.gray200}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><h3 style={{margin:0,fontWeight:700,fontSize:16,color:C.dark}}>{isAdmin?"All Cases":"My Cases"}</h3><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Case ID / Applicant" style={{...inputStyle,width:220}}/>{isAdmin&&<><input value={bankFilter} onChange={e=>setBankFilter(e.target.value)} placeholder="Bank" style={{...inputStyle,width:140}}/><input value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} placeholder="Branch" style={{...inputStyle,width:140}}/></>}<span onClick={()=>setPage("cases")} style={{color:C.gold,fontSize:13,cursor:"pointer",fontWeight:600}}>View All →</span></div></div>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:1250}}><thead><tr style={{background:C.gray100}}>{["Case ID","Applicant Name","Bank","Branch","Challan","Other Challans","Defaced Challan","Index 2","NOI Receipt","Status"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,color:C.gray500,textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{filteredCases.length===0?<tr><td colSpan={10} style={{padding:40,textAlign:"center",color:C.gray400}}>{cases.length?"No matching cases found.":"No cases found for your role."}</td></tr>:filteredCases.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(c=>{const st=statusOf(c);const other=st.otherChallansDone||c.otherChallans;const def=st.defacedChallanDone||c.defacedChallan;return <tr key={c.id} style={{borderBottom:`1px solid ${C.gray100}`}}><td style={{padding:"12px",color:C.gold,fontWeight:800}}>{c.caseId}</td><td style={{padding:"12px",fontWeight:600}}>{c.applicantName||"—"}</td><td style={{padding:"12px"}}>{c.bankName||c.bankCode||"—"}</td><td style={{padding:"12px"}}>{c.branch||"—"}</td><td style={{padding:"12px"}}>{challanLabel(st)}</td><td style={{padding:"12px"}}>{other?"Done":"—"}</td><td style={{padding:"12px"}}>{def?"Done":"—"}</td><td style={{padding:"12px"}}>{st.index2Done?"Done":"Pending"}</td><td style={{padding:"12px"}}>{st.noiReceiptDone?"Done":"Pending"}</td><td style={{padding:"12px"}}>{((st.sdDone&&st.rfDone)||(st.sdrDone&&st.defacedChallanDone))&&st.index2Done&&st.noiReceiptDone?<span style={{background:C.greenBg,color:C.green,padding:"5px 9px",borderRadius:6,fontWeight:800}}>Completed</span>:<span style={{background:"#fff7ed",color:C.amber,padding:"5px 9px",borderRadius:6,fontWeight:800}}>Pending</span>}</td></tr>})}</tbody></table>
      </div>
    </div>
  );
}
// ─── CASES PAGE ───────────────────────────────────────────────────────────────
function Cases({ setPage, session, setActiveCaseData }) {
  const [search, setSearch] = useState("");
  const cases = getVisibleCases(session);
  const filtered = cases.filter(c => !search || c.caseId?.toLowerCase().includes(search.toLowerCase()) || c.applicantName?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}><h2 style={{ fontWeight:800, fontSize:22, color:C.dark, margin:0 }}>Cases</h2>{session?.role==="Banker"&&<button onClick={()=>setPage("uploadDocuments")} style={{ background:C.gold,color:C.dark,border:"none",borderRadius:8,padding:"10px 20px",fontWeight:700,cursor:"pointer" }}>+ New Case</button>}</div>
      <div style={{ marginBottom:16 }}><input style={inputStyle} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Case ID or Applicant Name..." /></div>
      <div style={{ background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,overflow:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",minWidth:900 }}><thead><tr style={{ background:C.gray100 }}>{["Case ID","Applicant","Bank","Amount","Status","Created"].map(h=><th key={h} style={{ padding:"10px 16px",textAlign:"left",fontSize:11,color:C.gray500,textTransform:"uppercase" }}>{h}</th>)}</tr></thead><tbody>{filtered.length===0?<tr><td colSpan={6} style={{padding:40,textAlign:"center",color:C.gray400}}>No cases found.</td></tr>:filtered.map(c=><tr key={c.id} onClick={()=>{setActiveCaseData?.(c.storeData || {caseId:c.caseId, applicantName:c.applicantName, bankName:c.bankName, loanAmount:c.loanAmount, branchName:c.branch});}} style={{borderBottom:`1px solid ${C.gray100}`,cursor:"pointer"}}><td style={{padding:"12px 16px",color:C.gold,fontWeight:800}}>{c.caseId}</td><td style={{padding:"12px 16px",fontWeight:600}}>{c.applicantName||"—"}</td><td style={{padding:"12px 16px"}}>{c.bankName||"—"}</td><td style={{padding:"12px 16px"}}>₹{Number(c.loanAmount||0).toLocaleString("en-IN")}</td><td style={{padding:"12px 16px"}}>{c.status||"Active"}</td><td style={{padding:"12px 16px",fontSize:12,color:C.gray500}}>{c.createdAt?new Date(c.createdAt).toLocaleDateString("en-IN"):"—"}</td></tr>)}</tbody></table></div>
    </div>
  );
}


// ─── CALCULATOR ───────────────────────────────────────────────────────────────
function Calculator() {
  const [loanAmt, setLoanAmt] = useState("");
  const [vendorFee, setVendorFee] = useState("");
  const [otherChallan, setOtherChallan] = useState("");
  const [otherQty, setOtherQty] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const FIVE_LAKH = 500000, THIRTY_LAKH = 3000000, REG_CAP = 15000;

  const calculate = () => {
    const loan = parseFloat(loanAmt) || 0;
    if (!loan || loan <= 0) { setError("Please enter a valid Loan Amount."); return; }
    setError("");
    const vendor = parseFloat(vendorFee) || 0;
    const otherAmt = parseFloat(otherChallan) || 0;
    const qty = otherChallan !== "" ? (parseInt(otherQty) || 1) : 0;
    const stampRate = loan < FIVE_LAKH ? 0.001 : 0.003;
    const stampLabel = loan < FIVE_LAKH ? "0.1%" : "0.3%";
    const stamp = Math.ceil(loan * stampRate);
    let reg = Math.ceil(loan * 0.005);
    if (loan > THIRTY_LAKH) reg = REG_CAP;
    const otherTotal = otherAmt > 0 ? otherAmt * qty : 0;
    const total = stamp + reg + vendor + otherTotal;
    setResult({ loan, stamp, stampLabel, reg, regCapped: loan > THIRTY_LAKH, vendor, otherAmt, otherQty: qty, otherTotal, total, hasOther: otherAmt > 0 });
    setCopied(false);
  };

  const fmt = v => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 })}`;

  const buildCopyText = () => {
    if (!result) return "";
    const lines = [`Loan Amount: ${fmt(result.loan)}`, `${result.stampLabel} Stamp Duty: ${fmt(result.stamp)}`, `0.5% Registration Fee${result.regCapped ? " (capped)" : ""}: ${fmt(result.reg)}`, `Vendor Fee: ${fmt(result.vendor)}`];
    if (result.hasOther) lines.push(`Other Challan (×${result.otherQty}): ${fmt(result.otherTotal)}`);
    lines.push(`Total: ${fmt(result.total)}`);
    return lines.join("\n");
  };

  // Fixed copy with execCommand fallback
  const handleCopy = async () => {
    const text = buildCopyText();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {}
    if (!ok) {
      const el = document.getElementById("calc-ta");
      if (el) { el.select(); el.setSelectionRange(0, 99999); try { document.execCommand("copy"); ok = true; } catch (_) {} }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
  };

  const loanNum = parseFloat(loanAmt) || 0;
  const slabHint = loanAmt ? (loanNum < FIVE_LAKH ? "< ₹5L → 0.1% stamp duty" : loanNum > THIRTY_LAKH ? "> ₹30L → 0.3% stamp · Reg capped at ₹15,000" : "₹5L–₹30L → 0.3% stamp duty") : null;

  return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, marginBottom: 6 }}>Fee Calculator</h2>
      <p style={{ color: C.gray500, marginBottom: 28, fontSize: 14 }}>Calculate stamp duty, registration fee, vendor charges and other challan for any loan amount.</p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 300, background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 28 }}>
          <SectionTitle>Inputs</SectionTitle>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Loan Amount (₹) <span style={{ color: C.red }}>*</span></label>
            <input style={{ ...inputStyle, borderColor: error ? C.red : C.gray300 }} placeholder="e.g. 1250000" value={loanAmt} onChange={e => { setLoanAmt(e.target.value); setError(""); }} type="number" min="0" />
            {slabHint && <div style={{ marginTop: 6, fontSize: 11, color: loanNum < FIVE_LAKH ? C.amber : loanNum > THIRTY_LAKH ? C.gold : C.green, fontWeight: 600 }}>ℹ {slabHint}</div>}
            {error && <div style={{ marginTop: 4, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Vendor Fee (₹)</label>
            <input style={inputStyle} placeholder="e.g. 5000" value={vendorFee} onChange={e => setVendorFee(e.target.value)} type="number" min="0" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Other Challan (₹) <span style={{ color: C.gray500, fontWeight: 400, fontSize: 11 }}>— optional</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Amount per challan" value={otherChallan} onChange={e => { setOtherChallan(e.target.value); if (!e.target.value) setOtherQty(""); }} type="number" min="0" />
              <select value={otherQty} onChange={e => setOtherQty(e.target.value)} style={{ ...inputStyle, width: 90, flexShrink: 0 }} disabled={!otherChallan}>
                <option value="">No.</option>
                {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          </div>
          <div style={{ background: C.goldBg, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: C.gold, marginBottom: 4 }}>Rate Reference</div>
            <div style={{ color: C.gray600 }}>Stamp Duty: 0.1% (&lt;₹5L) · 0.3% (₹5L+)</div>
            <div style={{ color: C.gray600 }}>Reg. Fee: 0.5% · capped at ₹15,000 if &gt;₹30L</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={calculate} style={{ flex: 1, padding: "12px", background: C.gold, color: C.dark, border: "none", borderRadius: 8, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Calculate</button>
            <button onClick={() => { setLoanAmt(""); setVendorFee(""); setOtherChallan(""); setOtherQty(""); setResult(null); setError(""); }} style={{ padding: "12px 16px", background: C.white, color: C.gray600, border: `1px solid ${C.gray300}`, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Reset</button>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 300, background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 28 }}>
          <SectionTitle>Breakdown</SectionTitle>
          {!result ? (
            <div style={{ color: C.gray400, fontSize: 14, textAlign: "center", padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 40 }}>🖩</span>Enter values and click <strong>Calculate</strong>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: result.loan < FIVE_LAKH ? "#fef3c7" : result.loan > THIRTY_LAKH ? C.goldBg : "#dcfce7", color: result.loan < FIVE_LAKH ? "#92400e" : result.loan > THIRTY_LAKH ? C.gold : C.green }}>
                  {result.loan < FIVE_LAKH ? "< ₹5L Slab" : result.loan > THIRTY_LAKH ? "> ₹30L Slab" : "₹5L–₹30L Slab"}
                </span>
              </div>
              {[{ label: "Loan Amount", val: result.loan }, { label: `${result.stampLabel} Stamp Duty`, val: result.stamp }, { label: `0.5% Reg. Fee${result.regCapped ? " (capped ₹15K)" : ""}`, val: result.reg }, { label: "Vendor Fee", val: result.vendor }, ...(result.hasOther ? [{ label: `Other Challan ×${result.otherQty}`, val: result.otherTotal }] : [])].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.gray100}`, fontSize: 14 }}>
                  <span style={{ color: C.gray600 }}>{r.label}</span>
                  <span style={{ fontWeight: 600, color: C.dark }}>{fmt(r.val)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 12px", borderRadius: 8, background: C.goldBg, marginTop: 12 }}>
                <span style={{ fontWeight: 800, color: C.dark, fontSize: 16 }}>Total</span>
                <span style={{ fontWeight: 800, color: C.gold, fontSize: 20 }}>{fmt(result.total)}</span>
              </div>
              <button onClick={handleCopy} style={{ width: "100%", marginTop: 16, padding: "10px", background: copied ? C.green : C.gray100, color: copied ? C.white : C.dark, border: `1px solid ${copied ? C.green : C.gray300}`, borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.2s" }}>
                {copied ? "✓ Copied to clipboard!" : "📋 Copy Summary"}
              </button>
              <textarea id="calc-ta" readOnly value={buildCopyText()} style={{ ...inputStyle, marginTop: 12, height: result.hasOther ? 140 : 120, resize: "none", background: C.gray100, fontSize: 12, fontFamily: "monospace", color: C.gray600 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CHALLAN (generates Case ID, auto-filled from AI extraction) ───────────────
function Challan({ session, activeCaseData, mergeActiveCaseData, setActiveCaseData }) {
  const ai = activeCaseData || {};
  const owners = ai.owners || [];

  const [form, setForm] = useState({
    loanFileNumber: ai.applicationNumber || "",
    district: ai.districtName || "",
    taluka: ai.talukaName || "",
    loanAmount: ai.loanAmount ? String(ai.loanAmount) : "",
    mortgagorName1: ai.applicantName || (owners[0]?.name || ""),
    mortgagorName2: ai.coApplicants?.[0] || (owners[1]?.name || ""),
    bankName: ai.bankName || "",
    addressFormatted: ai.propertyAddressFormatted || "",
    addressSL: ai.propertyAddressSL || "",
    addressIndex2: ai.propertyAddressIndex || "",
    pincode: ai.pincode || "",
    roi: ai.rateOfInterest || "",
    sroName: ai.sroOfficeName || "",
    documentNo: ai.documentNumber || "",
    village: ai.villageName || "",
    areaConstructed: ai.areaConstructed || "",
    surveyNo: ai.surveyNumbers || "",
  });
  const [generatedCase, setGeneratedCase] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Re-fill if activeCaseData changes (when user comes back to Challan after Documents)
  useEffect(() => {
    if (!activeCaseData) return;
    const ai = activeCaseData;
    const owners = ai.owners || [];
    setForm(prev => ({
      ...prev,
      loanFileNumber: prev.loanFileNumber || ai.applicationNumber || "",
      district: prev.district || ai.districtName || "",
      taluka: prev.taluka || ai.talukaName || "",
      loanAmount: prev.loanAmount || (ai.loanAmount ? String(ai.loanAmount) : ""),
      mortgagorName1: prev.mortgagorName1 || ai.applicantName || owners[0]?.name || "",
      mortgagorName2: prev.mortgagorName2 || ai.coApplicants?.[0] || owners[1]?.name || "",
      bankName: prev.bankName || ai.bankName || "",
      addressFormatted: prev.addressFormatted || ai.propertyAddressFormatted || "",
      addressSL: prev.addressSL || ai.propertyAddressSL || "",
      addressIndex2: prev.addressIndex2 || ai.propertyAddressIndex || "",
      pincode: prev.pincode || ai.pincode || "",
      roi: prev.roi || ai.rateOfInterest || "",
      sroName: prev.sroName || ai.sroOfficeName || "",
      documentNo: prev.documentNo || ai.documentNumber || "",
      village: prev.village || ai.villageName || "",
      areaConstructed: prev.areaConstructed || ai.areaConstructed || "",
      surveyNo: prev.surveyNo || ai.surveyNumbers || "",
    }));
  }, [activeCaseData]);

  const loan = parseFloat(form.loanAmount) || 0;
  const stamp = Math.ceil(loan * 0.003);
  const reg = Math.min(Math.ceil(loan * 0.005), 15000);
  const fmt = v => v ? `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";

  const handleExport = async () => {
    if (!form.mortgagorName1 || !form.loanAmount || !form.bankName) {
      alert("Fill Mortgagor Name, Loan Amount, and Bank Name before generating."); return;
    }
    setSaving(true);
    const existingRec = activeCaseData?.caseId ? DB.get("cases").find(c => c.caseId === activeCaseData.caseId) : null;
    const caseId = existingRec?.caseId || DB.generateCaseId();
    const challanData = { ...form, stamp, reg, total: stamp + reg, caseId, createdAt: new Date().toISOString() };
    if (existingRec) {
      DB.update("cases", existingRec.id, {
        loanFileNumber: form.loanFileNumber || existingRec.loanFileNumber,
        applicantName: form.mortgagorName1 || existingRec.applicantName,
        bankName: form.bankName || existingRec.bankName,
        loanAmount: form.loanAmount || existingRec.loanAmount,
        branch: existingRec.branch || session?.branch || "",
        createdBy: existingRec.createdBy || session?.id,
        challanData,
        aiData: existingRec.aiData || activeCaseData || null,
        storeData: { ...(existingRec.storeData || {}), ...(activeCaseData || {}), ...form, caseId, challanData },
      });
    } else {
      DB.insert("cases", { id:`case_${Date.now()}`, caseId, loanFileNumber:form.loanFileNumber, applicantName:form.mortgagorName1, coApplicants:form.mortgagorName2?[form.mortgagorName2]:[], bankName:form.bankName, bankCode:session?.bankCode || inferBankCode(form.bankName), loanAmount:form.loanAmount, branch:session?.branch||"", createdAt:new Date().toISOString(), createdBy:session?.id, status:"Active", challanData, aiData:activeCaseData||null, storeData:{...(activeCaseData||{}),caseId,challanData}, noiData:null });
      DB.audit("CASE_CREATED", session?.id, { caseId, applicant: form.mortgagorName1 });
    }
    syncCaseStatus(caseId);
    if (setActiveCaseData) setActiveCaseData({ ...(activeCaseData || {}), caseId, challanData, ...form });
    if (mergeActiveCaseData) mergeActiveCaseData({ caseId, challanData });

    // Auto-push complete MIS row (all mapped fields from challan + AI data)
    const today = new Date().toLocaleDateString("en-IN").split("/").join("-");
    const ai = activeCaseData || {};
    const misRow = {
      srNo: caseId,
      docReceivedDate: today,
      fiName: form.bankName,
      bankName: form.bankName,
      branchName: form.district || ai.branchName || "",
      customerName: form.mortgagorName1,
      mobNo: form.contactNumber || ai.contactNumber || "",
      loanAmt: form.loanAmount,
      amt030: Math.ceil(loan * 0.003),
      amt050: Math.min(Math.ceil(loan * 0.005), 15000),
      dhcAmt: "",
      challanTotal: stamp + reg,
      paymentDate: "",
      amtReceived: "", netFees: "", platformFee: ai.processingFee || "", extraAmt: "",
      noiSubmit: "", noiReceipt: "", tat: "",
      remarks: `Case ID: ${caseId} | ROI: ${form.roi || ai.rateOfInterest || ""} | ${form.addressFormatted || ""}`.trim(),
      sroNo: form.documentNo || ai.documentNumber || "",
      challanBy: session?.username || "",
      noiBy: "", fsf: "",
      // Extra mapped fields for full Excel coverage
      applicationNo: form.loanFileNumber || ai.applicationNumber || "",
      roi: form.roi || ai.rateOfInterest || "",
      coApplicant: form.mortgagorName2 || "",
      propertyAddress: form.addressFormatted || ai.propertyAddressFormatted || "",
      village: form.village || ai.villageName || "",
      taluka: form.taluka || ai.talukaName || "",
      district: form.district || ai.districtName || "",
      pincode: form.pincode || ai.pincode || "",
      sroName: form.sroName || ai.sroOfficeName || "",
      areaConstructed: form.areaConstructed || ai.areaConstructed || "",
      termMonths: ai.termMonths || "",
      sanctionDate: ai.sanctionDate || "",
      caseId,
    };
    // De-dup: replace existing row with same caseId, else append
    const existingMIS = DB.get("mis_rows");
    const filtered = existingMIS.filter(r => r.caseId !== caseId && r.srNo !== caseId);
    DB.set("mis_rows", [...filtered, misRow]);

    setGeneratedCase(rec);
    setSaving(false);
  };

  const copyId = () => { const t = generatedCase?.caseId; if (!t) return; try { navigator.clipboard.writeText(t); } catch { const el = document.createElement("input"); el.value = t; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); } alert(`Copied: ${t}`); };

  const F = ({ label, fkey, placeholder, span }) => (
    <div style={span ? { gridColumn: `span ${span}` } : {}}>
      <label style={labelStyle}>{label}</label>
      <input style={inputStyle} value={form[fkey]} onChange={set(fkey)} placeholder={placeholder || label} />
    </div>
  );

  if (generatedCase) return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, marginBottom: 24 }}>Challan</h2>
      <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 12, padding: 28, maxWidth: 760, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 32 }}>✅</span>
          <div>
            <div style={{ fontWeight: 800, color: C.green, fontSize: 18 }}>Challan Generated — Case Created</div>
            <div style={{ color: C.gray600, fontSize: 13 }}>MIS auto-filled. Use this Case ID in NOI, Documents, MIS.</div>
          </div>
        </div>
        <div style={{ background: C.white, borderRadius: 10, padding: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>Generated Case ID</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: C.gold, letterSpacing: 3 }}>{generatedCase.caseId}</div>
          </div>
          <button onClick={copyId} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>📋 Copy ID</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
          {[["Applicant", form.mortgagorName1], ["Bank", form.bankName], ["Loan File No.", form.loanFileNumber || "—"], ["Loan Amount", fmt(form.loanAmount)], ["Stamp Duty", fmt(stamp)], ["Reg. Fee", fmt(reg)], ["Village", form.village || "—"], ["District", form.district || "—"], ["ROI", form.roi || "—"]].map(([l, v]) => (
            <div key={l}><div style={{ color: C.gray500, fontWeight: 600, fontSize: 11 }}>{l}</div><div style={{ fontWeight: 700, color: C.dark, fontSize: 13 }}>{v}</div></div>
          ))}
        </div>
        {form.addressFormatted && (
          <div style={{ marginTop: 16, background: C.white, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ color: C.gray500, fontWeight: 600, fontSize: 11, marginBottom: 4 }}>PROPERTY ADDRESS</div>
            <div style={{ fontSize: 13, color: C.dark, fontWeight: 600 }}>{form.addressFormatted}</div>
          </div>
        )}
      </div>
      <button onClick={() => { setGeneratedCase(null); }} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "12px 28px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>+ New Challan</button>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, marginBottom: 24 }}>Challan</h2>
      {activeCaseData && (
        <div style={{ background: C.goldBg, border: `1px solid ${C.gold}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: C.gray600 }}>
          ✅ <strong style={{ color: C.gold }}>AI data auto-filled</strong> from Documents module. Review and edit below.
        </div>
      )}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 32, maxWidth: 860 }}>
        <SectionTitle>Challan Details</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <F label="Loan File / Application No." fkey="loanFileNumber" />
          <F label="District" fkey="district" />
          <F label="Taluka" fkey="taluka" />
          <F label="Village / Location" fkey="village" />
          <F label="Loan Amount (₹) *" fkey="loanAmount" placeholder="Enter loan amount" />
          <F label="Rate of Interest (ROI)" fkey="roi" />
        </div>
        <div style={{ background: C.gray100, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, marginBottom: 10, textTransform: "uppercase" }}>Auto Calculations</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={{ ...labelStyle, color: C.gray600 }}>Stamp Duty (0.3%)</label><input style={{ ...inputStyle, background: C.white }} value={fmt(stamp)} readOnly /></div>
            <div><label style={{ ...labelStyle, color: C.gray600 }}>Registration Fee (0.5%, max ₹15K)</label><input style={{ ...inputStyle, background: C.white }} value={fmt(reg)} readOnly /></div>
            <div><label style={{ ...labelStyle, color: C.gray600 }}>Total Challan</label><input style={{ ...inputStyle, background: C.white }} value={fmt(stamp + reg)} readOnly /></div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <F label="Mortgagor 1 (Applicant) *" fkey="mortgagorName1" placeholder="Primary applicant name" />
          <F label="Mortgagor 2 (Co-Applicant)" fkey="mortgagorName2" placeholder="Co-applicant (optional)" />
        </div>
        <div style={{ marginBottom: 16 }}><F label="Bank Name *" fkey="bankName" placeholder="Bank name" /></div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Property Address (Standard Format — Editable) *</label>
          <textarea style={{ ...inputStyle, height: 70, resize: "vertical" }} value={form.addressFormatted} onChange={set("addressFormatted")} placeholder="Flat/Unit No, Floor, Bldg Name, Landmark, Village, Taluka, District — PIN" />
          <div style={{ fontSize: 11, color: C.gray500, marginTop: 4 }}>Format: FLAT NO. X, FLOOR, BLDG NAME, LANDMARK, VILLAGE, TALUKA, DISTRICT, PIN - XXXXXX</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <F label="Address from Sanction Letter" fkey="addressSL" />
          <F label="Address from Index II (cleaned)" fkey="addressIndex2" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <F label="SRO Name" fkey="sroName" />
          <F label="Document No." fkey="documentNo" />
          <F label="Pincode" fkey="pincode" placeholder="6-digit pincode" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <F label="Area Constructed" fkey="areaConstructed" placeholder="e.g. 35.97 SQ.MT." />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: C.gray500 }}>Generates: <strong style={{ color: C.gold }}>ARK-{new Date().getFullYear()}-XXXXXX</strong></div>
          <button onClick={handleExport} disabled={saving} style={{ background: saving ? C.gray300 : C.gold, color: saving ? C.gray500 : C.dark, border: "none", borderRadius: 8, padding: "12px 28px", fontWeight: 800, fontSize: 15, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Generating…" : "🔖 Generate & Export Challan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NOI with Case ID Search + Full Auto-fill ─────────────────────────────────
function NOI({ session, activeCaseData, mergeActiveCaseData }) {
  const [selectedCase, setSelectedCase] = useState(null);
  const ai = activeCaseData || {};
  const owners = ai.owners || [];

  const buildForm = (ai, ch) => ({
    village: ai.villageName || ch?.village || "",
    taluka: ai.talukaName || ch?.taluka || "",
    district: ai.districtName || ch?.district || "",
    areaConstructed: ai.areaConstructed || "",
    addressSL: ai.propertyAddressSL || ch?.addressSL || "",
    addressIndex2: ai.propertyAddressIndex || ch?.addressIndex2 || "",
    addressFormatted: ai.propertyAddressFormatted || ch?.addressFormatted || "",
    loanAmount: ai.loanAmount ? String(ai.loanAmount) : (ch?.loanAmount || ""),
    roi: ai.rateOfInterest || ch?.roi || "",
    surveyCTS: ai.surveyNumbers || ch?.surveyNo || "",
    sroName: ai.sroOfficeName || ch?.sroName || "",
    documentNo: ai.documentNumber || ch?.documentNo || "",
    bankName: ai.bankName || ch?.bankName || "",
    applicationNo: ai.applicationNumber || ch?.loanFileNumber || "",
    m1Name: ai.applicantName || owners[0]?.name || "",
    m1DOB: owners[0]?.dob || "",
    m1PAN: owners[0]?.pan || "",
    m1Address: ai.propertyAddressFormatted || "",
    m1Village: ai.villageName || "",
    m1Taluka: ai.talukaName || "",
    m1District: ai.districtName || "",
    m1Pincode: ai.pincode || "",
    m2Name: ai.coApplicants?.[0] || owners[1]?.name || "",
    m2DOB: owners[1]?.dob || "",
    m2PAN: owners[1]?.pan || "",
    m2Address: "",
    m2Village: ai.villageName || "",
    m2Taluka: ai.talukaName || "",
    m2District: ai.districtName || "",
    m2Pincode: ai.pincode || "",
  });

  const [form, setForm] = useState(() => buildForm(ai, {}));
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Re-fill when activeCaseData changes (coming from Documents page)
  useEffect(() => {
    if (!activeCaseData) return;
    setForm(prev => {
      const fresh = buildForm(activeCaseData, {});
      // Only overwrite empty fields, preserve user edits
      const merged = {};
      Object.keys(fresh).forEach(k => { merged[k] = prev[k] || fresh[k]; });
      return merged;
    });
  }, [activeCaseData]);

  const handleCaseSelect = (c) => {
    setSelectedCase(c);
    const ch = c.challanData || {};
    const ai = c.aiData || c.storeData || {};
    const owners = ai.owners || [];
    // Build full form from case data
    setForm(buildForm(ai, ch));
  };

  const Row2 = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>{children}</div>;
  const Row3 = ({ children }) => <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>{children}</div>;
  const F = ({ label, fkey, placeholder, textarea }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {textarea
        ? <textarea style={{ ...inputStyle, height: 60, resize: "vertical" }} value={form[fkey]} onChange={set(fkey)} placeholder={placeholder || label} />
        : <input style={inputStyle} value={form[fkey]} onChange={set(fkey)} placeholder={placeholder || label} />
      }
    </div>
  );

  const saveNOI = () => {
    const targetId = selectedCase?.id || DB.get("cases").find(c => c.caseId === activeCaseData?.caseId)?.id;
    if (targetId) {
      DB.update("cases", targetId, { noiData: form, status: "NOI Filed" });
      DB.audit("NOI_FILED", session?.id, { caseId: selectedCase?.caseId || activeCaseData?.caseId });
    }
    if (mergeActiveCaseData) mergeActiveCaseData({ noiData: form });
    alert(`✅ NOI saved${selectedCase ? ` for Case ${selectedCase.caseId}` : ""}`);
  };

  const hasData = !!(form.m1Name || form.loanAmount || form.sroName);
  const caseId = selectedCase?.caseId || activeCaseData?.caseId;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: 0 }}>Notice of Intimation</h2>
        {caseId && <div style={{ background: C.goldBg, border: `1px solid ${C.gold}`, borderRadius: 8, padding: "6px 16px", color: C.gold, fontWeight: 800, fontSize: 14 }}>📎 {caseId}</div>}
      </div>

      {/* Case ID Search */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: C.dark, fontSize: 14, marginBottom: 10 }}>🔍 Load by Case ID</div>
        <CaseSearchBar onSelect={handleCaseSelect} placeholder="Type Case ID or Applicant Name to auto-fill all NOI fields…" />
        {activeCaseData && !selectedCase && (
          <div style={{ marginTop: 10, background: C.goldBg, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.gold, fontWeight: 700 }}>
            ✅ Auto-filled from AI Documents module{caseId ? ` · ${caseId}` : ""}. Review and save below.
          </div>
        )}
        {selectedCase && (
          <div style={{ marginTop: 10, background: C.greenBg, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.green, fontWeight: 700 }}>
            ✅ Loaded: {selectedCase.caseId} — {selectedCase.applicantName}
          </div>
        )}
        {!activeCaseData && !selectedCase && (
          <div style={{ marginTop: 10, fontSize: 13, color: C.gray500 }}>Search by Case ID above, or go to Documents module first to extract data automatically.</div>
        )}
      </div>

      {/* NOI Form — always visible */}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 32, maxWidth: 900 }}>
        <SectionTitle>Property & Loan Details</SectionTitle>
        <Row3><F label="Village" fkey="village" /><F label="Taluka" fkey="taluka" /><F label="District" fkey="district" /></Row3>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Property Address (Standard Format — Editable)</label>
          <textarea style={{ ...inputStyle, height: 60, resize: "vertical" }} value={form.addressFormatted} onChange={set("addressFormatted")} placeholder="Flat/Unit No, Floor, Bldg Name, Landmark, Village, Taluka, District, PIN" />
        </div>
        <Row2><F label="Address from SL" fkey="addressSL" /><F label="Address from Index II" fkey="addressIndex2" /></Row2>
        <Row3>
          <F label="Loan Amount (₹)" fkey="loanAmount" />
          <F label="ROI (%)" fkey="roi" placeholder="e.g. 7.95% P.A." />
          <F label="Area Constructed" fkey="areaConstructed" />
        </Row3>
        <Row3>
          <F label="Survey / Gat / CTS No." fkey="surveyCTS" />
          <F label="SRO Name" fkey="sroName" />
          <F label="Document No." fkey="documentNo" />
        </Row3>
        <Row3>
          <F label="Bank Name" fkey="bankName" />
          <F label="Application / Loan File No." fkey="applicationNo" />
          <F label="Pincode" fkey="m1Pincode" />
        </Row3>

        <SectionTitle>Mortgagor Information</SectionTitle>
        {[{ p: "m1", t: "Mortgagor 1 (Applicant)" }, { p: "m2", t: "Mortgagor 2 (Co-Applicant / Owner 2)" }].map(({ p, t }) => (
          <div key={p} style={{ marginBottom: 24, background: C.gray100, borderRadius: 10, padding: 16 }}>
            <div style={{ fontWeight: 700, color: C.dark, fontSize: 14, marginBottom: 12 }}>{t}</div>
            <Row3>
              <F label="Name" fkey={`${p}Name`} />
              <F label="Date of Birth" fkey={`${p}DOB`} placeholder="DD/MM/YYYY" />
              <F label="PAN No." fkey={`${p}PAN`} placeholder="PANXXXX" />
            </Row3>
            <Row3>
              <F label="Address" fkey={`${p}Address`} />
              <F label="Village" fkey={`${p}Village`} />
              <F label="Taluka" fkey={`${p}Taluka`} />
            </Row3>
            <Row2>
              <F label="District" fkey={`${p}District`} />
              <F label="Pincode" fkey={`${p}Pincode`} />
            </Row2>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={saveNOI} style={{ background: C.green, color: C.white, border: "none", borderRadius: 8, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>💾 Save NOI</button>
          <button style={{ background: C.white, color: C.dark, border: `1px solid ${C.gray300}`, borderRadius: 8, padding: "12px 24px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>📄 Export NOI</button>
        </div>
      </div>
    </div>
  );
}

// ─── AI DOCUMENT INTELLIGENCE ─────────────────────────────────────────────────
function fuzzyNameMatch(n1, n2) {
  const norm = n => n.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const p1 = norm(n1), p2 = norm(n2);
  if (p1.join(" ") === p2.join(" ")) return 100;
  let matched = 0;
  const [long, short] = p1.length > p2.length ? [p1, p2] : [p2, p1];
  for (const t of short) {
    if (t.length <= 1) { matched += 0.3; continue; }
    if (long.find(x => x === t || x.startsWith(t) || t.startsWith(x))) matched++;
  }
  return Math.min(Math.round((matched / Math.max(long.length, short.length)) * 100), 99);
}

function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}

async function analyzeDoc(file, b64, ownerList, bankCode = "OTHERS") {
  const isPDF = file.type === "application/pdf";
  const mt = file.type || "image/jpeg";

  const ownerCtx = ownerList.length
    ? `\n\nKNOWN PROPERTY OWNERS (from Index II / MAHADA already processed):
${JSON.stringify(ownerList.map(o => o.name))}

NAME-MATCHING RULES FOR PAN / AADHAAR:
- Fuzzy-match the card holder's name against every owner name above.
- Account for common variations: "GOKUL PATIL" matches "GOKUL SHIVDAS PATIL", "JYOTI GURAV" matches "JYOTI SANTOSH GURAV" etc.
- If best match score >= 50 → isIndexIIOwner: true, set matchedOwnerName and matchConfidence.
- If no match or score < 50 → isIndexIIOwner: false.

NAME-MATCHING RULES FOR SANCTION LETTER (applicant / co-applicant):
- Check applicantName against owner list. Set applicantIsOwner: true if matched.
- Check each coApplicantName. Set isOwner: true per name if matched, false if not.
- INCLUDE in NOI only names where isOwner: true.`
    : "";

  const bankRule = BANK_EXTRACTION_RULES[bankCode] || BANK_EXTRACTION_RULES.OTHERS;
  const selectedBankName = getBank(bankCode).name;
  const prompt = `You are an expert AI document extraction engine for Indian home loan processing.
SELECTED BANK FROM LOGIN: ${selectedBankName} (${bankCode})
${bankRule}
You have been trained on real documents from MRHFL (Mahindra Rural Housing Finance), MMFSL, NIWAS Housing Finance, TATA Capital Housing Finance, AFL (Axis Finance Limited), and others.
ALL OUTPUT TEXT VALUES MUST BE IN UPPERCASE ENGLISH. Translate any Marathi/Hindi text to English and return UPPERCASE.
RESPOND ONLY WITH A SINGLE VALID JSON OBJECT. No markdown, no backticks, no explanation, no text outside the JSON.

════════════════════════════════════════════════════════
STEP 1 — IDENTIFY DOCUMENT TYPE
════════════════════════════════════════════════════════
Choose ONE from: "IndexII", "MAHADA", "SanctionLetter", "PAN", "Aadhaar", "Unknown"

IndexII  = Marathi document titled "सूची क्र.2" / "Index-2 (सूची - २)" with SRO seal, दस्त क्रमांक, गावाचे नाव
MAHADA   = Document from "छत्रपती संभाजीनगर गृहनिर्माण" or any MAHADA body — titled "ना हरकत प्रमाणपत्र" / No Objection Certificate — has अर्ज क्रमांक, योजनेचे नाव, अर्जदाराचे नाव
SanctionLetter = Any bank loan sanction/approval letter (Mahindra, Niwas, TATA Capital, Axis Finance, HDFC, SBI, etc.)
PAN      = Income Tax Department PAN card image (Permanent Account Number Card)
Aadhaar  = Aadhaar card image with 12-digit masked number

════════════════════════════════════════════════════════
STEP 2 — EXTRACTION RULES PER DOCUMENT TYPE
════════════════════════════════════════════════════════

━━━ A) IndexII (सूची क्र.2) ━━━
This is a Marathi property registration document. Translate ALL Marathi to UPPERCASE ENGLISH.

Field mapping (Marathi label → English field name):
  दुय्यम निबंधक / सह दुय्यम निबंधक / मुख्य निबंधक  → sroOfficeName
  दस्त क्रमांक / दम्न क्रमांक / क्रमांक,खंड व पृष्ठ  → documentNumber  (e.g. "7931/2025", "1782/2021", "9909/2026")
  गावाचे नाव / गाव                                   → villageName     (e.g. "JUCHANDRA", "SAVKHEDA BU.", "JYUBELI")
  तालुका                                              → talukaName
  जिल्हा                                              → districtName
  Property description block (पालिकेचे नाव, सर्वे नं, माळा, इमारतीचे नाव, etc.) → propertyAddress (full, UPPERCASE)
  Survey/CTS/GAT numbers (सर्वे नं / गट नं / सी.टी.एस. / CTS)                  → surveyNumbers
  क्षेत्रफळ / बांधकाम क्षेत्रफळ / एकूण क्षेत्र / area    → areaConstructed (e.g. "35.97 SQ.MT.")
  Owner section — look for नाव:, Name:, 1) नाव, अर्जदाराचे नाव boxes            → ownerNames (array, ALL names found, UPPERCASE)
  ऐवज करून देण्याचा दिनांक / दिनांक                    → documentDate

  IMPORTANT: Extract ALL owners listed. Each owner block has नाव (name), वय (age), पत्ता (address), PAN नं.

━━━ B) MAHADA (No Objection Certificate) ━━━
This replaces Index II for MAHADA scheme properties (छत्रपती संभाजीनगर गृहनिर्माण / म्हाडा).
Translate ALL Marathi to UPPERCASE ENGLISH.

Field mapping:
  अर्ज क्रमांक / Ref No                               → documentNumber  (e.g. "4150000822")
  योजनेचे ठिकाण / scheme location                     → sroOfficeName   (e.g. "1056 T/S EWS PMAY NAKSHTRAWADI, CHH.SAMBHAJINAGAR")
  अर्जदाराचे नाव / यशस्वी अर्जदार                      → ownerNames      (array — e.g. ["JYOTI SANTOSH GURAV"])
  इमारत क्र., विंग, मजला क्र., सदनिका / भूखंड क्र.    → propertyAddress  (full flat/plot details, UPPERCASE)
  Carpet Area / बांधकाम क्षेत्रफळ                       → areaConstructed
  गाव / Village / location of scheme                  → villageName
  Bank name mentioned in letter                        → bankName
  Date on letter                                       → documentDate
  villageName, talukaName, districtName from scheme address

━━━ C) SanctionLetter ━━━
Banks use DIFFERENT label names. Map them all to the same internal fields:

  APPLICANT NAME — look for ANY of these labels (pick primary borrower only, strip Mr./Mrs./Ms./Shri/Smt prefix):
    "Name of the Applicant", "Borrower's Name", "Borrower", "Customer Name", "Name"
    → applicantName (UPPERCASE, no prefix)

  CO-APPLICANT NAME — look for:
    "Coapplicant Names", "Co-Borrower's/Guarantor's Name", "Co-Borrower", "Co-Applicant"
    → coApplicantNames (array, UPPERCASE, no prefix)

  CONTACT NUMBER — look for:
    "Contact No. (M)", "Contact No", "Ph:", "Mobile", "Phone"
    → contactNumber (digits only)

  APPLICATION / REFERENCE NUMBER — look for:
    "Finnone Neo ID No.", "Sanction ID", "Application No.", "Loan Application No.", "Ref Application No."
    → applicationNumber

  BANK NAME — from letterhead logo, footer, "For [Bank Name]", company name
    → bankName (UPPERCASE, e.g. "MAHINDRA RURAL HOUSING FINANCE", "NIWAS HOUSING FINANCE", "TATA CAPITAL HOUSING FINANCE", "AXIS FINANCE")

  BRANCH — "Branch:", "Branch Name"
    → branchName (UPPERCASE)

  SANCTION DATE — "Date:", "Sanction Date:", "Dated"
    → sanctionDate

  LOAN AMOUNT — CRITICAL RULES:
    1. Look for these labels: "Loan Amount Sanctioned", "Loan Amount", "Sanction Loan Amount without insurance",
       "Total Amount Sanctioned", "Approved Amount", "Facility Amount", "Sanctioned Amount"
    2. Some banks have TWO rows: "Sanction Loan Amount without insurance" + "Insurance Premium" → SUM them for loanAmountSanctioned
       Example TATA: Total Amount Sanctioned = INR 4,50,000 (this is already the sum including insurance INR 13742, so use 450000)
       Example AFL: "Sanction Loan Amount without insurance: Rs.2566635" + "Insurance Premium: Rs.38364+Rs.5001" → sum = 2610000
       Example MRHFL: Two separate SLs — Prime HL: 2746426 + Prime VAP: 103695 → report individually, flag isMultiProductSL
    3. Extract numeric value only (remove Rs., INR, commas)
    → loanAmountSanctioned (number)
    → isMultiProductSL (bool — true only if this is 2nd/3rd SL for same applicant)

  RATE OF INTEREST — look for:
    "Rate of Interest (ROI)", "Rate of Interest", "Floating Rate of Interest", row in financial table
    → rateOfInterest (e.g. "7.95% PER ANNUM", "13.00% PER ANNUM FLOATING", "12.00% FLOATING")
    NOTE: For NIWAS format: "Floating Rate of Interest: 13.00% per annum" — extract "13.00%"
    NOTE: For TATA format: table column "Rate of Interest" = "12.00% (Floating)" — extract "12.00%"

  LOAN TENURE — "Term of Loan", "Tenure", "Tenor", "Repayment Period"
    → termMonths (number)

  EMI — "Amount of EMI", "Monthly Installment (EMI)", "EMI"
    → emiAmount

  PROPERTY ADDRESS — look for:
    "Details of the Property (for which Loan is sanctioned)", "Description of the Property", "Security", "Property"
    → propertyAddress (full address, UPPERCASE)

  PROPERTY ADDRESS COMPONENTS — ALSO break the property address into these separate fields.
  Merge the BEST data from BOTH the Sanction Letter AND Index II (prefer Index II where it has more accurate building/flat details).
  Extract each component into the "fields" object using these EXACT keys (omit any that genuinely don't exist):
    addr_flatNo      → flat / unit / sadnika number (e.g. "512", "1003", "502")
    addr_floor       → floor (e.g. "5TH FLOOR", "10TH FLOOR")
    addr_wing        → wing / block letter (e.g. "A", "B6")
    addr_buildingName→ building / society / scheme name (e.g. "LAXMI LIFE STYLE", "NANO CITY")
    addr_buildingNo  → building number if separate (e.g. "1")
    addr_roadNo      → road number if mentioned
    addr_towerNo     → tower number if mentioned
    addr_landmark    → landmark ONLY if explicitly mentioned (e.g. "NEAR ISHAAN HOSPITAL")
    addr_village     → village name (prefer Index II)
    addr_taluka      → taluka (prefer Index II)
    addr_district    → district (prefer Index II)
  DO NOT include state, PIN code, or country in these component fields.
  Each component still uses the {value, confidence, doubtful, missing} shape.

  PROCESSING FEE — "Total Processing fees Applicable", "Processing Fee", "Mortgage Origination Fees"
    → processingFee

  LOAN PURPOSE — "Loan Purpose", "Purpose of the Loan", "Type of Loan"
    → loanPurpose (UPPERCASE)

  APPLICANT vs CO-APPLICANT INDEX II MATCHING:
    If known owners list provided: check each name against owners.
    applicantIsOwner: true/false
    For each co-applicant: { name, isOwner: true/false }
    INCLUDE in NOI only those with isOwner: true.

━━━ D) PAN Card ━━━
  नाम / Name field (first name field after photo)           → holderName (UPPERCASE)
  पिता का नाम / Father's Name                               → fatherName (UPPERCASE)
  जन्म की तारीख / Date of Birth                             → dateOfBirth (DD/MM/YYYY)
  Permanent Account Number / the 10-char alphanumeric code  → panNumber (UPPERCASE, e.g. "BATPY3370D")
  NOTE: Some PAN cards show only Name + DOB + PAN (no "Name:" label) — the name is the large bold text.

━━━ E) Aadhaar Card ━━━
  Name (bold text under photo)                              → holderName (UPPERCASE)
  Date of Birth / DOB / Year of Birth                       → dateOfBirth
  Gender                                                    → gender
  12-digit number (show only last 4, mask rest as XXXX XXXX XXXX) → aadhaarNumber
  Address                                                   → address (UPPERCASE)

${ownerCtx}

════════════════════════════════════════════════════════
STEP 3 — CONFIDENCE SCORING (apply to every extracted field)
════════════════════════════════════════════════════════
{ "value": "EXTRACTED TEXT", "confidence": 0-100, "doubtful": bool, "missing": bool }
90-100: clearly printed, high quality
70-89: readable, minor blur
50-69: partially visible, inferred from context
<50: guessed → doubtful: true
missing: true ONLY if field genuinely absent from this document

════════════════════════════════════════════════════════
STEP 4 — OUTPUT JSON SHAPE (STRICT — no extra keys)
════════════════════════════════════════════════════════
{
  "documentType": "IndexII|MAHADA|SanctionLetter|PAN|Aadhaar|Unknown",
  "overallConfidence": 85,
  "isMultiProductSL": false,
  "applicantIsOwner": false,
  "fields": {
    "FIELD_NAME": { "value": "UPPERCASE VALUE", "confidence": 90, "doubtful": false, "missing": false }
  },
  "matchedOwnerName": "",
  "matchConfidence": 0,
  "isIndexIIOwner": false,
  "warnings": []
}

════════════════════════════════════════════════════════
CALIBRATION EXAMPLES (ground truth from real documents)
════════════════════════════════════════════════════════

EXAMPLE 1 — Index II (Vasai, Thane format):
  sroOfficeName: "MAH DU.NI.VASAI 3"
  documentNumber: "7931/2025"
  villageName: "JUCHANDRA"
  surveyNumbers: "NAVEEN SURVEY NO. 351 HISSA 5, NAVEEN SURVEY NO. 352 HISSA 1/1"
  areaConstructed: "35.97 SQ.MT."
  ownerNames: ["KIRAN JITENDRA YADAV"]

EXAMPLE 2 — Index II (Jalgaon format):
  sroOfficeName: "DU.NI. JALGAON 1"
  documentNumber: "1782/2021"
  villageName: "SAVKHEDA BU."
  surveyNumbers: "SURVEY NO. 48/1 PLOT NO. 27 GAT NO. 48/1"
  areaConstructed: "40.09 SQ.MT."
  ownerNames: ["GOKUL SHIVDAS PATIL", "JAYASHRI GOKUL PATIL"]

EXAMPLE 3 — Index II (AFL / Thane Ulhasnagar format):
  sroOfficeName: "SAH DU.NI. ULHASNAGAR 4"
  documentNumber: "9909/2026"
  villageName: "JYUBELI"
  talukaName: "AMBARNATH"
  districtName: "THANE"
  ownerNames: ["AVINASH RAJENDRA SONAWANE", "SUSHMA AVINASH SONAWANE"]

EXAMPLE 4 — MAHADA NOC (Sambhajinagar):
  documentType: "MAHADA"
  documentNumber: "4150000822"
  sroOfficeName: "1056 T/S EWS PMAY NAKSHTRAWADI, CHH.SAMBHAJINAGAR"
  ownerNames: ["JYOTI SANTOSH GURAV"]
  propertyAddress: "B6 WING, FLOOR 5, SADNIKA NO. 502"
  areaConstructed: "CARPET AREA 29.96 SQ.MT., BUILT-UP AREA 38.26 SQ.MT."
  bankName: "NIWAS HOUSING FINANCE LIMITED"

EXAMPLE 5 — MRHFL Sanction Letter:
  bankName: "MAHINDRA RURAL HOUSING FINANCE"
  applicantName: "KIRAN JITENDRA YADAV"
  contactNumber: "9152448854"
  coApplicantNames: [{"name": "SURAJ JITENDRA YADAV", "isOwner": false}]
  loanAmountSanctioned: 2746426
  rateOfInterest: "7.95% PER ANNUM"
  propertyAddress: "FLAT NO 512, 5TH FLOOR, BUILDING NO 1, LAXMI LIFE STYLE, NEAR ISHAAN HOSPITAL, JUCHANDRA, VASI, THANE, MAHARASHTRA-401208"
  applicationNumber: "A000002417782"
  isMultiProductSL: false

EXAMPLE 5b — MRHFL 2nd SL (insurance/VAP — same applicant):
  isMultiProductSL: true
  loanAmountSanctioned: 103695
  (these two SLs sum to 2850121 total)

EXAMPLE 6 — NIWAS Housing Finance Sanction Letter:
  bankName: "NIWAS HOUSING FINANCE LIMITED"
  applicantName: "SANTOSH KRISHNA GURAV"
  coApplicantNames: [{"name": "JYOTI GURAV", "isOwner": false}]  ← name does NOT match Index II exactly
  contactNumber: "8390111942"
  applicationNumber: "20260511248633"
  loanAmountSanctioned: 1050000
  rateOfInterest: "13.00% PER ANNUM FLOATING"
  termMonths: 156
  propertyAddress: "SADNIKA 502 B6 WING NAKSHTRWADI, AURANGABAD CITY S.O, AURANGABAD-MH, MAHARASHTRA, INDIA-431001"

EXAMPLE 7 — TATA Capital Housing Finance Sanction Letter:
  bankName: "TATA CAPITAL HOUSING FINANCE LIMITED"
  applicantName: "GOKUL SHIVDAS PATIL"
  coApplicantNames: [{"name": "JAYASHRI GOKUL PATIL", "isOwner": true}]  ← both match Index II
  contactNumber: "9421675643"
  applicationNumber: "APPHE0121349"
  loanAmountSanctioned: 450000   ← Total Amount Sanctioned row (already includes insurance)
  rateOfInterest: "12.00% FLOATING"
  termMonths: 180
  propertyAddress: "PLOT NO. 27, UNIT NO. SOUTHERN SIDE BLOCK NO. 1, PLOT NO. 27, SOUTHERN SIDE BLOCK NO. 1, PLOT NO. 27, GAT 48/1, NEAR SWAMI SAMARTH KENDRA, SAVKHEDA SHIVAR, OFF DHULE HIGHWAY, JALGAON, MAHARASHTRA, 425001"

EXAMPLE 8 — AFL (Axis Finance) Sanction Letter:
  bankName: "AXIS FINANCE LIMITED"
  applicantName: "AVINASH RAJENDRA SONAWANE"
  coApplicantNames: [{"name": "SUSHMA AVINASH SONAWANE", "isOwner": true}]  ← both match Index II
  contactNumber: "7506130769"
  applicationNumber: "AFHA00025899"
  loanAmountSanctioned: 2610000  ← "Loan Amount including Insurance Premium" row
  rateOfInterest: "10.50% PER ANNUM MONTHLY"
  termMonths: 240
  propertyAddress: "PROPERTY FLAT 1003 10TH FLOOR A WING NANO CITY JOVELI OPP INDIAN OIL PETROL PUMP NEAR GODREJ VIHAA KARJAT ROAD BADLAPUR EAST THANE MAHARASHTRA-421503"

EXAMPLE 9 — PAN Card (standard format):
  holderName: "KIRAN JITENDRA YADAV"
  panNumber: "BATPY3370D"
  dateOfBirth: "03/03/2001"
  isIndexIIOwner: true, matchedOwnerName: "KIRAN JITENDRA YADAV", matchConfidence: 100

EXAMPLE 10 — PAN Card (abbreviated name on card):
  Card shows: "GOKUL PATIL" → holderName: "GOKUL PATIL"
  Index II owner: "GOKUL SHIVDAS PATIL" → fuzzy match score ~70 → isIndexIIOwner: true
  panNumber: "BIZPP5567K"
  dateOfBirth: "18/06/1986"`;

  const content = isPDF
    ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: prompt }]
    : [{ type: "image", source: { type: "base64", media_type: mt, data: b64 } }, { type: "text", text: prompt }];

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content }] })
  });
  const data = await resp.json();
  const raw = data.content?.map(i => i.text || "").join("") || "";
  // Strip any accidental markdown fences
  const clean = raw.replace(/```json[\s\S]*?```/g, m => m.slice(7, -3)).replace(/```/g, "").trim();
  try { return JSON.parse(clean); }
  catch (e) {
    // Try extracting first JSON object from response
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned non-JSON: " + clean.slice(0, 200));
  }
}

function DocumentUpload({ session, activeCaseData, mergeActiveCaseData, setPage }) {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processingFile, setProcessingFile] = useState("");
  const [results, setResults] = useState([]);
  const [owners, setOwners] = useState([]);
  const [view, setView] = useState("upload");
  const [verifiedData, setVerifiedData] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingOwner, setEditingOwner] = useState(null);
  const [slData, setSlData] = useState(null);
  const [linkedCase, setLinkedCase] = useState(null);
  const [aiTab, setAiTab] = useState("ALL");

  useEffect(() => {
    const raw = sessionStorage.getItem("ark_ai_imports");
    if (!raw) return;
    try {
      const imports = JSON.parse(raw);
      const imported = imports.map(x => ({ ...x, file: dataUrlToFile(x.dataUrl, x.fileName, x.mimeType), name:x.fileName, size:x.size||0, id:`imp_${Date.now()}_${Math.random()}`, status:"pending" }));
      setFiles(prev => [...prev, ...imported.filter(x => !prev.some(p => p.name === x.name && p.size === x.size))]);
      if (imports[0]?.caseId) {
        const c = DB.get("cases").find(x => x.caseId === imports[0].caseId);
        if (c) setLinkedCase(c);
      }
      sessionStorage.removeItem("ark_ai_imports");
    } catch {}
  }, []);

  const addFiles = (list) => {
    const newF = Array.from(list).filter(f => !files.find(u => u.name === f.name && u.size === f.size));
    setFiles(prev => [...prev, ...newF.map(f => ({ file: f, name: f.name, size: f.size, id: Date.now() + Math.random(), status: "pending" }))]);
  };

  const run = async () => {
    setProcessing(true);
    const analysisResults = [];
    let masters = [];
    // Process IndexII / MAHADA first, then SanctionLetters, then PAN/Aadhaar last
    const sorted = [...files].sort((a, b) => {
      const rank = (name) => {
        const n = name.toLowerCase();
        if (n.includes("index") || n.includes("suchi") || n.includes("mahada") || n.includes("noc")) return -3;
        if (n.includes("sanction") || n.includes("sl") || n.includes("letter")) return -1;
        if (n.includes("pan") || n.includes("aadhar") || n.includes("aadhaar")) return 1;
        return 0;
      };
      return rank(a.name) - rank(b.name);
    });

    let totalSLLoanAmount = 0;
    let slCount = 0;
    let primarySLResult = null;

    for (const fo of sorted) {
      setProcessingFile(fo.name);
      try {
        const b64 = await fileToBase64(fo.file);
        const r = await analyzeDoc(fo.file, b64, masters, session?.bankCode || "OTHERS");

        // ── IndexII or MAHADA: build owner master list ──────────────────
        if (r.documentType === "IndexII" || r.documentType === "MAHADA") {
          const names = r.fields?.ownerNames?.value;
          const arr = Array.isArray(names) ? names : (names ? [String(names).split(/[,;]/).map(s => s.trim())] : []).flat();
          const newMasters = arr.filter(Boolean).map((name, i) => ({
            id: `owner_${Date.now()}_${i}`,
            name: String(name).toUpperCase(),
            sroName: r.fields?.sroOfficeName?.value || "",
            docNumber: r.fields?.documentNumber?.value || "",
            village: r.fields?.villageName?.value || "",
            taluka: r.fields?.talukaName?.value || "",
            district: r.fields?.districtName?.value || "",
            aadhaar: null, pan: null, dob: null,
          }));
          // Accumulate across multiple index docs
          masters = [...masters, ...newMasters.filter(nm => !masters.find(m => fuzzyNameMatch(m.name, nm.name) >= 80))];
          setOwners([...masters]);
        }

        // ── SanctionLetter: sum amounts across multiple SLs ─────────────
        if (r.documentType === "SanctionLetter") {
          slCount++;
          const raw = String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "");
          const amt = parseFloat(raw) || 0;
          totalSLLoanAmount += amt;
          r._individualLoanAmt = amt;
          r._slIndex = slCount;
          if (slCount === 1) primarySLResult = r;
        }

        analysisResults.push({ fileId: fo.id, fileName: fo.name, ...r });
        setFiles(prev => prev.map(f => f.id === fo.id ? { ...f, status: "done", docType: r.documentType } : f));
      } catch (err) {
        analysisResults.push({ fileId: fo.id, fileName: fo.name, documentType: "Unknown", overallConfidence: 0, fields: {}, warnings: ["AI parse failed: " + err.message], error: true });
        setFiles(prev => prev.map(f => f.id === fo.id ? { ...f, status: "error" } : f));
      }
    }

    // Patch combined total onto first SL
    if (primarySLResult && slCount > 1) {
      const idx = analysisResults.findIndex(r => r.documentType === "SanctionLetter");
      if (idx >= 0) { analysisResults[idx]._totalCombinedLoanAmt = totalSLLoanAmount; analysisResults[idx]._slCount = slCount; }
    }
    if (primarySLResult) {
      primarySLResult._totalCombinedLoanAmt = totalSLLoanAmount;
      setSlData({ ...primarySLResult, _totalCombinedLoanAmt: totalSLLoanAmount });
    }

    // ── Link PAN/Aadhaar to owners using AI match + fuzzy fallback ──────
    const upd = [...masters];

    const getOwnerIndex = (holderName, aiMatchName, aiConf) => {
      // Priority 1: use AI's own match result
      if (aiMatchName && aiConf >= 50) {
        const i = upd.findIndex(o => fuzzyNameMatch(o.name, aiMatchName) >= 50);
        if (i >= 0) return i;
      }
      // Priority 2: local fuzzy match
      let best = 0, bi = -1;
      upd.forEach((o, i) => {
        const s = fuzzyNameMatch(String(holderName || "").toUpperCase(), o.name);
        if (s > best) { best = s; bi = i; }
      });
      return best >= 45 ? bi : -1;
    };

    for (const r of analysisResults) {
      if (r.documentType === "Aadhaar") {
        const nm = r.fields?.holderName?.value || "";
        const bi = getOwnerIndex(nm, r.matchedOwnerName, r.matchConfidence);
        if (bi >= 0) upd[bi] = { ...upd[bi], aadhaar: r.fields?.aadhaarNumber?.value || null, dob: upd[bi].dob || r.fields?.dateOfBirth?.value || null };
      }
      if (r.documentType === "PAN") {
        const nm = r.fields?.holderName?.value || "";
        const bi = getOwnerIndex(nm, r.matchedOwnerName, r.matchConfidence);
        if (bi >= 0) upd[bi] = { ...upd[bi], pan: r.fields?.panNumber?.value || null, dob: upd[bi].dob || r.fields?.dateOfBirth?.value || null };
      }
    }

    setOwners(upd);
    setResults(analysisResults);
    setProcessing(false);
    setProcessingFile("");
    setView("review");
  };

  const save = () => {
    const slResults = results.filter(r => r.documentType === "SanctionLetter");
    const propDoc = results.find(r => r.documentType === "IndexII" || r.documentType === "MAHADA");

    // ── Sum ALL loan amounts; identify the HIGHEST-value SL ─────────────
    let totalLoan = 0;
    let primarySL = null;       // the SL with the largest loan amount
    let largestAmt = -1;
    slResults.forEach(r => {
      const amt = parseFloat(String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "")) || 0;
      totalLoan += amt;
      if (amt > largestAmt) { largestAmt = amt; primarySL = r; }
    });

    // ── ALL non-loan-amount fields come from the highest-value SL ───────
    const pf = (key) => primarySL?.fields?.[key]?.value || "";
    const applicantName = pf("applicantName");
    const contactNumber = pf("contactNumber");
    const bankName = pf("bankName");
    const appNo = pf("applicationNumber");
    const branchName = pf("branchName");
    const loanPurpose = pf("loanPurpose");
    const termMonths = pf("termMonths");
    const emiAmt = pf("emiAmount");
    const sanctionDate = pf("sanctionDate");
    const roiFromLargest = pf("rateOfInterest");
    const processingFee = pf("processingFee") || pf("totalProcessingFees");

    // ── Address: build from AI structured components (merge SL + Index II)
    const rawSLAddr = primarySL?.fields?.propertyAddress?.value || "";
    const rawIdxAddr = propDoc?.fields?.propertyAddress?.value || "";
    const cleanIdxAddr = cleanPropertyAddress(rawIdxAddr);
    // Pull component fields — prefer SL component, fall back to Index II doc component
    const comp = (key) => primarySL?.fields?.[key]?.value || propDoc?.fields?.[key]?.value || "";
    const addressComponents = {
      flatNo: comp("addr_flatNo"),
      floor: comp("addr_floor"),
      wing: comp("addr_wing"),
      buildingName: comp("addr_buildingName"),
      buildingNo: comp("addr_buildingNo"),
      roadNo: comp("addr_roadNo"),
      towerNo: comp("addr_towerNo"),
      landmark: comp("addr_landmark"),
      // Village/Taluka/District: prefer Index II (more accurate per requirement)
      village: propDoc?.fields?.addr_village?.value || propDoc?.fields?.villageName?.value || primarySL?.fields?.addr_village?.value || "",
      taluka: propDoc?.fields?.addr_taluka?.value || propDoc?.fields?.talukaName?.value || primarySL?.fields?.addr_taluka?.value || "",
      district: propDoc?.fields?.addr_district?.value || propDoc?.fields?.districtName?.value || primarySL?.fields?.addr_district?.value || "",
    };
    const pincodeMatch = (rawSLAddr + rawIdxAddr).match(/\b(\d{6})\b/);
    const pincode = pincodeMatch ? pincodeMatch[1] : "";
    const standardAddress = formatStandardAddress(rawSLAddr, cleanIdxAddr, addressComponents);

    // ── Co-applicants (Index II owners only) from the highest-value SL ──
    const coAppsRaw = primarySL?.fields?.coApplicantNames?.value;
    const coApplicants = (() => {
      if (!coAppsRaw) return [];
      const arr = Array.isArray(coAppsRaw) ? coAppsRaw : [coAppsRaw];
      return arr.filter(x => typeof x === "object" ? x.isOwner : false).map(x => typeof x === "object" ? x.name : x);
    })();

    // ── Per-SL breakdown for storage/audit ─────────────────────────────
    const sanctionLetters = slResults.map(r => ({
      bankName: (r.fields?.bankName?.value || "").toUpperCase(),
      loanAmount: parseFloat(String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "")) || 0,
      applicationNumber: r.fields?.applicationNumber?.value || "",
      rateOfInterest: r.fields?.rateOfInterest?.value || "",
      isPrimary: r === primarySL,
    }));

    const extracted = {
      // Applicant / loan (highest-value SL for all except totalLoan)
      applicantName: (applicantName || "").toUpperCase(),
      coApplicants,
      contactNumber,
      loanAmount: totalLoan,                 // SUM of all SLs
      rateOfInterest: roiFromLargest.toUpperCase(),
      applicationNumber: appNo,
      bankName: (bankName || "").toUpperCase(),
      bankCode: session?.bankCode || inferBankCode(bankName),
      branchName: (branchName || "").toUpperCase(),
      loanPurpose: (loanPurpose || "").toUpperCase(),
      termMonths,
      emiAmount: emiAmt,
      sanctionDate,
      processingFee,
      sanctionLetterCount: slResults.length,
      sanctionLetters,                       // full per-SL breakdown
      // Property address fields
      propertyAddressSL: rawSLAddr.toUpperCase(),
      propertyAddressIndex: cleanIdxAddr.toUpperCase(),
      propertyAddressFormatted: standardAddress,
      pincode,
      addressComponents,
      // Index II / MAHADA fields (prefer AI address components, fall back to doc fields)
      villageName: (addressComponents.village || propDoc?.fields?.villageName?.value || "").toUpperCase(),
      talukaName: (addressComponents.taluka || propDoc?.fields?.talukaName?.value || "").toUpperCase(),
      districtName: (addressComponents.district || propDoc?.fields?.districtName?.value || "").toUpperCase(),
      sroOfficeName: (propDoc?.fields?.sroOfficeName?.value || "").toUpperCase(),
      documentNumber: propDoc?.fields?.documentNumber?.value || "",
      surveyNumbers: propDoc?.fields?.surveyNumbers?.value || "",
      areaConstructed: propDoc?.fields?.areaConstructed?.value || "",
      // Owners (all with PAN/DOB linked)
      owners,
      extractedAt: new Date().toISOString(),
    };

    // Push to global active case store (persists across tab switches)
    if (mergeActiveCaseData) mergeActiveCaseData(extracted);

    // Persist to linked DB case (single source of truth)
    if (linkedCase) {
      DB.update("cases", linkedCase.id, { bankCode: extracted.bankCode || linkedCase.bankCode || session?.bankCode || inferBankCode(extracted.bankName), aiData: extracted, applicantName: extracted.applicantName || linkedCase.applicantName, bankName: extracted.bankName || linkedCase.bankName, loanAmount: extracted.loanAmount || linkedCase.loanAmount, branch: linkedCase.branch || extracted.branchName || session?.branch || "", storeData: { ...(linkedCase.storeData || {}), ...extracted, caseId: linkedCase.caseId } });
      results.forEach(r => { const src = files.find(f => f.id === r.fileId); DB.insert("ai_documents", { id:`aid_${Date.now()}_${Math.random()}`, caseId:linkedCase.caseId, bankCode:extracted.bankCode || linkedCase.bankCode || session?.bankCode || "OTHERS", documentType:r.documentType, fileName:r.fileName, extractedAt:new Date().toISOString(), extractedData:r }); });
      syncCaseStatus(linkedCase.caseId);
      DB.audit("AI_DATA_SAVED", session?.id, { caseId: linkedCase.caseId, sls: slResults.length, totalLoan });
    }

    setVerifiedData({ owners, savedAt: new Date().toISOString(), totalLoan, standardAddress });
    setView("verified");
  };

  const CB = ({ score }) => { const c = score >= 85 ? C.green : score >= 60 ? C.amber : C.red; return <span style={{ background: c + "22", color: c, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{score}%</span>; };
  const DTB = ({ type }) => {
    const m = {
      SanctionLetter: ["📜", "SANCTION LETTER", C.gold, C.goldBg],
      IndexII: ["📑", "INDEX II", C.indigo, C.indigoBg],
      MAHADA: ["🏗️", "MAHADA NOC", "#7c3aed", "#ede9fe"],
      Aadhaar: ["🪪", "AADHAAR", C.green, C.greenBg],
      PAN: ["💳", "PAN CARD", C.sky, C.skyBg],
      Unknown: ["❓", "UNKNOWN", C.gray500, C.gray100],
    };
    const [i, l, c, bg] = m[type] || m.Unknown;
    return <span style={{ background: bg, color: c, borderRadius: 12, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{i} {l}</span>;
  };

  const reset = () => { setFiles([]); setResults([]); setOwners([]); setSlData(null); setVerifiedData(null); setLinkedCase(null); setView("upload"); };

  if (view === "verified") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div><h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: "0 0 4px" }}>✅ AI Documents Verified</h2><p style={{ color: C.gray500, fontSize: 13, margin: 0 }}>Saved · {new Date(verifiedData.savedAt).toLocaleString()}{linkedCase ? ` · Case: ${linkedCase.caseId}` : ""}</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={reset} style={{ background: C.white, color: C.dark, border: `1px solid ${C.gray300}`, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>+ New Upload</button>
          {setPage && <button onClick={() => setPage("challan")} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 800, cursor: "pointer" }}>Continue to Challan →</button>}
        </div>
      </div>
      <div style={{ background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, color: C.green, fontSize: 15 }}>✅ Verified data saved to database — available to Challan, NOI, MIS, and Excel Export.</div>
        {verifiedData.totalLoan > 0 && <div style={{ color: C.gray600, fontSize: 13, marginTop: 4 }}>Total Loan: <strong>₹{Number(verifiedData.totalLoan).toLocaleString("en-IN")}</strong>{verifiedData.standardAddress ? ` · Address: ${verifiedData.standardAddress}` : ""}</div>}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {owners.map((o, i) => (
          <div key={o.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, flex: "1 1 240px", minWidth: 220, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: C.goldBg }}><span style={{ color: C.gold, fontWeight: 800 }}>Owner {i + 1}</span></div>
            <div style={{ padding: "12px 16px" }}>
              {[["👤", "Name", o.name], ["📅", "DOB", o.dob], ["🪪", "Aadhaar", o.aadhaar], ["💳", "PAN", o.pan]].map(([ic, l, v]) => (
                <div key={l} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, marginBottom: 2 }}>{ic} {l}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: !v ? C.red : C.dark }}>{v || `❌ ${l} Missing`}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (view === "review") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div><h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: "0 0 4px" }}>🔍 AI Extraction Review</h2><p style={{ color: C.gray500, fontSize: 13, margin: 0 }}>Review, correct, then save.</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setView("upload")} style={{ background: C.white, color: C.dark, border: `1px solid ${C.gray300}`, borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>← Back</button>
          <button onClick={save} style={{ background: C.green, color: C.white, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>✅ Save Verified Data</button>
        </div>
      </div>

      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: C.dark, fontSize: 14, marginBottom: 10 }}>🔗 Link to Case ID (optional)</div>
        <CaseSearchBar onSelect={setLinkedCase} placeholder="Search Case ID to link this AI data…" />
        {linkedCase && <div style={{ marginTop: 10, background: C.greenBg, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.green, fontWeight: 700 }}>✅ Will save to: {linkedCase.caseId}</div>}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[["Documents", `${results.length}/${files.length}`, C.gold], ["Owners", owners.length, C.indigo], ["Aadhaar", `${owners.filter(o => o.aadhaar).length}/${owners.length}`, C.green], ["PAN", `${owners.filter(o => o.pan).length}/${owners.length}`, C.sky], ["Avg Conf.", results.length ? `${Math.round(results.reduce((s, r) => s + (r.overallConfidence || 0), 0) / results.length)}%` : "—", C.amber]].map(([l, v, c]) => (
          <div key={l} style={{ flex: "1 1 100px", minWidth: 90, background: C.white, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.gray200}`, borderTop: `3px solid ${c}` }}>
            <div style={{ fontSize: 11, color: C.gray500, marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {owners.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: C.dark, fontSize: 15, marginBottom: 12 }}>👥 Owner Records</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {owners.map((o, i) => (
              <div key={o.id} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, flex: "1 1 240px", minWidth: 220, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: C.goldBg, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.gold, fontWeight: 800 }}>Owner {i + 1}</span>
                  <button onClick={() => setEditingOwner(editingOwner === o.id ? null : o.id)} style={{ background: "none", border: `1px solid ${C.gold}`, borderRadius: 6, padding: "3px 10px", color: C.gold, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{editingOwner === o.id ? "Done" : "Edit"}</button>
                </div>
                <div style={{ padding: "12px 16px" }}>
                  {[["👤", "Name", "name"], ["📅", "DOB", "dob"], ["🪪", "Aadhaar", "aadhaar"], ["💳", "PAN", "pan"]].map(([ic, l, k]) => (
                    <div key={k} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, marginBottom: 3 }}>{ic} {l}</div>
                      {editingOwner === o.id
                        ? <input value={o[k] || ""} onChange={e => setOwners(prev => prev.map(x => x.id === o.id ? { ...x, [k]: e.target.value } : x))} style={{ ...inputStyle, fontSize: 13, padding: "6px 10px" }} />
                        : <div style={{ fontSize: 13, fontWeight: 600, color: !o[k] ? C.red : C.dark }}>{o[k] || `❌ ${l} Missing`}</div>
                      }
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Combined loan total banner — shown when multiple SLs detected */}
      {results.filter(r => r.documentType === "SanctionLetter").length > 1 && (() => {
        const total = results.filter(r => r.documentType === "SanctionLetter").reduce((s, r) => s + (parseFloat(String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "")) || 0), 0);
        return (
          <div style={{ background: C.goldBg, border: `1px solid ${C.gold}`, borderRadius: 10, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 24 }}>🏦</span>
            <div>
              <div style={{ fontWeight: 800, color: C.gold, fontSize: 15 }}>Multiple Sanction Letters Detected — Loan Amounts Summed</div>
              <div style={{ fontSize: 13, color: C.gray600, marginTop: 2 }}>
                {results.filter(r => r.documentType === "SanctionLetter").map((r, i) => `SL ${i + 1}: ₹${(parseFloat(String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "")) || 0).toLocaleString("en-IN")}`).join(" + ")} = <strong style={{ color: C.gold }}>₹{total.toLocaleString("en-IN")}</strong>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ fontWeight: 700, color: C.dark, fontSize: 15, marginBottom: 12 }}>📄 Extracted Data</div>
      {results.map((r, rIdx) => {
        const fmap = {
          SanctionLetter: [
            ["APPLICANT NAME", "applicantName"], ["CONTACT NO.", "contactNumber"], ["APPLICATION NO.", "applicationNumber"],
            ["BANK NAME", "bankName"], ["BRANCH", "branchName"], ["LOAN PURPOSE", "loanPurpose"],
            ["LOAN AMOUNT (THIS SL)", "loanAmountSanctioned"], ["TERM (MONTHS)", "termMonths"],
            ["RATE OF INTEREST", "rateOfInterest"], ["EMI AMOUNT", "emiAmount"],
            ["PROPERTY ADDRESS", "propertyAddress"], ["SANCTION DATE", "sanctionDate"],
          ],
          IndexII: [
            ["SRO OFFICE", "sroOfficeName"], ["DOCUMENT NO.", "documentNumber"], ["VILLAGE", "villageName"],
            ["TALUKA", "talukaName"], ["DISTRICT", "districtName"], ["PROPERTY ADDRESS", "propertyAddress"],
            ["SURVEY / CTS / GAT NO.", "surveyNumbers"], ["AREA CONSTRUCTED", "areaConstructed"],
            ["OWNER NAMES", "ownerNames"], ["DOCUMENT DATE", "documentDate"],
          ],
          MAHADA: [
            ["SRO / SCHEME", "sroOfficeName"], ["DOCUMENT / APP NO.", "documentNumber"], ["OWNER NAMES", "ownerNames"],
            ["VILLAGE / LOCATION", "villageName"], ["TALUKA", "talukaName"], ["DISTRICT", "districtName"],
            ["PROPERTY ADDRESS", "propertyAddress"], ["AREA CONSTRUCTED", "areaConstructed"],
            ["BANK NAME", "bankName"], ["DOCUMENT DATE", "documentDate"],
          ],
          Aadhaar: [["HOLDER NAME", "holderName"], ["AADHAAR NO.", "aadhaarNumber"], ["DATE OF BIRTH", "dateOfBirth"], ["GENDER", "gender"], ["ADDRESS", "address"]],
          PAN: [["HOLDER NAME", "holderName"], ["PAN NO.", "panNumber"], ["DATE OF BIRTH", "dateOfBirth"], ["FATHER'S NAME", "fatherName"]],
        };
        const flds = fmap[r.documentType] || [];
        const slAmt = r.documentType === "SanctionLetter" ? (parseFloat(String(r.fields?.loanAmountSanctioned?.value || "0").replace(/[^0-9.]/g, "")) || 0) : 0;
        return (
          <div key={r.fileId} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "12px 20px", background: C.gray100, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.fileName}</span>
                <DTB type={r.documentType} />
                {r.documentType === "SanctionLetter" && r._slIndex > 1 && <span style={{ background: C.indigoBg, color: C.indigo, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>SL #{r._slIndex}</span>}
              </div>
              <CB score={r.overallConfidence || 0} />
            </div>

            {r.error ? <div style={{ padding: "12px 20px", color: C.red, fontSize: 13 }}>⚠️ {r.warnings?.[0]}</div> : (
              <div style={{ padding: "4px 20px 12px" }}>
                {/* SL-specific: individual + combined loan amount */}
                {r.documentType === "SanctionLetter" && r._totalCombinedLoanAmt && r._totalCombinedLoanAmt !== slAmt && (
                  <div style={{ background: C.goldBg, borderRadius: 8, padding: "8px 12px", margin: "8px 0", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: C.gray600, fontWeight: 600 }}>💰 Combined Loan Total (all SLs)</span>
                    <span style={{ fontWeight: 800, color: C.gold }}>₹{r._totalCombinedLoanAmt.toLocaleString("en-IN")}</span>
                  </div>
                )}

                {flds.map(([label, key]) => {
                  const f = r.fields?.[key];
                  const val = f ? (Array.isArray(f.value) ? f.value.join(", ") : String(f.value || "")) : null;
                  const display = val || null;
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${C.gray100}`, fontSize: 13 }}>
                      <span style={{ color: C.gray500, width: "40%", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{label}</span>
                      <span style={{ flex: 1, fontWeight: 600, color: !display ? C.red : f?.doubtful ? C.amber : C.dark, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {!display ? "❌ Missing" : f?.doubtful ? "⚠️ " + display : display}
                        {display && <CB score={f?.confidence || 0} />}
                      </span>
                    </div>
                  );
                })}

                {/* Co-applicant section with Index II match warning */}
                {r.documentType === "SanctionLetter" && (() => {
                  const raw = r.fields?.coApplicantNames?.value;
                  if (!raw) return null;
                  // Normalise: AI may return array of strings OR array of {name, isOwner} objects
                  const coArr = Array.isArray(raw)
                    ? raw.map(x => typeof x === "object" ? x : { name: x, isOwner: false })
                    : [{ name: String(raw), isOwner: false }];
                  if (!coArr.length) return null;
                  const excluded = coArr.filter(c => !c.isOwner);
                  const included = coArr.filter(c => c.isOwner);
                  return (
                    <div style={{ marginTop: 10 }}>
                      {included.length > 0 && (
                        <div style={{ background: C.greenBg, borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, color: C.green, fontSize: 12, marginBottom: 6 }}>✅ CO-APPLICANT(S) — MATCHED IN INDEX II / INCLUDED IN NOI</div>
                          {included.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, color: C.dark, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ background: C.greenBg, color: C.green, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>INCLUDE</span>
                              {c.name}
                            </div>
                          ))}
                        </div>
                      )}
                      {excluded.length > 0 && (
                        <div style={{ background: "#fef3c7", borderRadius: 8, padding: "10px 14px" }}>
                          <div style={{ fontWeight: 700, color: C.amber, fontSize: 12, marginBottom: 6 }}>⚠️ CO-APPLICANT(S) — NOT IN INDEX II / EXCLUDED FROM NOI</div>
                          {excluded.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, color: C.gray600, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ background: "#fee2e2", color: C.red, borderRadius: 6, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>EXCLUDE</span>
                              {c.name}
                            </div>
                          ))}
                          <div style={{ fontSize: 11, color: C.gray500, marginTop: 4 }}>CO-APPLICANTS NOT IN INDEX II ARE EXCLUDED FROM NOI / CHALLAN.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* PAN/Aadhaar: show Index II match result */}
                {(r.documentType === "PAN" || r.documentType === "Aadhaar") && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: r.isIndexIIOwner ? C.greenBg : "#fee2e2", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{r.isIndexIIOwner ? "✅" : "❌"}</span>
                    <div style={{ fontSize: 12, fontWeight: 600, color: r.isIndexIIOwner ? C.green : C.red }}>
                      {r.isIndexIIOwner
                        ? `Matched to Index II owner: "${r.matchedOwnerName}" (${r.matchConfidence}% confidence)`
                        : "No match found in Index II — not a property owner"}
                    </div>
                  </div>
                )}

                {r.warnings?.map((w, i) => <div key={i} style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>⚠️ {w}</div>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: "0 0 4px" }}>🤖 AI Document Intelligence</h2>
      <p style={{ color: C.gray500, fontSize: 14, margin: "0 0 20px" }}>Process documents against one Case ID. Tabs: SL, INDEX2, ADHAR and PAN. Data is saved under the linked Case ID and processed using the selected bank pattern.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {[["📜", "Sanction Letter"], ["📑", "Index II"], ["🪪", "Aadhaar Card"], ["💳", "PAN Card"]].map(([i, l]) => (
          <div key={l} style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 18 }}>{i}</span><div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {[['ALL','All'],['SanctionLetter','SL'],['IndexII','INDEX2'],['Aadhaar','ADHAR'],['PAN','PAN']].map(([id,label]) => <button key={id} onClick={()=>setAiTab(id)} style={{ border:`1px solid ${aiTab===id?C.gold:C.gray300}`, background:aiTab===id?C.goldBg:C.white, color:aiTab===id?C.gold:C.gray600, borderRadius:7, padding:"7px 13px", fontWeight:700, cursor:"pointer" }}>{label}</button>)}
      </div>
      {files.length > 0 && <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:10, padding:12, marginBottom:14 }}>{files.filter(f=>aiTab==="ALL" || f.docType===aiTab).map(f=><div key={f.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 4px", borderBottom:`1px solid ${C.gray100}`, fontSize:13 }}><span>{f.name}</span><span style={{ color:f.status==="done"?C.green:f.status==="error"?C.red:C.amber, fontWeight:700 }}>{f.status}</span></div>)}</div>}
      <label onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${dragOver ? C.gold : C.gray300}`, borderRadius: 12, padding: "40px 20px", cursor: "pointer", background: dragOver ? C.goldBg : C.white, transition: "all 0.2s", marginBottom: 20 }}>
        <span style={{ fontSize: 36, marginBottom: 10 }}>⬆</span>
        <div style={{ fontWeight: 700, color: C.dark, fontSize: 16, marginBottom: 4 }}>Drop documents here or click to select</div>
        <div style={{ color: C.gray500, fontSize: 13 }}>PDF, JPG, PNG · Any type · Any order</div>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
      </label>
      {files.length > 0 && (
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.dark, fontSize: 14 }}>{files.length} file{files.length !== 1 ? "s" : ""} queued</div>
          {files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${C.gray100}` }}>
              <span style={{ fontSize: 18 }}>{f.status === "done" ? "✅" : f.status === "error" ? "❌" : processing && processingFile === f.name ? "⏳" : "📎"}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div><div style={{ fontSize: 11, color: C.gray500 }}>{(f.size / 1024).toFixed(1)} KB</div></div>
              {!processing && <span onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))} style={{ color: C.red, cursor: "pointer", fontWeight: 700, padding: "4px 8px" }}>✕</span>}
            </div>
          ))}
        </div>
      )}
      {processing && (
        <div style={{ background: C.goldBg, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div><div style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>AI Analysis in Progress…</div><div style={{ color: C.gray600, fontSize: 12 }}>Processing: {processingFile}</div></div>
        </div>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={run} disabled={!files.length || processing} style={{ flex: 1, padding: "14px", background: !files.length || processing ? C.gray300 : C.gold, color: !files.length || processing ? C.gray500 : C.dark, border: "none", borderRadius: 8, fontWeight: 800, fontSize: 15, cursor: files.length && !processing ? "pointer" : "not-allowed" }}>
          {processing ? "⏳ Analyzing…" : "🤖 Run AI Analysis"}
        </button>
        {files.length > 0 && !processing && <button onClick={() => setFiles([])} style={{ padding: "14px 20px", background: C.white, color: C.dark, border: `1px solid ${C.gray300}`, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Clear</button>}
      </div>
    </div>
  );
}

// ─── MIS ──────────────────────────────────────────────────────────────────────
function MIS({ session, activeCaseData }) {
  const mkRow = (preset = {}) => ({
    id: `mis_${Date.now()}_${Math.random()}`,
    srNo: preset.srNo || "", docReceivedDate: preset.docReceivedDate || "",
    fiName: preset.fiName || "", bankName: preset.bankName || "", branchName: preset.branchName || "",
    customerName: preset.customerName || "", coApplicant: preset.coApplicant || "", mobNo: preset.mobNo || "",
    applicationNo: preset.applicationNo || "",
    loanAmt: String(preset.loanAmt || preset.loanAmount || ""),
    roi: preset.roi || "", termMonths: preset.termMonths || "", sanctionDate: preset.sanctionDate || "",
    amt030: String(preset.amt030 || ""), amt050: String(preset.amt050 || ""),
    dhcAmt: preset.dhcAmt || "", challanTotal: String(preset.challanTotal || ""),
    paymentDate: preset.paymentDate || "", amtReceived: preset.amtReceived || "",
    netFees: preset.netFees || "", platformFee: preset.platformFee || "", extraAmt: preset.extraAmt || "",
    propertyAddress: preset.propertyAddress || "", village: preset.village || "", taluka: preset.taluka || "",
    district: preset.district || "", pincode: preset.pincode || "", areaConstructed: preset.areaConstructed || "",
    sroName: preset.sroName || "",
    noiSubmit: preset.noiSubmit || "", noiReceipt: preset.noiReceipt || "", tat: preset.tat || "",
    remarks: preset.remarks || "", sroNo: preset.sroNo || "",
    challanBy: preset.challanBy || session?.username || "", noiBy: preset.noiBy || "", fsf: preset.fsf || "",
    caseId: preset.caseId || preset.srNo || "",
  });

  const [rows, setRows] = useState([mkRow()]);
  const [savingId, setSavingId] = useState(null);
  useEffect(() => {
    let alive=true;
    (async()=>{
      const {data,error}=await supabase.from("mis_rows").select("*").order("created_at",{ascending:true});
      if(!alive||error)return;
      setRows(data&&data.length?data.map(r=>mkRow(dbToMis(r))):[mkRow()]);
    })();
    const channel=supabase.channel("mis-realtime").on("postgres_changes",{event:"*",schema:"public",table:"mis_rows"},payload=>{
      if(payload.eventType==="INSERT") setRows(rs=>rs.some(r=>r.id===payload.new.id)?rs:[...rs,mkRow(dbToMis(payload.new))]);
      if(payload.eventType==="UPDATE") setRows(rs=>rs.map(r=>r.id===payload.new.id?mkRow(dbToMis(payload.new)):r));
    }).subscribe();
    return()=>{alive=false;supabase.removeChannel(channel);};
  },[]);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const setField = (id, k, v) => setRows(rs => rs.map(r => r.id === id ? { ...r, [k]: v } : r));
  const saveRow = async row => {
    if(!row.srNo.trim()){setExportMsg("Enter Case ID / Sr No. before saving.");return;}
    setSavingId(row.id); setExportMsg("Saving MIS row and syncing Excel…");
    const payload={id:row.id,...misToDb(row),case_id:row.caseId||row.srNo||"",created_by:session?.id||null,created_at:new Date().toISOString()};
    const {error}=await supabase.from("mis_rows").upsert(payload,{onConflict:"id"});
    if(error){setExportMsg("❌ MIS save failed: "+error.message);setSavingId(null);return;}
    try {
      const res=await fetch("/api/mis-to-excel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({row})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||"Excel sync failed");
      setExportMsg("✅ Saved to MIS and Excel. Next rows will be appended automatically.");
    } catch(err) { setExportMsg("⚠️ MIS saved in Supabase, but Excel sync is not configured: "+err.message); }
    setSavingId(null);
  };
  const handleExportAll = async () => { for(const row of rows.filter(r=>r.srNo||r.customerName)) await saveRow(row); };

  const Inp = ({ id, fkey, placeholder }) => <input value={rows.find(r => r.id === id)?.[fkey] || ""} placeholder={placeholder} onChange={e => setField(id, fkey, e.target.value)} style={{ ...inputStyle, minWidth: 110 }} />;
  const Sel = ({ id, fkey, opts }) => <select value={rows.find(r => r.id === id)?.[fkey] || ""} onChange={e => setField(id, fkey, e.target.value)} style={{ ...inputStyle, minWidth: 110 }}><option value="">—</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div><h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: "0 0 4px" }}>MIS Report</h2><p style={{ color: C.gray500, fontSize: 13, margin: 0 }}>Auto-filled from Challan · Syncs to OneDrive Excel</p></div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={EXCEL_SHARE_URL} target="_blank" rel="noreferrer" style={{ background: C.goldBg, color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>📊 Open Excel</a>
          <button onClick={() => downloadCSV(rows)} style={{ background: C.indigoBg, color: C.indigo, border: `1px solid ${C.indigo}`, borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>⬇ CSV</button>
          <button onClick={handleExportAll} disabled={exporting} style={{ background: "#1d6f42", color: C.white, border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: exporting ? "not-allowed" : "pointer" }}>
            {exporting ? "⏳ Exporting…" : "💾 Save All & Sync Excel"}
          </button>
        </div>
      </div>
      {exportMsg && <div style={{ background: exportMsg.startsWith("✅") ? C.greenBg : C.goldBg, border: `1px solid ${exportMsg.startsWith("✅") ? C.green : C.gold}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600, color: exportMsg.startsWith("✅") ? C.green : C.dark }}>{exportMsg} {!exportMsg.startsWith("✅") && <a href={EXCEL_SHARE_URL} target="_blank" rel="noreferrer" style={{ marginLeft: 12, color: C.gold }}>Open Excel →</a>}</div>}
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: 24, overflowX: "auto" }}>
        {rows.map((row, idx) => (
          <div key={row.id} style={{ marginBottom: 28, paddingBottom: 28, borderBottom: idx < rows.length - 1 ? `1px dashed ${C.gray200}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: idx === 0 ? C.green : C.gray400 }}>{idx === 0 ? "Latest Entry" : `Row ${idx + 1}`} {row.srNo ? "· Saved/Ready" : "· New"}</div>
              <button onClick={() => saveRow(row)} style={{ background: "#1d6f42", color: C.white, border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{savingId===row.id?"Saving…":"💾 Save & Sync"}</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: C.green, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>Receipt & Document Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                <div><label style={labelStyle}>Sr. No. / Case ID</label><Inp id={row.id} fkey="srNo" placeholder="Case ID" /></div>
                <div><label style={labelStyle}>Doc Received Date</label><Inp id={row.id} fkey="docReceivedDate" placeholder="DD-MM-YYYY" /></div>
                <div><label style={labelStyle}>FI Name</label><Inp id={row.id} fkey="fiName" placeholder="FI / Bank" /></div>
                <div><label style={labelStyle}>Bank Name</label><Inp id={row.id} fkey="bankName" placeholder="Bank" /></div>
                <div><label style={labelStyle}>Branch</label><Inp id={row.id} fkey="branchName" placeholder="Branch" /></div>
                <div><label style={labelStyle}>Customer Name</label><Inp id={row.id} fkey="customerName" placeholder="Name" /></div>
                <div><label style={labelStyle}>MOB No.</label><Inp id={row.id} fkey="mobNo" placeholder="Mobile" /></div>
                <div><label style={labelStyle}>Loan Amt</label><Inp id={row.id} fkey="loanAmt" placeholder="Amount" /></div>
                <div><label style={labelStyle}>0.30% Amt</label><Inp id={row.id} fkey="amt030" placeholder="Amount" /></div>
                <div><label style={labelStyle}>0.50% Amt</label><Inp id={row.id} fkey="amt050" placeholder="Amount" /></div>
                <div><label style={labelStyle}>DHC Amt</label><Inp id={row.id} fkey="dhcAmt" placeholder="Amount" /></div>
                <div><label style={labelStyle}>Challan Total</label><Inp id={row.id} fkey="challanTotal" placeholder="Total" /></div>
                <div><label style={labelStyle}>Payment Date</label><Inp id={row.id} fkey="paymentDate" placeholder="DD-MM-YYYY" /></div>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: C.green, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12 }}>Payment & Submission Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                <div><label style={labelStyle}>Amt Received</label><Inp id={row.id} fkey="amtReceived" placeholder="Amount" /></div>
                <div><label style={labelStyle}>Net Fees</label><Inp id={row.id} fkey="netFees" placeholder="Net Fees" /></div>
                <div><label style={labelStyle}>Platform Fee</label><Inp id={row.id} fkey="platformFee" placeholder="Fee" /></div>
                <div><label style={labelStyle}>Extra Amt</label><Inp id={row.id} fkey="extraAmt" placeholder="Extra" /></div>
                <div><label style={labelStyle}>NOI Submit Date</label><Inp id={row.id} fkey="noiSubmit" placeholder="DD-MM-YYYY" /></div>
                <div><label style={labelStyle}>NOI Receipt Date</label><Inp id={row.id} fkey="noiReceipt" placeholder="DD-MM-YYYY" /></div>
                <div><label style={labelStyle}>TAT (Days)</label><Inp id={row.id} fkey="tat" placeholder="TAT" /></div>
                <div style={{ gridColumn: "span 2" }}><label style={labelStyle}>Remarks</label><textarea value={row.remarks} onChange={e => setField(row.id, "remarks", e.target.value)} placeholder="Remarks" style={{ ...inputStyle, height: 70, resize: "vertical" }} /></div>
                <div><label style={labelStyle}>SRO No.</label><Inp id={row.id} fkey="sroNo" placeholder="SRO No." /></div>
                <div><label style={labelStyle}>Challan By</label><Inp id={row.id} fkey="challanBy" placeholder="Name" /></div>
                <div><label style={labelStyle}>NOI By</label><Inp id={row.id} fkey="noiBy" placeholder="Name" /></div>
                <div><label style={labelStyle}>FSF</label><Sel id={row.id} fkey="fsf" opts={["Yes", "No"]} /></div>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button onClick={() => setRows(rs => [...rs, mkRow()])} style={{ flex: 1, padding: 12, background: C.green, color: C.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>+ Add Row</button>
          <button onClick={() => setRows([mkRow()])} style={{ padding: "12px 24px", background: C.white, color: C.dark, border: `1px solid ${C.gray300}`, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Clear All</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ session }) {
  const [users,setUsers]=useState([]); const [requests,setRequests]=useState([]); const [logs,setLogs]=useState([]); const [queries,setQueries]=useState([]); const [tab,setTab]=useState("requests"); const [loading,setLoading]=useState(false); const [auditSearch,setAuditSearch]=useState(""); const [requestError,setRequestError]=useState("");
  const roleColor={"Vendor Admin":C.indigo,"Vendor Employee":C.green,Banker:C.sky};
  const permissionKeys=["viewAllCases","receivedDocuments","aiDocuments","challan","noi","mis"];
  const permissionLabels={viewAllCases:"View All Cases",receivedDocuments:"Received Documents",aiDocuments:"AI Extraction",challan:"Challan",noi:"NOI",mis:"MIS Report"};
  const refresh=async()=>{
    setRequestError("");
    if(!supabase||DEMO_MODE){setUsers(DB.get("demo_profiles")||[]);setRequests([]);setLogs(DB.get("audit_logs")||[]);setQueries(DB.get("help_queries")||[]);return;}
    const [{data:u,error:usersError},{data:r,error:requestsError},{data:l,error:logsError}]=await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("access_requests").select("*").order("requested_at",{ascending:false}),
      supabase.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(200)
    ]);
    setUsers(u||[]); setRequests(r||[]); setLogs(l||[]); setQueries(DB.get("help_queries")||[]);
    if(requestsError){
      setRequestError(requestsError.message||"Unable to load access requests.");
      return;
    }
    if(usersError) console.error("Admin users load failed:",usersError);
    if(logsError) console.error("Admin audit logs load failed:",logsError);
  };
  useEffect(()=>{refresh(); const t=setTimeout(refresh,700); return()=>clearTimeout(t);},[]);
  const updateProfile=async(id,patch)=>{setLoading(true);const {error}=await supabase.from("profiles").update(patch).eq("id",id);if(error)alert(error.message);else await refresh();setLoading(false);};
  const approveRequest=async(req)=>{await updateProfile(req.user_id,{approved:true,active:true,approved_at:new Date().toISOString()});await supabase.from("access_requests").update({status:"Approved",approved_at:new Date().toISOString(),approved_by:session.id}).eq("id",req.id);await refresh();};
  const rejectRequest=async(req)=>{await supabase.from("access_requests").update({status:"Rejected"}).eq("id",req.id);await refresh();};
  const toggleUser=async(u)=>{if(u.id===session.id)return;await updateProfile(u.id,{active:u.active===true?false:true});try{await supabase.from("audit_logs").insert({user_id:session.id,action:"ACCOUNT_STATUS_CHANGED",details:{targetUserId:u.id,email:u.email,active:u.active!==true}});}catch{} };
  const togglePermission=async(u,key)=>{const p={...(u.permissions||{})};p[key]=p[key]===true?false:true;await updateProfile(u.id,{permissions:p});try{await supabase.from("audit_logs").insert({user_id:session.id,action:"BANKER_PERMISSION_CHANGED",details:{targetUserId:u.id,email:u.email,permission:key,enabled:p[key]}});}catch{} };
  return <div><h2 style={{fontWeight:800,fontSize:22,color:C.dark,marginBottom:6}}>⚙️ Vendor Admin Panel</h2><p style={{color:C.gray500,fontSize:13,marginTop:0,marginBottom:20}}>Manage approvals, banker access, page permissions and account status.</p>
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>{[["requests",`🔔 Access Requests${requests.length?` (${requests.length})`:""}`],["users","👥 Users"],["audit","📋 Audit Logs"],["queries",`❓ Queries${queries.length?` (${queries.filter(q=>q.status==="Open").length})`:""}`]].map(([t,l])=><button key={t} onClick={()=>{setTab(t);if(t==="requests")refresh();}} style={{padding:"8px 18px",background:tab===t?C.gold:C.white,color:tab===t?C.dark:C.gray600,border:`1px solid ${tab===t?C.gold:C.gray300}`,borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:14}}>{l}</button>)}<button onClick={refresh} style={{padding:"8px 14px",background:C.white,color:C.gray600,border:`1px solid ${C.gray300}`,borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:14}}>↻ Refresh</button></div>
    {tab==="requests"&&<div>{requestError&&<div style={{background:"#fee2e2",color:C.red,borderRadius:10,padding:12,marginBottom:14,fontWeight:700}}>Unable to load access requests: {requestError}</div>}{requests.filter(r=>String(r.status||"").trim().toLowerCase()==="pending").length===0?<div style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,padding:"55px 30px",textAlign:"center"}}><div style={{fontSize:42}}>🔔</div><div style={{fontWeight:800,color:C.dark,fontSize:17}}>No pending access requests</div><div style={{color:C.gray500,fontSize:13,marginTop:7}}>Click ↻ Refresh after a Vendor Employee completes signup.</div></div>:<div style={{display:"grid",gap:14}}>{requests.filter(r=>String(r.status||"").trim().toLowerCase()==="pending").map(r=><div key={r.id} style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,padding:20}}><div style={{fontWeight:800,fontSize:16,color:C.dark}}>{r.name||r.email} <span style={{color:C.gray500,fontSize:12}}>({r.role})</span></div><div style={{color:C.gray600,fontSize:13,marginTop:4}}>{r.email}</div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginTop:16,background:C.gray100,borderRadius:8,padding:12}}><div><div style={{color:C.gray500,fontSize:10,fontWeight:700}}>BRANCH</div><div style={{fontSize:13,fontWeight:700}}>{r.branch||"—"}</div></div><div><div style={{color:C.gray500,fontSize:10,fontWeight:700}}>BANK</div><div style={{fontSize:13,fontWeight:700}}>{r.bank_name||"—"}</div></div><div><div style={{color:C.gray500,fontSize:10,fontWeight:700}}>REQUESTED</div><div style={{fontSize:13}}>{r.requested_at?new Date(r.requested_at).toLocaleString("en-IN"):"—"}</div></div><div><div style={{color:C.gray500,fontSize:10,fontWeight:700}}>STATUS</div><div style={{fontSize:13,fontWeight:800,color:C.amber}}>{r.status||"Pending"}</div></div></div><div style={{display:"flex",gap:10,marginTop:14}}><button onClick={()=>approveRequest(r)} style={{flex:1,padding:10,background:C.green,color:C.white,border:"none",borderRadius:7,fontWeight:800,cursor:"pointer"}}>✓ Approve</button><button onClick={()=>rejectRequest(r)} style={{flex:1,padding:10,background:"#fee2e2",color:C.red,border:"none",borderRadius:7,fontWeight:800,cursor:"pointer"}}>✕ Reject</button></div></div>)}</div>}</div>}
    {tab==="users"&&<div style={{display:"grid",gap:14}}>{users.map(u=><div key={u.id} style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,padding:18}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div style={{fontWeight:800,color:C.dark}}>{u.name||u.email}</div><div style={{fontSize:12,color:C.gray500}}>{u.email} · {u.role} · Branch: <b>{u.branch||"—"}</b></div></div><button disabled={u.id===session.id||loading} onClick={()=>toggleUser(u)} style={{background:u.active?"#fee2e2":C.greenBg,color:u.active?C.red:C.green,border:"none",borderRadius:6,padding:"7px 13px",cursor:u.id===session.id?"not-allowed":"pointer",fontWeight:800}}>{u.id===session.id?"You":u.active?"Deactivate":"Activate"}</button></div>{u.role==="Banker"&&<div style={{marginTop:16,padding:14,background:C.gray100,borderRadius:10}}><div style={{fontWeight:800,color:C.dark,fontSize:13,marginBottom:10}}>Banker Page Permissions</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{permissionKeys.map(k=><button key={k} disabled={loading||u.active===false} onClick={()=>togglePermission(u,k)} style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${u.permissions?.[k]===true?C.green:C.gray300}`,background:u.permissions?.[k]===true?C.greenBg:C.white,color:u.permissions?.[k]===true?C.green:C.gray600,fontWeight:700,cursor:"pointer"}}>{u.permissions?.[k]===true?"✓ ":""}{permissionLabels[k]}</button>)}</div><div style={{fontSize:11,color:C.gray500,marginTop:8}}>Branch is fixed to the value stored in Supabase. Change it manually in the profile when required.</div></div>}</div>)}</div>}
    {tab==="queries"&&<div style={{display:"grid",gap:12}}>{queries.length===0?<div style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,padding:40,textAlign:"center",color:C.gray500}}>No help queries.</div>:queries.slice().reverse().map(q=><div key={q.id} style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,padding:18}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><div><b>{q.name||"User"}</b><div style={{fontSize:12,color:C.gray500}}>{q.email}</div></div><span style={{fontSize:11,color:q.status==="Open"?C.amber:C.green,fontWeight:800}}>{q.status}</span></div><div style={{marginTop:12,color:C.dark,lineHeight:1.6}}>{q.query}</div><div style={{fontSize:11,color:C.gray500,marginTop:8}}>{q.createdAt?new Date(q.createdAt).toLocaleString("en-IN"):""}</div><button onClick={()=>{DB.update("help_queries",q.id,{status:"Resolved"});setQueries(DB.get("help_queries"));}} style={{marginTop:10,padding:"7px 12px",background:C.gold,border:"none",borderRadius:7,fontWeight:800,cursor:"pointer"}}>Mark Resolved</button></div>)}</div>}{tab==="audit"&&<div><div style={{marginBottom:12}}><input style={{...inputStyle,maxWidth:360}} value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} placeholder="Search audit logs by email"/></div><div style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,overflow:"hidden"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:C.gray100}}>{["Action","User","Details","Time"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:C.gray500}}>{h}</th>)}</tr></thead><tbody>{logs.filter(l=>!auditSearch||String(l.details?.email||l.email||l.user_email||"").toLowerCase().includes(auditSearch.toLowerCase())).length===0?<tr><td colSpan={4} style={{padding:40,textAlign:"center",color:C.gray400}}>No audit logs yet.</td></tr>:logs.map(l=><tr key={l.id} style={{borderBottom:`1px solid ${C.gray100}`}}><td style={{padding:"10px 16px"}}>{l.action}</td><td style={{padding:"10px 16px",fontSize:13}}>{l.user_id||"—"}</td><td style={{padding:"10px 16px",fontSize:12,color:C.gray600}}>{JSON.stringify(l.details||{})}</td><td style={{padding:"10px 16px",fontSize:12,color:C.gray500}}>{l.created_at?new Date(l.created_at).toLocaleString("en-IN"):"—"}</td></tr>)}</tbody></table></div></div>}
  </div>;
}

// ─── UPLOAD DOCUMENTS (BANKER / OPERATIONS / SALES INBOX) ────────────────────
function UploadDocumentsPage({ session, setActiveCaseData, setPage }) {
  const [files,setFiles]=useState([]); const [query,setQuery]=useState(""); const [selectedCase,setSelectedCase]=useState(""); const [note,setNote]=useState(""); const [message,setMessage]=useState(""); const [submitting,setSubmitting]=useState(false);
  const cases=getVisibleCases(session).filter(c=>{const q=query.toLowerCase().trim();return !q||String(c.caseId||"").toLowerCase().includes(q)||String(c.applicantName||"").toLowerCase().includes(q);});
  const addFiles=list=>setFiles(prev=>[...prev,...Array.from(list||[]).filter(f=>!prev.some(x=>x.name===f.name&&x.size===f.size))]);
  const upload=async()=>{if(!files.length&&!note.trim()){setMessage("Attach at least one document or write a case note.");return;}setSubmitting(true);try{let caseId=selectedCase;let c=DB.get("cases").find(x=>x.caseId===caseId);if(!caseId){caseId=DB.generateCaseId();const now=new Date().toISOString();c={id:`case_${Date.now()}`,caseId,applicantName:"",loanFileNumber:"",bankName:"",bankCode:session.bankCode||"OTHERS",branch:session.branch||"",createdAt:now,createdBy:session.id,createdByEmail:session.email,createdByName:session.name||session.username,status:"Active"};DB.insert("cases",c);}for(const file of files){const dataUrl=await fileToDataUrl(file);DB.insert("case_documents",{id:`doc_${Date.now()}_${Math.random()}`,caseId,type:"OTHER",fileName:file.name,mimeType:file.type||"application/octet-stream",size:file.size,dataUrl,bankCode:c.bankCode||session.bankCode,uploadedBy:session.id,uploadedByName:session.name||session.username,uploadedAt:new Date().toISOString()});}if(note.trim())DB.insert("case_messages",{id:`msg_${Date.now()}_${Math.random()}`,caseId,message:note.trim(),senderId:session.id,senderEmail:session.email,senderName:session.name||session.username,createdAt:new Date().toISOString()});DB.audit("BANKER_CASE_UPDATE",session.id,{caseId,fileCount:files.length,hasNote:!!note.trim()});setActiveCaseData?.({...(c.storeData||{}),caseId});setFiles([]);setNote("");setMessage(`Saved successfully under Case ID ${caseId}.`);}catch(e){setMessage(e.message||"Unable to save case update.");}finally{setSubmitting(false)}};
  const downloadCase=cid=>{const docs=[...caseDocuments(cid),...DB.get("received_documents").filter(d=>d.caseId===cid)];if(!docs.length){setMessage("No documents found for this case yet.");return;}docs.forEach((d,i)=>setTimeout(()=>downloadDataUrl(d.dataUrl,d.fileName||`${cid}-${i+1}`),i*150));};
  return <div><h2 style={{fontWeight:800,fontSize:22,color:C.dark,margin:"0 0 5px"}}>⬆️ Upload Documents</h2><p style={{color:C.gray500,fontSize:14,margin:"0 0 20px"}}>Attach documents for a new case or add remaining documents to a case you already sent.</p><div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:22}}><div style={{marginBottom:16}}><label style={labelStyle}>Search your sent cases</label><input style={inputStyle} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Case ID or Applicant Name"/></div><div style={{display:"grid",gap:8,maxHeight:180,overflowY:"auto"}}>{cases.slice(0,8).map(c=><button key={c.caseId} onClick={()=>setSelectedCase(c.caseId)} style={{textAlign:"left",padding:11,border:`1px solid ${selectedCase===c.caseId?C.gold:C.gray200}`,background:selectedCase===c.caseId?C.goldBg:C.white,borderRadius:8,cursor:"pointer"}}><b style={{color:C.gold}}>{c.caseId}</b> · {c.applicantName||"Applicant"} · {c.branch||session.branch}</button>)}{cases.length===0&&<div style={{padding:15,color:C.gray500,textAlign:"center"}}>No matching cases.</div>}</div><div style={{marginTop:18}}><label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:`2px dashed ${C.gray300}`,borderRadius:10,padding:"38px 20px",cursor:"pointer",background:C.gray100}}><div style={{fontSize:34}}>📎</div><div style={{fontWeight:800,color:C.dark,marginTop:8}}>Attach files</div><div style={{fontSize:12,color:C.gray500,marginTop:4}}>PDF / JPG / JPEG · multiple files allowed</div><input type="file" multiple accept=".pdf,.jpg,.jpeg" style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/></label>{files.length>0&&<div style={{marginTop:12}}>{files.map((f,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 11px",borderBottom:`1px solid ${C.gray100}`}}><span>📄 {f.name}</span><button onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))} style={{border:"none",background:"transparent",color:C.red,cursor:"pointer"}}>Remove</button></div>)}</div>}</div><div style={{marginTop:18}}><label style={labelStyle}>Case chat / note</label><textarea style={{...inputStyle,minHeight:90,resize:"vertical"}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Write anything related to this case…"/></div><button onClick={upload} disabled={submitting} style={{width:"100%",marginTop:16,padding:13,background:submitting?C.gray300:C.gold,color:C.dark,border:"none",borderRadius:8,fontWeight:900,cursor:"pointer"}}>{submitting?"Saving…":"Attach & Save"}</button>{selectedCase&&<button onClick={()=>downloadCase(selectedCase)} style={{width:"100%",marginTop:10,padding:11,background:C.white,color:C.dark,border:`1px solid ${C.gray300}`,borderRadius:8,fontWeight:800,cursor:"pointer"}}>⬇️ Download all documents for {selectedCase}</button>}{message&&<div style={{marginTop:14,padding:11,borderRadius:8,background:C.greenBg,color:C.green,fontWeight:700}}>{message}</div>}</div></div>;
}

// ─── RECEIVED DOCUMENTS (ADMIN / EMPLOYEE ONLY) ──────────────────────────────
function ReceivedDocumentsPage({ session, setPage, setActiveCaseData }) {
  const [items, setItems] = useState(DB.get("received_documents"));
  const [openCaseId, setOpenCaseId] = useState(null);
  const refresh = () => setItems(DB.get("received_documents"));

  // Group every received file belonging to the same Case ID into ONE inbox conversation.
  const grouped = Object.values(items.reduce((acc, doc) => {
    const key = doc.caseId || "NO-CASE-ID";
    if (!acc[key]) acc[key] = { caseId: key, docs: [], latest: doc.uploadedAt || "", senderName: doc.senderName || "Unknown", senderRole: doc.senderRole || "", branch: doc.branch || "" };
    acc[key].docs.push(doc);
    if (new Date(doc.uploadedAt || 0) > new Date(acc[key].latest || 0)) {
      acc[key].latest = doc.uploadedAt || "";
      acc[key].senderName = doc.senderName || acc[key].senderName;
      acc[key].senderRole = doc.senderRole || acc[key].senderRole;
      acc[key].branch = doc.branch || acc[key].branch;
    }
    return acc;
  }, {})).sort((a, b) => new Date(b.latest || 0) - new Date(a.latest || 0));

  const openConversation = group => setOpenCaseId(openCaseId === group.caseId ? null : group.caseId);

  const exportToAI = group => {
    const sameCase = group.docs;
    sessionStorage.setItem("ark_ai_imports", JSON.stringify(sameCase.map(x => ({
      caseId: x.caseId,
      fileName: x.fileName,
      mimeType: x.mimeType,
      size: x.size,
      dataUrl: x.dataUrl
    }))));
    const c = DB.get("cases").find(x => x.caseId === group.caseId);
    if (c) setActiveCaseData?.(c.storeData || { caseId: c.caseId, applicantName: c.applicantName, branch: c.branch });
    DB.set("received_documents", DB.get("received_documents").map(x => x.caseId === group.caseId ? { ...x, aiExported: true } : x));
    setItems(DB.get("received_documents"));
    setPage("aiDocuments");
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, margin: 0 }}>📥 Received Documents</h2>
        <p style={{ color: C.gray500, fontSize: 13, margin: "5px 0 0" }}>Inbox — each Case ID appears as one message/conversation from the sender.</p>
      </div>
      <button onClick={refresh} style={{ background: C.white, border: `1px solid ${C.gray300}`, borderRadius: 7, padding: "9px 14px", cursor: "pointer" }}>↻ Refresh</button>
    </div>

    {grouped.length === 0 ? (
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: 50, textAlign: "center", color: C.gray500 }}>
        📭 No documents received yet.
      </div>
    ) : (
      <div style={{ display: "grid", gap: 10 }}>
        {grouped.map(group => {
          const isOpen = openCaseId === group.caseId;
          const aiDone = group.docs.every(d => d.aiExported);
          return <div key={group.caseId} style={{ background: C.white, border: `1px solid ${isOpen ? C.gold : C.gray200}`, borderRadius: 12, overflow: "hidden", boxShadow: isOpen ? "0 4px 16px rgba(0,0,0,.06)" : "none" }}>
            {/* Inbox message / chat header */}
            <div onClick={() => openConversation(group)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 16px", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.goldBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: C.dark }}>{group.senderName}</span>
                  <span style={{ fontSize: 11, color: C.gray500 }}>{group.senderRole}</span>
                  <span style={{ fontSize: 11, color: C.gray500 }}>• {group.branch || "—"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: C.gold }}>Case ID: {group.caseId}</span>
                  <span style={{ fontSize: 12, color: C.gray500 }}>• {group.docs.length} document{group.docs.length !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ fontSize: 11, color: C.gray500, marginTop: 3 }}>Last received: {new Date(group.latest).toLocaleString("en-IN")}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 18 }}>{isOpen ? "⌃" : "⌄"}</div>
                <div style={{ fontSize: 10, color: aiDone ? C.green : C.gray500 }}>{aiDone ? "AI exported" : "New documents"}</div>
              </div>
            </div>

            {/* Opened conversation: ALL files for this Case ID */}
            {isOpen && <div style={{ borderTop: `1px solid ${C.gray200}`, background: C.gray100, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, color: C.dark }}>📨 Documents received for {group.caseId}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => exportToAI(group)} style={{ background: C.gold, color: C.dark, border: "none", borderRadius: 7, padding: "9px 13px", fontWeight: 800, cursor: "pointer" }}>🤖 Export all to AI</button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {group.docs.slice().sort((a,b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0)).map(doc => (
                  <div key={doc.id} style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 9, padding: "11px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.dark }}>📄 {doc.fileName}</div>
                      <div style={{ fontSize: 11, color: C.gray500, marginTop: 3 }}>{doc.mimeType || "Document"} • {new Date(doc.uploadedAt).toLocaleString("en-IN")}</div>
                    </div>
                    <button onClick={() => downloadDataUrl(doc.dataUrl, doc.fileName)} style={{ background: C.white, border: `1px solid ${C.gray300}`, borderRadius: 7, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>⬇️ Download</button>
                  </div>
                ))}
              </div>
            </div>}
          </div>;
        })}
      </div>
    )}
  </div>;
}

// ─── ALL DOCUMENTS (ALL ROLES) ───────────────────────────────────────────────
function AllDocumentsPage({ session }) {
  const visibleCases=getVisibleCases(session);
  const receivedCaseIds=new Set(DB.get("received_documents").map(d=>d.caseId).filter(Boolean));
  const cases=session?.role === "Vendor Employee"
    ? [...visibleCases, ...DB.get("cases").filter(c=>receivedCaseIds.has(c.caseId) && !visibleCases.some(v=>v.caseId===c.caseId))]
    : visibleCases;
  const [caseId,setCaseId]=useState("");
  const [search,setSearch]=useState("");
  const [files,setFiles]=useState({});
  const [message,setMessage]=useState("");
  const matchedCases=cases.filter(c=>{const q=search.trim().toLowerCase(); return !q || String(c.caseId||"").toLowerCase().includes(q) || String(c.applicantName||"").toLowerCase().includes(q);});
  const selected=cases.find(c=>c.caseId===caseId);
  const canUploadLaterDocs=session?.role === "Vendor Employee";
  const upload=async type=>{const file=files[type]; if(!selected||!file){setMessage("Select a Case ID and a file first.");return;} const dataUrl=await fileToDataUrl(file); DB.insert("case_documents",{id:`doc_${Date.now()}_${Math.random()}`,caseId,type,fileName:file.name,mimeType:file.type,size:file.size,dataUrl,bankCode:selected.bankCode || session?.bankCode || "OTHERS",uploadedBy:session?.id,uploadedByName:session?.name||session?.username,uploadedAt:new Date().toISOString()}); syncCaseStatus(caseId); setMessage(`${DOC_TYPES[type].label} uploaded for ${caseId}.`); setFiles(p=>({...p,[type]:null}));};
  const docRows=caseId?caseDocuments(caseId):[];
  const findDoc=type=>docRows.find(d=>d.type===type);
  const downloadType=type=>{const d=findDoc(type); if(d?.dataUrl) downloadDataUrl(d.dataUrl,d.fileName); else setMessage(`${DOC_TYPES[type].label} is not uploaded for ${caseId}.`);};
  const downloadAll=()=>{const docs=docRows.filter(d=>d?.dataUrl); if(!docs.length){setMessage("No downloadable documents are available for this case yet.");return;} docs.forEach((d,i)=>setTimeout(()=>downloadDataUrl(d.dataUrl,d.fileName),i*180));};
  const downloadable=["SD","RF","SDR","NOI_RECEIPT","NOI","INDEX2","DEFACED_CHALLAN"];
  return <div><h2 style={{fontWeight:800,fontSize:22,color:C.dark,margin:"0 0 5px"}}>📂 All Documents</h2><p style={{color:C.gray500,fontSize:14,margin:"0 0 20px"}}>{canUploadLaterDocs?"Search the Case ID, upload the documents generated later, and download the complete case file.":"Search the Case ID and download any documents available for the case."}</p>
    <div style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:12,padding:20}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}><div><label style={labelStyle}>Search Case ID / Applicant Name</label><input style={inputStyle} value={search} onChange={e=>setSearch(e.target.value)} placeholder="e.g. ARS-2026-000001 or applicant name"/></div><div><label style={labelStyle}>Case ID</label><select style={inputStyle} value={caseId} onChange={e=>setCaseId(e.target.value)}><option value="">Select a case…</option>{matchedCases.map(c=><option key={c.caseId} value={c.caseId}>{c.caseId} — {c.applicantName||"Applicant"}</option>)}</select></div></div>
      {selected && <><div style={{marginTop:16,padding:12,background:C.gray100,borderRadius:8}}><strong>Case ID:</strong> {selected.caseId} &nbsp; | &nbsp; <strong>Bank:</strong> {selected.bankCode || inferBankCode(selected.bankName)} &nbsp; | &nbsp; <strong>Applicant:</strong> {selected.applicantName||"—"}</div>
        {canUploadLaterDocs&&<div style={{marginTop:18}}><SectionTitle>Vendor Uploads — Later Documents</SectionTitle><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>{["INDEX2","DEFACED_CHALLAN","NOI_RECEIPT"].map(type=><div key={type} style={{border:`1px solid ${C.gray200}`,borderRadius:10,padding:14}}><div style={{fontWeight:800,color:C.dark,marginBottom:8}}>{DOC_TYPES[type].icon} {DOC_TYPES[type].label}</div><input type="file" accept=".pdf,.jpg,.jpeg" onChange={e=>setFiles(p=>({...p,[type]:e.target.files?.[0]||null}))}/><button onClick={()=>upload(type)} style={{marginTop:9,background:C.gold,color:C.dark,border:"none",borderRadius:6,padding:"7px 11px",fontWeight:700,cursor:"pointer"}}>Upload</button></div>)}</div></div>}
        <div style={{marginTop:22}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><SectionTitle>Available Downloads</SectionTitle><button onClick={downloadAll} style={{padding:"8px 12px",background:C.dark,color:C.white,border:"none",borderRadius:7,fontWeight:800,cursor:"pointer"}}>⬇️ Download all available</button></div><div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>{downloadable.map(type=>{const d=findDoc(type); return <button key={type} disabled={!d} onClick={()=>downloadType(type)} style={{padding:10,border:`1px solid ${C.gray300}`,borderRadius:7,background:C.white,textAlign:"left",cursor:d?"pointer":"not-allowed",opacity:d?1:.5}}>⬇️ {DOC_TYPES[type].label} {d?`— ${d.fileName}`:"— Not uploaded"}</button>})}</div></div>
      </>}
      {message&&<div style={{marginTop:14,background:C.greenBg,color:C.green,padding:10,borderRadius:7,fontWeight:700}}>{message}</div>}
    </div></div>;
}
function PaymentTracking() {
  return (
    <div>
      <h2 style={{ fontWeight: 800, fontSize: 22, color: C.dark, marginBottom: 24 }}>Payment Tracking</h2>
      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, padding: "60px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💳</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: C.dark, marginBottom: 8 }}>Payment Tracking</div>
        <div style={{ color: C.gray500 }}>All payments are linked to their Case IDs via the Challan module.</div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [activeCaseData, setActiveCaseDataRaw] = useState(() => { try { return JSON.parse(sessionStorage.getItem("ark_active_case") || "null"); } catch { return null; } });
  const setActiveCaseData = data => { setActiveCaseDataRaw(data); try { sessionStorage.setItem("ark_active_case", JSON.stringify(data)); } catch {} };
  const mergeActiveCaseData = patch => setActiveCaseData({ ...(activeCaseData || {}), ...patch });
  const handleLogout = () => { if(session) DB.audit("LOGOUT",session.id,{username:session.username}); DB.session=null; sessionStorage.removeItem("ark_active_case"); setSession(null); setActiveCaseDataRaw(null); setPage("dashboard"); };
  if (!session) return <LoginPage onLogin={user => { setSession(user); setPage("dashboard"); }} />;
  const isBanker = session.role === "Banker";
  const canSee = key => !isBanker || session?.permissions?.[key] === true;
  const pages = {
    settings:<ProfileSettings session={session} onSessionChange={u=>setSession(u)}/>,
    dashboard:<Dashboard setPage={setPage} session={session}/>,
    cases:<Cases setPage={setPage} session={session} setActiveCaseData={setActiveCaseData}/>,
    calculator:<Calculator/>,
    uploadDocuments:session.role==="Banker"?<UploadDocumentsPage session={session} setActiveCaseData={setActiveCaseData} setPage={setPage}/>:<Dashboard setPage={setPage} session={session}/>,
    allDocuments:<AllDocumentsPage session={session}/>,
    receivedDocuments:canSee("receivedDocuments")?<ReceivedDocumentsPage session={session} setPage={setPage} setActiveCaseData={setActiveCaseData}/>:<Dashboard setPage={setPage} session={session}/>,
    aiDocuments:canSee("aiDocuments")?<DocumentUpload session={session} activeCaseData={activeCaseData} mergeActiveCaseData={mergeActiveCaseData} setPage={setPage}/>:<Dashboard setPage={setPage} session={session}/>,
    challan:canSee("challan")?<Challan session={session} activeCaseData={activeCaseData} mergeActiveCaseData={mergeActiveCaseData} setActiveCaseData={setActiveCaseData}/>:<Dashboard setPage={setPage} session={session}/>,
    noi:canSee("noi")?<NOI session={session} activeCaseData={activeCaseData} mergeActiveCaseData={mergeActiveCaseData}/>:<Dashboard setPage={setPage} session={session}/>,
    mis:canSee("mis")?<MIS session={session} activeCaseData={activeCaseData}/>:<Dashboard setPage={setPage} session={session}/>,
    payment:<PaymentTracking/>,
    admin:session.role==="Vendor Admin"?<AdminPanel session={session}/>:<Dashboard setPage={setPage} session={session}/>,
  };
  return <div style={{display:"flex",minHeight:"100vh",fontFamily:"'Inter','Segoe UI',sans-serif",background:C.pageBg}}><Sidebar active={page} setPage={setPage} session={session} onLogout={handleLogout}/><div style={{flex:1,padding:"32px 36px",overflowY:"auto",minWidth:0}}>{pages[page]||pages.dashboard}</div></div>;
}

