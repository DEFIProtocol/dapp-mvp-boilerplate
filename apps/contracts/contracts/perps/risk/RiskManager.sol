// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "../library/LiquidationLib.sol";
import "../../options/library/OptionsPricer.sol";

interface IMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}

/**
 * @title RiskManager
 * @notice Handles risk calculations: equity, margin requirements, liquidation checks
 * @dev View functions only - no state changes
 */
contract RiskManager {
    uint256 private constant RATIO_SCALE = 1e18;

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
        uint256 mark = getMarkPriceForMarket(perpStorage.marketFeedId());
        require(mark > 0, "Invalid mark price");
        return mark;
    }

    function getMarkPriceForMarket(bytes32 marketId) public view returns (uint256) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");
        bytes32 feedId = market.feedId;
        require(feedId != bytes32(0), "Invalid market feed");
        uint256 mark = IMarkOracle(perpStorage.markOracle()).getMarkPrice(feedId);
        require(mark > 0, "Invalid mark price");
        return mark;
    }

    function _getMaintenanceBpsForMarket(bytes32 marketId) internal view returns (uint256) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        if (market.exists && market.maintenanceMarginBps > 0) {
            return market.maintenanceMarginBps;
        }
        return perpStorage.maintenanceMarginBps();
    }

    /**
     * @notice Calculate total equity for a trader (collateral + unrealized PnL - funding)
     * @param trader Address to calculate equity for
     */
    function getAccountEquity(address trader) public view returns (int256 equity) {
        equity = int256(perpStorage.accountCollateral(trader));
        
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;
            if (pos.subAccountId != perpStorage.LEGACY_SUBACCOUNT_ID()) continue;
            uint256 markPrice = getMarkPriceForMarket(pos.marketId);
            
            (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, markPrice);
            equity += pnl - funding;
        }

        equity += _getOptionPortfolioEquityContribution(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
        equity += _getSpotPortfolioEquityContribution(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
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
        int256 currentCumulativeFunding = _getCurrentFunding(position.side, position.marketId);
        
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
        
        return (pos.exposure * _getMaintenanceBpsForMarket(pos.marketId)) / perpStorage.BPS_DENOMINATOR();
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
            if (pos.subAccountId != perpStorage.LEGACY_SUBACCOUNT_ID()) continue;
            
            totalReq += (pos.exposure * _getMaintenanceBpsForMarket(pos.marketId)) / perpStorage.BPS_DENOMINATOR();
        }

        totalReq += _getOptionPortfolioMaintenanceRequirement(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
        totalReq += _getSpotPortfolioMaintenanceRequirement(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function getSubAccountEquity(address trader, uint256 subAccountId) public view returns (int256 equity) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            return getAccountEquity(trader);
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        equity = int256(subAccount.collateralBalance);

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory pos = perpStorage.getPosition(positionIds[i]);
            if (!pos.active) continue;
            if (pos.subAccountId != subAccountId) continue;

            uint256 markPrice = getMarkPriceForMarket(pos.marketId);
            (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, markPrice);
            equity += pnl - funding;
        }

        equity += _getOptionPortfolioEquityContribution(trader, subAccountId);
        equity += _getSpotPortfolioEquityContribution(trader, subAccountId);
    }

    function getSubAccountMaintenanceRequirement(address trader, uint256 subAccountId) public view returns (uint256 totalReq) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            return getAccountMaintenanceRequirement(trader);
        }

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory pos = perpStorage.getPosition(positionIds[i]);
            if (!pos.active) continue;
            if (pos.subAccountId != subAccountId) continue;

            totalReq += (pos.exposure * _getMaintenanceBpsForMarket(pos.marketId)) / perpStorage.BPS_DENOMINATOR();
        }

        totalReq += _getOptionPortfolioMaintenanceRequirement(trader, subAccountId);
        totalReq += _getSpotPortfolioMaintenanceRequirement(trader, subAccountId);
    }

    function getAccountOptionEquityContribution(address trader) external view returns (int256) {
        return _getOptionPortfolioEquityContribution(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function getSubAccountOptionEquityContribution(address trader, uint256 subAccountId) external view returns (int256) {
        return _getOptionPortfolioEquityContribution(trader, subAccountId);
    }

    function getAccountOptionMaintenanceRequirement(address trader) external view returns (uint256) {
        return _getOptionPortfolioMaintenanceRequirement(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function getSubAccountOptionMaintenanceRequirement(address trader, uint256 subAccountId) external view returns (uint256) {
        return _getOptionPortfolioMaintenanceRequirement(trader, subAccountId);
    }

    function getAccountSpotEquityContribution(address trader) external view returns (int256) {
        return _getSpotPortfolioEquityContribution(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function getSubAccountSpotEquityContribution(address trader, uint256 subAccountId) external view returns (int256) {
        return _getSpotPortfolioEquityContribution(trader, subAccountId);
    }

    function getAccountSpotMaintenanceRequirement(address trader) external view returns (uint256) {
        return _getSpotPortfolioMaintenanceRequirement(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function getSubAccountSpotMaintenanceRequirement(address trader, uint256 subAccountId) external view returns (uint256) {
        return _getSpotPortfolioMaintenanceRequirement(trader, subAccountId);
    }

    function getSubAccountHealthRatio(address trader, uint256 subAccountId) external view returns (uint256) {
        int256 equity = getSubAccountEquity(trader, subAccountId);
        if (equity <= 0) return 0;

        uint256 maintenanceReq = getSubAccountMaintenanceRequirement(trader, subAccountId);
        if (maintenanceReq == 0) return type(uint256).max;

        return (uint256(equity) * 1e18) / maintenanceReq;
    }

    /**
     * @notice Check if a specific position is liquidatable
     */
    function isPositionLiquidatable(uint256 positionId) public view returns (bool) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");

        uint256 markPrice = getMarkPriceForMarket(pos.marketId);

        if (pos.marginMode == PerpStorage.MarginMode.Isolated) {
            if (pos.liquidationPrice > 0) {
                if (pos.side == PerpStorage.Side.Long) {
                    return markPrice <= pos.liquidationPrice;
                }
                return markPrice >= pos.liquidationPrice;
            }

            uint256 maintenanceBpsFallback = _getMaintenanceBpsForMarket(pos.marketId);
            int256 isolatedEquity = _getPositionEquity(pos, markPrice);
            return LiquidationLib.isLiquidatable(isolatedEquity, pos.exposure, maintenanceBpsFallback);
        }

        uint256 maintenanceBps = _getMaintenanceBpsForMarket(pos.marketId);

        int256 crossEquity = _getCrossAccountEquity(pos.trader, pos.subAccountId);
        uint256 crossMaintenanceReq = _getCrossMaintenanceRequirement(pos.trader, pos.subAccountId);
        if (crossMaintenanceReq == 0) return false;
        if (crossEquity >= int256(crossMaintenanceReq)) return false;

        return LiquidationLib.isLiquidatable(
            crossEquity,
            pos.exposure,
            maintenanceBps
        );
    }

    function getOptionPositionMarkLiability(uint256 optionPositionId) public view returns (uint256) {
        PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(optionPositionId);
        require(position.active, "Option position not active");
        require(!position.settled, "Option already settled");
        require(!position.isLong, "Only short options have liability");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(position.seriesId);
        require(series.exists, "Unknown series");

        uint256 spot = _getOptionSpot(series.marketId);
        uint256 secondsToExpiry = block.timestamp >= series.expiry ? 0 : series.expiry - block.timestamp;
        uint256 perUnitMark = OptionsPricerCore(perpStorage.optionsPricer()).getMarkPremium(
            series.isCall,
            series.strikePrice,
            spot,
            secondsToExpiry,
            series.ivBps,
            series.riskFreeRateBps
        );

        return (perUnitMark * position.size) / 1e18;
    }

    function isOptionPositionLiquidatable(uint256 optionPositionId) external view returns (bool) {
        PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(optionPositionId);
        require(position.active, "Option position not active");
        require(!position.settled, "Option already settled");
        require(!position.isLong, "Only short options liquidatable");

        int256 equity = getSubAccountEquity(position.trader, position.subAccountId);
        uint256 maintenanceReq = getSubAccountMaintenanceRequirement(position.trader, position.subAccountId);
        if (maintenanceReq == 0) return false;

        return equity < int256(maintenanceReq);
    }

    function isSpotBalanceLiquidatable(address trader, uint256 subAccountId, bytes32 marketId) external view returns (bool) {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.SpotBalance memory spotBalance = perpStorage.getSpotBalance(trader, subAccountId, resolvedMarketId);
        if (!spotBalance.exists || (spotBalance.quantity == 0 && spotBalance.borrowLiability == 0)) {
            return false;
        }

        int256 equity = subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()
            ? getAccountEquity(trader)
            : getSubAccountEquity(trader, subAccountId);
        uint256 maintenanceReq = subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()
            ? getAccountMaintenanceRequirement(trader)
            : getSubAccountMaintenanceRequirement(trader, subAccountId);

        return maintenanceReq > 0 && equity < int256(maintenanceReq);
    }

    function _getPositionEquity(
        PerpStorage.Position memory pos,
        uint256 markPrice
    ) internal view returns (int256 equity) {
        (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, markPrice);
        equity = int256(pos.margin) + pnl - funding;
    }

    function _getCrossAccountEquity(address trader, uint256 subAccountId) internal view returns (int256 equity) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            equity = int256(perpStorage.accountCollateral(trader));
        } else {
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            equity = int256(subAccount.collateralBalance);
        }

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory pos = perpStorage.getPosition(positionIds[i]);
            if (!pos.active) continue;
            if (pos.marginMode != PerpStorage.MarginMode.Cross) continue;
            if (pos.subAccountId != subAccountId) continue;

            uint256 markPrice = pos.marketId == bytes32(0) ? getMarkPrice() : getMarkPriceForMarket(pos.marketId);
            (int256 pnl, int256 funding) = getPositionPnlAndFunding(pos, markPrice);
            equity += pnl - funding;
        }

        equity += _getOptionPortfolioEquityContribution(trader, subAccountId);
        equity += _getSpotPortfolioEquityContribution(trader, subAccountId);
    }

    function _getCrossMaintenanceRequirement(address trader, uint256 subAccountId) internal view returns (uint256 totalReq) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory pos = perpStorage.getPosition(positionIds[i]);
            if (!pos.active) continue;
            if (pos.marginMode != PerpStorage.MarginMode.Cross) continue;
            if (pos.subAccountId != subAccountId) continue;

            totalReq += (pos.exposure * _getMaintenanceBpsForMarket(pos.marketId)) / perpStorage.BPS_DENOMINATOR();
        }

        totalReq += _getOptionPortfolioMaintenanceRequirement(trader, subAccountId);
        totalReq += _getSpotPortfolioMaintenanceRequirement(trader, subAccountId);
    }

    function _getCurrentFunding(PerpStorage.Side side, bytes32 marketId) internal view returns (int256) {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");
        return side == PerpStorage.Side.Long ? market.cumulativeFundingLong : market.cumulativeFundingShort;
    }

    function _getOptionPortfolioEquityContribution(address trader, uint256 subAccountId) internal view returns (int256 equityDelta) {
        uint256[] memory optionPositionIds = perpStorage.getTraderOptionPositions(trader);

        for (uint256 i = 0; i < optionPositionIds.length; i++) {
            PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(optionPositionIds[i]);
            if (!position.active || position.settled) continue;
            if (position.subAccountId != subAccountId) continue;

            PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(position.seriesId);
            if (!series.exists) continue;

            uint256 spot = _getOptionSpot(series.marketId);
            uint256 shockedSpot = _applyOptionShock(spot, series.isCall, position.isLong);
            uint256 secondsToExpiry = block.timestamp >= series.expiry ? 0 : series.expiry - block.timestamp;
            uint256 perUnitMark = OptionsPricerCore(perpStorage.optionsPricer()).getMarkPremium(
                series.isCall,
                series.strikePrice,
                shockedSpot,
                secondsToExpiry,
                series.ivBps,
                series.riskFreeRateBps
            );
            uint256 grossValue = (perUnitMark * position.size) / 1e18;

            if (position.isLong) {
                uint256 haircut = _getLongOptionHaircutBps(series, spot);
                equityDelta += int256((grossValue * haircut) / perpStorage.BPS_DENOMINATOR());
            } else {
                equityDelta -= int256(grossValue);
            }
        }
    }

    function _getOptionPortfolioMaintenanceRequirement(address trader, uint256 subAccountId) internal view returns (uint256 totalReq) {
        uint256[] memory optionPositionIds = perpStorage.getTraderOptionPositions(trader);

        for (uint256 i = 0; i < optionPositionIds.length; i++) {
            PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(optionPositionIds[i]);
            if (!position.active || position.settled || position.isLong) continue;
            if (position.subAccountId != subAccountId) continue;

            PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(position.seriesId);
            if (!series.exists) continue;

            uint256 spot = _getOptionSpot(series.marketId);
            uint256 adverseSpot = _applyOptionShock(spot, series.isCall, false);
            uint256 secondsToExpiry = block.timestamp >= series.expiry ? 0 : series.expiry - block.timestamp;
            uint256 perUnitLiability = OptionsPricerCore(perpStorage.optionsPricer()).getMarkPremium(
                series.isCall,
                series.strikePrice,
                adverseSpot,
                secondsToExpiry,
                series.ivBps,
                series.riskFreeRateBps
            );
            uint256 liability = (perUnitLiability * position.size) / 1e18;
            uint256 stressedWriterMargin = OptionsPricerCore(perpStorage.optionsPricer()).getWriterMargin(
                series.isCall,
                series.strikePrice,
                position.size,
                adverseSpot,
                secondsToExpiry,
                series.ivBps,
                series.riskFreeRateBps
            );

            totalReq += liability + stressedWriterMargin;
        }
    }

    function _getSpotPortfolioEquityContribution(address trader, uint256 subAccountId) internal view returns (int256 equityDelta) {
        bytes32[] memory spotMarketIds = perpStorage.getTraderSpotMarketIds(trader, subAccountId);

        for (uint256 i = 0; i < spotMarketIds.length; i++) {
            PerpStorage.SpotBalance memory spotBalance = perpStorage.getSpotBalance(trader, subAccountId, spotMarketIds[i]);
            if (!spotBalance.exists) continue;

            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(spotMarketIds[i]);
            if (!market.exists) continue;

            uint256 markPrice = getMarkPriceForMarket(spotMarketIds[i]);
            uint256 grossValue = (spotBalance.quantity * markPrice) / 1e18;
            uint256 haircutBps = market.spotCollateralHaircutBps > 0
                ? market.spotCollateralHaircutBps
                : perpStorage.BPS_DENOMINATOR();
            uint256 haircuttedValue = (grossValue * haircutBps) / perpStorage.BPS_DENOMINATOR();

            equityDelta += int256(haircuttedValue);
            if (spotBalance.borrowLiability > 0) {
                equityDelta -= int256(spotBalance.borrowLiability);
            }
        }
    }

    function _getSpotPortfolioMaintenanceRequirement(address trader, uint256 subAccountId) internal view returns (uint256 totalReq) {
        bytes32[] memory spotMarketIds = perpStorage.getTraderSpotMarketIds(trader, subAccountId);

        for (uint256 i = 0; i < spotMarketIds.length; i++) {
            PerpStorage.SpotBalance memory spotBalance = perpStorage.getSpotBalance(trader, subAccountId, spotMarketIds[i]);
            if (!spotBalance.exists) continue;

            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(spotMarketIds[i]);
            if (!market.exists) continue;

            uint256 markPrice = getMarkPriceForMarket(spotMarketIds[i]);
            uint256 grossValue = (spotBalance.quantity * markPrice) / 1e18;
            totalReq += spotBalance.borrowLiability;

            if (market.spotMaintenanceWeightBps > 0) {
                totalReq += (grossValue * market.spotMaintenanceWeightBps) / perpStorage.BPS_DENOMINATOR();
            }
        }
    }

    function _getOptionSpot(bytes32 marketId) internal view returns (uint256) {
        return getMarkPriceForMarket(marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId);
    }

    function _applyOptionShock(uint256 spot, bool isCall, bool isLong) internal view returns (uint256) {
        uint256 shockBps = perpStorage.optionAdversePriceShockBps();
        if (shockBps == 0) return spot;

        bool shouldDecreaseSpot = (isCall && isLong) || (!isCall && !isLong);
        if (shouldDecreaseSpot) {
            return (spot * (perpStorage.BPS_DENOMINATOR() - shockBps)) / perpStorage.BPS_DENOMINATOR();
        }

        return (spot * (perpStorage.BPS_DENOMINATOR() + shockBps)) / perpStorage.BPS_DENOMINATOR();
    }

    function _getLongOptionHaircutBps(PerpStorage.OptionSeries memory series, uint256 spot) internal view returns (uint256) {
        uint256 strike = series.strikePrice;
        if (strike == 0) return 0;

        uint256 absDiff = spot > strike ? spot - strike : strike - spot;
        uint256 distanceBps = (absDiff * perpStorage.BPS_DENOMINATOR()) / strike;
        uint256 intrinsic = series.isCall ? (spot > strike ? spot - strike : 0) : (strike > spot ? strike - spot : 0);
        uint256 intrinsicBps = (intrinsic * perpStorage.BPS_DENOMINATOR()) / strike;
        bool isOtm = series.isCall ? spot < strike : spot > strike;

        if (intrinsicBps >= perpStorage.optionDeepItmThresholdBps()) {
            return perpStorage.optionDeepItmHaircutBps();
        }

        if (distanceBps <= perpStorage.optionAtmThresholdBps()) {
            return perpStorage.optionAtmHaircutBps();
        }

        if (isOtm) {
            if (distanceBps <= perpStorage.optionSlightOtmThresholdBps()) {
                return perpStorage.optionSlightOtmHaircutBps();
            }

            return perpStorage.optionDeepOtmHaircutBps();
        }

        return perpStorage.optionAtmHaircutBps();
    }

    /**
     * @notice Check if a trader has any liquidatable positions
     */
    function getLiquidatablePositions(address trader) external view returns (uint256[] memory) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        uint256[] memory liquidatable = new uint256[](positionIds.length);
        uint256 count = 0;
        uint256 defaultMarkPrice = getMarkPrice();

        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            
            if (!pos.active) continue;

            bool isLiquidatable;
            if (pos.marginMode == PerpStorage.MarginMode.Isolated) {
                uint256 isolatedMark = pos.marketId == bytes32(0) ? defaultMarkPrice : getMarkPriceForMarket(pos.marketId);
                if (pos.liquidationPrice > 0) {
                    isLiquidatable = pos.side == PerpStorage.Side.Long
                        ? isolatedMark <= pos.liquidationPrice
                        : isolatedMark >= pos.liquidationPrice;
                } else {
                    int256 isolatedEquity = _getPositionEquity(pos, isolatedMark);
                    uint256 isolatedMaintenanceBps = _getMaintenanceBpsForMarket(pos.marketId);
                    isLiquidatable = LiquidationLib.isLiquidatable(
                        isolatedEquity,
                        pos.exposure,
                        isolatedMaintenanceBps
                    );
                }
            } else {
                int256 crossEquity = _getCrossAccountEquity(trader, pos.subAccountId);
                uint256 crossMaintenanceReq = _getCrossMaintenanceRequirement(trader, pos.subAccountId);
                bool crossAccountAtRisk = crossMaintenanceReq > 0 && crossEquity < int256(crossMaintenanceReq);
                uint256 crossMaintenanceBps = _getMaintenanceBpsForMarket(pos.marketId);
                isLiquidatable = crossAccountAtRisk && LiquidationLib.isLiquidatable(
                    crossEquity,
                    pos.exposure,
                    crossMaintenanceBps
                );
            }

            if (isLiquidatable) {
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

        if (pos.liquidationPrice > 0) {
            return pos.liquidationPrice;
        }
        
        return LiquidationLib.calculateLiquidationPrice(
            pos.exposure,
            pos.entryPrice,
            pos.margin,
            _getMaintenanceBpsForMarket(pos.marketId),
            pos.side == PerpStorage.Side.Long
        );
    }

    function getBankruptcyPrice(uint256 positionId) external view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        require(pos.active, "Position not active");
        return pos.bankruptcyPrice;
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
     * @notice Estimate aggregate loss if currently at-risk positions fail from current marks.
     * @dev Uses per-position equity shortfall vs maintenance as a conservative risk proxy.
     */
    function estimateTotalAtRiskLoss() public view returns (uint256 totalAtRiskLoss) {
        uint256 nextPositionId = perpStorage.nextPositionId();

        for (uint256 positionId = 0; positionId < nextPositionId; positionId++) {
            PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
            if (!pos.active) continue;

            bytes32 resolvedMarketId = pos.marketId == bytes32(0) ? perpStorage.marketFeedId() : pos.marketId;
            uint256 markPrice = getMarkPriceForMarket(resolvedMarketId);
            int256 equity = _getPositionEquity(pos, markPrice);
            uint256 maintenanceReq = (pos.exposure * _getMaintenanceBpsForMarket(pos.marketId)) / perpStorage.BPS_DENOMINATOR();

            if (equity >= int256(maintenanceReq)) continue;

            uint256 shortfall = uint256(int256(maintenanceReq) - equity);
            totalAtRiskLoss += shortfall;
        }
    }

    /**
     * @notice Insurance coverage ratio helper for proactive ADL policies.
     * @return coverageRatio 1e18-scaled ratio of insurance fund to estimated at-risk loss.
     * @return insuranceBalance Current insurance fund balance in collateral units.
     * @return totalAtRiskLoss Estimated aggregate at-risk loss in collateral units.
     */
    function getInsuranceCoverageData()
        external
        view
        returns (uint256 coverageRatio, uint256 insuranceBalance, uint256 totalAtRiskLoss)
    {
        insuranceBalance = perpStorage.insuranceFundBalance();
        totalAtRiskLoss = estimateTotalAtRiskLoss();

        if (totalAtRiskLoss == 0) {
            coverageRatio = type(uint256).max;
            return (coverageRatio, insuranceBalance, totalAtRiskLoss);
        }

        coverageRatio = (insuranceBalance * RATIO_SCALE) / totalAtRiskLoss;
        return (coverageRatio, insuranceBalance, totalAtRiskLoss);
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