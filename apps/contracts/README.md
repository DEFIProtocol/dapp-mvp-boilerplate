Global Dependency Graph

                    PerpSettlement
                         │
 ┌───────────────────────┼────────────────────────┐
 │                       │                        │
 │                       │                        │
Collateral Engine   Order Settlement        Risk Engine
 │                       │                        │
 │                       │                        │
depositCollateral   settleMatch()            getAccountEquity()
withdrawCollateral  settleMatches()          │
 │                       │                    │
 │                       ▼                    │
 │                _settleSingleMatch()        │
 │                       │                    │
 │        ┌──────────────┼─────────────┐      │
 │        │              │             │      │
 │   _hashOrder()   _verify()   _requireAvailableCollateral()
 │        │              │             │
 │        │              │             │
 │        │              │        getAvailableCollateral()
 │        │              │
 │        │              ▼
 │        │        _applyTradingCharges()
 │        │              │
 │        │              ├── feePool += fee
 │        │              └── insuranceFund.deposit()
 │        │
 │        ▼
 │   _openPosition()
 │        │
 │        ├── reservedMargin update
 │        ├── exposure update
 │        └── positions mapping
 │
 └───────────────────────────────────────────────


 Position Lifecycle Graph


            settleMatch()
                 │
                 ▼
        _settleSingleMatch()
                 │
                 ▼
           _openPosition()
                 │
                 ▼
             Position
                 │
        ┌────────┼─────────┐
        │                  │
        ▼                  ▼
   closePosition()      liquidate()
        │                  │
        ▼                  ▼
_computePositionPnL     _liquidateWithMark()
        │                  │
        ▼                  ▼
_applyAccountDelta()   _applyAccountDelta()
        │                  │
        ▼                  ▼
 accountCollateral     accountCollateral



 Liquidation Risk Path (MOST CRITICAL)

 liquidate()
   │
   ▼
_liquidateWithMark()
   │
   ├─ _computePositionPnlAndFunding()
   │
   ├─ getAccountEquity()
   │      │
   │      └─ loops traderPositions[]
   │
   ├─ maintenanceMargin check
   │
   ├─ _removeTraderPosition()
   │
   ├─ _applyAccountDelta()
   │
   ├─ reward → liquidator
   │
   └─ penalty → feePool



   Storage Dependency Map
   accountCollateral
 ├─ depositCollateral
 ├─ withdrawCollateral
 ├─ closePosition
 ├─ liquidate
 └─ _applyTradingCharges


reservedMargin
 ├─ _openPosition
 ├─ closePosition
 └─ liquidate


positions
 ├─ _openPosition
 ├─ closePosition
 └─ liquidate


filledAmount
 └─ _settleSingleMatch


traderPositions
 ├─ _openPosition
 └─ _removeTraderPosition


totalLongExposure
 ├─ _openPosition
 └─ closePosition / liquidate


totalShortExposure
 ├─ _openPosition
 └─ closePosition / liquidate


feePool
 ├─ _applyTradingCharges
 ├─ liquidate
 └─ withdrawFees


 PerpSettlement
│
├── Collateral Manager
│     depositCollateral
│     withdrawCollateral
│     _applyAccountDelta
│
├── Order Engine
│     settleMatch
│     settleMatches
│     _verify
│     _hashOrder
│
├── Position Manager
│     _openPosition
│     closePosition
│     _removeTraderPosition
│
├── Risk Engine
│     getAccountEquity
│     _computePositionPnL
│
├── Liquidation Engine
│     liquidate
│     _liquidateWithMark
│
└── Funding Engine
      updateFunding


Refactor Smart Contract
contracts/

PerpEngine.sol
│
├── modules/
│     ├─ SettlementEngine.sol
│     ├─ PositionManager.sol
│     ├─ LiquidationEngine.sol
│     ├─ RiskManager.sol
│     └─ CollateralManager.sol
│
├── storage/
│     └─ PerpStorage.sol
│
└── libraries/
      ├─ OrderLib.sol
      ├─ FundingLib.sol
      └─ MathLib.sol