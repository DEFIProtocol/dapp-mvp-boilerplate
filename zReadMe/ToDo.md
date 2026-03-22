
# Smart Contract & Protocol To-Do
*Items verified against live contract code. Resolved items removed. Order = priority.*

---

## DONE — verified in code, no action needed

- Funding rate formula: `imbalance = (long - short) / total → rate = imbalance × maxRate`
  (`FundingLib.calculateFundingRate`)
- Max oracle deviation guard: execution price checked vs mark price (5% cap) before every settlement
  (`SettlementEngine._requireWithinOracleDeviation`)
- Withdrawal safety: post-withdraw equity ≥ maintenance margin checked on every withdrawal
  (`CollateralManager.withdrawCollateral`)
- Emergency pause: `setEmergencyPause()`, per-market pause, frozen accounts — all wired
  (`PerpStorage`, `PerpSettlement.setEmergencyPause`)
- Oracle replacement: `setOracle()` + `setInsuranceFund()` exist on `PerpSettlement`
- Parameter governance: `setRiskParams`, `setFeeParams`, `setFundingParams`, etc. all exist
- Max leverage: `MAX_LEVERAGE=100` constant enforced in `PositionManager` on every position open
- Max positions per market: 1 active position per trader per market enforced in `PositionManager`
- Solvency check every sim step: `consistency.ts` solvency-bound assertion runs each step
- Liquidator reward: `liquidate()` pays liquidator via `LiquidationEngine._distributeLiquidationProceeds`

**1. Solvency-bound consistency failures in stress runs**
Simulator throws "Consistency check failed" in some stress scenarios. Root cause not yet diagnosed.
Run oracle-failure and black-swan scenarios, isolate which assertion fails (solvency-bound /
insurance-balance-sync / exposure-sync), trace back to the responsible module, fix the accounting.
- Files: `consistency.ts`, `runSimulator.ts`, `LiquidationEngine.sol`, `CollateralManager.sol`

**2. Oracle staleness — no fallback or auto-freeze behavior**
`MarkPrice.sol` reverts when the oracle index is stale: liquidations fail silently.
There is no auto-trigger to pause new settlement on staleness — only manual `setEmergencyPause`.
- Fix: when oracle is stale, the settlement loop should auto-halt (new stale-oracle flag) so
  operators can observe and act without needing an emergency manual call.
- Files: `MarkPrice.sol` (`getMarkPrice`), `Oracle.sol` (`isStale`), `PerpSettlement`

??
**3. Circuit breakers, liquidation throttling, order size limits**
`maxReductionBpsPerEvent` and `maxStepsPerTx` are defined in `ADLEngine` but never enforced —
the while-loop in `executeAutoDeleverage` runs unbounded. No price-speed gate exists.
- Fix: enforce throttle params in the while-loop; add a `maxPriceMovePct` storage param
  checked at the top of `settleMatch`.
- Files: `ADLEngine.sol` (`executeAutoDeleverage`), `PerpStorage.sol`, `SettlementEngine._settleMatch`

---

## PRIORITY 2 — Fix before production launch

**4. Trade matching attack: matchId uses `block.timestamp`**
Current: `matchId = keccak256(longHash, shortHash, block.timestamp)` — two matches in the
same block with the same orders produce an identical matchId (replay vector).
- Fix: add a `fillNonce` counter to `PerpStorage`, increment on every match, use it instead:
  `keccak256(longHash, shortHash, fillNonce)` — applies to 3 places in `SettlementEngine`.
- Files: `SettlementEngine._settleMatch` (lines 262, 314, 412), `PerpStorage`

**5. Keeper incentives: `updateFunding()` has no on-chain reward**
`updateFunding()` is open to anyone but pays nothing. If no one calls it, funding stops.
- Fix: allocate a small bps from the fee pool per successful `updateFunding()` call, paid to
  `msg.sender` via `CollateralManager.transferOut`.
- Files: `FundingEngine.updateFunding`, `CollateralManager`
---
**6. Anti-DoS: no max open orders per account**
Max leverage and single-active-position-per-market are enforced, but a trader can place unlimited
pending orders (no cap on the `filledAmount` mapping).
- Fix: add `maxPendingOrdersPerAccount` to `PerpStorage`, track per-account counter, enforce
  inside `SettlementEngine._validateOrder`.
