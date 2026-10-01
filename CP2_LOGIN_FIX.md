# CP2 Login Fix

Fixed the production Supabase login role mapping so `vendor_admin`, `vendor_employee`, and `banker` values from `public.profiles` are normalized to the UI's existing role names.

This keeps the existing design and login flow unchanged.
