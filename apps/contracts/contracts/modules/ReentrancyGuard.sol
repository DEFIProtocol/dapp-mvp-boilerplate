// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ILiquidationEngine {
    function liquidate(uint256 positionId) external;
}

interface ICollateralManager {
    function withdrawCollateral(uint256 amount) external;
}

contract ReentrancyAttacker {
    ILiquidationEngine public liquidationEngine;
    ICollateralManager public collateralManager;
    bool public entered;
    
    constructor(address _liquidationEngine, address _collateralManager) {
        liquidationEngine = ILiquidationEngine(_liquidationEngine);
        collateralManager = ICollateralManager(_collateralManager);
    }
    
    function attack(uint256 positionId) external {
        liquidationEngine.liquidate(positionId);
    }
    
    // This will be called during liquidation if the contract receives tokens
    function tokensReceived() external {
        if (!entered) {
            entered = true;
            // Attempt to re-enter the liquidation engine
            // This should be blocked by reentrancy guard
            liquidationEngine.liquidate(0); // Try to liquidate again
        }
    }
}