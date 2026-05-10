import { randomUUID } from "crypto";
import express from "express";
import { ethers, isAddress } from "ethers";
import { Pool } from "pg";
import { SettlementService } from "./SmartContracts/settlementService";
import * as userHelpers from "../postgres/users";

const PAPER_TRADING_CHAIN_ID = 84532;
const PAPER_TRADING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

type PaperTradingStatus = {
  eligibleNow: boolean;
  nextEligibleAt: string | null;
  lastGrantAt: string | null;
  grantCount: number;
  lastGrantTxHash: string | null;
  lastGrantChainId: number | null;
  challengeExpiresAt: string | null;
};

function requireBaseSepolia(chainId: unknown): boolean {
  return Number(chainId) === PAPER_TRADING_CHAIN_ID;
}

function buildChallengeMessage(walletAddress: string, nonce: string, expiresAt: Date): string {
  return [
    "DCSN paper trading faucet request",
    `Wallet: ${walletAddress.toLowerCase()}`,
    `ChainId: ${PAPER_TRADING_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `ExpiresAt: ${expiresAt.toISOString()}`,
  ].join("\n");
}

function computeStatus(user: userHelpers.UserRow | null): PaperTradingStatus {
  const lastGrantAt = user?.paper_trading_last_grant_at ? new Date(user.paper_trading_last_grant_at) : null;
  const nextEligibleAt = lastGrantAt ? new Date(lastGrantAt.getTime() + PAPER_TRADING_COOLDOWN_MS) : null;
  const eligibleNow = !nextEligibleAt || nextEligibleAt.getTime() <= Date.now();

  return {
    eligibleNow,
    nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null,
    lastGrantAt: lastGrantAt ? lastGrantAt.toISOString() : null,
    grantCount: Number(user?.paper_trading_grant_count ?? 0),
    lastGrantTxHash: user?.paper_trading_last_grant_tx_hash ?? null,
    lastGrantChainId: user?.paper_trading_last_grant_chain_id ?? null,
    challengeExpiresAt: user?.paper_trading_challenge_expires_at ?? null,
  };
}

export default function paperTradingRouter(pool: Pool) {
  const router = express.Router();

  router.get("/faucet/status/:wallet", async (req, res) => {
    try {
      const walletAddress = String(req.params.wallet || "").trim();
      const chainId = Number(req.query.chainId ?? PAPER_TRADING_CHAIN_ID);

      if (!isAddress(walletAddress)) {
        return res.status(400).json({ success: false, error: "wallet must be a valid EVM address" });
      }

      if (!requireBaseSepolia(chainId)) {
        return res.status(400).json({ success: false, error: "paper trading faucet is Base Sepolia only" });
      }

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      res.json({ success: true, chainId, status: computeStatus(user) });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to fetch faucet status" });
    }
  });

  router.post("/faucet/challenge", async (req, res) => {
    try {
      const walletAddress = String(req.body?.walletAddress || "").trim();
      const chainId = Number(req.body?.chainId);

      if (!isAddress(walletAddress)) {
        return res.status(400).json({ success: false, error: "walletAddress must be a valid EVM address" });
      }

      if (!requireBaseSepolia(chainId)) {
        return res.status(400).json({ success: false, error: "paper trading faucet is Base Sepolia only" });
      }

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const nonce = randomUUID();
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
      const updated = await userHelpers.setPaperTradingChallenge(pool, walletAddress, nonce, expiresAt);

      if (!updated) {
        return res.status(500).json({ success: false, error: "Failed to create challenge" });
      }

      const challenge = buildChallengeMessage(walletAddress, nonce, expiresAt);

      res.json({
        success: true,
        chainId: PAPER_TRADING_CHAIN_ID,
        expiresAt: expiresAt.toISOString(),
        challenge,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to create challenge" });
    }
  });

  router.post("/faucet/grant", async (req, res) => {
    try {
      const walletAddress = String(req.body?.walletAddress || "").trim();
      const chainId = Number(req.body?.chainId);
      const signature = String(req.body?.signature || "").trim();

      if (!isAddress(walletAddress)) {
        return res.status(400).json({ success: false, error: "walletAddress must be a valid EVM address" });
      }

      if (!requireBaseSepolia(chainId)) {
        return res.status(400).json({ success: false, error: "paper trading faucet is Base Sepolia only" });
      }

      if (!signature) {
        return res.status(400).json({ success: false, error: "signature is required" });
      }

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const nonce = user.paper_trading_challenge_nonce;
      const challengeExpiresAt = user.paper_trading_challenge_expires_at ? new Date(user.paper_trading_challenge_expires_at) : null;

      if (!nonce || !challengeExpiresAt) {
        return res.status(400).json({ success: false, error: "challenge required before grant" });
      }

      if (challengeExpiresAt.getTime() < Date.now()) {
        return res.status(400).json({ success: false, error: "challenge expired" });
      }

      const challenge = buildChallengeMessage(walletAddress, nonce, challengeExpiresAt);
      const recoveredAddress = ethers.verifyMessage(challenge, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(401).json({ success: false, error: "signature does not match walletAddress" });
      }

      const status = computeStatus(user);
      if (!status.eligibleNow) {
        return res.status(429).json({
          success: false,
          error: "paper trading cooldown active",
          nextEligibleAt: status.nextEligibleAt,
        });
      }

      const settlement = new SettlementService();
      const grant = await settlement.grantPaperTradingFunds(walletAddress);

      const committed = await userHelpers.commitPaperTradingGrant(
        pool,
        walletAddress,
        grant.usdcTxHash,
        PAPER_TRADING_CHAIN_ID
      );

      if (!committed) {
        return res.status(500).json({ success: false, error: "Failed to record faucet grant" });
      }

      res.json({
        success: true,
        chainId: PAPER_TRADING_CHAIN_ID,
        walletAddress: walletAddress.toLowerCase(),
        amount: process.env.PAPER_TRADING_USDC_AMOUNT ?? "10000",
        usdcTxHash: grant.usdcTxHash,
        ethTxHash: grant.ethTxHash ?? null,
        ethDripError: grant.ethDripError ?? null,
        status: computeStatus(committed),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to grant paper trading funds" });
    }
  });

  router.post("/faucet/admin-override", async (req, res) => {
    try {
      const walletAddress = String(req.body?.walletAddress || "").trim();
      const adminAddress = String(req.body?.adminAddress || "").trim();
      const chainId = Number(req.body?.chainId);

      if (!isAddress(walletAddress) || !isAddress(adminAddress)) {
        return res.status(400).json({ success: false, error: "walletAddress and adminAddress must be valid EVM addresses" });
      }

      if (!requireBaseSepolia(chainId)) {
        return res.status(400).json({ success: false, error: "paper trading faucet is Base Sepolia only" });
      }

      const allowlist = parseAllowlist(process.env.PAPER_TRADING_ADMIN_OVERRIDE_ALLOWLIST);
      if (allowlist.size === 0 || !allowlist.has(adminAddress.toLowerCase())) {
        return res.status(403).json({ success: false, error: "admin override is not allowed for this admin address" });
      }

      const user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const updated = await userHelpers.setPaperTradingAdminOverride(pool, walletAddress, adminAddress);
      if (!updated) {
        return res.status(500).json({ success: false, error: "Failed to apply admin override" });
      }

      res.json({
        success: true,
        chainId: PAPER_TRADING_CHAIN_ID,
        walletAddress: walletAddress.toLowerCase(),
        status: computeStatus(updated),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to apply admin override" });
    }
  });

  return router;
}