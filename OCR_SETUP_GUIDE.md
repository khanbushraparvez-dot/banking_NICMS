# ARSKEIL OCR – Setup and Test Guide

## What changed (OCR only)

- Sanction Letter extraction is now bank/lender independent. It looks for common labels and label/value pairs instead of relying on Mahindra-specific names.
- Required SL fields only: applicant/borrower, co-applicant/co-borrower, loan/application number, sanctioned amount, ROI, bank/lender, branch, and property/security address.
- Property address extraction stops before customer/residential/correspondence address labels so it does not intentionally substitute the customer's home address for the mortgaged property.
- PDF text layers are read first when usable; scanned PDFs and images are rendered and OCR'd.
- PaddleOCR uses `en` and the Marathi-capable `mr` model. The previous `devanagari` language setting was incorrect for this pinned PaddleOCR 2.10 setup.
- Existing `SanctionLetter` keys (`applicantName`, `coApplicantNames`, `applicationNumber`, `loanAmountSanctioned`, `rateOfInterest`, `bankName`, `branchName`, `propertyAddress`) are retained for the current Case ID → Challan → NOI → MIS flow.
- The AI Extraction screen displays only the eight required SL fields. Index 2, PAN, Aadhaar, login, roles, approval workflow, and the rest of the UI are not intentionally redesigned.

## Important hosting note

PaddleOCR itself is open-source software, but running the Python service online is a separate hosting requirement. Hugging Face's current documentation says Docker/Gradio Spaces use compute and creating them requires a paid plan, even though CPU Basic compute is listed at no hourly cost. Therefore, do not assume a new Docker Space is available on every free account. See: https://huggingface.co/docs/hub/spaces-overview

For a no-hosting-fee demonstration, run the OCR service on your Windows computer and expose it temporarily with a Cloudflare Quick Tunnel. Your computer and both terminals must stay running while the Vercel app uses OCR. The tunnel URL changes when restarted, so update Vercel if it changes.

## Option A – Free temporary demo using your Windows computer

### 1. Install Python

Install 64-bit Python 3.10 from https://www.python.org/downloads/release/python-31011/ if it is not already installed. During installation, select **Add Python to PATH**.

### 2. Start the OCR service

1. Extract the project ZIP on your computer.
2. Open PowerShell in the extracted project folder, then enter the `ocr-service` folder. Example (adjust the path to where you extracted the ZIP):

   ```powershell
   cd "$HOME\Desktop\ARSKEIL-OCR-OPEN-SOURCE-IMPROVED\ocr-service"
   ```

3. Create and activate a virtual environment:

   ```powershell
   py -3.10 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

   The first install/model start can take several minutes and downloads OCR model files. If `py -3.10` is not recognized, install Python 3.10 first.

4. Set a private token in the same PowerShell window. Use a long random string; do not share it in chat or screenshots:

   ```powershell
   $env:OCR_SERVICE_TOKEN = "REPLACE_WITH_A_LONG_RANDOM_SECRET"
   $env:ALLOWED_ORIGINS = "*"
   python -m uvicorn app:app --host 0.0.0.0 --port 7860
   ```

5. Keep this window open. In a browser on your computer, open `http://127.0.0.1:7860/health`. It should return JSON with `"ok": true`. Check `"marathiModelReady": true` if Marathi Index 2 OCR is required.

### 3. Create a temporary HTTPS URL

1. Download and install `cloudflared` from Cloudflare's official guide: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Open a **second** PowerShell window and run:

   ```powershell
   cloudflared tunnel --url http://localhost:7860
   ```

3. Copy the HTTPS URL ending in `.trycloudflare.com` shown in the terminal. Keep this terminal open too. Check `https://YOUR-TUNNEL.trycloudflare.com/health` in your browser; it should return `"ok": true`.

### 4. Connect the existing Vercel app

In Vercel → your existing ARSKEIL project → **Settings → Environment Variables**, add or update:

