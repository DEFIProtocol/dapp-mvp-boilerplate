User calls: perpEngine.closePosition(42)

TRACE:
├── [PerpEngine] closePosition(42)
│   ├── 1. CALL: riskManager.getMarkPrice() → 2000
│   └── 2. → positionManager.closePosition(42, 2000)
│
├── [PositionManager] closePosition(positionId, closePrice)
│   ├── 1. READ: PerpStorage.positions[42] → Position(long.trader, Long, 1000, 100, 1900, ...)
│   ├── 2. REQUIRE: position.active == true
│   ├── 3. REQUIRE: trader account not frozen
│   │
│   ├── ── FUNDING SETTLEMENT ───────────────────────────────
│   ├── 4. READ: current cumulative funding from PerpStorage (long/short side)
│   ├── 5. CALC: fundingOwed = (current - entryFunding) * exposure
│   ├── 6. fundingOwed = 20 (long pays funding)
│   │
│   ├── ── PNL CALCULATION ──────────────────────────────────
│   ├── 7. CALC: grossPnL = (2000 - 1900) * 1000 / 1e18 = +100
│   ├── 8. CALC: netDelta = grossPnL - fundingOwed = +80
│   │
│   ├── ── REMOVE RESERVED MARGIN ───────────────────────────
│   ├── 9. CALL: collateralManager.removeReservedMargin(trader, 100)
│   │   └── [CollateralManager] removeReservedMargin()
│   │       ├── READ: PerpStorage.reservedMargin[trader] → 150
│   │       ├── WRITE: PerpStorage.setReservedMargin(trader, 50)
│   │       └── EMIT: ReservedMarginUpdated
│   │
│   ├── ── APPLY PNL TO COLLATERAL ──────────────────────────
│   ├── 10. CALL: collateralManager.applyAccountDelta(trader, +80)
│   │   └── [CollateralManager] applyAccountDelta()
│   │       ├── READ: PerpStorage.accountCollateral[trader] → 500
│   │       ├── delta >= 0 → newBalance = 580
│   │       ├── WRITE: PerpStorage.setAccountCollateral(trader, 580)
│   │       └── NOTE: positive delta path does not update realizedPnl
│   │
│   ├── ── UPDATE GLOBAL EXPOSURE ───────────────────────────
│   ├── 11. READ: PerpStorage.totalLongExposure → 50000
│   ├── 12. WRITE: PerpStorage.setTotalLongExposure(49000)
│   │
│   ├── ── REMOVE POSITION ──────────────────────────────────
│   ├── 13. WRITE: PerpStorage.setPositionActive(42, false)
│   ├── 14. CALL: PerpStorage.removeTraderPosition(trader, 42)
│   │   └── [PerpStorage] removeTraderPosition()
│   │       ├── Manage array, update indexes
│   │       └── Delete traderPositionIndexPlusOne[42]
│   ├── 15. WRITE: PerpStorage.setHasPosition(trader, 42, false)
│   ├── 16. WRITE: PerpStorage.decrementPositionCount(trader)
│   │
│   └── 17. EMIT: PositionClosed
│
└── [Complete] Position closed, PnL settled, collateral updated