- Files: `PerpStorage`, `SettlementEngine._validateOrder`

---

## PRIORITY 3 — Launch readiness / investor documentation

**7. Governance: no multisig or timelock**
All admin functions use basic `Ownable` (single hot key). Production requires a Gnosis Safe
(2-of-3 or 3-of-5) + `TimelockController` on parameter changes.
- Fix: deploy `OpenZeppelin TimelockController` + Gnosis Safe, transfer `PerpSettlement`
  ownership to timelock, document delay values.
- Files: deploy scripts, `PerpSettlement` (`transferOwnership`)

**8. Upgrade posture not hardened**
`upgradeModule()` in `PerpSettlement` exists but is flagged in its own comment as "simplified."
No proxies, migration scripts, or rollback plan.
- Fix: decide UUPS vs. manual module-swap strategy, write the policy document, at minimum add
  events and interface validation to `upgradeModule()`.
- Files: `PerpSettlement.upgradeModule`

## PRIORITY 1 — Fix before stress-test sign-off


**9. Proof pack: risk parameters tied to scenario evidence**
Simulation run outputs exist in `simulation-results/` but nothing formally links parameter
choices (`maintenanceMarginBps`, `liquidationRewardBps`, ADL ratios) to scenario outcomes.
- Fix: write `zReadMe/ProofPack.md` — a table of param → scenario → outcome with links to
  specific simulation JSON runs.
- Status: ✅ Implemented in `zReadMe/ProofPack.md`.

**10. Liquidation price caching (gas reduction)**
`liquidationPrice` and `bankruptcyPrice` are computed on-demand inside every liquidation check.
- Fix: store both in the `Position` struct, update on every margin/exposure change.
  Reduces gas for keepers scanning all positions.
- Files: `PerpStorage.Position` struct, `PositionManager`, `RiskManager.isPositionLiquidatable`
- Status: ✅ Implemented in `PerpStorage.Position`, `PositionManager` cache refresh hooks,
  and `RiskManager` cached-liquidation checks.

---

## PRIORITY 4 — Future scope

**11. External security audit**
No code changes — schedule when code is stable after Priority 1–3 items are closed.
Target: Sherlock or Code4rena.

**12. Advanced order types**
Currently only market (limitPrice=0) and limit orders exist.
Users expect stop-loss, take-profit, reduce-only, post-only.
High effort, high user-facing value — scope separately after core stability.
- Files: `OrderLib.sol` (`Order` struct, `ORDER_TYPEHASH`), `SettlementEngine._validateOrder`

**13. Funding rate: optional mark-index formula upgrade**
Current imbalance-based formula is correct and intentional. Classic `(mark - index) / index`
formula would track price divergence instead of order-book imbalance.
Only needed if you want to match GMX / dYdX funding behaviour exactly.
- Files: `FundingLib.calculateFundingRate`, `FundingEngine.updateFunding`

**14. Wire `MarkPrice` / TWAP oracle into simulator**
`deployLocal.ts` uses `MockOracle` instead of `MarkPrice`, so simulation does not exercise the
production oracle stack.
- Files: `scripts/simulator/deployLocal.ts`

---

## UNCLEAR / OUT OF SCOPE FOR SMART CONTRACTS

- **Solvency buffer "fail at 99.5% solvent"**: this is a simulator config observation.
  `maintenanceMarginBps=75` (0.75%) in `PerpStorage`. Adjust that value in `deployLocal.ts`
  if you want a different buffer. No logic change needed — just a knob.


- **Chain-aware pages + cross-chain swap UI**: frontend/infrastructure work.
  Add chain selector + bridge call button to each page. Not a contract change.

- **Funding formula product question (imbalance vs mark-index)**: intentional design decision.
  Current implementation is correct. Revisit only if product direction changes.

---

## Simulation Results

| Scenario            | Bad Debt | Insurance Used | Solvency Buffer | Notes |
|---------------------|----------|----------------|-----------------|-------|
| Normal              |          |                |                 |       |
| Oracle Failure      |          |                |                 |       |
| Bear Market         |          |                |                 |       |
| Volatility Shock    |          |                |                 |       |
| Black Swan          |          |                |                 |       |
| Liquidation Cascade |          |                |                 |       |

