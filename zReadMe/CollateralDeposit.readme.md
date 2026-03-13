User calls: perpEngine.depositCollateral(100 USDC)

TRACE:
├── [PerpEngine] depositCollateral(100)
│   └── → collateralManager.depositCollateral(100)
│
├── [CollateralManager] depositCollateral(100)
│   ├── 1. Validate: notPaused, notFrozen, amount>0
│   ├── 2. Transfer: collateral.safeTransferFrom(user, address(this), 100)
│   ├── 3. READ: currentBalance = PerpStorage.accountCollateral[user] (via view)
│   ├── 4. CALC: newBalance = currentBalance + 100
│   ├── 5. WRITE: PerpStorage.setAccountCollateral(user, newBalance)
│   │   └── [PerpStorage] accountCollateral[user] = newBalance
│   └── 6. EMIT: CollateralDeposited(user, 100, newBalance)
│
└── [Complete] User collateral increased by 100 USDC