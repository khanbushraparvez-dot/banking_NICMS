# ARSKEIL OCR.space setup (SL demo)

1. Create a free OCR.space API key at https://ocr.space/ocrapi (Get your free API key).
2. In Vercel > Project > Settings > Environment Variables, add `OCR_SPACE_API_KEY` with the key value for Production (and Preview if needed).
3. Redeploy the Vercel project. Do not put the key in frontend files or GitHub.
4. Test with a redacted sample SL image/PDF smaller than 1 MB. The free API currently lists a 1 MB file limit and a 3-page PDF limit.

This integration uses OCR.space to read text, then rule-based extraction for the eight SL fields. It is not a generative AI model, and field extraction is not guaranteed. Review the extracted values manually. Do not send real borrower documents unless your organisation approves the third-party processing and privacy terms.

If a file exceeds 1 MB, the endpoint returns a clear size-limit error. Compress it or use a clear JPG/PNG under 1 MB for the demo.
