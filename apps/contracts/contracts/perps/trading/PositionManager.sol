// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "./PositionNetting.sol";
import "../../shared/account/CollateralManager.sol";

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
            marginMode,
            perpStorage.LEGACY_SUBACCOUNT_ID()
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
        return _openPosition(
            trader,
            side,
            exposure,
            leverage,
            entryPrice,
            marketId,
            marginMode,
            perpStorage.LEGACY_SUBACCOUNT_ID()
        );
    }

    function openPositionWithMarketAndSubAccount(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        uint256 subAccountId
    ) external onlyAuthorizedModule returns (uint256 positionId) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            PerpStorage.MarginMode marginMode = perpStorage.isCrossMargin(trader)
                ? PerpStorage.MarginMode.Cross
                : PerpStorage.MarginMode.Isolated;

            return _openPosition(trader, side, exposure, leverage, entryPrice, marketId, marginMode, subAccountId);
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        return _openPosition(trader, side, exposure, leverage, entryPrice, marketId, subAccount.marginMode, subAccountId);
    }

    function _openPosition(
        address trader,
        PerpStorage.Side side,
        uint256 exposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode,
        uint256 subAccountId
    ) internal returns (uint256 positionId) {
        require(!perpStorage.frozenAccounts(trader), "Account frozen");
        require(leverage >= perpStorage.MIN_LEVERAGE() && leverage <= perpStorage.MAX_LEVERAGE(), "Invalid leverage");
        require(exposure > 0, "Invalid exposure");
        require(entryPrice > 0, "Invalid entry price");
        require(marketId != bytes32(0), "Invalid market");

        // Check per-market open interest caps
        {
            PerpStorage.MarketConfig memory mktConfig = perpStorage.getMarketConfig(marketId);
            if (side == PerpStorage.Side.Long && mktConfig.maxLongExposure > 0) {
                require(
                    perpStorage.marketLongExposure(marketId) + exposure <= mktConfig.maxLongExposure,
                    "Long OI cap exceeded"
                );
            }
            if (side == PerpStorage.Side.Short && mktConfig.maxShortExposure > 0) {
                require(
                    perpStorage.marketShortExposure(marketId) + exposure <= mktConfig.maxShortExposure,
                    "Short OI cap exceeded"
                );
            }
        }

        // Calculate required margin
        uint256 requiredMargin = (exposure * 1e18) / leverage / 1e18; // exposure / leverage
        require(requiredMargin > 0, "Invalid margin");

        // Enforce size-based tiered initial margin when tiers are configured
        {
            uint256 tier1Cap = perpStorage.sizeBasedMarginTier1Cap();
            if (tier1Cap > 0) {
                uint256 effectiveImBps = _tieredImBps(exposure);
                uint256 minRequiredMargin = (exposure * effectiveImBps) / 10000;
                require(requiredMargin >= minRequiredMargin, "Leverage too high for position size tier");
            }
        }

        (bool hasActive, uint256 activePositionId, PerpStorage.Position memory activePosition, uint256 activeCount) =
            _getSingleActivePositionForMarket(trader, marketId, subAccountId);
        require(activeCount <= 1, "Multiple active positions unsupported");

        if (!hasActive) {
            _addReservedMargin(trader, subAccountId, requiredMargin);
            return _createPosition(trader, side, exposure, requiredMargin, entryPrice, marketId, marginMode, subAccountId);
        }

        require(activePosition.marginMode == marginMode, "Margin mode mismatch");
        require(activePosition.subAccountId == subAccountId, "Sub-account mismatch");

        if (activePosition.side == side) {
            _addReservedMargin(trader, subAccountId, requiredMargin);

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
            _refreshRiskPrices(activePositionId);

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

        return _offsetOrFlipPosition(trader, activePositionId, activePosition, side, exposure, leverage, entryPrice, subAccountId);
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
        _removeReservedMargin(position.trader, position.subAccountId, position.margin);
        
        // Apply PnL and funding to collateral (negative funding means trader receives)
        // funding > 0 means trader pays, funding < 0 means trader receives
        int256 totalDelta = pnl - funding; // funding payment is subtracted from PnL
        
        // Apply to collateral
        _applyAccountDelta(position.trader, position.subAccountId, totalDelta);

        _maybeSweepJitCollateral(position.trader, position.subAccountId);
        
        emit PositionClosed(positionId, position.trader, pnl, funding, totalDelta);
        
        return (pnl, funding);
    }

    /**
     * @notice Force-reduce a position by notional exposure without opening any new opposing leg.
     * @dev Used by ADL and other risk modules. Keeps position active unless fully reduced.
     */
    function forceReducePosition(
        uint256 positionId,
        uint256 reductionExposure,
        uint256 closePrice
    ) external onlyModule returns (uint256 reducedExposure, int256 reductionDelta) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);

        require(position.active, "Position not active");
        require(reductionExposure > 0, "Invalid reduction");
        require(reductionExposure <= position.exposure, "Reduction too large");
        require(closePrice > 0, "Invalid close price");

        int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
        (, , reductionDelta) = PositionNetting.calculateReductionDelta(
            position.side,
            reductionExposure,
            position.entryPrice,
            closePrice,
            position.entryFunding,
            currentFunding
        );

        if (reductionDelta != 0) {
            _applyAccountDelta(position.trader, position.subAccountId, reductionDelta);
        }

        uint256 releasedMargin = PositionNetting.calculateProportionalMarginRelease(
            position.margin,
            position.exposure,
            reductionExposure
        );
        if (releasedMargin > 0) {
            _removeReservedMargin(position.trader, position.subAccountId, releasedMargin);
        }

        if (position.side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() - reductionExposure);
            perpStorage.setMarketLongExposure(position.marketId, perpStorage.marketLongExposure(position.marketId) - reductionExposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() - reductionExposure);
            perpStorage.setMarketShortExposure(position.marketId, perpStorage.marketShortExposure(position.marketId) - reductionExposure);
        }

        uint256 remainingExposure = position.exposure - reductionExposure;
        if (remainingExposure == 0) {
            perpStorage.setPositionActive(positionId, false);
            _removeTraderPosition(position.trader, positionId);
            perpStorage.setHasPosition(position.trader, positionId, false);
            perpStorage.decrementPositionCount(position.trader);
            _maybeSweepJitCollateral(position.trader, position.subAccountId);
        } else {
            uint256 remainingMargin = position.margin - releasedMargin;
            perpStorage.setPositionExposure(positionId, remainingExposure);
            perpStorage.setPositionMargin(positionId, remainingMargin);
            _refreshRiskPrices(positionId);
            emit PositionModified(positionId, remainingExposure, remainingMargin, reductionDelta);
        }

        return (reductionExposure, reductionDelta);
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
        uint256 available = _getAvailableCollateral(msg.sender, position.subAccountId);
        require(available >= additionalMargin, "Insufficient available collateral");
        
        // Update reserved margin
        _addReservedMargin(msg.sender, position.subAccountId, additionalMargin);
        
        // Update position margin
        uint256 updatedMargin = position.margin + additionalMargin;
        perpStorage.setPositionMargin(positionId, updatedMargin);
        _refreshRiskPrices(positionId);
        
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
        _removeReservedMargin(msg.sender, position.subAccountId, marginToRemove);
        
        // Update position margin
        perpStorage.setPositionMargin(positionId, newMargin);
        _refreshRiskPrices(positionId);
        
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
        PerpStorage.MarginMode marginMode,
        uint256 subAccountId
    ) internal returns (uint256 positionId) {
        positionId = perpStorage.nextPositionId();
        int256 entryFunding = _getCurrentFunding(side, marketId);
        address collateralToken = _resolveCollateralToken(trader, subAccountId);

        PerpStorage.Position memory newPosition = PerpStorage.Position({
            trader: trader,
            side: side,
            exposure: exposure,
            margin: margin,
            entryPrice: entryPrice,
            liquidationPrice: 0,
            bankruptcyPrice: 0,
            entryFunding: entryFunding,
            marginMode: marginMode,
            marketId: marketId,
            subAccountId: subAccountId,
            collateralToken: collateralToken,
            active: true
        });

        perpStorage.setPosition(positionId, newPosition);
        _refreshRiskPrices(positionId);
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
        uint256 entryPrice,
        uint256 subAccountId
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
            _applyAccountDelta(trader, activePosition.subAccountId, reductionDelta);
        }

        uint256 releasedMargin = PositionNetting.calculateProportionalMarginRelease(
            activePosition.margin,
            activePosition.exposure,
            reductionExposure
        );
        if (releasedMargin > 0) {
            _removeReservedMargin(trader, activePosition.subAccountId, releasedMargin);
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

            if (remainingIncomingExposure == 0) {
                _maybeSweepJitCollateral(trader, activePosition.subAccountId);
            }
        } else {
            uint256 remainingMargin = activePosition.margin - releasedMargin;
            perpStorage.setPositionExposure(activePositionId, remainingActiveExposure);
            perpStorage.setPositionMargin(activePositionId, remainingMargin);
            _refreshRiskPrices(activePositionId);
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
            activePosition.marginMode,
            subAccountId
        );
    }

    function _openResidualPosition(
        address trader,
        PerpStorage.Side incomingSide,
        uint256 incomingExposure,
        uint256 leverage,
        uint256 entryPrice,
        bytes32 marketId,
        PerpStorage.MarginMode marginMode,
        uint256 subAccountId
    ) internal returns (uint256 positionId) {
        uint256 incomingMargin = (incomingExposure * 1e18) / leverage / 1e18;
        require(incomingMargin > 0, "Invalid margin");
        _addReservedMargin(trader, subAccountId, incomingMargin);

        return _createPosition(
            trader,
            incomingSide,
            incomingExposure,
            incomingMargin,
            entryPrice,
            marketId,
            marginMode,
            subAccountId
        );
    }

    function _isLegacySubAccount(uint256 subAccountId) internal view returns (bool) {
        return subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID();
    }

    function _resolveCollateralToken(address trader, uint256 subAccountId) internal view returns (address) {
        if (_isLegacySubAccount(subAccountId)) {
            return address(perpStorage.collateral());
        }

        return perpStorage.getSubAccount(trader, subAccountId).collateralToken;
    }

    function _getAvailableCollateral(address trader, uint256 subAccountId) internal view returns (uint256) {
        if (_isLegacySubAccount(subAccountId)) {
            return collateralManager.getAvailableCollateral(trader);
        }

        return collateralManager.getAvailableCollateralForSubAccount(trader, subAccountId);
    }

    function _addReservedMargin(address trader, uint256 subAccountId, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            collateralManager.addReservedMargin(trader, amount);
            return;
        }

        collateralManager.addReservedMarginForSubAccount(trader, subAccountId, amount);
    }

    function _removeReservedMargin(address trader, uint256 subAccountId, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            collateralManager.removeReservedMargin(trader, amount);
            return;
        }

        collateralManager.removeReservedMarginForSubAccount(trader, subAccountId, amount);
    }

    function _applyAccountDelta(address trader, uint256 subAccountId, int256 delta) internal {
        if (_isLegacySubAccount(subAccountId)) {
            collateralManager.applyAccountDelta(trader, delta);
            return;
        }

        collateralManager.applyAccountDeltaForSubAccount(trader, subAccountId, delta);
    }

    function _getCurrentFunding(PerpStorage.Side side, bytes32 marketId) internal view returns (int256) {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");

        return side == PerpStorage.Side.Long
            ? market.cumulativeFundingLong
            : market.cumulativeFundingShort;
    }

    function _getMaintenanceBpsForMarket(bytes32 marketId) internal view returns (uint256) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        if (market.exists && market.maintenanceMarginBps > 0) {
            return market.maintenanceMarginBps;
        }
        return perpStorage.maintenanceMarginBps();
    }

    function _refreshRiskPrices(uint256 positionId) internal {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        if (!position.active) return;
        if (position.exposure == 0 || position.entryPrice == 0) return;

        PnlLib.Position memory pnlPosition = PnlLib.Position({
            exposure: position.exposure,
            entryPrice: position.entryPrice,
            side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
        });

        uint256 liquidationPrice = PnlLib.calculateLiquidationPrice(
            pnlPosition,
            position.margin,
            _getMaintenanceBpsForMarket(position.marketId)
        );
        uint256 bankruptcyPrice = PnlLib.calculateBankruptcyPrice(pnlPosition, position.margin);

        perpStorage.setPositionLiquidationPrice(positionId, liquidationPrice);
        perpStorage.setPositionBankruptcyPrice(positionId, bankruptcyPrice);
    }

    function _getSingleActivePositionForMarket(address trader, bytes32 marketId, uint256 subAccountId)
        internal
        view
        returns (bool hasActive, uint256 activePositionId, PerpStorage.Position memory activePosition, uint256 activeCount)
    {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);

        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;
            if (position.marketId != marketId) continue;
            if (position.subAccountId != subAccountId) continue;

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

    /**
     * @notice Compute the effective initial-margin rate (in bps) for a given exposure,
     *         using the three-tier schedule stored in PerpStorage.
     *         Tiers are only active when sizeBasedMarginTier1Cap > 0.
     */
    function _tieredImBps(uint256 exposure) internal view returns (uint256) {
        uint256 tier1Cap = perpStorage.sizeBasedMarginTier1Cap();
        uint256 tier2Cap = perpStorage.sizeBasedMarginTier2Cap();
        if (exposure <= tier1Cap) {
            return perpStorage.sizeBasedMarginTier1Bps();
        } else if (tier2Cap == 0 || exposure <= tier2Cap) {
            return perpStorage.sizeBasedMarginTier2Bps();
        } else {
            return perpStorage.sizeBasedMarginTier3Bps();
        }
    }

    function _maybeSweepJitCollateral(address trader, uint256 subAccountId) internal {
        if (!perpStorage.jitModeEnabled()) {
            return;
        }

        if (_hasActivePositionInSubAccount(trader, subAccountId)) {
            return;
        }

        collateralManager.pushAvailableCollateralToWallet(trader, subAccountId);
    }

    function _hasActivePositionInSubAccount(address trader, uint256 subAccountId) internal view returns (bool) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;
            if (position.subAccountId != subAccountId) continue;
            return true;
        }

        return false;
    }
}