- `OCR_SERVICE_URL` = the HTTPS tunnel base URL only, e.g. `https://example.trycloudflare.com` (no `/extract` and no trailing slash).
- `OCR_SERVICE_TOKEN` = exactly the same secret used in PowerShell.

Do **not** use the `VITE_` prefix for either variable. Apply to Production (and Preview if you test there), save, then redeploy the existing project. Do not change Supabase keys or login settings for OCR.

### 5. Test end to end

1. Open the deployed app and go to AI Extraction.
2. Upload one readable SL PDF. Confirm the detected type says `SanctionLetter` and review all eight fields.
3. Confirm **Property / Security Address** is the mortgaged property, not the customer's home address.
4. Save against the correct Case ID and check that the existing Challan/NOI/MIS flow receives the saved case data.
5. Test a second lender's SL and one Index 2 PDF. Index 2 Marathi OCR requires `marathiModelReady: true`.
6. If a field is missing or wrong, correct it in review before saving. Do not treat OCR output as verified legal/financial data without review.

## Option B – Hugging Face Docker Space (only if your account can create it)

1. Create a Docker Space at https://huggingface.co/spaces.
2. Upload the **contents** of the ZIP's `ocr-service` folder to the Space repository root. The root must contain `Dockerfile`, `requirements.txt`, and `app.py`.
3. In Space Settings → Variables and secrets, add secret `OCR_SERVICE_TOKEN` with a long random value. Optionally add `ALLOWED_ORIGINS`.
4. Wait for the Space to build and start. Open `https://YOUR-SPACE-NAME.hf.space/health` and confirm `"ok": true` and (for Index 2) `"marathiModelReady": true`.
5. In Vercel, set `OCR_SERVICE_URL` to `https://YOUR-SPACE-NAME.hf.space` and `OCR_SERVICE_TOKEN` to the same secret, then redeploy.
6. If Hugging Face asks for a paid plan to create the Docker Space, use Option A for the demo or choose another Python host; the OCR library itself remains open source.

## Common errors

- **Vercel says OCR service is not configured:** check both Vercel variables are present without `VITE_`, then redeploy.
- **502 / could not reach service:** make sure the local Uvicorn terminal is still running and the tunnel URL is current.
- **401 Unauthorized:** the service token in Vercel must exactly match `OCR_SERVICE_TOKEN` on the service.
- **`marathiModelReady: false`:** the Marathi model did not load. Review the service logs and retry the installation before testing Marathi Index 2.
- **Low/incorrect fields:** use an upright, high-resolution PDF; verify the original OCR text and correct values in review. No OCR engine can guarantee every bank's scan/layout is perfect without representative testing.
- **The OCR service sleeps / takes time to start:** the first request may take longer while the service starts or downloads models.

## Extraction rules for Sanction Letters

Only these eight fields are required. The parser uses label variations, including:

- Applicant: `Name of Applicant`, `Applicant Name`, `Borrower Name`, `Customer Name`.
- Co-applicant: `Co-applicant Name`, `Co-borrower Name`, `Joint Applicant`.
- Loan/application number: `Application No`, `Application ID`, `Loan Account No`, `Loan Agreement No`, `Proposal No`, `FinnOne ID`, `LAN`.
- Sanction amount: `Amount Sanctioned`, `Sanctioned Amount`, `Loan Amount Sanctioned`, `Approved Loan Amount`. It does not use a requested amount or property value as a fallback.
- ROI: `Rate of Interest`, `ROI`, `Interest Rate`, `Applicable Rate`.
- Bank and branch: labeled values first, then general lender-name recognition from document text.
- Property address: `Details of Property`, `Property Address`, `Security Address`, `Property Offered as Security`, `Collateral Address`. Capture stops at customer/residential/correspondence address labels.

This is bank-independent heuristic extraction, not a guarantee of perfect results. Always review the eight fields before using them for a case.
