// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./perps/storage/PerpStorage.sol";
import "./shared/account/CollateralManager.sol";
import "./perps/trading/PositionManager.sol";
import "./perps/risk/RiskManager.sol";
import "./perps/risk/LiquidationEngine.sol";
import "./perps/trading/SettlementEngine.sol";
import "./perps/risk/FundingEngine.sol";
import "./shared/account/CrossMargin.sol";
import "./shared/account/SubAccountManager.sol";
import "./perps/adl/ADLEngine.sol";
import "./options/modules/OptionsEngine.sol";
import "./options/library/OptionsPricer.sol";
import "./perps/library/OrderLib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PerpEngine
 * @notice Main router contract that delegates to specialized modules
 * @dev Single entry point for all user interactions
 */
contract PerpEngine is Ownable {
    using SafeERC20 for IERC20;

    // Storage
    PerpStorage public perpStorage;
    
    // Modules
    CollateralManager public collateralManager;
    PositionManager public positionManager;
    RiskManager public riskManager;
    LiquidationEngine public liquidationEngine;
    SettlementEngine public settlementEngine;
    FundingEngine public fundingEngine;
    CrossMargin public crossMargin;
    SubAccountManager public subAccountManager;
    ADLEngine public adlEngine;
    OptionsPricerCore public optionsPricer;
    OptionsEngineModule public optionsEngine;

    // Events
    event ModuleInitialized(string name, address moduleAddress);
    event ModuleUpgraded(string moduleName, address indexed oldModule, address indexed newModule, uint256 timestamp);
    event EnginePaused(bool paused);
    event OracleUpdated(address oldOracle, address newOracle, bytes32 feedId);
    event InsuranceFundUpdated(address oldInsuranceFund, address newInsuranceFund);
    event ExecutionLeverageUpdated(uint256 oldLeverage, uint256 newLeverage);
    event ADLEngineUpdated(address oldAdlEngine, address newAdlEngine);

    constructor(
        address _perpStorage,
        address _collateralManager,
        address _positionManager,
        address _riskManager,
        address _liquidationEngine,
        address _settlementEngine,
        address _fundingEngine,
        address _crossMargin,
        address _subAccountManager,
        address _optionsPricer,
        address _optionsEngine
    ) Ownable(msg.sender) {
        _requireContract(_perpStorage, "PerpStorage");
        _requireContract(_collateralManager, "CollateralManager");
        _requireContract(_positionManager, "PositionManager");
        _requireContract(_riskManager, "RiskManager");
        _requireContract(_liquidationEngine, "LiquidationEngine");
        _requireContract(_settlementEngine, "SettlementEngine");
        _requireContract(_fundingEngine, "FundingEngine");
        _requireContract(_crossMargin, "CrossMargin");
        _requireContract(_subAccountManager, "SubAccountManager");
        _requireContract(_optionsPricer, "OptionsPricer");
        _requireContract(_optionsEngine, "OptionsEngine");

        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        positionManager = PositionManager(_positionManager);
        riskManager = RiskManager(_riskManager);
        liquidationEngine = LiquidationEngine(_liquidationEngine);
        settlementEngine = SettlementEngine(_settlementEngine);
        fundingEngine = FundingEngine(_fundingEngine);
        crossMargin = CrossMargin(_crossMargin);
        subAccountManager = SubAccountManager(_subAccountManager);
        optionsPricer = OptionsPricerCore(_optionsPricer);
        optionsEngine = OptionsEngineModule(_optionsEngine);
    }

    function _requireContract(address target, string memory label) internal view {
        require(target != address(0), string.concat(label, " is zero"));
        require(target.code.length > 0, string.concat(label, " must be contract"));
    }

    /**
     * @notice Set external ADL engine module and authorize/deauthorize it in storage.
     * @dev ADL is intentionally a separate contract that can be upgraded independently.
     */
    function setAdlEngine(address newAdlEngine) external onlyOwner {
        address oldAdlEngine = address(adlEngine);

        if (oldAdlEngine != address(0) && oldAdlEngine != newAdlEngine) {
            perpStorage.setAuthorizedModule(oldAdlEngine, false);
        }

        if (newAdlEngine != address(0)) {
            perpStorage.setAuthorizedModule(newAdlEngine, true);
            adlEngine = ADLEngine(newAdlEngine);
        } else {
            adlEngine = ADLEngine(address(0));
        }

        liquidationEngine.setAdlEngine(newAdlEngine);
        emit ADLEngineUpdated(oldAdlEngine, newAdlEngine);
    }

    // ============ USER FACING FUNCTIONS ============

    /**
     * @notice Deposit collateral
     */
    function depositCollateral(uint256 amount) external {
        collateralManager.depositCollateral(amount);
    }

    function depositCollateralToSubAccount(uint256 subAccountId, uint256 amount) external {
        collateralManager.depositCollateralToSubAccount(subAccountId, amount);
    }

    /**
     * @notice Withdraw collateral
     */
    function withdrawCollateral(uint256 amount) external {
        collateralManager.withdrawCollateral(amount);
    }

    function withdrawCollateralFromSubAccount(uint256 subAccountId, uint256 amount) external {
        collateralManager.withdrawCollateralFromSubAccount(subAccountId, amount);
    }

    /**
     * @notice Set caller margin mode.
     * @param enabled True for cross-margin, false for isolated.
     */
    function setMyCrossMarginMode(bool enabled) external {
        crossMargin.setMyCrossMarginMode(enabled);
    }

    function createSubAccount(address collateralToken, bool crossMarginEnabled) external returns (uint256 subAccountId) {
        return subAccountManager.createSubAccount(collateralToken, crossMarginEnabled);
    }

    function setDefaultSubAccount(uint256 subAccountId) external {
        subAccountManager.setDefaultSubAccount(subAccountId);
    }

    function setSubAccountCrossMarginMode(uint256 subAccountId, bool enabled) external {
        subAccountManager.setSubAccountCrossMarginMode(subAccountId, enabled);
    }

    function getSubAccount(address trader, uint256 subAccountId)
        external
        view
        returns (PerpStorage.SubAccountView memory)
    {
        return subAccountManager.getSubAccount(trader, subAccountId);
    }

    function getSubAccounts(address trader)
        external
        view
        returns (PerpStorage.SubAccountView[] memory)
    {
        return subAccountManager.getSubAccounts(trader);
    }

    function getAvailableCollateralForSubAccount(address trader, uint256 subAccountId) external view returns (uint256) {
        return collateralManager.getAvailableCollateralForSubAccount(trader, subAccountId);
    }

    /**
     * @notice Set margin mode for a trader (owner/admin).
     */
    function setCrossMarginForTrader(address trader, bool enabled) external onlyOwner {
        crossMargin.setCrossMarginForTrader(trader, enabled);
    }

    /**
     * @notice Read cross-margin mode.
     */
    function isCrossMarginEnabled(address trader) external view returns (bool) {
        return crossMargin.isCrossMarginEnabled(trader);
    }

    /**
     * @notice Add a new market (owner/governance only).
     */
    function addMarket(
        bytes32 marketId,
        bytes32 feedId,
        uint256 makerFeeBps,
        uint256 takerFeeBps,
        uint256 maintenanceMarginBps,
        uint256 liquidationRewardBps,
        uint256 liquidationPenaltyBps
    ) external onlyOwner {
        perpStorage.addMarket(
            marketId,
            feedId,
            makerFeeBps,
            takerFeeBps,
            maintenanceMarginBps,
            liquidationRewardBps,
            liquidationPenaltyBps
        );
    }

    function setMarketEnabled(bytes32 marketId, bool enabled) external onlyOwner {
        perpStorage.setMarketEnabled(marketId, enabled);
    }

    function setMarketPaused(bytes32 marketId, bool paused) external onlyOwner {
        perpStorage.setMarketPaused(marketId, paused);
    }

    function setMarketFeed(bytes32 marketId, bytes32 feedId) external onlyOwner {
        perpStorage.setMarketFeed(marketId, feedId);
    }

    function setMarketFeeParams(bytes32 marketId, uint256 makerFeeBps, uint256 takerFeeBps) external onlyOwner {
        perpStorage.setMarketFeeParams(marketId, makerFeeBps, takerFeeBps);
    }

    function setMarketRiskParams(
        bytes32 marketId,
        uint256 maintenanceMarginBps,
        uint256 liquidationRewardBps,
        uint256 liquidationPenaltyBps
    ) external onlyOwner {
        perpStorage.setMarketRiskParams(
            marketId,
            maintenanceMarginBps,
            liquidationRewardBps,
            liquidationPenaltyBps
        );
    }

    function setOptionFeeBps(uint256 creationFeeBps, uint256 exerciseFeeBps) external onlyOwner {
        perpStorage.setOptionFeeBps(creationFeeBps, exerciseFeeBps);
    }

    function setOptionSecondaryTransferFeeBps(uint256 secondaryTransferFeeBps) external onlyOwner {
        perpStorage.setOptionSecondaryTransferFeeBps(secondaryTransferFeeBps);
    }

    function setMaxOracleDeviationBps(uint256 bps) external onlyOwner {
        perpStorage.setMaxOracleDeviationBps(bps);
    }

    function setMarketOracleDeviationBps(bytes32 marketId, uint256 bps) external onlyOwner {
        perpStorage.setMarketOracleDeviationBps(marketId, bps);
    }

    function getMarketConfig(bytes32 marketId) external view returns (PerpStorage.MarketConfig memory) {
        return perpStorage.getMarketConfig(marketId);
    }

    function getMarketIds() external view returns (bytes32[] memory) {
        return perpStorage.getMarketIds();
    }

    /**
     * @notice Settle a single match between orders
     */
    function settleMatch(
        OrderLib.Order calldata longOrder,
        bytes calldata longSig,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSig,
        uint256 matchSize
    ) external returns (bytes32 matchId) {
        return settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, matchSize);
    }

    function settleMatchForMarket(
        bytes32 marketId,
        OrderLib.Order calldata longOrder,
        bytes calldata longSig,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSig,
        uint256 matchSize
    ) external returns (bytes32 matchId) {
        return settlementEngine.settleMatchForMarket(marketId, longOrder, longSig, shortOrder, shortSig, matchSize);
    }

    /**
     * @notice Settle a single match with explicit taker role.
     */
    function settleMatchWithRoles(
        OrderLib.Order calldata longOrder,
        bytes calldata longSig,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSig,
        uint256 matchSize,
        bool longIsTaker
    ) external returns (bytes32 matchId) {
        return settlementEngine.settleMatchWithRoles(
            longOrder,
            longSig,
            shortOrder,
            shortSig,
            matchSize,
            longIsTaker
        );
    }

    function settleMatchWithRolesForMarket(
        bytes32 marketId,
        OrderLib.Order calldata longOrder,
        bytes calldata longSig,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSig,
        uint256 matchSize,
        bool longIsTaker
    ) external returns (bytes32 matchId) {
        return settlementEngine.settleMatchWithRolesForMarket(
            marketId,
            longOrder,
            longSig,
            shortOrder,
            shortSig,
            matchSize,
            longIsTaker
        );
    }

    /**
     * @notice Settle multiple matches
     */
    function settleMatches(
        OrderLib.Order[] calldata longs,
        bytes[] calldata longSigs,
        OrderLib.Order[] calldata shorts,
        bytes[] calldata shortSigs,
        uint256[] calldata sizes
    ) external returns (bytes32[] memory matchIds) {
        return settlementEngine.settleMatches(longs, longSigs, shorts, shortSigs, sizes);
    }

    /**
     * @notice Close a position
     */
    function closePosition(uint256 positionId) external {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
        uint256 closePrice = riskManager.getMarkPriceForMarket(marketId);
        positionManager.closePosition(positionId, closePrice);
    }

    /**
     * @notice Close or partially close a position through matched execution.
     * @dev Caller is treated as taker. Counterparty order is maker.
     */
    function closePositionViaMatch(
        uint256 positionId,
        OrderLib.Order calldata counterOrder,
        bytes calldata counterSig,
        uint256 matchSize
    ) external returns (bytes32 matchId) {
        return settlementEngine.closePositionViaMatch(positionId, counterOrder, counterSig, matchSize);
    }

    function registerOptionSeries(
        bytes32 marketId,
        bool isCall,
        uint256 strikePrice,
        uint256 expiry,
        uint256 ivBps,
        uint256 riskFreeRateBps,
        address collateralToken
    ) external onlyOwner returns (uint256 seriesId) {
        return optionsEngine.registerOptionSeries(
            marketId,
            isCall,
            strikePrice,
            expiry,
            ivBps,
            riskFreeRateBps,
            collateralToken
        );
    }

    function openLongOption(uint256 seriesId, uint256 size) external returns (uint256 positionId) {
        return optionsEngine.openLongOption(seriesId, size);
    }

    function openLongOptionForSubAccount(
        uint256 seriesId,
        uint256 size,
        uint256 subAccountId
    ) external returns (uint256 positionId) {
        return optionsEngine.openLongOptionForSubAccount(seriesId, size, subAccountId);
    }

    function openShortOption(uint256 seriesId, uint256 size) external returns (uint256 positionId) {
        return optionsEngine.openShortOption(seriesId, size);
    }

    function openShortOptionForSubAccount(
        uint256 seriesId,
        uint256 size,
        uint256 subAccountId
    ) external returns (uint256 positionId) {
        return optionsEngine.openShortOptionForSubAccount(seriesId, size, subAccountId);
    }

    function expireOptionSeries(uint256 seriesId) external {
        optionsEngine.expireSeries(seriesId);
    }

    function settleOption(uint256 positionId) external {
        optionsEngine.settleOption(positionId);
    }

    function transferOptionPosition(uint256 positionId, address newOwner, uint256 salePrice) external {
        optionsEngine.transferOptionPosition(positionId, newOwner, salePrice);
    }

    function transferOptionPositionForSubAccount(
        uint256 positionId,
        address newOwner,
        uint256 newSubAccountId,
        uint256 salePrice
    ) external {
        optionsEngine.transferOptionPositionForSubAccount(positionId, newOwner, newSubAccountId, salePrice);
    }

    /**
     * @notice Liquidate a position
     */
    function liquidate(uint256 positionId) external {
        liquidationEngine.liquidate(positionId);
    }

    function liquidateOptionPosition(uint256 optionPositionId) external {
        liquidationEngine.liquidateOptionPosition(optionPositionId);
    }

    /**
     * @notice Liquidate through matched execution where caller is taker.
     */
    function liquidateViaMatch(uint256 positionId, uint256 matchSize) external returns (bytes32 matchId) {
        return settlementEngine.liquidatePositionViaMatch(positionId, matchSize);
    }

    /**
     * @notice Add margin to a position
     */
    function addMargin(uint256 positionId, uint256 amount) external {
        positionManager.addMargin(positionId, amount);
    }

    /**
     * @notice Remove margin from a position
     */
    function removeMargin(uint256 positionId, uint256 amount) external {
        positionManager.removeMargin(positionId, amount);
    }

    /**
     * @notice Cancel a specific nonce
     */
    function cancelNonce(uint256 nonce) external {
        settlementEngine.cancelNonce(nonce);
    }

    /**
     * @notice Cancel all nonces up to a value
     */
    function cancelUpTo(uint256 nonce) external {
        settlementEngine.cancelUpTo(nonce);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @notice Get current mark price
     */
    function getMarkPrice() external view returns (uint256) {
        return riskManager.getMarkPrice();
    }

    /**
     * @notice Get account equity
     */
    function getAccountEquity(address trader) external view returns (int256) {
        return riskManager.getAccountEquity(trader);
    }

    function getAccountOptionEquityContribution(address trader) external view returns (int256) {
        return riskManager.getAccountOptionEquityContribution(trader);
    }

    /**
     * @notice Get available collateral
     */
    function getAvailableCollateral(address trader) external view returns (uint256) {
        return collateralManager.getAvailableCollateral(trader);
    }

    /**
     * @notice Get total collateral
     */
    function getTotalCollateral(address trader) external view returns (uint256) {
        return collateralManager.getTotalCollateral(trader);
    }

    /**
     * @notice Get account health ratio
     */
    function getAccountHealthRatio(address trader) external view returns (uint256) {
        return riskManager.getAccountHealthRatio(trader);
    }

    function getSubAccountEquity(address trader, uint256 subAccountId) external view returns (int256) {
        return riskManager.getSubAccountEquity(trader, subAccountId);
    }

    function getSubAccountOptionEquityContribution(address trader, uint256 subAccountId) external view returns (int256) {
        return riskManager.getSubAccountOptionEquityContribution(trader, subAccountId);
    }

    function getSubAccountHealthRatio(address trader, uint256 subAccountId) external view returns (uint256) {
        return riskManager.getSubAccountHealthRatio(trader, subAccountId);
    }

    function getSubAccountMaintenanceRequirement(address trader, uint256 subAccountId) external view returns (uint256) {
        return riskManager.getSubAccountMaintenanceRequirement(trader, subAccountId);
    }

    /**
     * @notice Get account maintenance requirement
     */
    function getAccountMaintenanceRequirement(address trader) external view returns (uint256) {
        return riskManager.getAccountMaintenanceRequirement(trader);
    }

    function getAccountOptionMaintenanceRequirement(address trader) external view returns (uint256) {
        return riskManager.getAccountOptionMaintenanceRequirement(trader);
    }

    function getSubAccountOptionMaintenanceRequirement(address trader, uint256 subAccountId) external view returns (uint256) {
        return riskManager.getSubAccountOptionMaintenanceRequirement(trader, subAccountId);
    }

    /**
     * @notice Get position details
     */
    function getPosition(uint256 positionId) external view returns (PerpStorage.Position memory) {
        return perpStorage.getPosition(positionId);
    }

    function getOptionSeries(uint256 seriesId) external view returns (PerpStorage.OptionSeries memory) {
        return perpStorage.getOptionSeries(seriesId);
    }

    function getOptionPosition(uint256 positionId) external view returns (PerpStorage.OptionPosition memory) {
        return perpStorage.getOptionPosition(positionId);
    }

    function getTraderOptionPositions(address trader) external view returns (uint256[] memory) {
        return perpStorage.getTraderOptionPositions(trader);
    }

    function getOptionMarkPremium(uint256 seriesId, uint256 spotPrice) external view returns (uint256) {
        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(seriesId);
        require(series.exists, "Unknown series");
        if (block.timestamp >= series.expiry) {
            return series.isCall
                ? (spotPrice > series.strikePrice ? spotPrice - series.strikePrice : 0)
                : (series.strikePrice > spotPrice ? series.strikePrice - spotPrice : 0);
        }

        return optionsPricer.getMarkPremium(
            series.isCall,
            series.strikePrice,
            spotPrice,
            series.expiry - block.timestamp,
            series.ivBps,
            series.riskFreeRateBps
        );
    }

    function getPositionCollateralToken(uint256 positionId) external view returns (address) {
        return perpStorage.getPosition(positionId).collateralToken;
    }

    function getLockedMargin(uint256 positionId) external view returns (uint256) {
        return perpStorage.getPosition(positionId).margin;
    }

    /**
     * @notice Get position with current PnL
     */
    function getPositionWithPnL(uint256 positionId) external view returns (
        PerpStorage.Position memory position,
        int256 unrealizedPnl,
        int256 unrealizedFunding,
        int256 equity
    ) {
        position = perpStorage.getPosition(positionId);
        bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
        return positionManager.getPositionWithPnL(positionId, riskManager.getMarkPriceForMarket(marketId));
    }

    /**
     * @notice Get trader's positions
     */
    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return positionManager.getTraderPositions(trader);
    }

    /**
     * @notice Check if position is liquidatable
     */
    function isPositionLiquidatable(uint256 positionId) external view returns (bool) {
        return riskManager.isPositionLiquidatable(positionId);
    }

    function isOptionPositionLiquidatable(uint256 optionPositionId) external view returns (bool) {
        return riskManager.isOptionPositionLiquidatable(optionPositionId);
    }

    function getOptionPositionMarkLiability(uint256 optionPositionId) external view returns (uint256) {
        return riskManager.getOptionPositionMarkLiability(optionPositionId);
    }

    /**
     * @notice Get liquidation price for a position
     */
    function getLiquidationPrice(uint256 positionId) external view returns (uint256) {
        return riskManager.getLiquidationPrice(positionId);
    }

    /**
     * @notice Get bankruptcy price for a position
     */
    function getBankruptcyPrice(uint256 positionId) external view returns (uint256) {
        return riskManager.getBankruptcyPrice(positionId);
    }

    /**
     * @notice Get estimated liquidation reward
     */
    function getEstimatedLiquidationReward(uint256 positionId) external view returns (uint256) {
        return liquidationEngine.getEstimatedLiquidationReward(positionId);
    }

    /**
     * @notice Get order fill status
     */
    function getOrderFillStatus(OrderLib.Order calldata order) external view returns (uint256 filled, uint256 remaining) {
        return settlementEngine.getOrderFillStatus(order);
    }

    /**
     * @notice Get current funding rate
     */
    function getCurrentFundingRate() external view returns (int256 longRate, int256 shortRate) {
        return fundingEngine.getCurrentFundingRate();
    }

    function getCurrentFundingRateForMarket(bytes32 marketId) external view returns (int256 longRate, int256 shortRate) {
        return fundingEngine.getCurrentFundingRateForMarket(marketId);
    }

    /**
     * @notice Get funding owed for a position
     */
    function getPositionFundingOwed(uint256 positionId) external view returns (int256) {
        return fundingEngine.getPositionFundingOwed(positionId);
    }

    /**
     * @notice Get total funding owed by a trader
     */
    function getTraderFundingOwed(address trader) external view returns (int256) {
        return fundingEngine.getTraderFundingOwed(trader);
    }

    /**
     * @notice Get protocol stats
     */
    function getProtocolStats() external view returns (
        uint256 totalValueLocked,
        uint256 totalLongExposure,
        uint256 totalShortExposure,
        uint256 openInterest,
        uint256 feePool,
        uint256 insuranceFundBalance,
        uint256 totalBadDebt,
        uint256 nextFundingTime
    ) {
        totalValueLocked = perpStorage.collateral().balanceOf(address(collateralManager));
        totalLongExposure = perpStorage.totalLongExposure();
        totalShortExposure = perpStorage.totalShortExposure();
        openInterest = totalLongExposure + totalShortExposure;
        feePool = perpStorage.feePool();
        insuranceFundBalance = perpStorage.insuranceFundBalance();
        totalBadDebt = perpStorage.totalBadDebt();
        nextFundingTime = perpStorage.nextFundingTime();
    }

    // ============ ADMIN FUNCTIONS ============

    /**
     * @notice Update risk parameters
     */
    function setRiskParams(
        uint256 _maintenanceMarginBps,
        uint256 _liquidationRewardBps,
        uint256 _liquidationPenaltyBps
    ) external onlyOwner {
        require(_maintenanceMarginBps <= 5000, "Maintenance too high");
        require(_liquidationRewardBps <= 2000, "Reward too high");
        require(_liquidationPenaltyBps <= 5000, "Penalty too high");
        require(_liquidationRewardBps <= _liquidationPenaltyBps, "Reward > penalty");
        
        perpStorage.setMaintenanceMarginBps(_maintenanceMarginBps);
        perpStorage.setLiquidationRewardBps(_liquidationRewardBps);
        perpStorage.setLiquidationPenaltyBps(_liquidationPenaltyBps);
    }

    /**
     * @notice Update fee parameters
     */
    function setFeeParams(
        uint256 _makerFeeBps,
        uint256 _takerFeeBps,
        uint256 _insuranceBps
    ) external onlyOwner {
        require(_makerFeeBps <= 1000, "Maker fee too high");
        require(_takerFeeBps <= 2000, "Taker fee too high");
        require(_insuranceBps <= 2000, "Insurance too high");
        
        perpStorage.setMakerFeeBps(_makerFeeBps);
        perpStorage.setTakerFeeBps(_takerFeeBps);
        perpStorage.setInsuranceBps(_insuranceBps);
    }

    /**
     * @notice Update insurance fund/treasury address
     */
    function setInsuranceFund(address _insuranceFund) external onlyOwner {
        require(_insuranceFund != address(0), "Invalid insurance fund");
        require(_insuranceFund.code.length > 0, "Insurance must be contract");

        address oldInsuranceFund = perpStorage.insuranceFund();
        perpStorage.setInsuranceFund(_insuranceFund);

        emit InsuranceFundUpdated(oldInsuranceFund, _insuranceFund);
    }

    /**
     * @notice Update settlement execution leverage used to derive required margin
     */
    function setExecutionLeverage(uint256 leverage) external onlyOwner {
        uint256 oldLeverage = settlementEngine.executionLeverage();
        settlementEngine.setExecutionLeverage(leverage);
        emit ExecutionLeverageUpdated(oldLeverage, leverage);
    }

    /**
     * @notice Update oracle
     */
    function setOracle(address _oracle, bytes32 _feedId) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle");
        
        address oldOracle = perpStorage.markOracle();
        perpStorage.setMarkOracle(_oracle);
        perpStorage.setMarketFeedId(_feedId);
        
        emit OracleUpdated(oldOracle, _oracle, _feedId);
    }

    /**
     * @notice Set funding parameters
     */
    function setFundingParams(uint256 interval, uint256 maxRate) external onlyOwner {
        if (interval > 0) {
            fundingEngine.setFundingInterval(interval);
        }
        if (maxRate > 0) {
            fundingEngine.setMaxFundingRate(maxRate);
        }
    }

    function setJitModeEnabled(bool enabled) external onlyOwner {
        perpStorage.setJitModeEnabled(enabled);
    }

    function setOptionHaircuts(
        uint256 deepItmHaircutBps,
        uint256 atmHaircutBps,
        uint256 slightOtmHaircutBps,
        uint256 deepOtmHaircutBps
    ) external onlyOwner {
        perpStorage.setOptionHaircuts(
            deepItmHaircutBps,
            atmHaircutBps,
            slightOtmHaircutBps,
            deepOtmHaircutBps
        );
    }

    function setOptionMoneynessThresholds(
        uint256 deepItmThresholdBps,
        uint256 atmThresholdBps,
        uint256 slightOtmThresholdBps
    ) external onlyOwner {
        perpStorage.setOptionMoneynessThresholds(deepItmThresholdBps, atmThresholdBps, slightOtmThresholdBps);
    }

    function setOptionAdversePriceShockBps(uint256 shockBps) external onlyOwner {
        perpStorage.setOptionAdversePriceShockBps(shockBps);
    }

    /**
     * @notice Configure proactive ADL coverage triggers.
     * @param softRatio 1e18-scaled ratio threshold for soft pre-trigger (coverage < soft).
     * @param hardRatio 1e18-scaled ratio threshold for hard pre-trigger (coverage <= hard).
     */
    function setAdlCoverageTriggerRatios(uint256 softRatio, uint256 hardRatio) external onlyOwner {
        perpStorage.setAdlCoverageTriggerRatios(softRatio, hardRatio);
    }

    /**
     * @notice Update funding (can be called by anyone, but only when ready)
     */
    function updateFunding() external returns (int256 longRate, int256 shortRate) {
        return fundingEngine.updateFunding();
    }

    function updateFundingForMarket(bytes32 marketId) external returns (int256 longRate, int256 shortRate) {
        return fundingEngine.updateFundingForMarket(marketId);
    }

    /**
     * @notice Emergency pause
     */
    function setEmergencyPause(bool paused) external onlyOwner {
        perpStorage.setEmergencyPause(paused);
        emit EnginePaused(paused);
    }

    /**
     * @notice Freeze/unfreeze account
     */
    function freezeAccount(address trader, bool frozen) external onlyOwner {
        perpStorage.setFrozenAccount(trader, frozen);
    }

    /**
     * @notice Withdraw fees
     */
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        to;
        amount;
        revert("Fees are routed directly to ProtocolTreasury");
    }

    /**
     * @notice Set per-market long/short exposure caps.
     * @param marketId Market identifier.
     * @param maxLong  Maximum total long exposure (notional). 0 = no cap.
     * @param maxShort Maximum total short exposure (notional). 0 = no cap.
     */
    function setMarketExposureCaps(bytes32 marketId, uint256 maxLong, uint256 maxShort) external onlyOwner {
        perpStorage.setMarketExposureCaps(marketId, maxLong, maxShort);
    }

    /**
     * @notice Configure three-tier size-based initial margin schedule.
     * @param tier1Cap   Max exposure for tier-1 rate. Set to 0 to disable tiers entirely.
     * @param tier2Cap   Max exposure for tier-2 rate. 0 = only two tiers.
     * @param tier1Bps   IM rate (bps) for positions <= tier1Cap  (e.g. 500 = 5%).
     * @param tier2Bps   IM rate (bps) for positions in (tier1Cap, tier2Cap] (e.g. 1000 = 10%).
     * @param tier3Bps   IM rate (bps) for positions > tier2Cap   (e.g. 2500 = 25%).
     */
    function setSizeBasedMarginTiers(
        uint256 tier1Cap,
        uint256 tier2Cap,
        uint256 tier1Bps,
        uint256 tier2Bps,
        uint256 tier3Bps
    ) external onlyOwner {
        perpStorage.setSizeBasedMarginTiers(tier1Cap, tier2Cap, tier1Bps, tier2Bps, tier3Bps);
    }

    /**
     * @notice Upgrade a module — de-authorizes the old address, wires the new one.
     * @dev Caller must be the owner (timelock in production). newModule must be a deployed contract.
     *      ADLEngine is managed separately via setAdlEngine.
     */
    function upgradeModule(string calldata moduleName, address newModule) external onlyOwner {
        require(newModule != address(0), "Zero address");
        require(newModule.code.length > 0, "Not a contract");

        bytes32 nameHash = keccak256(bytes(moduleName));
        address oldModule;

        if (nameHash == keccak256(bytes("CollateralManager"))) {
            oldModule = address(collateralManager);
            perpStorage.setAuthorizedModule(oldModule, false);
            collateralManager = CollateralManager(newModule);
        } else if (nameHash == keccak256(bytes("PositionManager"))) {
            oldModule = address(positionManager);
            perpStorage.setAuthorizedModule(oldModule, false);
            positionManager = PositionManager(newModule);
        } else if (nameHash == keccak256(bytes("RiskManager"))) {
            oldModule = address(riskManager);
            perpStorage.setAuthorizedModule(oldModule, false);
            riskManager = RiskManager(newModule);
        } else if (nameHash == keccak256(bytes("LiquidationEngine"))) {
            oldModule = address(liquidationEngine);
            perpStorage.setAuthorizedModule(oldModule, false);
            liquidationEngine = LiquidationEngine(newModule);
        } else if (nameHash == keccak256(bytes("SettlementEngine"))) {
            oldModule = address(settlementEngine);
            perpStorage.setAuthorizedModule(oldModule, false);
            settlementEngine = SettlementEngine(newModule);
        } else if (nameHash == keccak256(bytes("FundingEngine"))) {
            oldModule = address(fundingEngine);
            perpStorage.setAuthorizedModule(oldModule, false);
            fundingEngine = FundingEngine(newModule);
        } else if (nameHash == keccak256(bytes("CrossMargin"))) {
            oldModule = address(crossMargin);
            perpStorage.setAuthorizedModule(oldModule, false);
            crossMargin = CrossMargin(newModule);
        } else if (nameHash == keccak256(bytes("OptionsEngine"))) {
            oldModule = address(optionsEngine);
            perpStorage.setAuthorizedModule(oldModule, false);
            optionsEngine = OptionsEngineModule(newModule);
        } else if (nameHash == keccak256(bytes("OptionsPricer"))) {
            oldModule = address(optionsPricer);
            optionsPricer = OptionsPricerCore(newModule);
            perpStorage.setOptionsPricer(newModule);
            optionsEngine.setOptionsPricer(newModule);
        } else {
            revert("Unknown module name");
        }

        if (nameHash != keccak256(bytes("OptionsPricer"))) {
            perpStorage.setAuthorizedModule(newModule, true);
        }
        emit ModuleUpgraded(moduleName, oldModule, newModule, block.timestamp);
    }
}