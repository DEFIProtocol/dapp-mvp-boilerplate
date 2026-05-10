

Frontend:


1.) Orderflow component for perps page.


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