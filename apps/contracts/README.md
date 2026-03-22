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

      - Funding
      - PnL
      - Fees
      - Liquidation math
      - Order validation





Exchange Simulator


deploy.ts
• start local network
• deploy contracts
• mint test USDC
• fund traders
• initialize oracle
• seed liquidity
ex.
1 deploy USDC
2 deploy oracle mock
3 deploy PerpEngine
4 mint USDC to traders
5 traders deposit margin

Trader Agents
These simulate different market participants.

You don’t want only random trades — that produces unrealistic markets.

Create multiple trader personalities.

Market Maker
Places both long and short positions.

Purpose:
provide liquidity
narrow spreads

Momentum Trader

Trades with the trend.

if price rising
    open long
if price falling
    open short

Random Retail Trader

Pure chaos.
random direction
random size
random timing

Whale

Large position sizes.

Tests:

• liquidity
• insurance fund
• liquidation cascades

Liquidator Bots

These constantly scan positions.

if position health < threshold
     liquidate

This tests:

• liquidation incentives
• insurance fund protection

Without these bots liquidations won't happen in simulation.

5. Order Generator
Instead of writing trade logic everywhere, build one generator.

generateOrder()

Output:

{
 trader
 side: long/short
 size
 leverage
 price
}

Example random generation:

size = random(1k, 100k)
leverage = random(2x, 10x)
side = random(long/short)

6. Market Price Engine

Market Price Engine

Your protocol likely depends on a mark price oracle.

In simulation, you control it.

Create a price model:

Random Walk
price = price + random(-.5%, +.5%)

Trending Market
price += 0.3% every step
Volatility Shock
price -= 30%
Black Swan
price -= 70% instantly

These are critical tests.

Real markets behave like this during crashes.


7.) Scenario Controller

Scenario Controller

This decides what environment the simulation runs in.

Example scenarios:

Normal Market
price volatility: low
trader count: 50
duration: 10k trades
Bull Run
price trending up
more longs than shorts
Bear Market
price trending down
liquidations increase
Liquidity Crisis
few traders
large positions
thin liquidity
Black Swan Crash
price drops 60%
mass liquidations
insurance fund stress test

This is the most important test.

8.) Your core loop might look like this:

for step in 0 → 50,000

    updatePrice()

    trader = randomTrader()

    order = generateOrder()

    executeTrade(order)

    checkLiquidations()

    recordMetrics()

This will run thousands of real blockchain transactions.

9. Metrics Collection

You need analytics every step.

Track things like:

Protocol Health
TVL
open interest
long/short ratio

Risk
average leverage
liquidation count
bad debt
Insurance Fund
insurance balance
insurance payouts
insurance growth
Market Quality
slippage
spread
price impact

10. Logging System

Every step should log something like:

STEP 2450
price: $2015
open interest: $5.2M
liquidations: 4
insurance fund: $320k

Save logs to a file:

simulation-results.json

11. Visualization

After simulation finishes, generate charts.

Charts you want:

• price vs open interest
• liquidations over time
• insurance fund balance
• protocol revenue

Use libraries like:

• chart.js
• matplotlib
• plotly

12. Stress Tests You MUST Run

These are the important ones.

1️⃣ 50k Trades

Tests scaling and gas.

2️⃣ Whale Liquidation
$10M position
10x leverage

Price drops 10%.

Check:

• does insurance fund cover losses?

3️⃣ Liquidation Cascade
price drops 20%
many traders liquidated

Check:

• does protocol become insolvent?

4️⃣ Oracle Failure

Freeze price.

Does the system break?

5️⃣ Liquidity Drain

Remove liquidity providers.

Can traders still exit?

13. Performance

Running 50k trades normally would take forever.

But Hardhat allows instant mining.

So your simulation can run:

50,000 trades
in about 1–3 minutes


14. The Final Output

After simulation you should get something like:

Simulation Results

Trades executed: 50,000
Liquidations: 1,203
Insurance fund start: $100,000
Insurance fund end: $184,200
Protocol fees earned: $92,400
Bad debt: $0

If bad debt > 0, your system is broken.

15. The Most Important Metric

Perp protocols live or die by:

insurance fund solvency

If the insurance fund cannot cover liquidations during a crash, the exchange dies.

16. One More Thing (This Is HUGE)

Add a deterministic seed.

Example:

seed = 12345

Then your simulation becomes reproducible.

If a bug happens at step 37,412 you can re-run the exact scenario.