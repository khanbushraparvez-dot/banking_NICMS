ARSKEIL SERVICES LLP — Rebuilt Deployment Package

This package is reconstructed from the latest ARSKEIL Settings/Branding build available in the project library, with the standalone OCR extraction module included under src/ocrExtraction.js.

Deployment:
1. GitHub: upload the contents of this folder.
2. Vercel: Framework Vite; Build Command npm run build; Output Directory dist.
3. Environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
4. Run ARS_PRODUCTION_MIGRATION.sql in Supabase if app_records/login_page_assets have not been created.

Do not put an OpenAI key in frontend files. OCR calls must go through a secure backend endpoint (/api/ocr/extract).
