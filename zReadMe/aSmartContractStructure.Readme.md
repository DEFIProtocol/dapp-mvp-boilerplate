┌──────────────────────────────────────────────────────────────────────┐
│                          PERPENGINE (Router)                          │
│                      msg.sender → function dispatch                   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                       PERPSTORAGE                             │
    │  "The Source of Truth" - All state lives here                 │
    │  ┌────────────────────────────────────────────────────────┐   │
    │  │ Account State:    │ Global State:   │ Position State: │   │
    │  │ accountCollateral │ feePool         │ positions[]     │   │
    │  │ reservedMargin    │ totalExposure   │ entryPrice      │   │
    │  │ realizedPnl       │ cumulativeFunding│ margin         │   │
    │  │ positionCount     │ insuranceFundBalance                │   │
    │  └────────────────────────────────────────────────────────┘   │
    └──────────────────────────────────────────────────────────────┘
                    ▲               ▲               ▲
                    │               │               │
    ┌───────────────┴───────┐ ┌─────┴──────┐ ┌──────┴──────────┐
    ▼                       ▼ ▼            ▼ ▼                 ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│CollateralMgr  │    │PositionManager│    │ RiskManager   │    │SettlementEngine│
│   (Module)    │    │   (Module)    │    │   (Module)    │    │   (Module)    │
└───────────────┘    └───────────────┘    └───────────────┘    └───────────────┘
    ▲                                                       ▲
    │                                                       │
┌───────────────┐                                       ┌───────────────┐
│LiquidationEng │                                       │ FundingEngine │
│   (Module)    │                                       │   (Module)    │
└───────────────┘                                       └───────────────┘
        │                   │                   │                   │
        └───────────────────┼───────────────────┼───────────────────┘
                            ▼                   ▼
                ┌─────────────────────────────────────┐
                │      EXTERNAL TREASURIES             │
                ├─────────────────┬───────────────────┤
                │ ProtocolTreasury │ InsuranceTreasury │
                │ (Trading Fees)   │ (Bad Debt Coverage + Liquidation Remainder)│
                └─────────────────┴───────────────────┘