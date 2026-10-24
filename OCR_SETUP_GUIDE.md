# ARSKEIL OCR Service — Deployment Guide

This service provides local/open-source OCR for the ARSKEIL app using EasyOCR and FastAPI. The API honors the document type selected in the app and maps Sanction Letters into the eight requested SL fields.

## Important capability limits

- English OCR is configured. Marathi Index 2 extraction is **not enabled or verified** by this build.
- The eight SL fields are mapped using OCR text and label-based rules. Different bank templates, skewed/low-quality scans, handwritten text, and ambiguous labels can cause missing or incorrect values. Users must review extracted values before relying on them for loan processing.
- A successful local OCR sample is not a guarantee of accuracy on every document.
- Do not use a temporary public tunnel as a permanent production hosting solution. Use a secured, persistent HTTPS host for the OCR service before handling real borrower documents.

## Deploy the service on a Docker-compatible host

1. Deploy this `ocr-service` folder as a Docker web service on a host that supports persistent HTTPS endpoints and sufficient RAM/CPU for EasyOCR.
2. Set these environment variables on that host:
   - `OCR_SERVICE_TOKEN`: a long, random secret (at least 32 characters).
   - `ALLOWED_ORIGINS`: your ARSKEIL app origin, if browser calls are made directly. The current Vercel API proxy calls the service server-to-server.
3. Expose port `7860` or configure the host to route its HTTPS endpoint to the container port.
4. Set `OCR_SERVICE_URL` in Vercel to the service's HTTPS base URL (no trailing slash).
5. Set `OCR_SERVICE_TOKEN` in Vercel to the exact same secret.
6. Redeploy the Vercel app after the updated project is pushed to its connected GitHub repository.
7. First startup downloads the EasyOCR English model; allow extra startup time and enough disk space.

## Local Windows setup (for development or temporary use)

Open Command Prompt inside this folder and run:

```bat
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
set OCR_SERVICE_TOKEN=REPLACE_WITH_A_LONG_RANDOM_SECRET
set ALLOWED_ORIGINS=*
.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 7860
```

Open `http://127.0.0.1:7860/health`. A temporary Cloudflare Tunnel can connect Vercel during development, but its URL changes and the computer/service must stay running. Do not treat that as a permanent production deployment.

## File limits and privacy

- Maximum accepted upload size in the OCR service: 20 MB.
- PDF processing is limited to 30 pages per request.
- Avoid uploading real customer documents to a temporary tunnel. Keep the service token private and never place it in frontend code.
- The service does not guarantee the legal or financial correctness of extracted data. Review all eight fields before use.
