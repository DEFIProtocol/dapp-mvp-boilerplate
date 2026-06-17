import crypto from "crypto";
import { ethers } from "ethers";
import { Pool } from "pg";
import {
  normalizeAddress,
  createUser,
  getUserByWallet,
  updateUserByWallet,
  UserRow,
} from "./users";

export type KycStatus =
  | "UNVERIFIED"
  | "KYC_PENDING"
  | "PENDING_REVIEW"
  | "KYC_VERIFIED"
  | "KYC_REJECTED";

export type CompetencyStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPETENCY_PASSED"
  | "COMPETENCY_FAILED";

export interface KycIdentityRow {
  id: string;
  user_id: string;
  identity_hash: string;
  is_secondary: boolean;
  created_at: string;
  updated_at: string;
}

export interface KycReviewTaskRow {
  id: string;
  user_id: string;
  identity_hash: string;
  duplicate_of_user_id?: string;
  status: string;
  review_notes?: string;
  created_at: string;
  resolved_at?: string;
}

export interface VoucherIssuanceRow {
  id: string;
  user_id: string;
  identity_hash: string;
  voucher_payload: any;
  voucher_signature: string;
  issued_at: string;
}

export interface CompetencySubmissionRow {
  id: string;
  user_id: string;
  answers: any;
  score: number;
  passed: boolean;
  submitted_at: string;
}

export interface VoucherPayload {
  wallet_address: string;
  identity_hash: string;
  voucher_type: string;
  issued_at: number;
}

export interface SignedWalletMessage {
  action: string;
  wallet_address: string;
  timestamp: number;
}

const HASH_SECRET = process.env.KYC_HASH_SECRET;
const VOUCHER_PRIVATE_KEY = process.env.KYC_VOUCHER_SIGNING_PRIVATE_KEY;
const AES_KEY = process.env.KYC_AES_KEY;
const VOUCHER_CHAIN_ID = Number(process.env.VOUCHER_CHAIN_ID || "84531");
const VOUCHER_CONTRACT_ADDRESS =
  process.env.VOUCHER_CONTRACT_ADDRESS || ethers.ZeroAddress;

function getAesKeyBuffer(): Buffer {
  if (!AES_KEY) {
    throw new Error("KYC_AES_KEY environment variable is required");
  }

  if (/^[0-9a-fA-F]{64}$/.test(AES_KEY)) {
    return Buffer.from(AES_KEY, "hex");
  }

  const buffer = Buffer.from(AES_KEY, "base64");
  if (buffer.length !== 32) {
    throw new Error("KYC_AES_KEY must be 32 bytes in hex or base64 format");
  }
  return buffer;
}

function getHashSecret(): string {
  if (!HASH_SECRET) {
    throw new Error("KYC_HASH_SECRET environment variable is required");
  }
  return HASH_SECRET;
}

function getVoucherSigner(): ethers.Wallet {
  if (!VOUCHER_PRIVATE_KEY) {
    throw new Error("KYC_VOUCHER_SIGNING_PRIVATE_KEY environment variable is required");
  }
  return new ethers.Wallet(VOUCHER_PRIVATE_KEY);
}

export function normalizeKycData(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeKycData(item));
  }
  if (typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      normalized[key] = normalizeKycData((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }
  return value;
}

export function deriveIdentityHash(rawData: unknown): string {
  const normalized = normalizeKycData(rawData);
  const text = JSON.stringify(normalized);
  const secret = getHashSecret();
  const hash = crypto.createHmac("sha256", secret).update(text).digest("hex");
  return `0x${hash}`;
}

export function encryptKycPayload(rawData: unknown): {
  payload: Buffer;
  metadata: { algorithm: string; iv: string; tag: string };
} {
  const key = getAesKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const serialized = JSON.stringify(rawData);
  const encrypted = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, encrypted, tag]);

  return {
    payload,
    metadata: {
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    },
  };
}

export function decryptKycPayload(
  payload: Buffer,
  metadata: { iv: string; tag: string }
): any {
  const key = getAesKeyBuffer();
  const iv = Buffer.from(metadata.iv, "base64");
  const tag = Buffer.from(metadata.tag, "base64");
  const encrypted = payload.slice(iv.length, payload.length - tag.length);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const result = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(result.toString("utf8"));
}

export function parseSignedWalletMessage(message: string): SignedWalletMessage {
  try {
    const payload = JSON.parse(message);
    if (
      typeof payload.action !== "string" ||
      typeof payload.wallet_address !== "string" ||
      (typeof payload.timestamp !== "number" && typeof payload.timestamp !== "string")
    ) {
      throw new Error("Invalid signed wallet message schema");
    }

    return {
      action: payload.action,
      wallet_address: normalizeAddress(payload.wallet_address),
      timestamp: Number(payload.timestamp),
    };
  } catch (error) {
    throw new Error("Signed wallet message must be valid JSON");
  }
}

