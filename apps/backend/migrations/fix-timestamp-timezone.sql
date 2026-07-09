-- Migration: Fix timestamp columns to use TIMESTAMPTZ for proper timezone handling
-- This fixes the "challenge expired" issue caused by timezone mismatches

-- Convert existing TIMESTAMP columns to TIMESTAMPTZ
-- This preserves the existing data while adding timezone information

ALTER TABLE users 
  ALTER COLUMN paper_trading_last_grant_at TYPE TIMESTAMPTZ USING paper_trading_last_grant_at AT TIME ZONE 'UTC';

ALTER TABLE users 
  ALTER COLUMN paper_trading_challenge_expires_at TYPE TIMESTAMPTZ USING paper_trading_challenge_expires_at AT TIME ZONE 'UTC';

ALTER TABLE users 
  ALTER COLUMN paper_trading_admin_override_at TYPE TIMESTAMPTZ USING paper_trading_admin_override_at AT TIME ZONE 'UTC';

ALTER TABLE users 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE users 
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN (
    'paper_trading_last_grant_at',
    'paper_trading_challenge_expires_at', 
    'paper_trading_admin_override_at',
    'created_at',
    'updated_at'
  );
