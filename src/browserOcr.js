/* Free browser-side OCR helpers. No paid AI key is required. */

const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

function loadScript(src, id) {
  return new Promise((resolve, reject) => {
    if (id && document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    if (id) s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Unable to load OCR library: ${src}`));
    document.head.appendChild(s);
  });
}

export async function ensureOcrLibraries() {
  if (!window.Tesseract) await loadScript(TESSERACT_SRC, "arskeil-tesseract");
  if (!window.pdfjsLib) await loadScript(PDFJS_SRC, "arskeil-pdfjs");
  if (window.pdfjsLib?.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  if (!window.Tesseract) throw new Error("OCR engine could not be loaded. Check the browser connection and refresh once.");
  if (!window.pdfjsLib) throw new Error("PDF reader could not be loaded. Check the browser connection and refresh once.");
}

function canvasFor(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

async function recognize(source, lang, onProgress) {
  const result = await window.Tesseract.recognize(source, lang, {
    logger: m => {
      if (typeof onProgress === "function" && m?.status) onProgress(m);
    },
  });
  return result?.data?.text || "";
}

async function pdfTextLayer(pdf, maxPages = 40) {
  const chunks = [];
  const count = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = (tc.items || []).map(x => x.str || "").join(" ").trim();
    if (text) chunks.push(`\n--- PAGE ${i} ---\n${text}`);
  }
  return chunks.join("\n").trim();
}

export async function ocrFile(file, { language = "eng", maxPages = 30, onProgress } = {}) {
  if (!(file instanceof File)) throw new Error("Invalid document file.");
  await ensureOcrLibraries();

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    let text = "";
    try { text = await recognize(file, language, onProgress); }
    catch (e) {
      if (language !== "eng") text = await recognize(file, "eng", onProgress);
      else throw e;
    }
    return { text: text.trim(), pages: 1, method: "tesseract-image" };
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  let embedded = "";
  try { embedded = await pdfTextLayer(pdf, maxPages); } catch (_) {}

  // Digital PDFs often have a perfect text layer. Use it when it is substantial.
  if (embedded.replace(/\s/g, "").length >= 80) {
    return { text: embedded.trim(), pages: pageCount, method: "pdf-text" };
  }

  const chunks = [];
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.({ status: "pdf", page: i, total: pageCount, progress: i / pageCount });
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.7 });
    const canvas = canvasFor(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: ctx, viewport }).promise;
    let text = "";
    try { text = await recognize(canvas, language, onProgress); }
    catch (e) {
      if (language !== "eng") text = await recognize(canvas, "eng", onProgress);
      else throw e;
    }
    chunks.push(`\n--- PAGE ${i} ---\n${text}`);
    canvas.width = 1; canvas.height = 1;
  }
  return { text: chunks.join("\n").trim(), pages: pageCount, method: "tesseract-pdf" };
}