export function verifyWalletProof(
  walletAddress: string,
  message: string,
  signature: string,
  expectedAction: string
): boolean {
  const parsed = parseSignedWalletMessage(message);
  if (parsed.action !== expectedAction) {
    throw new Error(`Expected signed message action '${expectedAction}' but got '${parsed.action}'`);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > 300) {
    throw new Error("Signed wallet message timestamp is outside the allowed window");
  }

  if (normalizeAddress(walletAddress) !== parsed.wallet_address) {
    throw new Error("Wallet address does not match signed payload");
  }

  const recovered = ethers.verifyMessage(message, signature);
  return normalizeAddress(recovered) === normalizeAddress(walletAddress);
}

export function getVoucherDomain() {
  return {
    name: "ironRelay Voucher",
    version: "1",
    chainId: VOUCHER_CHAIN_ID,
    verifyingContract: VOUCHER_CONTRACT_ADDRESS,
  };
}

export async function signVoucherPayload(payload: VoucherPayload): Promise<string> {
  const signer = getVoucherSigner();
  return signer.signTypedData(
    getVoucherDomain(),
    {
      Voucher: [
        { name: "wallet_address", type: "address" },
        { name: "identity_hash", type: "bytes32" },
        { name: "voucher_type", type: "string" },
        { name: "issued_at", type: "uint256" },
      ],
    },
    {
      wallet_address: payload.wallet_address,
      identity_hash: payload.identity_hash,
      voucher_type: payload.voucher_type,
      issued_at: payload.issued_at,
    }
  );
}

