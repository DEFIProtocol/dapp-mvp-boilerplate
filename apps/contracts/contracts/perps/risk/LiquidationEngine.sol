// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/LiquidationLib.sol";
import "../../interfaces/IInsuranceTreasury.sol";
import "../../shared/account/CollateralManager.sol";
import "../trading/PositionManager.sol";
import "./RiskManager.sol";
import "../../options/library/OptionsPricer.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IADLEngine {
    function executeAutoDeleverage(
        bytes32 marketId,
        bool targetLongSide,
        uint256 deficit,
        uint256 eventId
    ) external returns (uint256 covered, uint256 remainingDeficit);
}

/**
 * @title LiquidationEngine
 * @notice Handles liquidation of underwater positions
 * @dev Uses LiquidationLib for calculations, interacts with other modules
 */
contract LiquidationEngine {
    using SafeERC20 for IERC20;

    uint256 private constant RATIO_SCALE = 1e18;

    PerpStorage public perpStorage;
    CollateralManager public collateralManager;
    PositionManager public positionManager;
    RiskManager public riskManager;
    address public adlEngine;
    uint256 public adlEventNonce;
    uint256 public lastProactiveAdlBlock;

    // Events
    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 reward,
        uint256 badDebt,
        uint256 insuranceUsed,
        uint256 penaltyCollected,
        uint256 marginReturned
    );
    event OptionPositionLiquidated(
        uint256 indexed optionPositionId,
        uint256 indexed seriesId,
        address indexed trader,
        address liquidator,
        uint256 markLiability,
        uint256 reward,
        uint256 badDebt,
        uint256 insuranceUsed,
        uint256 penaltyCollected,
        uint256 marginReturned
    );
    event SpotBalanceLiquidated(
        address indexed trader,
        uint256 indexed subAccountId,
        bytes32 indexed marketId,
        address liquidator,
        uint256 quantity,
        uint256 markPrice,
        uint256 reward,
        uint256 badDebt,
        uint256 insuranceUsed,
        uint256 penaltyCollected,
        uint256 marginReturned
    );
    
    event BadDebtRecorded(uint256 amount, address indexed trader);
    event InsuranceFundUsed(uint256 amount, uint256 remaining);
    event ADLEngineUpdated(address indexed oldEngine, address indexed newEngine);
    event ADLExecuted(
        bytes32 indexed marketId,
        bool indexed targetLongSide,
        uint256 indexed eventId,
        uint256 requestedDeficit,
        uint256 covered,
        uint256 remainingDeficit
    );
    event ADLProactiveTriggered(
        bytes32 indexed marketId,
        uint256 indexed eventId,
        bool hardTrigger,
        uint256 coverageRatio,
        uint256 softThreshold,
        uint256 hardThreshold,
        uint256 insuranceBalance,
        uint256 totalAtRiskLoss,
        uint256 requestedDeficit,
        uint256 covered,
        uint256 remainingDeficit
    );

    constructor(
        address _perpStorage,
        address _collateralManager,
        address _positionManager,
        address _riskManager
    ) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        positionManager = PositionManager(_positionManager);
        riskManager = RiskManager(_riskManager);
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    function setAdlEngine(address _adlEngine) external onlyOwner {
        address old = adlEngine;
        adlEngine = _adlEngine;
        emit ADLEngineUpdated(old, _adlEngine);
    }

    /**
     * @notice Liquidate a single position
     * @param positionId Position to liquidate
     */
    function liquidate(uint256 positionId) external notPaused {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
        _maybeAutoPauseOnOracleStale(marketId);
        if (perpStorage.marketOracleStalePaused(marketId)) {
            require(perpStorage.allowLiquidationWhenOracleStalePaused(), "Market oracle stale paused");
            revert("Use liquidateWithPrice while oracle stale");
        }
        _liquidate(positionId, msg.sender, riskManager.getMarkPriceForMarket(marketId));
    }

    /**
     * @notice Liquidate with custom price (admin only for emergencies)
     */
    function liquidateWithPrice(uint256 positionId, uint256 price) external onlyModule {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
        if (perpStorage.marketOracleStalePaused(marketId)) {
            require(perpStorage.allowLiquidationWhenOracleStalePaused(), "Market oracle stale paused");
        }
        _liquidate(positionId, msg.sender, price);
    }

    /**
     * @notice Batch liquidate multiple positions
     */
    function batchLiquidate(uint256[] calldata positionIds) external notPaused {
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
            _maybeAutoPauseOnOracleStale(marketId);
            if (perpStorage.marketOracleStalePaused(marketId)) {
                require(perpStorage.allowLiquidationWhenOracleStalePaused(), "Market oracle stale paused");
                revert("Use liquidateWithPrice while oracle stale");
            }
            _liquidate(positionIds[i], msg.sender, riskManager.getMarkPriceForMarket(marketId));
        }
    }

    function liquidateSpotBalance(address trader, uint256 subAccountId, bytes32 marketId) external notPaused {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        _maybeAutoPauseOnOracleStale(resolvedMarketId);
        if (perpStorage.marketOracleStalePaused(resolvedMarketId)) {
            require(perpStorage.allowLiquidationWhenOracleStalePaused(), "Market oracle stale paused");
            revert("Use liquidateSpotBalanceWithPrice while oracle stale");
        }

        _liquidateSpotBalance(trader, subAccountId, resolvedMarketId, msg.sender, riskManager.getMarkPriceForMarket(resolvedMarketId));
    }

    function liquidateSpotBalanceWithPrice(address trader, uint256 subAccountId, bytes32 marketId, uint256 markPrice) external onlyModule {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        if (perpStorage.marketOracleStalePaused(resolvedMarketId)) {
            require(perpStorage.allowLiquidationWhenOracleStalePaused(), "Market oracle stale paused");
        }

        _liquidateSpotBalance(trader, subAccountId, resolvedMarketId, msg.sender, markPrice);
    }

    function liquidateOptionPosition(uint256 optionPositionId) external notPaused {
        PerpStorage.OptionPosition memory optionPosition = perpStorage.getOptionPosition(optionPositionId);
        require(optionPosition.active, "Option position not active");
        require(!optionPosition.settled, "Option already settled");
        require(!optionPosition.isLong, "Only short options liquidatable");
        require(!perpStorage.frozenAccounts(optionPosition.trader), "Account frozen");

        bool isLiquidatable = riskManager.isOptionPositionLiquidatable(optionPositionId);
        require(isLiquidatable, "Option position still healthy");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(optionPosition.seriesId);
        require(series.exists, "Unknown option series");

        uint256 spot = riskManager.getMarkPriceForMarket(series.marketId);
        uint256 secondsToExpiry = block.timestamp >= series.expiry ? 0 : series.expiry - block.timestamp;
        uint256 perUnitMark = OptionsPricerCore(perpStorage.optionsPricer()).getMarkPremium(
            series.isCall,
            series.strikePrice,
            spot,
            secondsToExpiry,
            series.ivBps,
            series.riskFreeRateBps
        );
        uint256 markLiability = (perUnitMark * optionPosition.size) / 1e18;

        _removeReservedMargin(optionPosition.trader, optionPosition.subAccountId, optionPosition.marginLocked);

        uint256 badDebt = 0;
        if (markLiability > 0) {
            badDebt = _applyAccountDelta(optionPosition.trader, optionPosition.subAccountId, -int256(markLiability));
        }

        perpStorage.setOptionPositionActive(optionPositionId, false);
        perpStorage.setOptionPositionSettled(optionPositionId, true);
        perpStorage.removeTraderOptionPosition(optionPosition.trader, optionPositionId);

        uint256 shortOi = perpStorage.seriesOpenInterestShort(optionPosition.seriesId);
        if (shortOi >= optionPosition.size) {
            perpStorage.setSeriesOpenInterestShort(optionPosition.seriesId, shortOi - optionPosition.size);
        } else {
            perpStorage.setSeriesOpenInterestShort(optionPosition.seriesId, 0);
        }

        uint256 notional = (series.strikePrice * optionPosition.size) / 1e18;
        uint256 availableCollateral = _getAvailableCollateral(optionPosition.trader, optionPosition.subAccountId);

        uint256 liquidationRewardBps = perpStorage.liquidationRewardBps();
        uint256 liquidationPenaltyBps = perpStorage.liquidationPenaltyBps();
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(series.marketId);
        if (market.exists) {
            liquidationRewardBps = market.liquidationRewardBps;
            liquidationPenaltyBps = market.liquidationPenaltyBps;
        }

        (uint256 reward, uint256 penalty, uint256 toInsurance, ) = LiquidationLib.calculateLiquidationPayouts(
            notional,
            availableCollateral,
            liquidationRewardBps,
            liquidationPenaltyBps
        );

        (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) = _distributeLiquidationProceeds(
            optionPosition.trader,
            msg.sender,
            optionPosition.subAccountId,
            series.marketId,
            PerpStorage.Side.Long,
            reward,
            penalty,
            toInsurance,
            badDebt
        );

        _maybeSweepJitCollateral(optionPosition.trader, optionPosition.subAccountId);

        emit OptionPositionLiquidated(
            optionPositionId,
            optionPosition.seriesId,
            optionPosition.trader,
            msg.sender,
            markLiability,
            rewardPaid,
            badDebt,
            insuranceContribution,
            penaltyCollected,
            marginReturned
        );

        if (badDebt > 0) {
            emit BadDebtRecorded(badDebt, optionPosition.trader);
        }
    }

    function _maybeAutoPauseOnOracleStale(bytes32 marketId) internal {
        if (perpStorage.marketOracleStalePaused(marketId)) {
            return;
        }

        if (!perpStorage.oracleStaleAutoPauseEnabled()) {
            return;
        }

        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        if (!market.exists || market.feedId == bytes32(0)) {
            return;
        }

        if (_isOracleStale(market.feedId)) {
            perpStorage.setMarketOracleStalePause(marketId, true);
        }
    }

    function _isOracleStale(bytes32 feedId) internal view returns (bool) {
        try ILiquidationMarkPriceDiagnostics(perpStorage.markOracle()).getPriceBreakdown(feedId) returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            int256,
            bool indexStale
        ) {
            return indexStale;
        } catch {
            return false;
        }
    }

    /**
     * @notice Internal liquidation logic
     */
    function _liquidate(uint256 positionId, address liquidator, uint256 markPrice) internal {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        require(position.active, "Position not active");
        require(!perpStorage.frozenAccounts(position.trader), "Account frozen");
        
        // Verify position is actually liquidatable
        bool isLiquidatable = riskManager.isPositionLiquidatable(positionId);
        require(isLiquidatable, "Position still healthy");

        _maybeRunProactiveAdl(position.marketId, position.side);
        
        // Calculate PnL and funding
        (int256 pnl, int256 funding) = riskManager.getPositionPnlAndFunding(position, markPrice);
        int256 totalDelta = pnl - funding;
        
        // Deactivate position through PositionManager
        // CollateralManager.applyAccountDelta() is the canonical source of bad debt.
        uint256 badDebt = _forceClosePosition(positionId, totalDelta);

        // Liquidation payout is based on position exposure and post-close available collateral.
        uint256 availableCollateral = _getAvailableCollateral(position.trader, position.subAccountId);

        uint256 liquidationRewardBps = perpStorage.liquidationRewardBps();
        uint256 liquidationPenaltyBps = perpStorage.liquidationPenaltyBps();
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(position.marketId);
        if (market.exists) {
            liquidationRewardBps = market.liquidationRewardBps;
            liquidationPenaltyBps = market.liquidationPenaltyBps;
        }

        (uint256 reward, uint256 penalty, uint256 toInsurance, ) = LiquidationLib.calculateLiquidationPayouts(
            position.exposure,
            availableCollateral,
            liquidationRewardBps,
            liquidationPenaltyBps
        );
        
        // Apply liquidation distributions
        (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) = _distributeLiquidationProceeds(
            position.trader,
            liquidator,
            position.subAccountId,
            position.marketId,
            position.side,
            reward,
            penalty,
            toInsurance,
            badDebt
        );

        _maybeSweepJitCollateral(position.trader, position.subAccountId);
        
        emit PositionLiquidated(
            positionId,
            position.trader,
            liquidator,
            rewardPaid,
            badDebt,
            insuranceContribution,
            penaltyCollected,
            marginReturned
        );
        
        if (badDebt > 0) {
            emit BadDebtRecorded(badDebt, position.trader);
        }
    }

    function _liquidateSpotBalance(
        address trader,
        uint256 subAccountId,
        bytes32 marketId,
        address liquidator,
        uint256 markPrice
    ) internal {
        PerpStorage.SpotBalance memory spotBalance = perpStorage.getSpotBalance(trader, subAccountId, marketId);
        require(spotBalance.exists, "Spot balance not active");
        require(spotBalance.quantity > 0 || spotBalance.borrowLiability > 0, "Spot balance empty");
        require(!perpStorage.frozenAccounts(trader), "Account frozen");

        int256 equity = _isLegacySubAccount(subAccountId)
            ? riskManager.getAccountEquity(trader)
            : riskManager.getSubAccountEquity(trader, subAccountId);
        uint256 maintenanceReq = _isLegacySubAccount(subAccountId)
            ? riskManager.getAccountMaintenanceRequirement(trader)
            : riskManager.getSubAccountMaintenanceRequirement(trader, subAccountId);
        require(maintenanceReq > 0 && equity < int256(maintenanceReq), "Spot balance still healthy");

        uint256 grossValue = (spotBalance.quantity * markPrice) / 1e18;
        int256 delta = int256(grossValue);
        if (spotBalance.borrowLiability > 0) {
            delta -= int256(spotBalance.borrowLiability);
        }

        perpStorage.setSpotBalance(trader, subAccountId, marketId, 0, 0, 0, 0, 0);
        uint256 badDebt = _applyAccountDelta(trader, subAccountId, delta);

        uint256 availableCollateral = _getAvailableCollateral(trader, subAccountId);
        uint256 notional = grossValue > 0 ? grossValue : spotBalance.borrowLiability;

        uint256 liquidationRewardBps = perpStorage.liquidationRewardBps();
        uint256 liquidationPenaltyBps = perpStorage.liquidationPenaltyBps();
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        if (market.exists) {
            liquidationRewardBps = market.liquidationRewardBps;
            liquidationPenaltyBps = market.liquidationPenaltyBps;
        }

        (uint256 reward, uint256 penalty, uint256 toInsurance, ) = LiquidationLib.calculateLiquidationPayouts(
            notional,
            availableCollateral,
            liquidationRewardBps,
            liquidationPenaltyBps
        );

        (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) = _distributeLiquidationProceeds(
            trader,
            liquidator,
            subAccountId,
            marketId,
            PerpStorage.Side.Long,
            reward,
            penalty,
            toInsurance,
            badDebt
        );

        _maybeSweepJitCollateral(trader, subAccountId);

        emit SpotBalanceLiquidated(
            trader,
            subAccountId,
            marketId,
            liquidator,
            spotBalance.quantity,
            markPrice,
            rewardPaid,
            badDebt,
            insuranceContribution,
            penaltyCollected,
            marginReturned
        );

        if (badDebt > 0) {
            emit BadDebtRecorded(badDebt, trader);
        }
    }

    function _maybeRunProactiveAdl(bytes32 marketId, PerpStorage.Side liquidatedSide) internal {
        if (adlEngine == address(0)) {
            return;
        }

        if (lastProactiveAdlBlock == block.number) {
            return;
        }

        (uint256 coverageRatio, uint256 insuranceBalance, uint256 totalAtRiskLoss) = riskManager.getInsuranceCoverageData();
        if (totalAtRiskLoss == 0) {
            return;
        }

        uint256 softThreshold = perpStorage.adlSoftTriggerCoverageRatio();
        uint256 hardThreshold = perpStorage.adlHardTriggerCoverageRatio();

        bool hardTrigger = coverageRatio <= hardThreshold;
        bool softTrigger = !hardTrigger && coverageRatio < softThreshold;
        if (!hardTrigger && !softTrigger) {
            return;
        }

        uint256 targetRatio = hardTrigger ? hardThreshold : softThreshold;
        uint256 requiredInsurance = (totalAtRiskLoss * targetRatio) / RATIO_SCALE;
        uint256 requestedDeficit = requiredInsurance > insuranceBalance ? requiredInsurance - insuranceBalance : 0;

        if (requestedDeficit == 0) {
            requestedDeficit = totalAtRiskLoss > insuranceBalance ? totalAtRiskLoss - insuranceBalance : totalAtRiskLoss / 20;
        }
        if (requestedDeficit == 0) {
            return;
        }

        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        bool targetLongSide = liquidatedSide == PerpStorage.Side.Short;
        uint256 eventId = ++adlEventNonce;

        (uint256 coveredByAdl, uint256 remainingAfterAdl) = IADLEngine(adlEngine).executeAutoDeleverage(
            resolvedMarketId,
            targetLongSide,
            requestedDeficit,
            eventId
        );

        lastProactiveAdlBlock = block.number;

        emit ADLProactiveTriggered(
            resolvedMarketId,
            eventId,
            hardTrigger,
            coverageRatio,
            softThreshold,
            hardThreshold,
            insuranceBalance,
            totalAtRiskLoss,
            requestedDeficit,
            coveredByAdl,
            remainingAfterAdl
        );
    }

    /**
     * @notice Force close a position during liquidation
     */
    function _forceClosePosition(uint256 positionId, int256 totalDelta) internal returns (uint256 badDebt) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);

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
        
        // Apply PnL (returns bad debt created by this liquidation if any)
        badDebt = _applyAccountDelta(position.trader, position.subAccountId, totalDelta);

        // Mark inactive and remove from trader views after accounting/exposure are updated
        perpStorage.setPositionActive(positionId, false);

        // Remove from trader's position list
        _removeTraderPosition(position.trader, positionId);
        perpStorage.setHasPosition(position.trader, positionId, false);
        perpStorage.decrementPositionCount(position.trader);

        return badDebt;
    }

    /**
     * @notice Distribute liquidation proceeds
     */
    function _distributeLiquidationProceeds(
        address trader,
        address liquidator,
        uint256 subAccountId,
        bytes32 marketId,
        PerpStorage.Side liquidatedSide,
        uint256 reward,
        uint256 penalty,
        uint256 toInsurance,
        uint256 badDebt
    ) internal returns (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) {
        uint256 remainingCollateral = _getCollateralBalance(trader, subAccountId);

        uint256 targetInsurance = _supportsInsuranceRoute(trader, subAccountId) ? toInsurance : 0;
        uint256 targetPenalty = reward + targetInsurance;

        // penalty = reward + toInsurance, both carved from within the same penalty pool.
        // Cap to available collateral and pro-rate the split if needed.
        penaltyCollected = targetPenalty > remainingCollateral ? remainingCollateral : targetPenalty;

        if (penaltyCollected < targetPenalty && targetPenalty > 0) {
            // Pro-rate reward and insurance when penalty is capped
            rewardPaid = (reward * penaltyCollected) / targetPenalty;
            insuranceContribution = penaltyCollected - rewardPaid;
        } else {
            rewardPaid = reward;
            insuranceContribution = targetInsurance;
        }

        // Liquidator reward exits CollateralManager ERC20 vault
        if (rewardPaid > 0) {
            _transferOutForSubAccount(trader, subAccountId, liquidator, rewardPaid);
        }

        // Insurance portion goes to InsuranceTreasury and updates on-chain balance
        if (insuranceContribution > 0) {
            collateralManager.transferToInsurance(insuranceContribution);
            perpStorage.depositToInsurance(insuranceContribution);
        }

        // Deduct full penalty from trader's collateral accounting
        uint256 newCollateral = remainingCollateral > penaltyCollected ? remainingCollateral - penaltyCollected : 0;
        _setCollateralBalance(trader, subAccountId, newCollateral);
        marginReturned = newCollateral;

        if (badDebt > 0) {
            uint256 uncovered = _coverBadDebtWithInsurance(badDebt);
            if (uncovered > 0 && adlEngine != address(0)) {
                bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
                bool targetLongSide = liquidatedSide == PerpStorage.Side.Short;
                uint256 eventId = ++adlEventNonce;

                (uint256 coveredByAdl, uint256 remainingAfterAdl) = IADLEngine(adlEngine).executeAutoDeleverage(
                    resolvedMarketId,
                    targetLongSide,
                    uncovered,
                    eventId
                );

                if (coveredByAdl > 0) {
                    uint256 currentBadDebt = perpStorage.totalBadDebt();
                    uint256 debtReduction = coveredByAdl > currentBadDebt ? currentBadDebt : coveredByAdl;
                    perpStorage.setTotalBadDebt(currentBadDebt - debtReduction);
                }

                emit ADLExecuted(
                    resolvedMarketId,
                    targetLongSide,
                    eventId,
                    uncovered,
                    coveredByAdl,
                    remainingAfterAdl
                );
            }
        }
    }

    /**
     * @notice Use insurance fund to cover bad debt
     */
    function _coverBadDebtWithInsurance(uint256 badDebt) internal returns (uint256 remainingDebt) {
        remainingDebt = badDebt;
        uint256 insuranceBalance = perpStorage.insuranceFundBalance();
        uint256 totalBadDebt = perpStorage.totalBadDebt();
        uint256 treasuryBalance = IInsuranceTreasury(perpStorage.insuranceFund()).balance();
        
        if (insuranceBalance > 0 && treasuryBalance > 0 && badDebt > 0 && totalBadDebt > 0) {
            uint256 coverAmount = badDebt > insuranceBalance ? insuranceBalance : badDebt;
            if (coverAmount > treasuryBalance) {
                coverAmount = treasuryBalance;
            }
            if (coverAmount > totalBadDebt) {
                coverAmount = totalBadDebt;
            }

            // Respect the InsuranceTreasury withdrawal policy so the call never reverts.
            uint256 withdrawable = IInsuranceTreasury(perpStorage.insuranceFund()).maxWithdrawable();
            if (coverAmount > withdrawable) {
                coverAmount = withdrawable;
            }

            if (coverAmount == 0) {
                return remainingDebt;
            }

            // Move funds back to CollateralManager where trader collateral accounting lives.
            IInsuranceTreasury(perpStorage.insuranceFund()).withdrawTo(address(collateralManager), coverAmount);
            
            uint256 reconciledInsuranceBalance = treasuryBalance - coverAmount;
            perpStorage.setInsuranceFundBalance(reconciledInsuranceBalance);
            perpStorage.setTotalBadDebt(totalBadDebt - coverAmount);
            remainingDebt = badDebt > coverAmount ? badDebt - coverAmount : 0;
            
            emit InsuranceFundUsed(coverAmount, reconciledInsuranceBalance);
        }

        return remainingDebt;
    }

    /**
     * @notice Emergency function to socialize bad debt if insurance is insufficient
     */
    function socializeBadDebt(uint256 amount) external onlyModule {
        require(amount <= perpStorage.totalBadDebt(), "Insufficient bad debt");
        
        // This would implement a mechanism to spread losses across all traders
        // Complex logic - simplified for now
        perpStorage.setTotalBadDebt(perpStorage.totalBadDebt() - amount);
    }

    /**
     * @notice Remove position from trader's array
     */
    function _removeTraderPosition(address trader, uint256 positionId) internal {
        perpStorage.removeTraderPosition(trader, positionId);
    }

    /**
     * @notice Get estimated liquidation reward for a position
     */
    function getEstimatedLiquidationReward(uint256 positionId) external view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        if (!pos.active) return 0;
        
        uint256 available = _getAvailableCollateral(pos.trader, pos.subAccountId);

        uint256 liquidationRewardBps = perpStorage.liquidationRewardBps();
        uint256 liquidationPenaltyBps = perpStorage.liquidationPenaltyBps();
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(pos.marketId);
        if (market.exists) {
            liquidationRewardBps = market.liquidationRewardBps;
            liquidationPenaltyBps = market.liquidationPenaltyBps;
        }

        (uint256 reward, , , ) = LiquidationLib.calculateLiquidationPayouts(
            pos.exposure,
            available,
            liquidationRewardBps,
            liquidationPenaltyBps
        );
        
        return reward;
    }

    function _isLegacySubAccount(uint256 subAccountId) internal view returns (bool) {
        return subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID();
    }

    function _getAvailableCollateral(address trader, uint256 subAccountId) internal view returns (uint256) {
        if (_isLegacySubAccount(subAccountId)) {
            return collateralManager.getAvailableCollateral(trader);
        }

        return collateralManager.getAvailableCollateralForSubAccount(trader, subAccountId);
    }

    function _removeReservedMargin(address trader, uint256 subAccountId, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            collateralManager.removeReservedMargin(trader, amount);
            return;
        }

        collateralManager.removeReservedMarginForSubAccount(trader, subAccountId, amount);
    }

    function _applyAccountDelta(address trader, uint256 subAccountId, int256 delta) internal returns (uint256 badDebt) {
        if (_isLegacySubAccount(subAccountId)) {
            return collateralManager.applyAccountDelta(trader, delta);
        }

        return collateralManager.applyAccountDeltaForSubAccount(trader, subAccountId, delta);
    }

    function _getCollateralBalance(address trader, uint256 subAccountId) internal view returns (uint256) {
        if (_isLegacySubAccount(subAccountId)) {
            return perpStorage.accountCollateral(trader);
        }

        return perpStorage.getSubAccount(trader, subAccountId).collateralBalance;
    }

    function _setCollateralBalance(address trader, uint256 subAccountId, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            perpStorage.setAccountCollateral(trader, amount);
            return;
        }

        perpStorage.setSubAccountCollateralBalance(trader, subAccountId, amount);
    }

    function _supportsInsuranceRoute(address trader, uint256 subAccountId) internal view returns (bool) {
        if (_isLegacySubAccount(subAccountId)) {
            return true;
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        return subAccount.collateralToken == address(perpStorage.collateral());
    }

    function _transferOutForSubAccount(address trader, uint256 subAccountId, address to, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            collateralManager.transferOut(to, amount);
            return;
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        collateralManager.transferOutToken(subAccount.collateralToken, to, amount);
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

interface ILiquidationMarkPriceDiagnostics {
    function getPriceBreakdown(bytes32 feedId) external view returns (
        uint256 indexPrice,
        uint256 indexUpdatedAt,
        uint256 twapPrice,
        uint256 twapObservations,
        uint256 markPrice,
        int256 premiumBps,
        bool indexStale
    );
}