# Database Migrations

This directory contains SQL migration scripts for the database.

## How to Apply Migrations

### Option 1: Using psql (Recommended)

If you have direct access to your PostgreSQL database:

```bash
psql -h <host> -U <username> -d <database> -f fix-timestamp-timezone.sql
```

For example, if using a local database:
```bash
psql -U postgres -d your_database_name -f fix-timestamp-timezone.sql
```

### Option 2: Using a PostgreSQL Client

1. Connect to your database using a tool like pgAdmin, DBeaver, or TablePlus
2. Open the `fix-timestamp-timezone.sql` file
3. Execute the SQL statements

### Option 3: Programmatically (if needed)

You can also run this migration from Node.js:

```javascript
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    // your database config
  });
  
  const sql = fs.readFileSync(
    path.join(__dirname, 'fix-timestamp-timezone.sql'),
    'utf8'
  );
  
  await pool.query(sql);
  console.log('Migration completed successfully');
  await pool.end();
}

runMigration();
```

## Current Migrations

### fix-timestamp-timezone.sql

**Purpose:** Fixes the "challenge expired" error in the paper trading faucet.

**Issue:** The database was using `TIMESTAMP` columns which don't store timezone information. This caused timezone mismatches when comparing expiration times, leading to challenges being incorrectly marked as expired.

**Solution:** Converts all timestamp columns to `TIMESTAMPTZ` (timestamp with timezone) to ensure proper timezone handling across different server configurations.

**Affected Columns:**
- `paper_trading_last_grant_at`
- `paper_trading_challenge_expires_at`
- `paper_trading_admin_override_at`
- `created_at`
- `updated_at`

**Safe to run:** Yes, this migration preserves all existing data and is idempotent (safe to run multiple times).
