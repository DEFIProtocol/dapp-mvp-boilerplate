User calls: perpEngine.settleMatch(longOrder, sig, shortOrder, sig, 1000)

TRACE:
├── [PerpEngine] settleMatch(...)
│   └── → settlementEngine.settleMatch(...)
│
├── [SettlementEngine] settleMatch(...)
│   ├── ── VALIDATION PHASE ──────────────────────────────────
│   ├── 1. READ: PerpStorage.emergencyPause() → false
│   ├── 2. CHECK: longOrder.side == Long, shortOrder.side == Short
│   ├── 2a. READ: markPrice = riskManager.getMarkPrice()
│   ├── 3. READ: PerpStorage.minValidNonce[trader] for both
│   ├── 4. READ: PerpStorage.cancelledNonce[trader][nonce] for both
│   ├── 5. READ: PerpStorage.filledAmount[orderHash] for both
│   ├── 6. CHECK: matchSize <= remaining for both
│   ├── 7. VERIFY: signatures via EIP712
│   ├── 8. CHECK: OrderLib.doOrdersCross(longOrder, shortOrder)
│   │
│   ├── ── ORDER FILL TRACKING ──────────────────────────────
│   ├── 9. CALC: longHash = hashOrder(longOrder)
│   ├── 10. CALC: shortHash = hashOrder(shortOrder)
│   ├── 11. READ: longFilled = PerpStorage.filledAmount[longHash]
│   ├── 12. READ: shortFilled = PerpStorage.filledAmount[shortHash]
│   ├── 13. WRITE: PerpStorage.setFilledAmount(longHash, longFilled + 1000)
│   ├── 14. WRITE: PerpStorage.setFilledAmount(shortHash, shortFilled + 1000)
│   │
│   ├── ── FEE CALCULATION ──────────────────────────────────
│   ├── 15. READ: PerpStorage.makerFeeBps, takerFeeBps, insuranceBps
│   ├── 16. CALC: fees using FeeLib
│   ├── 17. NOTE: current CollateralManager policy sets insuranceCut=0 for trading fees
│   │
│   ├── ── MARGIN REQUIREMENT ───────────────────────────────
│   ├── 18. CALC: requiredMargin = 1000 / executionLeverage (100 each)
│   ├── 19. CALL: collateralManager.requireAvailableCollateral(long.trader, 100 + fees)
│   │   └── [CollateralManager] getAvailableCollateral(long.trader)
│   │       ├── READ: PerpStorage.accountCollateral[long.trader]
│   │       ├── READ: PerpStorage.reservedMargin[long.trader]
│   │       └── RETURN: available
│   ├── 20. Same for short.trader
│   │
│   ├── ── FEE CHARGING ─────────────────────────────────────
│   ├── 21. CALL: collateralManager.chargeTradingFees(long.trader, 1000, false)
│   │   └── [CollateralManager] chargeTradingFees()
│   │       ├── READ: PerpStorage.accountCollateral[trader]
│   │       ├── WRITE: PerpStorage.setAccountCollateral(trader, newBalance - fees)
│   │       ├── APPROVE: collateral.forceApprove(protocolTreasury, fees)
│   │       ├── CALL: IProtocolTreasury.deposit(fees)
│   │       │   └── [ProtocolTreasury] deposit()
│   │       │       ├── TRANSFER: collateral.safeTransferFrom(msg.sender, address(this), fees)
│   │       │       └── EMIT: TreasuryDeposited
│   │       ├── READ: PerpStorage.feePool
│   │       ├── WRITE: PerpStorage.setFeePool(feePool + fees)
│   │       └── EMIT: FeeCharged
│   ├── 22. Same for short.trader (isMaker=true)
│   │
│   ├── ── POSITION CREATION ────────────────────────────────
│   ├── 23. GET: matchPrice = OrderLib.getMatchPrice(longOrder, shortOrder, markPrice)
│   ├── 24. CALL: positionManager.openPosition(long.trader, Long, 1000, 10, matchPrice)
│   │   └── [PositionManager] openPosition()
│   │       ├── 1. READ: PerpStorage.nextPositionId
│   │       ├── 2. SET: positionId = nextPositionId
│   │       ├── 3. WRITE: PerpStorage.setPosition(positionId, Position({
│   │       │       trader: long.trader,
│   │       │       side: Long,
│   │       │       exposure: 1000,
│   │       │       margin: 100,
│   │       │       entryPrice: matchPrice,
│   │       │       entryFunding: PerpStorage.cumulativeFundingLong,
│   │       │       active: true
│   │       │   }))
│   │       ├── 4. WRITE: PerpStorage.setHasPosition(long.trader, positionId, true)
│   │       ├── 5. WRITE: PerpStorage.pushTraderPosition(long.trader, positionId)
│   │       ├── 6. WRITE: PerpStorage.setTraderPositionIndex(positionId, newIndex + 1)
│   │       ├── 7. WRITE: PerpStorage.incrementPositionCount(long.trader)
│   │       ├── 8. READ: PerpStorage.totalLongExposure
│   │       ├── 9. WRITE: PerpStorage.setTotalLongExposure(totalLongExposure + 1000)
│   │       ├── 10. CALL: collateralManager.addReservedMargin(long.trader, 100)
│   │       │   └── [CollateralManager] addReservedMargin()
│   │       │       ├── READ: PerpStorage.reservedMargin[trader]
│   │       │       ├── WRITE: PerpStorage.setReservedMargin(trader, current + 100)
│   │       │       └── EMIT: ReservedMarginUpdated
│   │       └── 11. EMIT: PositionOpened
│   ├── 25. Same for short.trader (updates totalShortExposure)
│   │
│   ├── 26. GENERATE: matchId = keccak256(longHash, shortHash, block.timestamp)
│   └── 27. EMIT: MatchSettled
│
└── [Complete] Two positions created, fees deposited to treasury