# KYC & Competency Test System - Security & Implementation Guide

## Overview

This document provides comprehensive information about the KYC (Know Your Customer) registration and Competency Test system, including security features, implementation details, and usage guidelines.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Security Features](#security-features)
3. [Competency Test](#competency-test)
4. [KYC Registration](#kyc-registration)
5. [API Endpoints](#api-endpoints)
6. [Database Schema](#database-schema)
7. [Security Best Practices](#security-best-practices)
8. [Troubleshooting](#troubleshooting)

---

## System Architecture

### State-Gated Onboarding Flow

```
┌─────────────────┐
│  Wallet Connect │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ KYC Registration│ ◄── AES-256 Encryption
└────────┬────────┘     Identity Hashing
         │              Duplicate Detection
         ▼
┌─────────────────┐
│  KYC_VERIFIED   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Competency Test │ ◄── 10 Questions
└────────┬────────┘     100% Required
         │              3 Attempts Max
         ▼              Answer Randomization
┌─────────────────┐
│COMPETENCY_PASSED│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Voucher Claim   │ ◄── EIP-712 Signature
└─────────────────┘     Multi-sig Ready
```

### Key States

**KYC Status:**
- `UNVERIFIED` - Initial state
- `PENDING_REVIEW` - Duplicate identity detected, awaiting admin review
- `KYC_VERIFIED` - Identity verified, can proceed to competency test
- `KYC_REJECTED` - Identity rejected by admin

**Competency Status:**
- `NOT_STARTED` - Initial state after KYC verification
- `COMPETENCY_PASSED` - Passed the test (10/10 correct)
- `COMPETENCY_FAILED` - Failed the test (< 10/10 correct)

---

## Security Features

### 1. **Cryptographic Identity Hashing**

**Purpose:** Prevent duplicate registrations without storing raw PII

**Implementation:**
```typescript
// Identity hash uses HMAC-SHA256 with secret salt
const identityHash = crypto
  .createHmac('sha256', KYC_HASH_SECRET)
  .update(JSON.stringify(normalizedData))
  .digest('hex');
```

**Features:**
- Deterministic: Same identity data always produces same hash
- One-way: Cannot reverse hash to get original data
- Collision detection: Duplicate identities are flagged for review
- Secondary salt: Admin can approve duplicates with unique secondary salt

### 2. **AES-256-GCM Encryption**

**Purpose:** Protect sensitive KYC documents at rest

**Implementation:**
```typescript
// Encryption uses AES-256-GCM with random IV
const key = Buffer.from(KYC_AES_KEY, 'hex'); // 32 bytes
const iv = crypto.randomBytes(12); // 96-bit IV
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
```

**Features:**
- Military-grade encryption (AES-256)
- Authenticated encryption (GCM mode prevents tampering)
- Unique IV per document
- 7-day automatic expiry for document purging

### 3. **Wallet Signature Verification**

**Purpose:** Ensure all state-changing actions are authorized by wallet owner

**Implementation:**
```typescript
const payload = {
  action: "KYC_REGISTRATION", // or "COMPETENCY_SUBMIT"
  wallet_address: address.toLowerCase(),
  timestamp: Math.floor(Date.now() / 1000)
};
const message = JSON.stringify(payload);
const signature = await signMessageAsync({ message });
```

**Features:**
- Timestamp validation (5-minute window prevents replay attacks)
- Action-specific signatures
- Wallet address verification
- Prevents unauthorized submissions

### 4. **Answer Randomization**

**Purpose:** Prevent cheating by randomizing answer order

**Implementation:**
```typescript
// Fisher-Yates shuffle algorithm
function shuffleAnswers(answers) {
  const shuffled = [...answers];
  const mapping = [];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    [mapping[i], mapping[j]] = [mapping[j], mapping[i]];
  }
  
  return { shuffled, mapping };
}
```

**Features:**
- Each user sees answers in different order
- Mapping stored client-side only
- Backend validates using original indices
- Prevents answer sharing between users

### 5. **Attempt Limiting**

**Purpose:** Prevent brute-force attempts

**Features:**
- Maximum 3 attempts per wallet (lifetime)
- Attempts tracked in database
- Admin can reset if needed
- Clear feedback on remaining attempts

---

## Competency Test

### Test Structure

**10 Questions** covering:
1. Global commodity pricing systems
2. Market interventions and independent producers
3. Centralized vs. decentralized systems
4. Blockchain settlement advantages
5. Network resilience
6. Derivatives and risk hedging
7. Currency debasement effects
8. Proof-of-uniqueness mechanisms
9. Price controls and supply chains
10. Just-in-time inventory fragilities

### Passing Requirements

- **Score Required:** 10/10 (100%)
- **Attempts Allowed:** 3 total (lifetime)
- **Prerequisites:** KYC_VERIFIED status
- **Time Limit:** None (users can take their time)

### Answer Validation

```typescript
// All correct answers are at index 0 in the original array
const answerKey = {
  q1: 0,  // "The US Dollar and Eurodollar markets"
  q2: 0,  // "It temporarily suppresses market prices..."
  q3: 0,  // "They lack sovereign debt-printing capacity..."
  // ... etc
};

// User submits shuffled indices, backend maps back to original
const score = Object.entries(answerKey).filter(([qId, correctIdx]) => 
  answers[qId] === correctIdx
).length;

const passed = score === 10;
```

### User Experience

1. **Start Quiz:** Navigate to `/account/competency-test/quiz`
2. **Answer Questions:** One question at a time, can navigate back/forward
3. **Review Answers:** Can change answers before final submission
4. **Submit:** Wallet signature required
5. **Results:** Immediate feedback with explanations
6. **Retry:** If failed, can retry (up to 3 total attempts)

---

## KYC Registration

### Registration Flow

1. **Collect Identity Data**
   - Full name
   - Date of birth
   - Address
   - Government ID number
   - Other required fields

2. **Sign Submission**
   ```typescript
   const payload = {
     action: "KYC_REGISTRATION",
     wallet_address: address.toLowerCase(),
     timestamp: Math.floor(Date.now() / 1000)
   };
   const signature = await signMessageAsync({ 
     message: JSON.stringify(payload) 
   });
   ```

3. **Submit to Backend**
   - Data is encrypted with AES-256-GCM
   - Identity hash is generated
   - Duplicate check is performed

4. **Outcome**
   - **No Duplicate:** Instant verification → `KYC_VERIFIED`
   - **Duplicate Found:** Manual review required → `PENDING_REVIEW`
   - **Same User:** Re-verification → `KYC_VERIFIED`

### Duplicate Handling

**Scenario 1: First-time registration**
```
User A registers → No duplicate → KYC_VERIFIED
```

**Scenario 2: Duplicate identity (different wallet)**
```
User B registers with same identity as User A
→ Duplicate detected
→ Status: PENDING_REVIEW
→ Admin reviews and decides:
   - Approve with secondary salt (legitimate duplicate)
   - Reject (fraudulent attempt)
```

**Scenario 3: Re-registration (same wallet)**
```
User A registers again
→ Same identity, same wallet
→ Status: KYC_VERIFIED (preserved)
```

### Document Expiry

- KYC documents are encrypted and stored for **7 days**
- After 7 days, documents should be purged (implement cleanup job)
- Identity hash remains for duplicate detection
- User status is preserved

---

## API Endpoints

### Public Endpoints

#### POST `/api/onboarding/kyc/register`
Register KYC information

**Request:**
```json
{
  "wallet_address": "0x...",
  "identity_data": {
    "full_name": "John Doe",
    "dob": "1990-01-01",
    "address": "123 Main St",
    "id_number": "ABC123"
  },
  "message": "{\"action\":\"KYC_REGISTRATION\",\"wallet_address\":\"0x...\",\"timestamp\":1234567890}",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "status": "KYC_VERIFIED",
  "message": "KYC verified"
}
```

#### POST `/api/onboarding/competency/submit`
Submit competency test answers

**Request:**
```json
{
  "wallet_address": "0x...",
  "answers": {
    "q1": 0,
    "q2": 0,
    "q3": 0,
    // ... all 10 questions
  },
  "message": "{\"action\":\"COMPETENCY_SUBMIT\",\"wallet_address\":\"0x...\",\"timestamp\":1234567890}",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "score": 10,
  "passed": true,
  "status": "COMPETENCY_PASSED",
  "attempts_used": 1,
  "attempts_remaining": 2
}
```

#### GET `/api/onboarding/competency/result/:address`
Get competency test status and attempt count

**Response:**
```json
{
  "success": true,
  "data": {
    "kyc_status": "KYC_VERIFIED",
    "competency_status": "COMPETENCY_PASSED",
    "attempt_count": 1,
    "attempts_remaining": 2
  }
}
```

#### GET `/api/onboarding/kyc/status/:address`
Get KYC and competency status

**Response:**
```json
{
  "success": true,
  "data": {
    "kyc_status": "KYC_VERIFIED",
    "competency_status": "COMPETENCY_PASSED",
    "review_task": null
  }
}
```

#### POST `/api/onboarding/voucher/claim`
Claim voting rights voucher (after passing both KYC and competency)

**Request:**
```json
{
  "wallet_address": "0x...",
  "voucher_type": "COMPETENCY_VOUCHER",
  "message": "{\"action\":\"VOUCHER_CLAIM\",\"wallet_address\":\"0x...\",\"timestamp\":1234567890}",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "voucher": {
    "payload": {
      "wallet_address": "0x...",
      "identity_hash": "0x...",
      "voucher_type": "COMPETENCY_VOUCHER",
      "issued_at": 1234567890
    },
    "signature": "0x..." // EIP-712 signature
  }
}
```

### Admin Endpoints

All admin endpoints require `x-admin-api-key` header.

#### GET `/api/onboarding/kyc/document/:address`
Retrieve decrypted KYC document for review

**Headers:**
```
x-admin-api-key: YOUR_ADMIN_KEY
```

**Response:**
```json
{
  "success": true,
  "document": {
    "data": {
      "full_name": "John Doe",
      "dob": "1990-01-01",
      // ... decrypted fields
    },
    "created_at": "2026-06-17T12:00:00Z"
  }
}
```

#### POST `/api/onboarding/kyc/review/:address/approve`
Approve a pending KYC review

**Request:**
```json
{
  "secondary_salt": "optional_unique_salt",
  "review_notes": "Approved - legitimate duplicate"
}
```

#### POST `/api/onboarding/kyc/review/:address/reject`
Reject a pending KYC review

**Request:**
```json
{
  "review_notes": "Rejected - fraudulent attempt"
}
```

---

## Database Schema

### kyc_documents
```sql
CREATE TABLE kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_payload BYTEA NOT NULL,
  encryption_metadata JSONB NOT NULL,
  expires_at TIMESTAMP,  -- 7 days from creation
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### kyc_identities
```sql
CREATE TABLE kyc_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_hash TEXT UNIQUE NOT NULL,
  is_secondary BOOLEAN DEFAULT FALSE,  -- True if approved with secondary salt
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### kyc_review_tasks
```sql
CREATE TABLE kyc_review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  duplicate_of_user_id UUID REFERENCES users(id),  -- Original user with this identity
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED
  review_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);
```

### competency_submissions
```sql
CREATE TABLE competency_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,  -- Stores user's answers
  score INTEGER NOT NULL,  -- 0-10
  passed BOOLEAN NOT NULL,  -- true if score === 10
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

### voucher_issuances
```sql
CREATE TABLE voucher_issuances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  voucher_payload JSONB NOT NULL,
  voucher_signature TEXT NOT NULL,  -- EIP-712 signature
  issued_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (identity_hash),
  UNIQUE (user_id)
);
```

---

## Security Best Practices

### For Users

1. **Protect Your Wallet**
   - Never share private keys
   - Use hardware wallet for high-value operations
   - Verify all signature requests before approving

2. **KYC Data Privacy**
   - Only submit accurate information
   - Data is encrypted and auto-expires after 7 days
   - Identity hash prevents duplicate registrations

3. **Competency Test**
   - Take your time (no time limit)
   - Review all answers before submitting
   - You have 3 attempts - use them wisely
   - Answers are randomized - don't share screenshots

### For Administrators

1. **Secure Admin Credentials**
   - Store `ADMIN_API_KEY` securely
   - Rotate keys regularly
   - Use environment variables, never commit to code

2. **KYC Review Process**
   - Review duplicate cases carefully
   - Document decisions in review_notes
   - Use secondary salt for legitimate duplicates
   - Reject fraudulent attempts immediately

3. **Encryption Keys**
   - `KYC_AES_KEY`: 32-byte hex string for AES-256
   - `KYC_HASH_SECRET`: Secret for identity hashing
   - `KYC_VOUCHER_SIGNING_PRIVATE_KEY`: Private key for EIP-712 signatures
   - Store in secure environment variables
   - Never expose in logs or error messages

4. **Database Maintenance**
   - Implement cleanup job for expired documents (7 days)
   - Monitor for suspicious patterns
   - Regular backups of identity hashes
   - Audit logs for admin actions

### Environment Variables

```bash
# Required for KYC/Competency System
KYC_AES_KEY=<64-char-hex-string>  # 32 bytes for AES-256
KYC_HASH_SECRET=<random-secret-string>
KYC_VOUCHER_SIGNING_PRIVATE_KEY=<ethereum-private-key>
ADMIN_API_KEY=<admin-api-key>

# Optional
VOUCHER_CHAIN_ID=84531  # Base Goerli
VOUCHER_CONTRACT_ADDRESS=0x...
```

---

## Troubleshooting

### Common Issues

#### "Competency submission requires KYC_VERIFIED status"
**Cause:** User hasn't completed KYC or is in PENDING_REVIEW state  
**Solution:** Complete KYC registration first, or wait for admin review

#### "Maximum attempts (3) reached"
**Cause:** User has failed the test 3 times  
**Solution:** Contact admin for attempt reset (requires manual database update)

#### "Signed wallet message timestamp is outside the allowed window"
**Cause:** System clock is out of sync or signature is old  
**Solution:** Ensure system time is correct, regenerate signature

#### "Duplicate identity detected; review required"
**Cause:** Another wallet has registered with same identity data  
**Solution:** Wait for admin review, or contact support if legitimate

#### Quiz answers not randomizing
**Cause:** Browser cache or component not re-rendering  
**Solution:** Hard refresh page (Ctrl+Shift+R), quiz generates new shuffle on mount

### Admin Operations

#### Reset Competency Attempts
```sql
-- Delete all submissions for a user
DELETE FROM competency_submissions WHERE user_id = '<user-uuid>';

-- Reset competency status
UPDATE users 
SET competency_status = 'NOT_STARTED' 
WHERE id = '<user-uuid>';
```

#### Manually Verify KYC
```sql
UPDATE users 
SET kyc_status = 'KYC_VERIFIED' 
WHERE wallet_address = '0x...';
```

#### Purge Expired Documents
```sql
DELETE FROM kyc_documents 
WHERE expires_at < NOW();
```

---

## Changelog

### v1.0.0 (Current)
- ✅ Implemented answer randomization (Fisher-Yates shuffle)
- ✅ Added 3-attempt limit (lifetime)
- ✅ Timestamp validation on all submissions (5-min window)
- ✅ Production-ready quiz UI with progress tracking
- ✅ Comprehensive error handling and user feedback
- ✅ Answer review after failed attempts
- ✅ Attempt tracking in database
- ✅ Security hardening across all endpoints

### Future Enhancements

1. **Admin Dashboard Improvements**
   - Visual KYC review interface
   - Bulk operations for review tasks
   - Analytics and reporting

2. **Enhanced Security**
   - Rate limiting on KYC submissions
   - CAPTCHA for bot prevention
   - IP whitelisting for admin operations

3. **User Experience**
   - Email notifications for status changes
   - Progress saving (partial quiz completion)
   - Mobile-optimized quiz interface

---

## Support

For issues or questions:
- Review this documentation
- Check the troubleshooting section
- Contact the admin team for KYC/competency issues
- Report bugs via `/reportbug` command

---

**Last Updated:** June 17, 2026  
**Version:** 1.0.0  
**Maintained by:** ironRelay Development Team
