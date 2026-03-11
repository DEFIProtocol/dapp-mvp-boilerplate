// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "./CollateralManager.sol";

/**
 * @title PositionManager
 * @notice Manages position lifecycle: open, close, modify
 * @dev Uses PnlLib for PnL calculations, FundingLib for funding, FeeLib for fees
 */
contract PositionManager {
    PerpStorage public perpStorage;
    CollateralManager public collateralManager;
    address public fundingEngine;

    // Events
    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 margin,
        uint256 entryPrice,
        int256 entryFunding
    );
    
    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        int256 pnl,
        int256 fundingPayment,
        int256 totalReturn
    );
    
    event PositionModified(
        uint256 indexed positionId,
        uint256 newExposure,
        uint256 newMargin,
        int256 pnlRealized
    );

    constructor(address _perpStorage, address _collateralManager, address _fundingEngine) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        fundingEngine = _fundingEngine;
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    modifier onlyAuthorizedModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    /**
     * @notice Open a new position
     * @param trader Position owner
     * @param side Long or Short
     * @param exposure Position size (notional)
     * @param leverage Leverage used (1-100x)
     * @param entryPrice Price at opening
     */
    function openPosition(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 leverage,
        uint256 entryPrice
    ) external onlyAuthorizedModule returns (uint256 positionId) {
        require(!perpStorage.frozenAccounts(trader), "Account frozen");
        require(leverage >= perpStorage.MIN_LEVERAGE() && leverage <= perpStorage.MAX_LEVERAGE(), "Invalid leverage");
        
        // Calculate required margin
        uint256 requiredMargin = (exposure * 1e18) / leverage / 1e18; // exposure / leverage
        
        // Reserve margin
        collateralManager.addReservedMargin(trader, requiredMargin);
        
        // Get position ID
        positionId = perpStorage.nextPositionId();
        
        // Determine current funding snapshot
        int256 entryFunding = (side == PerpStorage.Side.Long) 
            ? perpStorage.cumulativeFundingLong() 
            : perpStorage.cumulativeFundingShort();
        
        // Create position
        PerpStorage.Position memory newPosition = PerpStorage.Position({
            trader: trader,
            side: side,
            exposure: exposure,
            margin: requiredMargin,
            entryPrice: entryPrice,
            entryFunding: entryFunding,
            active: true
        });
        
        // Store position
        perpStorage.setPosition(positionId, newPosition);
        
        // Update position tracking
        perpStorage.setTraderPositionIndex(positionId, perpStorage.positionCount(trader) + 1);
        perpStorage.pushTraderPosition(trader, positionId);
        perpStorage.setHasPosition(trader, positionId, true);
        perpStorage.incrementPositionCount(trader);
        
        // Update global exposure
        if (side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() + exposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() + exposure);
        }
        
        // Increment position ID for next
        perpStorage.setNextPositionId(positionId + 1);
        
        emit PositionOpened(
            positionId,
            trader,
            side,
            exposure,
            requiredMargin,
            entryPrice,
            entryFunding
        );
        
        return positionId;
    }

    /**
     * @notice Close an existing position
     * @param positionId ID of position to close
     * @param closePrice Price at closing
     */
    function closePosition(uint256 positionId, uint256 closePrice) external onlyModule returns (int256 pnl, int256 funding) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        require(position.active, "Position not active");
        require(!perpStorage.frozenAccounts(position.trader), "Account frozen");
        
        // Calculate PnL using PnlLib
        PnlLib.Position memory pnlPosition = PnlLib.Position({
            exposure: position.exposure,
            entryPrice: position.entryPrice,
            side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
        });
        
        pnl = PnlLib.calculateUnrealizedPnl(pnlPosition, closePrice);
        
        // Calculate funding using FundingLib
        int256 currentFunding = (position.side == PerpStorage.Side.Long) 
            ? perpStorage.cumulativeFundingLong() 
            : perpStorage.cumulativeFundingShort();
            
        funding = FundingLib.calculateFundingPayment(
            position.exposure,
            position.entryFunding,
            currentFunding
        );
        
        // Deactivate position
        perpStorage.setPositionActive(positionId, false);
        
        // Remove from trader's position list
        _removeTraderPosition(position.trader, positionId);
        perpStorage.setHasPosition(position.trader, positionId, false);
        perpStorage.decrementPositionCount(position.trader);
        
        // Update global exposure
        if (position.side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() - position.exposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() - position.exposure);
        }
        
        // Release reserved margin
        collateralManager.removeReservedMargin(position.trader, position.margin);
        
        // Apply PnL and funding to collateral (negative funding means trader receives)
        // funding > 0 means trader pays, funding < 0 means trader receives
        int256 totalDelta = pnl - funding; // funding payment is subtracted from PnL
        
        // Apply to collateral
        collateralManager.applyAccountDelta(position.trader, totalDelta);
        
        emit PositionClosed(positionId, position.trader, pnl, funding, totalDelta);
        
        return (pnl, funding);
    }

    /**
     * @notice Add margin to an existing position
     * @param positionId Position ID
     * @param additionalMargin Amount to add
     */
    function addMargin(uint256 positionId, uint256 additionalMargin) external {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        require(position.active, "Position not active");
        require(position.trader == msg.sender, "Not position owner");
        require(additionalMargin > 0, "Margin must be > 0");
        
        // Check available collateral
        uint256 available = collateralManager.getAvailableCollateral(msg.sender);
        require(available >= additionalMargin, "Insufficient available collateral");
        
        // Update reserved margin
        collateralManager.addReservedMargin(msg.sender, additionalMargin);
        
        // Update position margin
        uint256 updatedMargin = position.margin + additionalMargin;
        perpStorage.setPositionMargin(positionId, updatedMargin);
        
        // Check leverage is still valid (not below min)
        uint256 newLeverage = (position.exposure * 1e18) / updatedMargin / 1e18;
        require(newLeverage >= perpStorage.MIN_LEVERAGE(), "Leverage too low");
    }

    /**
     * @notice Remove margin from a position
     * @param positionId Position ID
     * @param marginToRemove Amount to remove
     */
    function removeMargin(uint256 positionId, uint256 marginToRemove) external {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        require(position.active, "Position not active");
        require(position.trader == msg.sender, "Not position owner");
        require(marginToRemove > 0, "Margin must be > 0");
        require(position.margin > marginToRemove, "Cannot remove all margin");
        
        // Check leverage won't exceed max
        uint256 newMargin = position.margin - marginToRemove;
        uint256 newLeverage = (position.exposure * 1e18) / newMargin / 1e18;
        require(newLeverage <= perpStorage.MAX_LEVERAGE(), "Leverage too high");
        
        // Update reserved margin
        collateralManager.removeReservedMargin(msg.sender, marginToRemove);
        
        // Update position margin
        perpStorage.setPositionMargin(positionId, newMargin);
        
        // Transfer collateral back to available (already handled by removeReservedMargin)
    }

    /**
     * @notice Get position details with current PnL
     * @param positionId Position ID
     * @param currentPrice Current mark price
     */
    function getPositionWithPnL(uint256 positionId, uint256 currentPrice) external view returns (
        PerpStorage.Position memory position,
        int256 unrealizedPnl,
        int256 unrealizedFunding,
        int256 equity
    ) {
        position = perpStorage.getPosition(positionId);
        require(position.active, "Position not active");
        
        PnlLib.Position memory pnlPosition = PnlLib.Position({
            exposure: position.exposure,
            entryPrice: position.entryPrice,
            side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
        });
        
        unrealizedPnl = PnlLib.calculateUnrealizedPnl(pnlPosition, currentPrice);
        
        int256 currentFunding = (position.side == PerpStorage.Side.Long) 
            ? perpStorage.cumulativeFundingLong() 
            : perpStorage.cumulativeFundingShort();
            
        unrealizedFunding = FundingLib.calculateFundingPayment(
            position.exposure,
            position.entryFunding,
            currentFunding
        );
        
        equity = int256(position.margin) + unrealizedPnl - unrealizedFunding;
    }

    /**
     * @notice Remove position from trader's position array
     */
    function _removeTraderPosition(address trader, uint256 positionId) internal {
        perpStorage.removeTraderPosition(trader, positionId);
    }

    /**
     * @notice Get all positions for a trader
     */
    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return perpStorage.getTraderPositions(trader);
    }
}