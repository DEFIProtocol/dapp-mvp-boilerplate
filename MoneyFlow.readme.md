Money Flow Diagram(Should be allocated in Collateral Manager)


                   Traders
                      │
                      ▼
               Trade Executed
                      │
                      ▼
                PnL Calculated
        ┌─────────────┴─────────────┐
        ▼                           ▼
   Trader Profit               Trader Loss
        │                           │
        └──────────────┬────────────┘
                       ▼
               Margin Transfers


               Liquidation/liquidation reward

                            Trader Liquidated
                        │
                        ▼
                 Position Closed
                        │
                        ▼
                Liquidation Penalty
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
 Liquidator Reward                 Insurance Fund
      (0.8%)                           (0.7%)   
