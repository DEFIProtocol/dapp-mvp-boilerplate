# Proof Pack — Risk Parameters vs Scenario Evidence

This document links core protocol risk parameters to observed behavior in deterministic simulation runs.

## Reference Runs (seed = 12345)

- Black Swan: `apps/contracts/simulation-results/blackSwan_12345_1774120696270/simulation_complete.json`
- Oracle Failure: `apps/contracts/simulation-results/oracleFailure_12345_1774104659269/simulation_complete.json`
- Liquidation Cascade: `apps/contracts/simulation-results/liquidationCascade_12345_1774105520654/simulation_complete.json`

Companion summaries:
- `apps/contracts/simulation-results/blackSwan_12345_1774120696270/summary.txt`
- `apps/contracts/simulation-results/oracleFailure_12345_1774104659269/summary.txt`
- `apps/contracts/simulation-results/liquidationCascade_12345_1774105520654/summary.txt`

## Parameter Evidence Table

| Parameter | Configured Value | Scenario Evidence | Observed Outcome |
|---|---:|---|---|
| `maintenanceMarginBps` | `75` (0.75%) | Black Swan + Liquidation Cascade | Liquidations trigger and de-risk positions under stress. Black Swan: liquidator orders `21`, liquidation penalty collected `$3182.775`, insurance used `$74.109`. Cascade: liquidator orders `2456`, penalties `$11374.65`, insurance used `$0.0`. |
| `liquidationRewardBps` | `80` (0.8%) | Black Swan + Liquidation Cascade | Keepers are paid as intended. Black Swan: liquidator rewards `$1697.48`. Cascade: liquidator rewards `$6066.48`. |
| `liquidationPenaltyBps` | `150` (1.5%) | Black Swan + Liquidation Cascade | Penalty pool funds rewards and insurance inflow. Black Swan penalty collected `$3182.775` with insurance inflow `$1485.295`. Cascade penalty collected `$11374.65` with insurance inflow `$5308.17`. |
| `adlSoftTriggerCoverageRatio` | `1.1e18` | Black Swan | Proactive ADL path engaged under deep stress when coverage weakens. Black Swan reports proactive ADL events `10` and ADL remaining deficit `$52833.207589`. |
| `adlHardTriggerCoverageRatio` | `1.0e18` | Black Swan + Liquidation Cascade | Hard trigger response observed in Black Swan (hard events `10`), while Cascade remained mostly liquidation-driven (proactive ADL events `1`, no ADL notional requested/covered). |
| `maxOracleDeviationBps` (execution guard) | `500` (5.0%) | Oracle Failure | Oracle-failure run remains non-insolvent (`Insolvent Steps: 0`) with no liquidations in this seed path, indicating guarded execution did not induce cascade behavior. |

## Scenario Snapshot

### Black Swan (`blackSwan_12345_1774120696270`)
- Price change: `-77.50%`
- Insolvent steps: `1701`
- Insurance end: `$1411.186`
- Insurance used: `$74.109`
- ADL events: `5`
- Proactive ADL hard triggers: `10`

### Oracle Failure (`oracleFailure_12345_1774104659269`)
- Price change: `0.00%`
- Insolvent steps: `0`
- Insurance end: `$0.0`
- Liquidations / 100 orders: `0.00`

### Liquidation Cascade (`liquidationCascade_12345_1774105520654`)
- Price change: `-12.53%`
- Insolvent steps: `0`
- Insurance end: `$5308.17`
- Liquidations / 100 orders: `0.65`
- ADL events: `0` (proactive ADL events: `1`)

## Notes

- Values above are taken directly from each run's `summary.txt` and are traceable to the corresponding `simulation_complete.json` metrics stream.
- This proof pack is intended as launch-readiness evidence tying parameter choices to deterministic stress outcomes, not as a substitute for external audit results.
