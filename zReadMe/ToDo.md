

Frontend:


1.) Orderflow component for perps page.


3.) Possible to connect solana wallet, and eth wallet to same application?


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

⭐ The Unified Margin Engine
Because once you have:
- one account model
- one collateral pool
- one margin calculator
- one liquidation threshold
…you can plug in:
- perps
- options
- spot
- structured products
- credit
- intents
All without rewriting the foundation.
So let’s build this piece by piece.

🧩 Step 1 — The Account Model (the root of everything)
Every user gets one multi-account, and that account holds:
Collateral
- USDC (or whatever stable/ethereum you choose)

Positions
- Perp positions (marketId → size, entryPrice)
- Option positions (seriesId → long/short, size, premiumPaid)
- Spot balances (optional later)
Computed values
- Unrealized PnL
- Equity
- Margin requirements
This is the structure everything else plugs into.

🧩 Step 2 — The Margin Engine (the brain)
This is a standalone module that every product calls into.
It exposes functions like:
- getEquity(accountId)
- getInitialMarginRequired(accountId)
- getMaintenanceMarginRequired(accountId)
- isLiquidatable(accountId)
- checkOpenAllowed(accountId, productId, deltaExposure)
It does not execute trades.
It only evaluates risk.
This separation is what lets you scale.

🧩 Step 3 — Perps + Options both plug into the same engine
Right now, your perp logic probably computes margin internally.
We’re going to extract that out so both engines call the same margin logic.
PerpEngine calls:
- checkOpenAllowed before opening
- isLiquidatable during liquidation
- getEquity for PnL settlement
OptionsEngine calls:
- checkOpenAllowed before selling options
- getMarginRequiredForShortOption for writers
- settleOption at expiry
This is how you unify the system.

🧩 Step 4 — Minimal Options Engine (v1)
You don’t need full Black‑Scholes or volatility surfaces.
Start with:
- European options
- Cash‑settled
- Fixed IV per series
- A few strikes per expiry
This lets you:
- Open long/short positions
- Charge premium
- Settle at expiry
And most importantly:
it gives the margin engine a second product type to unify.

🧩 Step 5 — Liquidation Engine stays mostly the same
Your current liquidation logic probably does:
- Check margin ratio
- Reduce positions
- Seize collateral
- Pay liquidator
That stays.
The only change is:
- It now liquidates all positions in the account, not just perps.

🧩 Step 6 — Oracle Module stays modular
You already have:
- price feeds
- TWAP logic
- index price
Options and perps both use the same oracle.
This is what makes unified margin possible.

🧠 Where you are right now
You already have:
- Perp engine
- Liquidation logic
- Oracle integration
- Margin logic (per‑product)
- A simulator
- A strong mental model of risk
You’re not starting from zero.
You’re starting from 70% of the foundation.
The next 30% is architectural, not conceptual.

🔥 Where we go next
Pick one of these and we’ll drill into it:
A) The Account Model
We define the exact storage layout and data structures.
B) The Margin Engine
We design the interface and the math.
C) The Options Engine (v1)
We define how options are created, priced, and settled.
D) The Integration Layer
We map how perps + options both call into the margin engine.
E) The Frontend Architecture
We design the unified account UI and risk dashboard.
You tell me which one you want to dive into first, and we’ll build it like we’re writing the spec for a real protocol.


Adapt Test and Simulation to new smart Contract. 