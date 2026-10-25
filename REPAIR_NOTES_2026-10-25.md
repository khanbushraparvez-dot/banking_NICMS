# ARSKEIL targeted repair notes — 25 October 2026

Base used: `ARSKEIL-OCRSPACE-SL-DEMO-AUDITED-20261025.zip` (existing project preserved).

## Targeted changes only
- Challan and NOI input controls now use stable React component definitions so rerenders do not unmount the active field after each keystroke.
- MIS input/select controls use stable components for continuous typing.
- MIS rows now read/write through the project's existing `app_records` table using `table_name = mis_rows`, matching the app's established persistence model instead of assuming a separate `mis_rows` SQL table exists.
- Sanction-letter property extraction now recognises `Details of Property`, `Property Address`, `Security`, `Security Address`, `Property offered as Security`, and related variants; it supports label-only headings followed by address lines and avoids treating borrower correspondence/residential address as the property address.
- Login Settings, Help, and Terms pages now contain fuller professional operational guidance. The signed-in Settings information section also includes privacy, OCR review, MIS sync and support guidance.
- No redesign or unrelated role/login/workflow changes were intentionally made.

## Checks performed
- Python syntax check: `python -m py_compile ocr-service/app.py` — passed.
- Property extraction examples covering comma-separated headings, a `Security:` label followed by address lines, and `Details of the Property ...` — passed.
- ZIP archive integrity check — performed after packaging.

## Environment-dependent checks not possible here
- A full Vite production build could not be run because npm dependencies could not be installed in this environment (package download/install timed out).
- Live Supabase persistence/realtime and external OneDrive/Excel synchronisation cannot be verified without the deployed project's live environment credentials/configuration. Excel sync still requires `MIS_EXCEL_WEBHOOK_URL` in Vercel.
- OCR results depend on the configured OCR service and scan quality; review extracted values against the original document before saving.
