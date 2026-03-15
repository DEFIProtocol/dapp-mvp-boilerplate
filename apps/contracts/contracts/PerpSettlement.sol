// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./storage/PerpStorage.sol";
import "./modules/account/CollateralManager.sol";
import "./modules/trading/PositionManager.sol";
import "./modules/risk/RiskManager.sol";
import "./modules/risk/LiquidationEngine.sol";
import "./modules/trading/SettlementEngine.sol";
import "./modules/risk/FundingEngine.sol";
import "./modules/account/CrossMargin.sol";
import "./modules/adl/ADLEngine.sol";
import "./library/OrderLib.sol";
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
    ADLEngine public adlEngine;

    // Events
    event ModuleInitialized(string name, address moduleAddress);
    event EnginePaused(bool paused);
    event OracleUpdated(address oldOracle, address newOracle, bytes32 feedId);
    event InsuranceFundUpdated(address oldInsuranceFund, address newInsuranceFund);
    event ExecutionLeverageUpdated(uint256 oldLeverage, uint256 newLeverage);
    event ADLEngineUpdated(address oldAdlEngine, address newAdlEngine);

    constructor(
        address _collateral,
        address _insurance,
        address _oracle,
        bytes32 _feedId
    ) Ownable(msg.sender) {
        require(_insurance.code.length > 0, "Insurance must be contract");

        // Deploy storage first
        perpStorage = new PerpStorage();
        
        // Initialize storage with basic parameters
        perpStorage.setCollateral(IERC20(_collateral));
        perpStorage.setInsuranceFund(_insurance);
        perpStorage.setMarkOracle(_oracle);
        perpStorage.setMarketFeedId(_feedId);
        
        // Set default parameters
        perpStorage.setMakerFeeBps(5);
        perpStorage.setTakerFeeBps(10);
        perpStorage.setInsuranceBps(200);
        perpStorage.setMaintenanceMarginBps(75);  // 10%
        perpStorage.setLiquidationRewardBps(80);    // 0.8%
        perpStorage.setLiquidationPenaltyBps(150);  // 1.5%

        // Register initial market using provided feed id as default market id.
        perpStorage.addMarket(
            _feedId,
            _feedId,
            5,
            10,
            75,
            80,
            150
        );
        
        // Set initial funding time
        perpStorage.setLastFundingUpdate(block.timestamp);
        perpStorage.setNextFundingTime(block.timestamp + 1 hours);

        // Deploy modules
        _deployModules();
        
        // Authorize modules in storage
        _authorizeModules();
        
        // Transfer storage ownership to this contract
        perpStorage.transferOwnership(address(this));
    }

    /**
     * @notice Deploy all modules
     */
    function _deployModules() internal {
        // Deploy base modules (no dependencies)
        collateralManager = new CollateralManager(address(perpStorage));
        emit ModuleInitialized("CollateralManager", address(collateralManager));
        
        riskManager = new RiskManager(address(perpStorage));
        emit ModuleInitialized("RiskManager", address(riskManager));
        
        fundingEngine = new FundingEngine(address(perpStorage), address(collateralManager));
        emit ModuleInitialized("FundingEngine", address(fundingEngine));

        crossMargin = new CrossMargin(address(perpStorage));
        emit ModuleInitialized("CrossMargin", address(crossMargin));
        
        // Deploy PositionManager (depends on CollateralManager and FundingEngine)
        positionManager = new PositionManager(
            address(perpStorage),
            address(collateralManager),
            address(fundingEngine)
        );
        emit ModuleInitialized("PositionManager", address(positionManager));
        
        // Deploy SettlementEngine (depends on multiple modules)
        settlementEngine = new SettlementEngine(
            address(perpStorage),
            address(collateralManager),
            address(positionManager),
            address(riskManager)
        );
        emit ModuleInitialized("SettlementEngine", address(settlementEngine));
        
        // Deploy LiquidationEngine (depends on most modules)
        liquidationEngine = new LiquidationEngine(
            address(perpStorage),
            address(collateralManager),
            address(positionManager),
            address(riskManager)
        );
        emit ModuleInitialized("LiquidationEngine", address(liquidationEngine));
    }

    /**
     * @notice Authorize all modules in storage
     */
    function _authorizeModules() internal {
        address[] memory modules = new address[](7);
        modules[0] = address(collateralManager);
        modules[1] = address(positionManager);
        modules[2] = address(riskManager);
        modules[3] = address(liquidationEngine);
        modules[4] = address(settlementEngine);
        modules[5] = address(fundingEngine);
        modules[6] = address(crossMargin);
        
        for (uint256 i = 0; i < modules.length; i++) {
            perpStorage.setAuthorizedModule(modules[i], true);
        }
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

    /**
     * @notice Withdraw collateral
     */
    function withdrawCollateral(uint256 amount) external {
        collateralManager.withdrawCollateral(amount);
    }

    /**
     * @notice Set caller margin mode.
     * @param enabled True for cross-margin, false for isolated.
     */
    function setMyCrossMarginMode(bool enabled) external {
        crossMargin.setMyCrossMarginMode(enabled);
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

    /**
     * @notice Liquidate a position
     */
    function liquidate(uint256 positionId) external {
        liquidationEngine.liquidate(positionId);
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

    /**
     * @notice Get account maintenance requirement
     */
    function getAccountMaintenanceRequirement(address trader) external view returns (uint256) {
        return riskManager.getAccountMaintenanceRequirement(trader);
    }

    /**
     * @notice Get position details
     */
    function getPosition(uint256 positionId) external view returns (PerpStorage.Position memory) {
        return perpStorage.getPosition(positionId);
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

    /**
     * @notice Get liquidation price for a position
     */
    function getLiquidationPrice(uint256 positionId) external view returns (uint256) {
        return riskManager.getLiquidationPrice(positionId);
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
     * @notice Upgrade a module (advanced)
     */
    function upgradeModule(string calldata moduleName, address newModule) external onlyOwner {
        // De-authorize old module, authorize new one
        // This is simplified - in production you'd need careful migration
        if (keccak256(bytes(moduleName)) == keccak256(bytes("CollateralManager"))) {
            perpStorage.setAuthorizedModule(address(collateralManager), false);
            collateralManager = CollateralManager(newModule);
            perpStorage.setAuthorizedModule(newModule, true);
        }
        // Add similar for other modules...
    }
}