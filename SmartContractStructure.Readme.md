                    ┌──────────────────┐
                    │   Order Engine   │
                    └─────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ PositionManager │
                     └───────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  CollateralManager     FundingEngine     LiquidationEngine
         │                   │                   │
         └───────────────┬───┴───────┬───────────┘
                         ▼           ▼
                    MarginVault   InsuranceFund
                         │
                         ▼
                    ProtocolTreasury