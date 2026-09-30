# Bank Selection Update

The prototype now starts with a bank gateway:

1. Select MRHFL / MMFSL / AFL / Others.
2. Draw that bank's 3x3 access pattern.
3. Select the user role.
4. Enter the existing credentials (or Admin access code).
5. The selected bank is stored in the session and copied to new cases/documents.
6. AI extraction receives the selected bank and uses bank-specific extraction rules.

## Prototype patterns for testing

- MRHFL: 1 → 2 → 5 → 8 → 9
- MMFSL: 1 → 4 → 5 → 6 → 9
- AFL: 3 → 2 → 5 → 8 → 7
- Others: 1 → 5 → 9 → 6 → 3

The 3x3 nodes are numbered left-to-right, top-to-bottom:

1 2 3
4 5 6
7 8 9

## Role visibility

### Admin
- All existing tabs
- Admin Panel

### Employee
- All normal tabs
- No Admin Panel

### Operations / Sales Manager
- Dashboard
- Cases
- Calculator
- Upload Documents
- All Documents
- Payment Tracking
- Hidden and route-protected: Received Documents, AI Documents, Challan, Notice of Intimation, MIS Report, Admin Panel

## Database note

The current ZIP is still localStorage-backed. `BANK_DATABASE_MIGRATION.sql` is included for the later Supabase/PostgreSQL stage.
