# Developer API System - Security & Usage Guide

## Overview

This document provides comprehensive information about the Developer API system, including security features, best practices, and usage guidelines.

## Security Features

### 1. **API Key Authentication**
- Keys use SHA-256 hashing with unique salts
- Raw keys are never stored in the database
- Keys are shown only once upon creation
- Format: `<uuid>.<64-char-secret>`
- **Optional Authentication**: API keys are optional for requests from allowed CORS origins (your frontend). External developers must use API keys.

### 2. **Endpoint Authorization**
- Each key can be restricted to specific endpoints
- Middleware validates endpoint access on every request
- Supports both exact match and prefix matching
- Empty allowed_endpoints array = access to all developer endpoints

### 3. **Rate Limiting**
- Redis-backed with in-memory fallback
- Configurable per-key limits (default: 120 req/min)
- Rate limit headers included in all responses:
  - `X-RateLimit-Limit`: Max requests per window
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Window duration in seconds

### 4. **Admin Authentication**
- Wallet signature verification required for all admin operations
- Timestamp validation prevents replay attacks (5-minute tolerance)
- Validates action, wallet address, and timestamp in signed payload
- Admin wallet address must match `ADMIN_WALLET_ADDRESS` env var

### 5. **Error Message Sanitization**
- Generic "Unauthorized" messages prevent information leakage
- Detailed errors only in admin responses
- Consistent error format across all endpoints

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
ADMIN_WALLET_ADDRESS=0x...  # Admin wallet for key management

# Optional
ADMIN_API_ACTION=ADMIN_API_KEY_MANAGEMENT  # Action string for signatures
ADMIN_TIMESTAMP_TOLERANCE_SECONDS=300      # Replay attack window (default: 5 min)
DEVELOPER_API_RATE_LIMIT_PER_MINUTE=120    # Default rate limit
DEVELOPER_API_RATE_LIMIT_WINDOW_SECONDS=60 # Rate limit window
```

## API Endpoints

### Protected Endpoints (Require API Key)
- `/api/binance` - Binance pricing data
- `/api/coinbase` - Coinbase pricing data
- `/api/coinranking` - Coinranking data
- `/api/1inch` - 1inch token data
- `/api/klines` - Candlestick/kline data
- `/api/oracle` - Oracle pricing data
- `/api/pyth` - Pyth oracle data
- `/api/aggregator` - Aggregated price data

### Admin Endpoints (Require Admin Signature)
- `POST /api/api-keys` - Create new API key
- `GET /api/api-keys` - List all API keys
- `GET /api/api-keys/:id` - Get specific API key
- `PATCH /api/api-keys/:id` - Update API key (status, endpoints, rate limit)

## Usage Examples

### 1. Using API Keys (Developers)

**With x-api-key header:**
```bash
curl -H "x-api-key: YOUR_API_KEY" \
  https://api.example.com/api/binance/prices
```

**With Authorization header:**
```bash
curl -H "Authorization: ApiKey YOUR_API_KEY" \
  https://api.example.com/api/coinbase/prices
```

**JavaScript/TypeScript:**
```typescript
const response = await fetch('https://api.example.com/api/oracle/latest', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
});

const data = await response.json();
```

### 2. Admin Operations

**Creating an API Key:**
```typescript
// 1. Sign the message with admin wallet
const payload = {
  action: "ADMIN_API_KEY_MANAGEMENT",
  wallet_address: adminAddress.toLowerCase(),
  timestamp: Math.floor(Date.now() / 1000)
};
const message = JSON.stringify(payload);
const signature = await signMessage({ message });

// 2. Send request
const response = await fetch('https://api.example.com/api/api-keys', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-wallet-address': adminAddress,
    'x-admin-message': message,
    'x-admin-signature': signature
  },
  body: JSON.stringify({
    owner_name: 'Acme Corp',
    owner_email: 'dev@acme.com',
    description: 'Production API access',
    allowed_endpoints: ['/api/binance', '/api/coinbase'],
    rate_limit_per_minute: 200
  })
});

