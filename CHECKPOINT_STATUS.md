# ARSKEIL CP1 — Frontend Deployment Checkpoint

This checkpoint is intended as the safe frontend/demo deployment baseline.

## Included
- React + Vite application
- ARSKEIL login and application UI
- Local/demo mode when Supabase environment variables are absent
- Existing application pages and assets
- Supabase client wiring (optional until environment variables are supplied)
- Existing API files for MIS/OTP

## Build verification
The source was structurally inspected and the non-JSX JavaScript files passed `node --check`.
A complete Vite build could not be executed in the isolated test environment because npm package downloads timed out. Therefore this package is **not represented as a guaranteed successful build** until Vercel/another networked build environment runs `npm run build`.

## Important CP1 limitation
The AI/OCR screen remains part of the UI, but production OCR requires the secure backend endpoint described in `src/ocrExtraction.js`. Do not place an Anthropic/OpenAI secret in browser code.

## Vercel settings
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## Environment variables
Optional for CP1 demo mode:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not commit `.env` files or API secrets.


## Login policy update
- Removed demo/StackBlitz login accounts (including Maria/Jubbu/Bushra demo credentials).
- Vendor Admin login is restricted to the two approved official email addresses configured in the frontend.
- Passwords are NOT stored in the frontend; the two Admin accounts must be created in Supabase Auth during CP2.
