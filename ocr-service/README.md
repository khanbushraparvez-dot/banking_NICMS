# ARSKEIL Open-Source OCR service (PaddleOCR)

This service replaces the browser call to a paid AI API with PaddleOCR, an open-source OCR engine. The existing Vercel app remains the frontend. A small Vercel API proxy keeps the service token out of browser code.

## Deploy the free OCR service
1. Create a Hugging Face Space with **Docker** SDK (CPU Basic is free but can be slow/sleep).
2. Upload the files in this folder to the Space repository.
3. In Space Settings → Variables and secrets, add `OCR_SERVICE_TOKEN` with a long random secret. Add `ALLOWED_ORIGINS` with your Vercel domain (for example `https://your-project.vercel.app`).
4. Wait for the Space to build, then test its `/health` endpoint.
5. In Vercel project settings → Environment Variables, set `OCR_SERVICE_URL` to the Space base URL and `OCR_SERVICE_TOKEN` to the same secret. Redeploy the Vercel app.

## Notes
- No paid generative-AI API key is used.
- PaddleOCR reads text; the included field mapper uses labels/patterns. Scanned documents with unusual layouts must be validated and extraction rules may need refinement.
- The service processes documents in memory and does not intentionally store them.
- Test with redacted samples first. The service token is enforced by the API; do not expose it in `VITE_` variables.
