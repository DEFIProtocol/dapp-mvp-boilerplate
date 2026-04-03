# Decentralized Exchange Rebuild Roadmap

Goal: Build a Bybit/Deribit-level decentralized exchange with a non-custodial flow.
Key requirement: user funds move from wallet only when trade opens, and are returned to wallet when position closes.
No idle pre-funded balances required for the default path.

## Plan 1 - Core Contract Model (Perps + Non-Custodial JIT Margin)

### 1.1 Target behavior

- Open trade:
  - User signs order off-chain.
  - On fill, contract pulls required margin from wallet via ERC20 `transferFrom` (or permit path).
- Close trade:
  - Margin and realized PnL are returned immediately to wallet.
- Liquidation:
  - Locked margin is distributed (liquidator reward, insurance, remainder) and remainder goes back to trader wallet.

### 1.2 Required contract updates

- `apps/contracts/contracts/perps/trading/SettlementEngine.sol`
  - Add/route open flow to pull margin at fill time for JIT mode.
  - Keep explicit market routing (`marketId`) as default behavior.
- `apps/contracts/contracts/shared/account/CollateralManager.sol`
  - Add primitives:
    - `pullMarginFromTrader(address trader, uint256 amount, address token)`
    - `pushMarginToTrader(address trader, uint256 amount, address token)`
  - Keep existing deposit/withdraw functions for optional legacy/pre-funded mode.
- `apps/contracts/contracts/perps/risk/LiquidationEngine.sol`
  - Ensure liquidation distributions are applied from locked margin and residual value is pushed back to wallet.
- `apps/contracts/contracts/perps/storage/PerpStorage.sol`
  - Add `jitModeEnabled` feature flag.
  - Add `collateralToken` field on `Position` for explicit payout token accounting.
- `apps/contracts/contracts/PerpSettlement.sol`
  - Expose views needed by frontend/backend:
    - `getPositionCollateralToken(positionId)`
    - `getLockedMargin(positionId)`

### 1.3 Compatibility policy

- `jitModeEnabled = false`: current pre-funded behavior remains.
- `jitModeEnabled = true`: new wallet pull/push behavior becomes default for legacy account path.
- Subaccounts remain supported and can stay pre-funded in first rollout.

## Plan 2 - Options Engine v1 (European Cash-Settled)

### 2.1 Scope

- Product type: European calls and puts.
- Settlement: cash-settled in stable collateral.
- Pricing model: full Black-Scholes, including proper time value, volatility input, and Greeks-aware valuation.

### 2.2 New contracts/modules

- `apps/contracts/contracts/options/storage/OptionsStorage.sol`
  - `OptionSeries` and `OptionPosition` structs.
  - Series lifecycle: register, active, expiry, settled.
- `apps/contracts/contracts/options/library/OptionsPricer.sol`
  - `getMarkPremium(seriesId, spot)`
  - `getWriterMargin(seriesId, size, spot)`
- `apps/contracts/contracts/options/modules/OptionsEngine.sol`
  - `openLongOption(seriesId, size)`
  - `openShortOption(seriesId, size)`
  - `expireSeries(seriesId)`
  - `settleOption(positionId)`

### 2.3 Integration notes

- Reuse existing oracle feed model by `marketId`.
- Use same collateral movement primitives from `CollateralManager`.
- Keep options isolated from perps until unified margin layer is introduced.

## Plan 3 - Unified Margin / Risk Engine

### 3.1 Purpose

Risk should remain product-aware rather than forcing all products into one liquidation path.

- Perps risk should be handled at the position level, or at the account level when the trader is using cross margin.
- Perps liquidations should only affect perp positions and the collateral supporting those perp positions.
- Options should not be liquidated the same way perps are. Instead, options should follow their own lifecycle: pricing while active, then exercise or settlement at expiry.
- The engine in this phase is therefore a shared risk and valuation layer, not a rule that all products must be liquidated together.
- The main purpose of Plan 3 is to centralize account equity, margin views, and product-specific risk checks without incorrectly coupling perp liquidation logic to options settlement behavior.


## Plan 4 - Tests (Contract + Integration)

### 4.1 JIT margin tests

Status: implemented in [apps/contracts/test/JITMargin.test.ts](apps/contracts/test/JITMargin.test.ts)

Create `apps/contracts/test/JITMargin.test.ts`:

- open pulls margin from wallet
- close returns margin + PnL to wallet
- losing close returns margin - loss
- liquidation payout distribution works in JIT mode
- insufficient allowance/approval reverts
- mixed perps + options activity works with JIT collateral pulls
- protocol treasury and option feePool reconcile across perp trading fees, option creation/exercise fees, and secondary transfer fees

### 4.2 Options tests

Create `apps/contracts/test/OptionsEngine.test.ts`:

- open long/short option behavior
- expiry and settlement for ITM/OTM calls and puts
- writer margin lock/release behavior
- cannot open expired/inactive series

### 4.3 Unified margin tests

Status: completed in [apps/contracts/test/UnifiedMarginEngine.test.ts](apps/contracts/test/UnifiedMarginEngine.test.ts)

Create `apps/contracts/test/UnifiedMarginEngine.test.ts`:

- mixed portfolio equity math
- mixed portfolio maintenance check
- liquidation threshold across products
- open-allowed checks with offsets
- partial perp force-reduction lowers maintenance requirement as expected
- short option ownership transfer continues to work during adverse perp drawdown with correct reserved-margin handoff
- opposite-side offset reduces maintenance exposure without requiring additional margin when no residual opens
- oversized opposite-side offset flips to residual position with expected side and exposure

