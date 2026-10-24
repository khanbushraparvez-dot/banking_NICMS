# ARSKEIL OCR deployment — point by point

This update is based on `ARSKEIL-OCR-FINAL-SYNONYM-FIX`. Keep the existing Supabase/Vercel configuration and application files.

## 1. Update the GitHub project
1. Download and extract this ZIP into a separate folder.
2. Open your existing local ARSKEIL repository folder used by GitHub Desktop.
3. Copy the extracted project files into that repository folder, replacing files with the same paths. Do not copy the whole extracted folder as a nested folder.
4. In GitHub Desktop, review the changed files, commit with message `Connect EasyOCR SL extraction`, then click **Push origin**.
5. Wait for Vercel's deployment to finish.

## 2. Host the OCR service persistently
The OCR service must run somewhere reachable over HTTPS. A laptop plus temporary Cloudflare Tunnel is only for temporary use, not a reliable production service.
1. Deploy the `ocr-service` folder using its included `Dockerfile` on a persistent Docker-capable hosting service with enough memory for EasyOCR.
2. Set `OCR_SERVICE_TOKEN` on that host to a long random secret (32+ characters). Do not put this secret in React/frontend files.
3. Ensure the host routes HTTPS requests to the container's port `7860`.
4. Copy the service's HTTPS base URL.

## 3. Configure Vercel
In Vercel → ARSKEIL project → Settings → Environment Variables, set:
- `OCR_SERVICE_URL` = the OCR service HTTPS base URL, without a trailing slash.
- `OCR_SERVICE_TOKEN` = the same secret used by the OCR service.

Apply the variables to Production, then redeploy the latest GitHub commit.

## 4. OCR field mapping
For a Sanction Letter, the API returns these fields:
- Applicant / borrower name
- Co-applicant / co-borrower name
- Loan / application number
- Sanctioned loan amount
- ROI / rate of interest
- Bank / lender
- Branch
- Property / security address

The selected document type from ARSKEIL is now passed to the OCR service instead of relying only on filename guessing. The extraction uses OCR plus text-label rules; it does not use a paid AI API.

## Important limits
- English OCR is configured. Marathi Index 2 OCR is not enabled/verified in this package.
- Do not treat extracted financial data as verified until a person reviews it. Different bank formats can produce missing or incorrect values.
- The service accepts up to 20 MB and 30 PDF pages, but Vercel's request limit can be lower because the file is base64 encoded. Keep uploaded PDFs small (around 3 MB or less) when going through the Vercel API.
- Keep the OCR token private. Do not use a public temporary tunnel for real borrower documents.
