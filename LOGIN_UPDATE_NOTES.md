# Login Page Update – 09 Sep 2026

This version keeps the existing loan-processing pages and changes the authentication entry flow.

## New login flow
- Login uses **Official Email + Password** only.
- Email must belong to a verified approved user.
- Forgot Password: email → OTP → new password.
- Create New User: choose Vendor Admin or Vendor Employee.
- Bank list: Mahindra Rural Housing Finance Ltd, Mahindra and Mahindra Financial Services Ltd, Axis Finance Ltd, Niwas Housing Finance Ltd, Tata Capital Housing Finance Ltd, OTHERS.
- Vertical list: Home Loan, Loan Against Property, Working Capital, Overdraft / Cash Credit.
- Branch + official email + OTP verification + password.
- Vendor Employee requests require Admin approval.
- Vendor Admin is created as an approved vendor account after email verification.

## Email OTP limitation in this prototype
The current project still uses browser localStorage and does not have a server/email provider connected. Therefore the OTP is generated locally and printed in the browser console for testing. It is **not actually emailed** yet.

For real OTP delivery, connect this flow to Supabase Auth/Edge Functions or another transactional email service before production use. Do not put a private email-service secret in frontend code.

## Email domains
- MRHFL: @mahindrafinance.com
- MMFSL: @mahindrafinance.com (set provisionally; change if the bank provides a different official domain)
- AFL: @axisfinance.in
- NIWAS: @niwashfc.com
- TATA: @tatacapital.com
- Vendor: @arskeil.in
- OTHERS: no forced domain; use the bank's official domain if configured later.

## Important
The exact bank pattern used by the older prototype login has been removed from the new login screen. Bank selection remains available in registration and is stored with the account/case for bank-specific extraction.
