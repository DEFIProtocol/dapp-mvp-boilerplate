

Frontend:

CRITICAL PRIORITY (P0)
1.) Base Sepolia paper trading completion (must finish first)

Wire full paper-trading execution for both perps and options (not just queued intents)
Finalize Base Sepolia test USDC faucet config and env wiring
Enforce chain gating to Base Sepolia for faucet + paper trade actions
Add end-to-end smoke tests: claim faucet, open/close perp, open/settle option

P0 Deployment Env Checklist (replace placeholders):
- PAPER_TRADING_USDC_ADDRESS
- PAPER_TRADING_USDC_MODE (mint or transfer)
- PAPER_TRADING_USDC_DECIMALS
- PAPER_TRADING_USDC_AMOUNT
- PAPER_TRADING_ETH_DRIP_WEI
- PAPER_TRADING_ETH_MIN_BALANCE_WEI
- PAPER_TRADING_OPTIONS_ENGINE_ADDRESS
- PAPER_TRADING_PERPS_ENGINE_ADDRESS
- PAPER_TRADING_ADMIN_OVERRIDE_ALLOWLIST


1.) Orderflow component for perps page.
1a.) Add options component/spot on admin similar to perps component.
1b.)

2.) Possible to connect solana wallet, and eth wallet to same application?


Default User Preferences JSON (preferences JSONB):

```json
{
    "themeMode": "dark",
    "themeDesign": "futuristic",
    "defaultView": "trading",
    "notifications": {
        "email": {
            "tradeExecuted": true,
            "orderFilled": true,
            "priceAlerts": true,
            "securityAlerts": true,
            "newsletter": false
        }
    },
    "trading": {
        "slippageTolerance": 0.5,
        "defaultOrderType": "market",
        "showConfirmationDialogs": true,
        "favoritePairs": []
    },
    "privacy": {
        "showBalanceInNav": true,
        "shareTradingActivity": false
    },
    "enabledChains": [1, 8453],
    "chart": {
        "token": {
            "timeframe": "24h",
            "chartType": "candles",
            "indicators": ["ema9", "ema21"],
            "activeTool": "pointer"
        },
        "crypto": {
            "timeframe": "1h",
            "chartType": "candles",
            "indicators": ["ema9", "ema21", "volume"],
            "activeTool": "pointer"
        },
        "futures": {
            "timeframe": "1h",
            "chartType": "candles",
            "indicators": ["ema9", "ema21", "volume"],
            "activeTool": "pointer"
        }
    }
}
```

Theme options:

- `themeDesign`: `futuristic`, `professional`, `cool` (`cool` is labeled as `Aurora` in the UI)
- `themeMode`: `dark`, `light`


PowerShell API Smoke Tests (User Preferences):

```powershell
# 0) Set base values
$api = "http://localhost:3001/api"
$wallet = "0x1111111111111111111111111111111111111111"

# 1) Ensure user exists (idempotent pattern)
Invoke-RestMethod -Method Post -Uri "$api/users" -ContentType "application/json" -Body (@{
    wallet_address = $wallet
} | ConvertTo-Json)

# 2) Read current user (confirm preferences/email_verified fields)
Invoke-RestMethod -Method Get -Uri "$api/users/wallet/$wallet" | ConvertTo-Json -Depth 12

# 3) PATCH theme preference keys
Invoke-RestMethod -Method Patch -Uri "$api/users/wallet/$wallet/preferences" -ContentType "application/json" -Body (@{
    themeDesign = "professional"
    themeMode = "light"
} | ConvertTo-Json) | ConvertTo-Json -Depth 12

# 4) PATCH nested preference key (deep merge)
Invoke-RestMethod -Method Patch -Uri "$api/users/wallet/$wallet/preferences" -ContentType "application/json" -Body (@{
    trading = @{
        slippageTolerance = 1.2
    }
} | ConvertTo-Json -Depth 12) | ConvertTo-Json -Depth 12

# 5) PATCH array field (replace-on-write behavior)
Invoke-RestMethod -Method Patch -Uri "$api/users/wallet/$wallet/preferences" -ContentType "application/json" -Body (@{
    enabledChains = @(1, 8453, 137)
} | ConvertTo-Json -Depth 12) | ConvertTo-Json -Depth 12

# 6) Invalid key test (should return 400)
try {
    Invoke-RestMethod -Method Patch -Uri "$api/users/wallet/$wallet/preferences" -ContentType "application/json" -Body (@{
        dangerousFlag = $true
    } | ConvertTo-Json -Depth 12)
} catch {
    $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.ReadToEnd()
}

# 7) Update top-level identity fields (email + email_verified)
Invoke-RestMethod -Method Put -Uri "$api/users/wallet/$wallet" -ContentType "application/json" -Body (@{
    email = "dev@example.com"
    email_verified = $true
} | ConvertTo-Json -Depth 12) | ConvertTo-Json -Depth 12
```