### 4.4 Regression updates

Update existing tests to assert:

- `position.marketId`
- `position.subAccountId`
- `position.collateralToken`
- JIT mode paths do not rely on `accountCollateral` for open/close accounting

## Plan 5 - Simulator + Acceptance

Status: on hold until pre-simulation production-readiness review is completed.

### 5.1 Deployment flow updates

- `apps/contracts/scripts/simulator/deployLocal.ts`
  - Add JIT mode toggle.
  - Configure trader approvals for settlement flow.
  - Keep optional pre-funded scenario path for A/B comparison.

### 5.2 Runtime simulator updates

- `apps/contracts/scripts/simulator/runSimulator.ts`
  - Add options participants and order generation.
  - Add series lifecycle events (register/expire/settle).
  - Keep explicit market settlement routing.

### 5.3 Metrics updates

Track:

- account equity (portfolio)
- perp/options position counts
- liquidation count by product
- insurance utilization
- ADL events with mixed products

### 5.4 Acceptance criteria

- No unhandled reverts in stress path.
- Hedged account scenario survives intended crash profile.
- Naked risk scenario liquidates as expected.
- Final accounting invariants hold for collateral, fee pools, insurance, and bad debt.

## Implementation order

1. Plan 1 (JIT margin core)
2. Plan 4.1 (JIT tests)
3. Plan 2 (Options v1)
4. Plan 4.2 (Options tests)
5. Plan 3 (Unified margin)
6. Plan 4.3 (Unified tests)
7. Plan 5 (Simulator + acceptance)

This order keeps each milestone independently testable and reversible.

## Pre-Simulation Production Readiness Review (must finish before Plan 5)

### A) Liquidation logic and fund destinations

Status: in progress

- Implemented: liquidation fund-flow conservation test in `apps/contracts/test/PerpSettlement.test.ts`
  - validates `PositionLiquidated` reward/insurance split,
  - validates liquidator reward transfer,
  - validates insurance treasury and `insuranceFundBalance` deltas,
  - validates fee pool and protocol treasury remain unchanged for liquidation path,
  - validates token-flow conservation across collateral manager + insurance + protocol + liquidator buckets.

- Confirm perps liquidation payout waterfall end-to-end:
  - liquidator reward,
  - insurance contribution,
  - remaining collateral handling,
  - bad-debt coverage and socialization fallback.
- Confirm option liquidation path (`liquidateOptionPosition`) accounting and events.
- Add explicit assertions/reports that every liquidation delta is conserved across:
  - account collateral,
  - fee pool,
  - protocol treasury,
  - insurance treasury,
  - bad debt counters.

### B) Options funding invariants

Status: implemented in `apps/contracts/test/UnifiedMarginEngine.test.ts`

- Added explicit tests that option-only risk metrics are unchanged by perp funding index updates:
  - long option equity contribution remains unchanged,
  - short option maintenance requirement remains unchanged,
  - account equity for option-only account remains unchanged.

- Options should not accrue perp-style periodic funding fees.
- Add explicit tests/invariants proving option positions are unaffected by funding index updates.

### C) Expiry ownership and execution responsibilities

Status: in progress

- Implemented on-chain enforceability tests in `apps/contracts/test/OptionsEngine.test.ts`:
  - permissionless keeper can call `expireSeries` after expiry timestamp,
  - duplicate `expireSeries` attempts are cleanly rejected,
  - delayed settlement works without prior explicit expiry call,
  - first delayed settle auto-transitions series `Active -> Expired`,
  - final settle transitions series `Expired -> Settled`,
  - duplicate settle retries are cleanly rejected.

- Backend/keeper responsibilities still to define and verify:
  - keeper scheduling SLA for expiry and settlement jobs,
  - retry strategy and idempotent handling for delayed/failed submissions,
  - alerting and recovery for missed expiry windows.

- Stale-oracle / paused-market checklist still to finalize for expiry windows:
  - expected behavior when mark source is stale at settlement time,
  - policy for pausing new opens while still allowing safe settlement.

- Define ownership split for option expiry lifecycle:
  - on-chain enforceability (series expiry, settlement rules),
  - backend/keeper responsibilities (triggering expiry/settlement jobs),
  - retry/idempotency guarantees for delayed jobs.
- Add checklist for stale-oracle/paused-market behavior during and after expiry.

Acceptance criteria:
- `expireSeries` remains permissionless post-expiry and rejects duplicate transitions.
- Delayed `settleOption` path safely transitions `Active -> Expired -> Settled` and remains idempotent.
- Keeper retries do not produce double-settlement, double-payout, or series-state corruption.
- Stale-oracle policy is enforced: new risk-increasing actions pause while safe settlement/close paths remain available.

### D) Production hardening checklist before simulator work

Status: completed (contract hardening scope)

- Implemented in `apps/contracts/test/PerpSettlement.test.ts`:
  - stale-oracle pause path blocks new settlement,
  - missing protocol treasury cleanly reverts settlement fee routing,
  - stale-oracle liquidation gate enforces `liquidateWithPrice` usage,
  - `liquidateWithPrice` access control requires authorized module,
  - insurance-fallback liquidation path records bad debt when insurance treasury has no liquidity.

- Contract test blockers before Plan 5: none.