export async function ensureOnboardingTables(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encrypted_payload BYTEA NOT NULL,
      encryption_metadata JSONB NOT NULL,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      identity_hash TEXT UNIQUE NOT NULL,
      is_secondary BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_review_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      identity_hash TEXT NOT NULL,
      duplicate_of_user_id UUID REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      review_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competency_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers JSONB NOT NULL,
      score INTEGER NOT NULL,
      passed BOOLEAN NOT NULL,
      submitted_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voucher_issuances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      identity_hash TEXT NOT NULL,
      voucher_payload JSONB NOT NULL,
      voucher_signature TEXT NOT NULL,
      issued_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (identity_hash),
      UNIQUE (user_id)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kyc_identities_user_id ON kyc_identities(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kyc_review_tasks_user_id ON kyc_review_tasks(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_competency_submissions_user_id ON competency_submissions(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_voucher_issuances_identity_hash ON voucher_issuances(identity_hash)');
}

export async function createKycDocument(
  pool: Pool,
  userId: string,
  encryptedPayload: Buffer,
  metadata: { algorithm: string; iv: string; tag: string },
  expiresAt: Date
): Promise<void> {
  await ensureOnboardingTables(pool);
  await pool.query(
    `INSERT INTO kyc_documents (user_id, encrypted_payload, encryption_metadata, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [userId, encryptedPayload, metadata, expiresAt]
  );
}

export async function createKycIdentity(
  pool: Pool,
  userId: string,
  identityHash: string,
  isSecondary = false
): Promise<KycIdentityRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `INSERT INTO kyc_identities (user_id, identity_hash, is_secondary)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET identity_hash = EXCLUDED.identity_hash,
           is_secondary = EXCLUDED.is_secondary,
           updated_at = NOW()
     RETURNING *`,
    [userId, identityHash, isSecondary]
  );
  return result.rows[0] ?? null;
}

export async function findKycIdentityByHash(
  pool: Pool,
  identityHash: string
): Promise<KycIdentityRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `SELECT * FROM kyc_identities WHERE identity_hash = $1`,
    [identityHash]
  );
  return result.rows[0] ?? null;
}

export async function getKycIdentityByUser(
  pool: Pool,
  userId: string
): Promise<KycIdentityRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `SELECT * FROM kyc_identities WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function createKycReviewTask(
  pool: Pool,
  userId: string,
  identityHash: string,
  duplicateOfUserId: string | null
): Promise<KycReviewTaskRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `INSERT INTO kyc_review_tasks (user_id, identity_hash, duplicate_of_user_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, identityHash, duplicateOfUserId]
  );
  return result.rows[0] ?? null;
}

export async function getKycReviewTaskByUser(
  pool: Pool,
  userId: string
): Promise<KycReviewTaskRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `SELECT * FROM kyc_review_tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function updateUserKycStatus(
  pool: Pool,
  userId: string,
  status: KycStatus
): Promise<UserRow | null> {
  const result = await pool.query(
    `UPDATE users SET kyc_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, status]
  );
  return result.rows[0] ?? null;
}

export async function updateUserCompetencyStatus(
  pool: Pool,
  userId: string,
  status: CompetencyStatus
): Promise<UserRow | null> {
  const result = await pool.query(
    `UPDATE users SET competency_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [userId, status]
  );
  return result.rows[0] ?? null;
}

export async function createCompetencySubmission(
  pool: Pool,
  userId: string,
  answers: any,
  score: number,
  passed: boolean
): Promise<CompetencySubmissionRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `INSERT INTO competency_submissions (user_id, answers, score, passed)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING *`,
    [userId, answers, score, passed]
  );
  return result.rows[0] ?? null;
}

export async function getVoucherIssuanceByHash(
  pool: Pool,
  identityHash: string
): Promise<VoucherIssuanceRow | null> {
  await ensureOnboardingTables(pool);
  const result = await pool.query(
    `SELECT * FROM voucher_issuances WHERE identity_hash = $1`,
    [identityHash]
  );
  return result.rows[0] ?? null;
}

export async function createVoucherIssuance(
  pool: Pool,
  userId: string,
  identityHash: string,
  voucherPayload: VoucherPayload,
  voucherSignature: string
): Promise<VoucherIssuanceRow | null> {
  await ensureOnboardingTables(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT * FROM voucher_issuances WHERE identity_hash = $1 OR user_id = $2 FOR SHARE`,
      [identityHash, userId]
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return existing.rows[0];
    }

    const result = await client.query(
      `INSERT INTO voucher_issuances (user_id, identity_hash, voucher_payload, voucher_signature)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [userId, identityHash, voucherPayload, voucherSignature]
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as any).code === "23505") {
      const existing = await client.query(
        `SELECT * FROM voucher_issuances WHERE identity_hash = $1 OR user_id = $2`,
        [identityHash, userId]
      );
      return existing.rows[0] ?? null;
    }
    throw error;
  } finally {
    client.release();
  }
}

export function evaluateCompetencyAnswers(
  answers: Record<string, string>
): { score: number; passed: boolean } {
  const answerKey: Record<string, string> = {
    q1: "A",
    q2: "A",
    q3: "A",
    q4: "A",
    q5: "A",
    q6: "A",
    q7: "A",
    q8: "A",
    q9: "A",
    q10: "A",
  };

  let score = 0;
  for (const [question, correctAnswer] of Object.entries(answerKey)) {
    const submitted = String(answers[question] || "").trim().toUpperCase();
    if (submitted === correctAnswer) {
      score += 1;
    }
  }

  return {
    score,
    passed: score === Object.keys(answerKey).length,
  };
}

export async function approveKycReview(
  pool: Pool,
  userId: string,
  secondarySalt: string | null,
  reviewNotes?: string
): Promise<UserRow | null> {
  await ensureOnboardingTables(pool);
  const user = await getUserByWallet(pool, userId);
  if (!user) {
    throw new Error("User not found");
  }

  const kycDocumentRow = await pool.query(
    `SELECT encrypted_payload, encryption_metadata FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );

  if (kycDocumentRow.rowCount === 0) {
    throw new Error("No KYC document found for review");
  }

  const { encrypted_payload, encryption_metadata } = kycDocumentRow.rows[0];
  const decrypted = decryptKycPayload(encrypted_payload, encryption_metadata);
  const salt = secondarySalt ? String(secondarySalt) : crypto.randomBytes(8).toString("hex");
  const hashInput = { ...decrypted, secondary_salt: salt };
  const identityHash = deriveIdentityHash(hashInput);

  await createKycIdentity(pool, user.id!, identityHash, true);
  await updateUserByWallet(pool, user.wallet_address, { kyc_status: "KYC_VERIFIED" });

  await pool.query(
    `UPDATE kyc_review_tasks SET status = 'APPROVED', review_notes = $2, resolved_at = NOW() WHERE user_id = $1 AND status = 'PENDING'`,
    [user.id, reviewNotes ?? null]
  );

  return getUserByWallet(pool, user.wallet_address);
}

export async function rejectKycReview(
  pool: Pool,
  userId: string,
  reviewNotes?: string
): Promise<UserRow | null> {
  await ensureOnboardingTables(pool);
  const user = await getUserByWallet(pool, userId);
  if (!user) {
    throw new Error("User not found");
  }

  await updateUserByWallet(pool, user.wallet_address, { kyc_status: "KYC_REJECTED" });
  await pool.query(
    `UPDATE kyc_review_tasks SET status = 'REJECTED', review_notes = $2, resolved_at = NOW() WHERE user_id = $1 AND status = 'PENDING'`,
    [user.id, reviewNotes ?? null]
  );

  return getUserByWallet(pool, user.wallet_address);
}