const result = await response.json();
// result.data.raw_api_key contains the key - save it now!
```

## Security Best Practices

### For Developers Using API Keys

1. **Never commit API keys to version control**
   - Use environment variables
   - Add `.env` to `.gitignore`
   - Use secret management services in production

2. **Rotate keys regularly**
   - Request new keys periodically
   - Update applications before revoking old keys
   - Monitor usage for anomalies

3. **Use HTTPS only**
   - Never send API keys over unencrypted connections
   - Validate SSL certificates

4. **Implement proper error handling**
   - Handle 401, 403, 429 status codes gracefully
   - Implement exponential backoff for rate limits
   - Log errors for debugging

5. **Monitor rate limits**
   - Check `X-RateLimit-*` headers
   - Implement client-side rate limiting
   - Cache responses when appropriate

### For Administrators

1. **Secure admin wallet**
   - Use hardware wallet for production
   - Never share private keys
   - Implement multi-sig if possible

2. **Review key requests carefully**
   - Verify requester identity
   - Set appropriate endpoint restrictions
   - Use conservative rate limits initially

3. **Monitor API usage**
   - Review usage_count and last_used_at regularly
   - Investigate unusual patterns
   - Revoke suspicious keys immediately

4. **Regular audits**
   - Review active keys quarterly
   - Revoke unused keys
   - Update rate limits based on usage

5. **Backup and recovery**
   - Maintain secure backups of database
   - Document key issuance procedures
   - Have revocation process ready

## Database Schema

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name VARCHAR(128),
  owner_email VARCHAR(255),
  description TEXT,
  api_key_salt TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  allowed_endpoints JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  rate_limit_per_minute INTEGER DEFAULT 120,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0
);

CREATE INDEX idx_api_keys_hash ON api_keys(api_key_hash);
CREATE INDEX idx_api_keys_status ON api_keys(status);
```

## Error Codes

| Status Code | Meaning | Action |
|------------|---------|--------|
| 401 | Unauthorized | Check API key validity |
| 403 | Forbidden | Endpoint not authorized for your key |
| 429 | Too Many Requests | Wait for rate limit reset |
| 500 | Internal Server Error | Contact support |

## Rate Limit Response Headers

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 60
```

## Troubleshooting

### "Unauthorized" Error
- Verify API key is correct
- Check key status (not revoked)
- Ensure proper header format

### "Access denied: This endpoint is not authorized"
- Check allowed_endpoints for your key
- Contact admin to update permissions

### "Rate limit exceeded"
- Wait for window to reset
- Check X-RateLimit-Reset header
- Consider requesting higher limit

### Admin: "Request timestamp expired"
- Check system clock synchronization
- Ensure timestamp is current (within 5 minutes)
- Regenerate signature with fresh timestamp

## Future Enhancements

Planned improvements for future releases:

1. **IP Whitelisting** - Restrict keys to specific IP ranges
2. **Key Expiration** - Automatic expiration with renewal flow
3. **Usage Analytics** - Detailed request logging and analytics dashboard
4. **Webhook Notifications** - Alerts for suspicious activity
5. **Self-Service Portal** - Developer request workflow
6. **API Documentation** - OpenAPI/Swagger specification
7. **Sandbox Keys** - Limited test keys for development

## Support

For issues or questions:
- Review this documentation
- Check the developer portal at `/developer`
- Contact the admin team for key-related issues

## Changelog

### v1.1.0 (Current)
- ✅ Fixed double `/api` path bug in AdminKeyManager
- ✅ Implemented endpoint authorization checking
- ✅ Added timestamp validation for replay attack prevention
- ✅ Improved error messages (sanitized for security)
- ✅ Added comprehensive rate limit headers
- ✅ Enhanced developer documentation

### v1.0.0
- Initial release with basic API key authentication
- Admin dashboard for key management
- Rate limiting with Redis support
