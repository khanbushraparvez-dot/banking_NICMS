-- OPTIONAL: Supabase/PostgreSQL migration for the bank segregation work.
-- IMPORTANT: The current prototype still uses browser localStorage as its working database.
-- This SQL is for the Supabase phase; running it is NOT required for the current ZIP to run.

ALTER TABLE IF EXISTS cases
  ADD COLUMN IF NOT EXISTS bank_code text;

-- Backfill older cases where bank_name already exists.
UPDATE cases
SET bank_code = CASE
  WHEN upper(coalesce(bank_name, '')) LIKE '%MRHFL%'
    OR upper(coalesce(bank_name, '')) LIKE '%MAHINDRA RURAL HOUSING%' THEN 'MRHFL'
  WHEN upper(coalesce(bank_name, '')) LIKE '%MMFSL%'
    OR upper(coalesce(bank_name, '')) LIKE '%MAHINDRA & MAHINDRA FINANCIAL%'
    OR upper(coalesce(bank_name, '')) LIKE '%MAHINDRA AND MAHINDRA FINANCIAL%' THEN 'MMFSL'
  WHEN upper(coalesce(bank_name, '')) LIKE '%AFL%'
    OR upper(coalesce(bank_name, '')) LIKE '%AXIS FINANCE%' THEN 'AFL'
  ELSE 'OTHERS'
END
WHERE bank_code IS NULL OR bank_code = '';

CREATE INDEX IF NOT EXISTS idx_cases_bank_code ON cases(bank_code);

-- Optional future table: move bank configuration/patterns out of frontend code.
-- Store a salted/hashed pattern representation in production, not the raw pattern.
CREATE TABLE IF NOT EXISTS bank_configs (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  full_name text,
  pattern_hash text,
  active boolean NOT NULL DEFAULT true,
  extraction_rules text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bank_configs (code, display_name, full_name, active)
VALUES
  ('MRHFL', 'MRHFL', 'Mahindra Rural Housing Finance', true),
  ('MMFSL', 'MMFSL', 'MMFSL', true),
  ('AFL', 'AFL', 'Axis Finance Limited', true),
  ('OTHERS', 'Others', 'Other / New Bank', true)
ON CONFLICT (code) DO NOTHING;
