// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "./PositionNetting.sol";
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
        PerpStorage.MarginMode marginMode = perpStorage.isCrossMargin(trader)
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;

        return _openPosition(
            trader,
            side,
            exposure,
            leverage,
            entryPrice,
            perpStorage.marketFeedId(),
            marginMode
        );
    }

    /**
     * @notice Open a new position with explicit market and margin mode.
     */
    function openPositionWithMarket(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode
    ) external onlyAuthorizedModule returns (uint256 positionId) {
        return _openPosition(trader, side, exposure, leverage, entryPrice, marketId, marginMode);
    }

    function _openPosition(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode
    ) internal returns (uint256 positionId) {
        require(!perpStorage.frozenAccounts(trader), "Account frozen");
        require(leverage >= perpStorage.MIN_LEVERAGE() && leverage <= perpStorage.MAX_LEVERAGE(), "Invalid leverage");
        require(exposure > 0, "Invalid exposure");
        require(entryPrice > 0, "Invalid entry price");
        require(marketId != bytes32(0), "Invalid market");
        
        // Calculate required margin
        uint256 requiredMargin = (exposure * 1e18) / leverage / 1e18; // exposure / leverage
        require(requiredMargin > 0, "Invalid margin");

        (bool hasActive, uint256 activePositionId, PerpStorage.Position memory activePosition, uint256 activeCount) =
            _getSingleActivePositionForMarket(trader, marketId);
        require(activeCount <= 1, "Multiple active positions unsupported");

        if (!hasActive) {
            collateralManager.addReservedMargin(trader, requiredMargin);
            return _createPosition(trader, side, exposure, requiredMargin, entryPrice, marketId, marginMode);
        }

        require(activePosition.marginMode == marginMode, "Margin mode mismatch");

        if (activePosition.side == side) {
            collateralManager.addReservedMargin(trader, requiredMargin);

            uint256 mergedExposure = activePosition.exposure + exposure;
            uint256 mergedMargin = activePosition.margin + requiredMargin;
            uint256 mergedEntryPrice = PositionNetting.calculateWeightedEntryPrice(
                activePosition.exposure,
                activePosition.entryPrice,
                exposure,
                entryPrice
            );

            perpStorage.setPositionExposure(activePositionId, mergedExposure);
            perpStorage.setPositionMargin(activePositionId, mergedMargin);
            perpStorage.setPositionEntryPrice(activePositionId, mergedEntryPrice);

            if (side == PerpStorage.Side.Long) {
                perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() + exposure);
                perpStorage.setMarketLongExposure(marketId, perpStorage.marketLongExposure(marketId) + exposure);
            } else {
                perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() + exposure);
                perpStorage.setMarketShortExposure(marketId, perpStorage.marketShortExposure(marketId) + exposure);
            }

            emit PositionModified(activePositionId, mergedExposure, mergedMargin, 0);
            return activePositionId;
        }

        return _offsetOrFlipPosition(trader, activePositionId, activePosition, side, exposure, leverage, entryPrice);
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
        int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
            
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
            perpStorage.setMarketLongExposure(position.marketId, perpStorage.marketLongExposure(position.marketId) - position.exposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() - position.exposure);
            perpStorage.setMarketShortExposure(position.marketId, perpStorage.marketShortExposure(position.marketId) - position.exposure);
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
        
        int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
            
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

    function _createPosition(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 margin,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode
    ) internal returns (uint256 positionId) {
        positionId = perpStorage.nextPositionId();
        int256 entryFunding = _getCurrentFunding(side, marketId);

        PerpStorage.Position memory newPosition = PerpStorage.Position({
            trader: trader,
            side: side,
            exposure: exposure,
            margin: margin,
            entryPrice: entryPrice,
            entryFunding: entryFunding,
            marginMode: marginMode,
            marketId: marketId,
            active: true
        });

        perpStorage.setPosition(positionId, newPosition);
        perpStorage.setTraderPositionIndex(positionId, perpStorage.positionCount(trader) + 1);
        perpStorage.pushTraderPosition(trader, positionId);
        perpStorage.setHasPosition(trader, positionId, true);
        perpStorage.incrementPositionCount(trader);

        if (side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() + exposure);
            perpStorage.setMarketLongExposure(marketId, perpStorage.marketLongExposure(marketId) + exposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() + exposure);
            perpStorage.setMarketShortExposure(marketId, perpStorage.marketShortExposure(marketId) + exposure);
        }

        perpStorage.setNextPositionId(positionId + 1);

        emit PositionOpened(positionId, trader, side, exposure, margin, entryPrice, entryFunding);
        return positionId;
    }

    function _offsetOrFlipPosition(
        address trader,
        uint256 activePositionId,
        PerpStorage.Position memory activePosition,
        PerpStorage.Side incomingSide,
        uint256 incomingExposure,
        uint256 leverage,
        uint256 entryPrice
    ) internal returns (uint256 resultingPositionId) {
        uint256 reductionExposure = incomingExposure <= activePosition.exposure
            ? incomingExposure
            : activePosition.exposure;

        int256 currentFunding = _getCurrentFunding(activePosition.side, activePosition.marketId);
        (, , int256 reductionDelta) = PositionNetting.calculateReductionDelta(
            activePosition.side,
            reductionExposure,
            activePosition.entryPrice,
            entryPrice,
            activePosition.entryFunding,
            currentFunding
        );

        if (reductionDelta != 0) {
            collateralManager.applyAccountDelta(trader, reductionDelta);
        }

        uint256 releasedMargin = PositionNetting.calculateProportionalMarginRelease(
            activePosition.margin,
            activePosition.exposure,
            reductionExposure
        );
        if (releasedMargin > 0) {
            collateralManager.removeReservedMargin(trader, releasedMargin);
        }

        if (activePosition.side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() - reductionExposure);
            perpStorage.setMarketLongExposure(activePosition.marketId, perpStorage.marketLongExposure(activePosition.marketId) - reductionExposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() - reductionExposure);
            perpStorage.setMarketShortExposure(activePosition.marketId, perpStorage.marketShortExposure(activePosition.marketId) - reductionExposure);
        }

        uint256 remainingActiveExposure = activePosition.exposure - reductionExposure;
        uint256 remainingIncomingExposure = incomingExposure - reductionExposure;

        if (remainingActiveExposure == 0) {
            perpStorage.setPositionActive(activePositionId, false);
            _removeTraderPosition(trader, activePositionId);
            perpStorage.setHasPosition(trader, activePositionId, false);
            perpStorage.decrementPositionCount(trader);
        } else {
            uint256 remainingMargin = activePosition.margin - releasedMargin;
            perpStorage.setPositionExposure(activePositionId, remainingActiveExposure);
            perpStorage.setPositionMargin(activePositionId, remainingMargin);
            emit PositionModified(activePositionId, remainingActiveExposure, remainingMargin, reductionDelta);
        }

        if (remainingIncomingExposure == 0) {
            return activePositionId;
        }

        return _openResidualPosition(
            trader,
            incomingSide,
            remainingIncomingExposure,
            leverage,
            entryPrice,
            activePosition.marketId,
            activePosition.marginMode
        );
    }

    function _openResidualPosition(
        address trader,
        PerpStorage.Side incomingSide,
        uint256 incomingExposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode
    ) internal returns (uint256 positionId) {
        uint256 incomingMargin = (incomingExposure * 1e18) / leverage / 1e18;
        require(incomingMargin > 0, "Invalid margin");
        collateralManager.addReservedMargin(trader, incomingMargin);

        return _createPosition(
            trader,
            incomingSide,
            incomingExposure,
            incomingMargin,
            entryPrice,
            marketId,
            marginMode
        );
    }

    function _getCurrentFunding(PerpStorage.Side side, bytes32 marketId) internal view returns (int256) {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");

        return side == PerpStorage.Side.Long
            ? market.cumulativeFundingLong
            : market.cumulativeFundingShort;
    }

    function _getSingleActivePositionForMarket(address trader, bytes32 marketId)
        internal
        view
        returns (bool hasActive, uint256 activePositionId, PerpStorage.Position memory activePosition, uint256 activeCount)
    {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);

        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;
            if (position.marketId != marketId) continue;

            activeCount++;
            if (!hasActive) {
                hasActive = true;
                activePositionId = positionIds[i];
                activePosition = position;
            }
        }
    }

    /**
     * @notice Get all positions for a trader
     */
    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return perpStorage.getTraderPositions(trader);
    }
}