# Read-Only Database Setup for Contributors

This guide explains how to set up a read-only database user that contributors can use to access real data without compromising security.

## Why Read-Only Access?

Contributors get:
- ✅ Real tokens from your database
- ✅ Real user data (without sensitive fields)
- ✅ Trading history and market data
- ✅ Full frontend functionality
- ❌ Cannot modify or delete data
- ❌ No access to API keys or private keys

## Step 1: Create Read-Only Database User

Connect to your production PostgreSQL database and run:

```sql
-- Create read-only user
CREATE USER readonly_contributor WITH PASSWORD 'your_secure_password_here';

-- Grant connect permission
GRANT CONNECT ON DATABASE gridlockdb TO readonly_contributor;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO readonly_contributor;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_contributor;

-- Grant SELECT on future tables (auto-grant)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO readonly_contributor;

-- Revoke any write permissions (just to be safe)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM readonly_contributor;
```

## Step 2: Filter Sensitive Data (Optional but Recommended)

Create views that exclude sensitive columns:

```sql
-- Create a safe view of users table (without sensitive data)
CREATE OR REPLACE VIEW users_safe AS
SELECT 
  id,
  wallet_address,
  username,
  created_at,
  updated_at,
  kyc_status,
  preferences
  -- Exclude: api_keys, private_keys, email, etc.
FROM users;

-- Grant access to the view
GRANT SELECT ON users_safe TO readonly_contributor;

-- Create safe view of api_keys table (without actual keys)
CREATE OR REPLACE VIEW api_keys_safe AS
SELECT 
  id,
  owner_name,
  description,
  tier,
  rate_limit_per_minute,
  status,
  created_at,
  usage_count,
  last_used_at
  -- Exclude: api_key_hash, api_key_salt
FROM api_keys;

GRANT SELECT ON api_keys_safe TO readonly_contributor;
```

## Step 3: Update Your Application Code (Optional)

If you created safe views, update your database helpers to use them in development mode:

```typescript
// apps/backend/postgres/users.ts
export async function getAllUsers(pool: Pool) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const tableName = isDevelopment ? 'users_safe' : 'users';
  
  const result = await pool.query(`SELECT * FROM ${tableName}`);
  return result.rows;
}
```

## Step 4: Get Connection String

Your read-only connection string will be:

```
postgresql://readonly_contributor:your_secure_password_here@your-db-host:5432/gridlockdb
```

**Important Security Notes:**
- Use a strong, unique password
- Consider using a different password than your main database user
- The host should be accessible from contributor machines (or use a proxy)
- Monitor usage to detect any abuse

## Step 5: Share with Contributors

Add to your `.env.example`:

```bash
# Read-Only Production Database (Recommended for Contributors)
DATABASE_URL=postgresql://readonly_contributor:password@your-db-host:5432/gridlockdb
```

Or create a separate `.env.contributor` file:

```bash
NODE_ENV=development
DATABASE_URL=postgresql://readonly_contributor:password@your-db-host:5432/gridlockdb
IRON_RELAY_API_KEY=sandbox_key_here
PRODUCTION_API_URL=https://dapp-mvp-boilerplate.onrender.com
```

## Step 6: Test the Setup

Test that the read-only user works correctly:

```bash
# Connect as readonly user
psql "postgresql://readonly_contributor:password@your-db-host:5432/gridlockdb"

# Try to read (should work)
SELECT * FROM tokens LIMIT 5;

# Try to write (should fail)
INSERT INTO tokens (symbol, name) VALUES ('TEST', 'Test Token');
-- ERROR: permission denied for table tokens
```

## Security Checklist

- [ ] Read-only user created with strong password
- [ ] User can only SELECT, not INSERT/UPDATE/DELETE
- [ ] Sensitive columns excluded via views (optional)
- [ ] Connection string shared securely (not in public repo)
- [ ] Database host accessible to contributors
- [ ] Monitoring set up for unusual activity
- [ ] Password rotation plan in place

## Alternative: Database Proxy

For even better security, consider using a database proxy service like:
- **Supabase** - Provides read-only API access
- **Hasura** - GraphQL API with fine-grained permissions
- **PostgREST** - REST API for PostgreSQL

This way, you don't expose the database directly at all!

## Troubleshooting

**Contributors can't connect:**
- Check firewall rules allow connections from their IPs
- Verify the connection string is correct
- Check if database host is publicly accessible

**Contributors see permission errors:**
- Verify GRANT statements were run correctly
- Check if tables were created after granting permissions
- Re-run ALTER DEFAULT PRIVILEGES command

**Too much data exposed:**
- Create more restrictive views
- Use row-level security (RLS) in PostgreSQL
- Consider a proxy API instead

## Monitoring

Monitor the readonly user's activity:

```sql
-- Check active connections
SELECT * FROM pg_stat_activity 
WHERE usename = 'readonly_contributor';

-- Check query statistics
SELECT * FROM pg_stat_statements 
WHERE userid = (SELECT oid FROM pg_roles WHERE rolname = 'readonly_contributor');
```

## Revoking Access

If needed, revoke access:

```sql
-- Revoke all permissions
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM readonly_contributor;
REVOKE CONNECT ON DATABASE gridlockdb FROM readonly_contributor;

-- Drop user
DROP USER readonly_contributor;
```
