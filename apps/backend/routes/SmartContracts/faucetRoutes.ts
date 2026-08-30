import express from "express";
import { isAddress } from "ethers";
import { Pool } from "pg";
import { FaucetService } from "./faucetService";
import * as faucetHelpers from "../../postgres/faucet";
import { ensurePaperTradingChain } from "./paperTradingGuards";

function getFaucetService() {
  try {
    return { faucet: new FaucetService() };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to initialize faucet service",
    };
  }
}

const CLAIM_WINDOW_HOURS = 24;

export default function faucetRouter(pool: Pool) {
  const router = express.Router();

  /**
   * Claim testnet USDC. No wallet signature required - the backend's own
   * treasury wallet signs and sends a plain transfer() to the caller's
   * address, which avoids ever asking the user's wallet to interact with
   * the faucet contract directly (the previous mint()-from-your-own-wallet
   * flow is what triggered MetaMask's "malicious contract" warning).
   */
  router.post("/claim", async (req, res) => {
    const { faucet, error } = getFaucetService();
    if (!faucet) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const { chainId, address } = req.body ?? {};

      const chainGuard = ensurePaperTradingChain(chainId);
      if (!chainGuard.ok) {
        return res.status(400).json({ success: false, error: chainGuard.message });
      }

      if (typeof address !== "string" || !isAddress(address)) {
        return res.status(400).json({ success: false, error: "address must be a valid EVM address" });
      }

      const normalizedAddress = address.toLowerCase();

      const activeClaim = await faucetHelpers.getActiveClaimWindow(pool, normalizedAddress);
      if (activeClaim) {
        // Note: res.json() is wrapped by a shared bigintSerializer middleware
        // that deep-clones payloads via a generic for...in loop - Date
        // instances have no enumerable own properties, so passing a raw
        // Date through it serializes to "{}" instead of a timestamp. Always
        // convert dates to ISO strings explicitly before returning them here.
        const lastClaimedAt = new Date(activeClaim.created_at);
        const nextEligibleAt = new Date(lastClaimedAt.getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000);
        return res.status(429).json({
          success: false,
          error: `Faucet already claimed within the last ${CLAIM_WINDOW_HOURS}h. Try again later.`,
          lastClaimedAt: lastClaimedAt.toISOString(),
          nextEligibleAt: nextEligibleAt.toISOString(),
        });
      }

      const result = await faucet.claim(address);
      const amountDisplay = (Number(result.amount) / 10 ** result.decimals).toString();

      await faucetHelpers.recordFaucetClaim(pool, normalizedAddress, amountDisplay, result.txHash);

      res.json({
        success: true,
        address,
        amount: amountDisplay,
        txHash: result.txHash,
      });
    } catch (routeError) {
      console.error("Error processing faucet claim:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  /**
   * Lets the frontend check claim eligibility up front (e.g. to disable
   * the claim button / show a countdown) without attempting a claim.
   */
  router.get("/status/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!isAddress(address)) {
        return res.status(400).json({ success: false, error: "address must be a valid EVM address" });
      }

      const activeClaim = await faucetHelpers.getActiveClaimWindow(pool, address.toLowerCase());
      if (!activeClaim) {
        return res.json({ success: true, eligible: true });
      }

      const lastClaimedAt = new Date(activeClaim.created_at);
      const nextEligibleAt = new Date(lastClaimedAt.getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000);

      res.json({
        success: true,
        eligible: false,
        lastClaimedAt: lastClaimedAt.toISOString(),
        nextEligibleAt: nextEligibleAt.toISOString(),
      });
    } catch (routeError) {
      console.error("Error checking faucet status:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  return router;
}
