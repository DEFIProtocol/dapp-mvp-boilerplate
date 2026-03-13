Liquidator calls: perpEngine.liquidate(42) // underwater position

Additional entry paths:
- liquidationEngine.batchLiquidate(positionIds[]) (same internal flow in a loop)
- liquidationEngine.liquidateWithPrice(positionId, customPrice) (module-only emergency path)

TRACE:
├── [PerpEngine] liquidate(42)
│   └── → liquidationEngine.liquidate(42)
│
├── [LiquidationEngine] liquidate(positionId)
│   ├── 1. READ: PerpStorage.positions[42] → Position(strugglingTrader, Long, 1000, 100, 2000, ...)
│   ├── 2. CALL: riskManager.isPositionLiquidatable(42)
│   │   └── [RiskManager] isPositionLiquidatable()
│   │       ├── READ: PerpStorage.maintenanceMarginBps
│   │       ├── GET: markPrice from oracle
│   │       ├── CALC: currentMarginRatio
│   │       └── RETURN: currentMarginRatio < maintenanceMarginBps
│   │
│   ├── 3. REQUIRE: position is liquidatable
│   ├── 4. GET: markPrice = riskManager.getMarkPrice() → 1800
│   │
│   ├── ── FORCE CLOSE + PNL/FUNDING SETTLEMENT ─────────────
│   ├── 5. CALL: riskManager.getPositionPnlAndFunding(position, markPrice)
│   ├── 6. CALC: totalDelta = pnl - funding
│   ├── 7. CALL: _forceClosePosition(positionId, totalDelta)
│   │   ├── WRITE: PerpStorage.setPositionActive(42, false)
│   │   ├── WRITE: remove position from trader arrays/indexes
│   │   ├── WRITE: reduce totalLongExposure / totalShortExposure
│   │   ├── CALL: collateralManager.removeReservedMargin(trader, position.margin)
│   │   └── CALL: collateralManager.applyAccountDelta(trader, totalDelta) → badDebt
│   │
│   ├── ── CALCULATE LIQUIDATION PAYOUT BUCKET ──────────────
│   ├── 8. READ: availableCollateral = collateralManager.getAvailableCollateral(trader)
│   ├── 9. READ: liquidationRewardBps / liquidationPenaltyBps
│   ├── 10. CALL: LiquidationLib.calculateLiquidationPayouts(exposure, availableCollateral, rewardBps, penaltyBps)
│   │   ├── targetPenalty = exposure * penaltyBps / 10000
│   │   ├── penaltyCollected = min(targetPenalty, availableCollateral)
│   │   ├── targetReward = exposure * rewardBps / 10000
│   │   ├── reward = min(targetReward, penaltyCollected)
│   │   ├── toInsurance = penaltyCollected - reward
│   │   └── marginReturned = availableCollateral - penaltyCollected
│   │
│   ├── ── DISTRIBUTE PROCEEDS ───────────────────────────────
│   ├── 11. CALL: _distributeLiquidationProceeds(trader, liquidator, reward, penalty, toInsurance, badDebt)
│   │   ├── rewardPaid: pro-rated if penalty was capped
│   │   ├── insuranceContribution = penaltyCollected - rewardPaid
│   │   ├── CALL: collateralManager.transferOut(liquidator, rewardPaid)
│   │   ├── CALL: perpStorage.depositToInsurance(insuranceContribution)
│   │   ├── CALL: collateralManager.transferToInsurance(insuranceContribution)
│   │   ├── WRITE: perpStorage.setAccountCollateral(trader, remainingCollateral - penaltyCollected)
│   │   └── marginReturned = new account collateral after penalty
│   │
│   ├── ── BAD DEBT COVERAGE FROM INSURANCE ─────────────────
│   ├── 12. IF badDebt > 0: CALL _coverBadDebtWithInsurance(badDebt)
│   │   ├── coverAmount = min(badDebt, insuranceFundBalance, InsuranceTreasury.balance(), totalBadDebt)
│   │   ├── CALL: InsuranceTreasury.withdrawTo(CollateralManager, coverAmount)
│   │   ├── WRITE: decrease insuranceFundBalance by coverAmount
│   │   └── WRITE: decrease totalBadDebt by coverAmount
│   │
│   └── 13. EMIT: PositionLiquidated (+ BadDebtRecorded / InsuranceFundUsed when applicable)
│
└── [Complete] Position liquidated, penalty bucket split (reward + insurance), trader collateral updated, bad debt partially covered by insurance when available