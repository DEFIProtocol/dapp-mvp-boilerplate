// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "../library/LiquidationLib.sol";

interface IMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}

/**
 * @title RiskManager
 * @notice Handles risk calculations: equity, margin requirements, liquidation checks
 * @dev View functions only - no state changes
 */
contract RiskManager {
    PerpStorage public perpStorage;

    // Events
    event MarginCheck(address indexed trader, int256 equity, uint256 maintenanceReq, bool isSafe);
    event PositionRiskUpdated(uint256 indexed positionId, uint256 liquidationPrice);

    constructor(address _perpStorage) {
        perpStorage = PerpStorage(_perpStorage);
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    /**
     * @notice Get current mark price from oracle
     */
    function getMarkPrice() public view returns (uint256) {
        uint256 mark = IMarkOracle(perpStorage.markOracle()).getMarkPrice(perpStorage.marketFeedId());
        require(mark > 0, "Invalid mark price");
        return mark;
    }

    /**
     * @notice Calculate total equity for a trader (collateral + unrealized PnL - funding)
     * @param trader Address to calculate equity for
     */
    function getAccountEquity(address trader) public view returns (int256 equity) {
        equity = int256(perpStorage.accountCollateral(trader));
        
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        uint256 markPrice = getMarkPrice();
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;
            
            (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, markPrice);
            equity += pnl - funding;
        }
    }

    /**
     * @notice Calculate PnL and funding for a single position
     */
    function getPositionPnlAndFunding(
        PerpStorage.Position memory position,
        uint256 currentPrice
    ) public view returns (int256 pnl, int256 funding) {
        // Convert to PnlLib format
        PnlLib.Position memory pnlPos = PnlLib.Position({
            exposure: position.exposure,
            entryPrice: position.entryPrice,
            side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
        });
        
        pnl = PnlLib.calculateUnrealizedPnl(pnlPos, currentPrice);
        
        // Get current cumulative funding
        int256 currentCumulativeFunding = (position.side == PerpStorage.Side.Long) 
            ? perpStorage.cumulativeFundingLong() 
            : perpStorage.cumulativeFundingShort();
        
        funding = FundingLib.calculateFundingPayment(
            position.exposure,
            position.entryFunding,
            currentCumulativeFunding
        );
    }

    /**
     * @notice Calculate maintenance margin requirement for a position
     */
    function getPositionMaintenanceRequirement(uint256 positionId) public view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");
        
        return (pos.exposure * perpStorage.maintenanceMarginBps()) / perpStorage.BPS_DENOMINATOR();
    }

    /**
     * @notice Calculate total maintenance margin requirement for a trader
     */
    function getAccountMaintenanceRequirement(address trader) public view returns (uint256 totalReq) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;
            
            totalReq += (pos.exposure * perpStorage.maintenanceMarginBps()) / perpStorage.BPS_DENOMINATOR();
        }
    }

    /**
     * @notice Check if a specific position is liquidatable
     */
    function isPositionLiquidatable(uint256 positionId) public view returns (bool) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");

        (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, getMarkPrice());
        int256 equity = int256(pos.margin) + pnl - funding;

        return LiquidationLib.isLiquidatable(
            equity,
            pos.exposure,
            perpStorage.maintenanceMarginBps()
        );
    }

    /**
     * @notice Check if a trader has any liquidatable positions
     */
    function getLiquidatablePositions(address trader) external view returns (uint256[] memory) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        uint256[] memory liquidatable = new uint256[](positionIds.length);
        uint256 count = 0;
        
        int256 equity = getAccountEquity(trader);
        uint256 totalMaintenanceReq = getAccountMaintenanceRequirement(trader);
        
        // If total equity is above total requirement, no positions are liquidatable
        if (equity >= int256(totalMaintenanceReq)) {
            return new uint256[](0);
        }
        
        // Otherwise, check each position
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;
            
            if (LiquidationLib.isLiquidatable(equity, pos.exposure, perpStorage.maintenanceMarginBps())) {
                liquidatable[count] = positionId;
                count++;
            }
        }
        
        // Resize array
        assembly {
            mstore(liquidatable, count)
        }
        
        return liquidatable;
    }

    /**
     * @notice Calculate liquidation price for a position
     */
    function getLiquidationPrice(uint256 positionId) external view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");
        
        return LiquidationLib.calculateLiquidationPrice(
            pos.exposure,
            pos.entryPrice,
            pos.margin,
            perpStorage.maintenanceMarginBps(),
            pos.side == PerpStorage.Side.Long
        );
    }

    /**
     * @notice Get account health ratio (equity / maintenance requirement)
     * @dev >1 means safe, <1 means liquidatable
     */
    function getAccountHealthRatio(address trader) external view returns (uint256) {
        int256 equity = getAccountEquity(trader);
        if (equity <= 0) return 0;
        
        uint256 maintenanceReq = getAccountMaintenanceRequirement(trader);
        if (maintenanceReq == 0) return type(uint256).max;
        
        return (uint256(equity) * 1e18) / maintenanceReq;
    }

    /**
     * @notice Get leverage for a specific position
     */
    function getPositionLeverage(uint256 positionId) external view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");
        require(pos.margin > 0, "Zero margin");
        
        return (pos.exposure * 1e18) / pos.margin;
    }

    /**
     * @notice Get total leverage for a trader (notional / equity)
     */
    function getAccountLeverage(address trader) external view returns (uint256) {
        int256 equity = getAccountEquity(trader);
        if (equity <= 0) return type(uint256).max;
        
        uint256 totalExposure = 0;
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;
            totalExposure += pos.exposure;
        }
        
        return (totalExposure * 1e18) / uint256(equity);
    }
}