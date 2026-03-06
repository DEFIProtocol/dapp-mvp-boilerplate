// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./storage/PerpStorage.sol";
import "./modules/CollateralManager.sol";
import "./modules/PositionManager.sol";
import "./modules/RiskManager.sol";
import "./modules/LiquidationEngine.sol";
import "./modules/SettlementEngine.sol";
import "./modules/FundingEngine.sol";
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

    // Events
    event ModuleInitialized(string name, address moduleAddress);
    event EnginePaused(bool paused);
    event OracleUpdated(address oldOracle, address newOracle, bytes32 feedId);

    constructor(
        address _collateral,
        address _insurance,
        address _oracle,
        bytes32 _feedId
    ) Ownable(msg.sender) {
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
        perpStorage.setMaintenanceMarginBps(1000);  // 10%
        perpStorage.setLiquidationRewardBps(500);   // 5%
        perpStorage.setLiquidationPenaltyBps(1000); // 10%
        
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
        
        // Deploy PositionManager (depends on CollateralManager)
        positionManager = new PositionManager(
            address(perpStorage),
            address(collateralManager)
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
        address[] memory modules = new address[](6);
        modules[0] = address(collateralManager);
        modules[1] = address(positionManager);
        modules[2] = address(riskManager);
        modules[3] = address(liquidationEngine);
        modules[4] = address(settlementEngine);
        modules[5] = address(fundingEngine);
        
        for (uint256 i = 0; i < modules.length; i++) {
            perpStorage.setAuthorizedModule(modules[i], true);
        }
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
        // Need price at closing
        uint256 closePrice = riskManager.getMarkPrice();
        positionManager.closePosition(positionId, closePrice);
    }

    /**
     * @notice Liquidate a position
     */
    function liquidate(uint256 positionId) external {
        liquidationEngine.liquidate(positionId);
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
        return positionManager.getPositionWithPnL(positionId, riskManager.getMarkPrice());
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
        totalValueLocked = perpStorage.collateral().balanceOf(address(this));
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
        uint256 feePool = perpStorage.feePool();
        require(amount <= feePool, "Insufficient fees");
        
        perpStorage.setFeePool(feePool - amount);
        perpStorage.collateral().safeTransfer(to, amount);
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