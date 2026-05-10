# DCSN Governance Process

This document describes how proposals move from idea to execution within the DCSN ecosystem.

---

## 1. Proposal Lifecycle

1. **Idea & Discussion**
   - Ideas are first discussed in public forums (e.g., GitHub, Discord, governance forum).
   - Authors gather feedback and refine scope.

2. **Draft Proposal**
   - A formal draft is created using a standard template:
     - Title  
     - Author(s)  
     - Summary  
     - Motivation  
     - Specification / Implementation details  
     - Risks & tradeoffs  
     - Dependencies  
     - Timeline  

3. **Review Period**
   - Minimum review period (e.g., 7 days) before on‑chain voting.
   - Community, node operators, and domain experts provide feedback.

4. **On‑Chain Vote**
   - Proposal is submitted on‑chain.
   - Voting follows the rules in the DAO Constitution (quorum, thresholds, etc.).

5. **Execution**
   - If passed:
     - On‑chain changes are executed via governance contracts, or  
     - The Foundation executes off‑chain actions (e.g., legal, operational, grants).

6. **Post‑Mortem (Optional but Recommended)**
   - For major changes, a post‑mortem or impact review is published.

---

## 2. Proposal Categories

- **Standard Proposals**  
  Parameter changes, incentives, minor upgrades.

- **Upgrade Proposals**  
  Protocol upgrades, contract migrations, major architectural changes.

- **Treasury Proposals**  
  Grants, funding, subsidies, operational budgets.

- **Role Approval Proposals**  
  Approving or revoking special roles or node classes.

- **Emergency Proposals**  
  Time‑sensitive actions related to systemic risk or essential goods.

Each category may have additional requirements (e.g., longer review for upgrades).

---

## 3. Quorum and Thresholds

As defined in the DAO Constitution:

- **Standard quorum:** 10% of active governance power.  
- **Amendments:** 2/3 majority, 15% quorum.  
- **Dissolution:** 3/4 majority.

Specific numeric values can be updated via governance if needed.

---

## 4. Transparency

- All proposals must be:
  - Publicly accessible  
  - Archived (e.g., in this repo and on‑chain)  
  - Immutable once voted on  

- Rationale and implementation details must be clear enough for:
  - node operators  
  - auditors  
  - external reviewers  

to understand impact and risk.

---

## 5. Foundation Execution

When a proposal requires off‑chain execution:

- The DAO approves the proposal on‑chain.
- The Foundation:
  - executes the required actions (contracts, grants, legal steps, etc.)
  - publishes a confirmation and any relevant documentation.
