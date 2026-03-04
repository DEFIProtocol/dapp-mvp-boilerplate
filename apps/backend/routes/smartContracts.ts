import express from "express";
import { SettlementService } from "./SmartContracts/settlementService";

const router = express.Router();

function getSettlementService() {
  try {
    return { settlement: new SettlementService() };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to initialize settlement service",
    };
  }
}

router.get("/params", async (_req, res) => {
  const { settlement, error } = getSettlementService();
  if (!settlement) {
    return res.status(503).json({ success: false, error });
  }

  try {
    const params = await settlement.getParams();
    res.json({ success: true, params });
  } catch (error) {
    console.error("Error fetching settlement params:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/params", async (req, res) => {
  const { settlement, error } = getSettlementService();
  if (!settlement) {
    return res.status(503).json({ success: false, error });
  }

  try {
    const {
      makerFeeBps,
      takerFeeBps,
      insuranceBps,
      maintenanceMarginBps,
      liquidationRewardBps,
      liquidationPenaltyBps,
    } = req.body;

    const values = [
      makerFeeBps,
      takerFeeBps,
      insuranceBps,
      maintenanceMarginBps,
      liquidationRewardBps,
      liquidationPenaltyBps,
    ];

    if (values.some((value) => typeof value !== "number" || Number.isNaN(value))) {
      return res.status(400).json({
        success: false,
        error: "All params must be numeric values",
      });
    }

    if (liquidationRewardBps > liquidationPenaltyBps) {
      return res.status(400).json({
        success: false,
        error: "liquidationRewardBps cannot exceed liquidationPenaltyBps",
      });
    }

    const [feeTxHash, riskTxHash] = await Promise.all([
      settlement.setFeeParams(makerFeeBps, takerFeeBps, insuranceBps),
      settlement.setRiskParams(
        maintenanceMarginBps,
        liquidationRewardBps,
        liquidationPenaltyBps
      ),
    ]);

    const updated = await settlement.getParams();

    res.json({
      success: true,
      tx: {
        feeTxHash,
        riskTxHash,
      },
      params: updated,
    });
  } catch (error) {
    console.error("Error updating settlement params:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
