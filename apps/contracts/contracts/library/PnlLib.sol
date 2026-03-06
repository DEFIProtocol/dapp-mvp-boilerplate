// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library PnlLib {
    uint256 private constant BPS_DENOMINATOR = 10000;
    
    enum Side { Long, Short }

    struct Position {
        uint256 exposure;
        uint256 entryPrice;
        Side side;
    }

    // Calculate unrealized PnL for a position
    function calculateUnrealizedPnl(
        Position memory position,
        uint256 currentPrice
    ) internal pure returns (int256 pnl) {
        require(position.entryPrice > 0, "Invalid entry price");
        require(currentPrice > 0, "Invalid current price");

        int256 exposure = int256(position.exposure);
        int256 entry = int256(position.entryPrice);
        int256 current = int256(currentPrice);

        if (position.side == Side.Long) {
            // Long PnL = (current - entry) * exposure / entry
            pnl = (exposure * (current - entry)) / entry;
        } else {
            // Short PnL = (entry - current) * exposure / entry
            pnl = (exposure * (entry - current)) / entry;
        }
    }

    // Calculate PnL percentage
    function calculatePnlPercentage(
        uint256 entryPrice,
        uint256 currentPrice,
        Side side
    ) internal pure returns (int256 percentage) {
        require(entryPrice > 0, "Invalid entry price");
        
        if (side == Side.Long) {
            percentage = (int256(currentPrice) - int256(entryPrice)) * 100 / int256(entryPrice);
        } else {
            percentage = (int256(entryPrice) - int256(currentPrice)) * 100 / int256(entryPrice);
        }
    }

    // Check if position is profitable
    function isProfitable(
        uint256 entryPrice,
        uint256 currentPrice,
        Side side
    ) internal pure returns (bool) {
        if (side == Side.Long) {
            return currentPrice > entryPrice;
        } else {
            return currentPrice < entryPrice;
        }
    }

    // Calculate liquidation price (when equity = maintenance margin)
    function calculateLiquidationPrice(
        Position memory position,
        uint256 margin,
        uint256 maintenanceBps
    ) internal pure returns (uint256 liqPrice) {
        require(position.exposure > 0, "Zero exposure");
        require(maintenanceBps <= BPS_DENOMINATOR, "Invalid maintenance bps");
        
        // maintenanceReq = exposure * maintenanceBps / 10000
        uint256 maintenanceReq = (position.exposure * maintenanceBps) / BPS_DENOMINATOR;
        
        if (position.side == Side.Long) {
            // For longs: price drops until loss = margin - maintenanceReq
            // loss = (entry - current) * exposure / entry = margin - maintenanceReq
            // current = entry - (margin - maintenanceReq) * entry / exposure
            if (margin <= maintenanceReq) {
                // Already underwater - liquidation price is above current
                uint256 lossNeeded = maintenanceReq - margin;
                uint256 priceDrop = (lossNeeded * position.entryPrice) / position.exposure;
                liqPrice = position.entryPrice > priceDrop ? position.entryPrice - priceDrop : 0;
            } else {
                // Still have equity buffer
                uint256 buffer = margin - maintenanceReq;
                uint256 priceDrop = (buffer * position.entryPrice) / position.exposure;
                liqPrice = position.entryPrice - priceDrop;
            }
        } else {
            // For shorts: price rises until loss = margin - maintenanceReq
            // loss = (current - entry) * exposure / entry = margin - maintenanceReq
            // current = entry + (margin - maintenanceReq) * entry / exposure
            if (margin <= maintenanceReq) {
                // Already underwater
                uint256 lossNeeded = maintenanceReq - margin;
                uint256 priceIncrease = (lossNeeded * position.entryPrice) / position.exposure;
                liqPrice = position.entryPrice + priceIncrease;
            } else {
                // Still have equity buffer
                uint256 buffer = margin - maintenanceReq;
                uint256 priceIncrease = (buffer * position.entryPrice) / position.exposure;
                liqPrice = position.entryPrice + priceIncrease;
            }
        }
    }

    // Calculate equity including unrealized PnL
    function calculateEquity(
        uint256 margin,
        int256 unrealizedPnl
    ) internal pure returns (int256) {
        return int256(margin) + unrealizedPnl;
    }

    // Check if position is solvent (equity > 0)
    function isSolvent(
        uint256 margin,
        int256 unrealizedPnl
    ) internal pure returns (bool) {
        return int256(margin) + unrealizedPnl > 0;
    }

    // Calculate return on margin (ROM) percentage
    function calculateRom(
        uint256 margin,
        int256 unrealizedPnl
    ) internal pure returns (int256) {
        require(margin > 0, "Zero margin");
        return (unrealizedPnl * 100) / int256(margin);
    }
}