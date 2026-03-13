Anyone calls: perpEngine.updateFunding()

TRACE:
├── [PerpEngine] updateFunding()
│   └── → fundingEngine.updateFunding()
│
├── [FundingEngine] updateFunding()
│   ├── 1. READ: PerpStorage.nextFundingTime → 12:00
│   ├── 2. REQUIRE: block.timestamp >= 12:00
│   │
│   ├── ── CALCULATE FUNDING RATE ───────────────────────────
│   ├── 3. READ: PerpStorage.totalLongExposure → 1,000,000
│   ├── 4. READ: PerpStorage.totalShortExposure → 800,000
│   ├── 5. CALC: imbalance = (1M - 800k) / (1M + 800k) = 0.111
│   ├── 6. CALC: rate = imbalance * maxRate / 1e18
│   │
│   ├── ── UPDATE CUMULATIVE FUNDING ────────────────────────
│   ├── 7. READ: PerpStorage.cumulativeFundingLong
│   ├── 8. READ: PerpStorage.cumulativeFundingShort
│   ├── 9. long pays short → 
│   │   ├── cumulativeFundingLong += rate
│   │   └── cumulativeFundingShort -= rate
│   ├── 10. WRITE: PerpStorage.setCumulativeFundingLong(newLong)
│   ├── 11. WRITE: PerpStorage.setCumulativeFundingShort(newShort)
│   │
│   ├── ── UPDATE TIMERS ────────────────────────────────────
│   ├── 12. WRITE: PerpStorage.setLastFundingUpdate(block.timestamp)
│   ├── 13. WRITE: PerpStorage.setNextFundingTime(block.timestamp + fundingInterval)
│   │
│   └── 14. EMIT: FundingUpdated
│
└── [Complete] Funding rates updated for next period