---
## DCSN Node — Implementation Tracker

### ✅ Day 1–2 — Node Skeleton + API Layer — COMPLETE
- ✅ Initialize TypeScript project (`apps/node`, strict mode, ESM)
- ✅ Set up Express (`src/api/app.ts`, middleware, error handler)
- ⬜ WebSocket server for real-time routing
- ✅ Config + environment loader (`src/core/config.ts`, `.env.example`)
- ✅ Node registration endpoint (`/api/health`, `/api/ready`, `/api/config`)

**Deliverable:** Node boots, serves health checks, loads env config.

---

### ✅ Day 3–4 — Routing Engine MVP — COMPLETE
- ✅ Order intent queuing (`src/routing/engine.ts` — `queueIntent`)
- ✅ Filter by chain, expiry, instrument (`chainId` + `expiresAt` validation)
- ✅ Accept/reject intents (`acceptIntent`, `rejectIntent`, `processExpiry`)
- ✅ Publish/query intents (`GET/POST /api/routing/intents`)
- ⬜ WebSocket subscription to updates

**Deliverable:** Node can accept and queue order intents via HTTP.

---

### ✅ Day 5–6 — Settlement Engine MVP — COMPLETE
- ✅ ethers.js integrated as dependency
- ⬜ Wallet creation/import (key loaded from `NODE_PRIVATE_KEY` env)
- ✅ Settlement contract call scaffold (`src/settlement/service.ts` — guarded by address check)
- ✅ Batch settle (`batchSettle` via `Promise.allSettled`)
- ⬜ Signature verification
- ⬜ Dispute hooks

**Deliverable:** Node can batch settle intents; contract call fires when address is deployed.

---

### ✅ Day 5–6 (bonus) — Verification Module Scaffold — COMPLETE
- ✅ `src/verification/engine.ts` — Merkle, signature, attestation proof routing
- ⬜ GPS capture service
- ⬜ QR/NFC scan ingestion
- ⬜ Multi-party signature flow
- ⬜ Proof upload to network

---

### ✅ Day 1–2 (bonus) — Governance + Identity — COMPLETE
- ✅ Role system: farmer, processor, transporter, auditor, broker, developer (`src/identity/identityManager.ts`)
- ✅ Permission enforcement per role (`src/core/constants.ts`)
- ✅ Emergency mode with 14-day auto-expiry
- ✅ Role revocation with reason
- ✅ Background governance worker (60s interval)

---

### ✅ Day 1–2 (bonus) — Observability — COMPLETE
- ✅ Pino structured logging (`src/observability/logger.ts`)
- ✅ Pretty-print in dev, JSON in production
- ✅ Graceful shutdown (SIGTERM + SIGINT)
- ✅ Background batch settlement worker (30s interval)

---

### 🔲 Day 7 — Verification Module MVP — TODO
- ⬜ GPS capture service
- ⬜ QR/NFC scan ingestion
- ⬜ Multi-party signature flow
- ⬜ Proof upload to network

**Deliverable:** Node can complete a delivery and release escrow.

---

### 🧱 WEEK 2 — Operator Experience + Hardening

### 🔲 Day 8–9 — Node Dashboard (React + Vite)
- ⬜ Load list
- ⬜ Delivery flow
- ⬜ Proof submission
- ⬜ Wallet balance view
- ⬜ Reputation score

**Deliverable:** Usable interface for truckers, warehouses, farmers.

---

### 🔲 Day 10–11 — Reputation + Role System
- ⬜ Role registration
- ⬜ Reputation scoring
- ⬜ Slashing hooks
- ⬜ Audit logs

**Deliverable:** Node can earn reputation and be slashed for fraud.

---

### 🔲 Day 12 — Multi-Leg Logistics
- ⬜ Local pickup
- ⬜ Port transfer
- ⬜ Long-haul
- ⬜ Last-mile
- ⬜ Route stitching

**Deliverable:** Node can participate in multi-leg global routes.

---

### 🔲 Day 13 — Hardening + Security
- ⬜ Rate limiting (scaffold in `src/security/middleware.ts`)
- ⬜ Signature validation
- ⬜ Replay-attack protection (scaffold in `src/security/middleware.ts`)
- ⬜ Basic encryption
- ⬜ Logging + monitoring

**Deliverable:** Node is safe enough for public demo.

---

### 🔲 Day 14 — Public-Ready Packaging
- ⬜ Install script
- ⬜ GitHub repo
- ⬜ Documentation
- ⬜ Demo video flow
- ❌ Docker image — intentionally excluded (pure npm, see README)

**Deliverable:** A fully installable, runnable DCSN node (`npm install && npm start`).