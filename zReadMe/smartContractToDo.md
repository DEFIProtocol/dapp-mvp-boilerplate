# Decentralized Exchange Rebuild Roadmap

Contract roadmap cleanup status: completed.

The contract-side milestones in this document have been finished and removed from the active TODO list.

## Completed Contract Areas

- Plan 1: Core contract model (JIT margin + compatibility path)
- Plan 2: Options engine v1
- Plan 3: Unified margin/risk integration
- Plan 4: Contract and integration test coverage
- Pre-simulation contract hardening checklist

## Non-Contract Follow-Ups

Completed:
- Backend/keeper operations spec for options expiry and settlement jobs is implemented in backend services/routes.
- Stale-oracle handling policy during settlement windows is implemented via backend price aggregation and oracle guardrails.

Remaining:
- Continue simulator/acceptance runs as needed (see zReadMe/.simRun.md for run commands).

⭐ What smart contracts should do in DCSN
Smart contracts should ONLY handle:

Escrow

Settlement

Dispute resolution

Reputation staking / slashing

Governance

That’s it.

Everything else — routing, verification, identity, logistics, operator roles — belongs off‑chain inside the node daemon.
