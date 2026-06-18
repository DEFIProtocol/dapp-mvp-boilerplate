import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as userHelpers from "../postgres/users";
import * as onboardingHelpers from "../postgres/onboarding";

export default function onboardingRouter(pool: Pool) {
  const router = Router();

  const getParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  const validateWalletAddress = (value: unknown, res: Response): string | null => {
    const walletAddress = String(value || "").trim().toLowerCase();
    if (!userHelpers.isValidAddress(walletAddress)) {
      res.status(400).json({ success: false, error: "wallet_address must be a valid address" });
      return null;
    }
    return walletAddress;
  };

  const validateSignedWalletProof = (
    walletAddress: string,
    message: unknown,
    signature: unknown,
    expectedAction: string,
    res: Response
  ): boolean => {
    const msg = String(message || "").trim();
    const sig = String(signature || "").trim();
    if (!msg || !sig) {
      res.status(400).json({ success: false, error: "message and signature are required" });
      return false;
    }

    try {
      if (!onboardingHelpers.verifyWalletProof(walletAddress, msg, sig, expectedAction)) {
        res.status(401).json({ success: false, error: "signature verification failed" });
        return false;
      }
      return true;
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      res.status(401).json({ success: false, error: messageText });
      return false;
    }
  };

  const requireAdmin = (req: Request, res: Response): boolean => {
    const adminKey = String(req.headers["x-admin-api-key"] || "").trim();
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      res.status(401).json({ success: false, error: "Admin authorization required" });
      return false;
    }
    return true;
  };

  router.post("/kyc/register", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      const identityData = req.body?.identity_data;
      if (!identityData || typeof identityData !== "object") {
        return res.status(400).json({ success: false, error: "identity_data is required" });
      }

      if (!validateSignedWalletProof(walletAddress, req.body?.message, req.body?.signature, "KYC_REGISTRATION", res)) {
        return;
      }

      let user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        user = await userHelpers.createUser(pool, { wallet_address: walletAddress });
      }
      if (!user || !user.id) {
        return res.status(500).json({ success: false, error: "Unable to create or load user" });
      }

      const identityHash = onboardingHelpers.deriveIdentityHash(identityData);
      const encrypted = onboardingHelpers.encryptKycPayload(identityData);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await onboardingHelpers.createKycDocument(pool, user.id, encrypted.payload, encrypted.metadata, expiresAt);

      const duplicate = await onboardingHelpers.findKycIdentityByHash(pool, identityHash);
      if (!duplicate) {
        await onboardingHelpers.createKycIdentity(pool, user.id, identityHash, false);
        user = await userHelpers.updateUserByWallet(pool, walletAddress, {
          kyc_status: "KYC_VERIFIED",
          competency_status: "NOT_STARTED",
        });
        return res.json({ success: true, status: user?.kyc_status, message: "KYC verified" });
      }

      if (duplicate.user_id !== user.id) {
        await userHelpers.updateUserByWallet(pool, walletAddress, {
          kyc_status: "PENDING_REVIEW",
        });
        await onboardingHelpers.createKycReviewTask(pool, user.id, identityHash, duplicate.user_id);
        return res.json({ success: true, status: "PENDING_REVIEW", message: "Duplicate identity detected; review required" });
      }

      // Duplicate for same user, preserve verified state if already verified.
      await userHelpers.updateUserByWallet(pool, walletAddress, {
        kyc_status: "KYC_VERIFIED",
      });
      return res.json({ success: true, status: "KYC_VERIFIED", message: "KYC already verified" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/kyc/status/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const reviewTask = await onboardingHelpers.getKycReviewTaskByUser(pool, user.id);
      res.json({
        success: true,
        data: {
          kyc_status: user.kyc_status,
          competency_status: user.competency_status,
          review_task: reviewTask,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/kyc/document/:address", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const docRes = await pool.query(
        `SELECT encrypted_payload, encryption_metadata, created_at FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );

      if (docRes.rowCount === 0) {
        return res.status(404).json({ success: false, error: "No KYC document found" });
      }

      const { encrypted_payload, encryption_metadata, created_at } = docRes.rows[0];
      const decrypted = onboardingHelpers.decryptKycPayload(encrypted_payload, encryption_metadata);

      res.json({ success: true, document: { data: decrypted, created_at } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post("/competency/submit", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;
      if (!validateSignedWalletProof(walletAddress, req.body?.message, req.body?.signature, "COMPETENCY_SUBMIT", res)) {
        return;
      }

      const answers = req.body?.answers;
      if (!answers || typeof answers !== "object") {
        return res.status(400).json({ success: false, error: "answers are required" });
      }

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.kyc_status !== "KYC_VERIFIED") {
        return res.status(403).json({ success: false, error: "Competency submission requires KYC_VERIFIED status" });
      }

      // Check attempt count (max 3 attempts total)
      const attemptCount = await onboardingHelpers.getCompetencyAttemptCount(pool, user.id);
      if (attemptCount >= 3) {
        return res.status(403).json({ 
          success: false, 
          error: "Maximum attempts (3) reached. Contact support for reset." 
        });
      }

      const { score, passed } = onboardingHelpers.evaluateCompetencyAnswers(answers);
      await onboardingHelpers.createCompetencySubmission(pool, user.id, answers, score, passed);
      await onboardingHelpers.updateUserCompetencyStatus(
        pool,
        user.id,
        passed ? "COMPETENCY_PASSED" : "COMPETENCY_FAILED"
      );

      return res.json({ 
        success: true, 
        score, 
        passed, 
        status: passed ? "COMPETENCY_PASSED" : "COMPETENCY_FAILED",
        attempts_used: attemptCount + 1,
        attempts_remaining: Math.max(0, 2 - attemptCount)
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/competency/result/:address", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const attemptCount = await onboardingHelpers.getCompetencyAttemptCount(pool, user.id);

      res.json({
        success: true,
        data: {
          kyc_status: user.kyc_status,
          competency_status: user.competency_status,
          attempt_count: attemptCount,
          attempts_remaining: Math.max(0, 3 - attemptCount),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post("/voucher/claim", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;
      if (!validateSignedWalletProof(walletAddress, req.body?.message, req.body?.signature, "VOUCHER_CLAIM", res)) {
        return;
      }

      const voucherType = String(req.body?.voucher_type || "COMPETENCY_VOUCHER").trim();
      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.kyc_status !== "KYC_VERIFIED" || user.competency_status !== "COMPETENCY_PASSED") {
        return res.status(403).json({
          success: false,
          error: "Voucher claim requires KYC_VERIFIED and COMPETENCY_PASSED status",
        });
      }

      const identity = await onboardingHelpers.getKycIdentityByUser(pool, user.id);
      if (!identity) {
        return res.status(400).json({ success: false, error: "No verified KYC identity found" });
      }

      const existingVoucher = await onboardingHelpers.getVoucherIssuanceByHash(pool, identity.identity_hash);
      if (existingVoucher) {
        return res.json({
          success: true,
          alreadyIssued: true,
          voucher: {
            payload: existingVoucher.voucher_payload,
            signature: existingVoucher.voucher_signature,
          },
        });
      }

      const payload = {
        wallet_address: walletAddress,
        identity_hash: identity.identity_hash,
        voucher_type: voucherType,
        issued_at: Math.floor(Date.now() / 1000),
      };
      const signature = await onboardingHelpers.signVoucherPayload(payload);
      const voucher = await onboardingHelpers.createVoucherIssuance(pool, user.id, identity.identity_hash, payload, signature);

      if (!voucher) {
        return res.status(500).json({ success: false, error: "Failed to create voucher issuance" });
      }

      return res.json({ success: true, voucher: { payload, signature } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/kyc/review/:address", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const reviewTask = await onboardingHelpers.getKycReviewTaskByUser(pool, user.id);
      res.json({ success: true, review_task: reviewTask });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post("/kyc/review/:address/approve", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const secondarySalt = req.body?.secondary_salt ? String(req.body.secondary_salt) : null;
      const reviewNotes = req.body?.review_notes ? String(req.body.review_notes) : undefined;
      const updatedUser = await onboardingHelpers.approveKycReview(pool, user.wallet_address, secondarySalt, reviewNotes);
      res.json({ success: true, user: updatedUser });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post("/kyc/review/:address/reject", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const walletAddress = validateWalletAddress(getParam(req.params.address), res);
      if (!walletAddress) return;

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user || !user.id) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const reviewNotes = req.body?.review_notes ? String(req.body.review_notes) : undefined;
      const updatedUser = await onboardingHelpers.rejectKycReview(pool, user.wallet_address, reviewNotes);
      res.json({ success: true, user: updatedUser });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
