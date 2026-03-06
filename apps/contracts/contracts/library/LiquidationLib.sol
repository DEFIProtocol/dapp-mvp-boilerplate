// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library LiquidationLib {
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Check if position is liquidatable
    function isLiquidatable(
        int256 equity,
        uint256 exposure,
        uint256 maintenanceMarginBps
    ) internal pure returns (bool) {
        uint256 maintenanceReq = (exposure * maintenanceMarginBps) / BPS_DENOMINATOR;
        return equity < int256(maintenanceReq);
    }

    // Calculate liquidation rewards and penalties
    function calculateLiquidationPayouts(
        uint256 margin,
        uint256 availableCollateral,
        uint256 rewardBps,
        uint256 penaltyBps
    ) internal pure returns (uint256 reward, uint256 penalty, uint256 toInsurance) {
        reward = (margin * rewardBps) / BPS_DENOMINATOR;
        penalty = (margin * penaltyBps) / BPS_DENOMINATOR;
        
        // Cap reward to available collateral
        if (reward > availableCollateral) {
            reward = availableCollateral;
        }
        
        uint256 remaining = availableCollateral - reward;
        
        // Cap penalty to remaining
        if (penalty > remaining) {
            penalty = remaining;
        }
        
        // Rest goes to insurance (or stays with protocol)
        toInsurance = remaining - penalty;
    }

    // Calculate bad debt after liquidation
    function calculateBadDebt(
        int256 pnl,
        int256 funding,
        uint256 margin
    ) internal pure returns (uint256) {
        int256 totalLoss = -pnl - funding; // Convert to positive loss
        if (totalLoss <= 0) return 0;
        
        uint256 loss = uint256(totalLoss);
        return loss > margin ? loss - margin : 0;
    }

    // Calculate liquidation price
    function calculateLiquidationPrice(
        uint256 exposure,
        uint256 entryPrice,
        uint256 margin,
        uint256 maintenanceMarginBps,
        bool isLong
    ) internal pure returns (uint256) {
        uint256 maintenanceReq = (exposure * maintenanceMarginBps) / BPS_DENOMINATOR;
        
        // Equity = margin + pnl
        // At liquidation: margin + pnl = maintenanceReq
        // pnl = maintenanceReq - margin
        
        if (isLong) {
            // (current - entry) * exposure / entry = maintenanceReq - margin
            // current = entry + (maintenanceReq - margin) * entry / exposure
            int256 pnlTarget = int256(maintenanceReq) - int256(margin);
            if (pnlTarget >= 0) return 0; // Already underwater
            uint256 priceDrop = (uint256(-pnlTarget) * entryPrice) / exposure;
            return entryPrice > priceDrop ? entryPrice - priceDrop : 0;
        } else {
            // (entry - current) * exposure / entry = maintenanceReq - margin
            // current = entry - (maintenanceReq - margin) * entry / exposure
            int256 pnlTarget = int256(maintenanceReq) - int256(margin);
            if (pnlTarget >= 0) return type(uint256).max; // Already underwater
            uint256 priceIncrease = (uint256(-pnlTarget) * entryPrice) / exposure;
            return entryPrice + priceIncrease;
        }
    }
}