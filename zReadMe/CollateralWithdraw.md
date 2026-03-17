User calls: perpEngine.withdrawCollateral(50 USDC)

TRACE:
├── [PerpEngine] withdrawCollateral(50)
│   └── → collateralManager.withdrawCollateral(50)
│
├── [CollateralManager] withdrawCollateral(50)
│   ├── 1. Validate: notPaused, notFrozen
│   ├── 2. READ: reserved = PerpStorage.reservedMargin[user]
│   ├── 3. READ: totalCollateral = PerpStorage.accountCollateral[user]
│   ├── 4. CALC: available = totalCollateral - reserved
│   ├── 5. REQUIRE: available >= 50
│   ├── 6. CALC: newBalance = totalCollateral - 50
│   ├── 7. WRITE: PerpStorage.setAccountCollateral(user, newBalance)
│   │   └── [PerpStorage] accountCollateral[user] = newBalance
│   ├── 8. TRANSFER: collateral.safeTransfer(user, 50)
│   └── 9. EMIT: CollateralWithdrawn(user, 50, newBalance)
│
└── [Complete] User receives 50 USDC