# Settings + Login Branding Update

This update preserves the existing ARSKEIL layout, colours, spacing and overall theme.

## Added
- Vendor Admin-only login-page branding controls in Settings.
- Editable login-page logo image.
- Editable Secure Login image.
- Editable Role Based Access image.
- Editable NOI Lifecycle Management image.
- Image preview + Change image control.
- Production persistence through Supabase Storage + `login_page_assets`.
- Public read access for login-page images; upload/update restricted to Vendor Admin.
- Profile settings expanded with profile picture, account details, password update, notifications, security and system information.
- Notification preferences stored in `profiles.notification_preferences`.
- Login page now loads saved branding assets without changing the existing visual layout.
- Login header profile-picture circle remains in the header beside the logo.

## Supabase setup
Run `ARS_PRODUCTION_MIGRATION.sql` in the Supabase SQL editor before testing production image uploads.

## Important
- StackBlitz/demo mode uses browser storage only for demo asset persistence when Supabase is not configured.
- Production mode uses Supabase Storage and database records; production login branding does not depend on localStorage.
- OCR work is intentionally not changed in this update and will be handled separately.
