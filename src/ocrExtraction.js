/*
 * ARSKEIL OCR entry point.
 * The production AI Documents screen uses free browser-side OCR through browserOcr.js.
 * No OpenAI/Anthropic key is required and no document is sent to a paid AI API.
 */
export { ensureOcrLibraries, ocrFile } from "./browserOcr";
