// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../perps/storage/PerpStorage.sol";
import "../../perps/library/FeeLib.sol";
import "../../perps/library/PnlLib.sol";
import "../../perps/library/FundingLib.sol";
import "../../interfaces/IInsuranceTreasury.sol";
import "../../interfaces/IProtocolTreasury.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICollateralMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}

/**
 * @title CollateralManager
 * @notice Manages user collateral: deposits, withdrawals, and reserved margin
 * @dev Uses PerpStorage for data, FeeLib for fee calculations
 */
contract CollateralManager {
    using SafeERC20 for IERC20;

    error FeePoolUndercollateralized(uint256 vaultBalance, uint256 feePoolLiability);

    PerpStorage public perpStorage;
    mapping(address => bool) public privilegedModules;
    bool public privilegedAccessControlEnabled;

    // Events
    event CollateralDeposited(address indexed trader, uint256 amount, uint256 newBalance);
    event CollateralWithdrawn(address indexed trader, uint256 amount, uint256 newBalance);
    event SubAccountCollateralDeposited(address indexed trader, uint256 indexed subAccountId, address indexed collateralToken, uint256 amount, uint256 newBalance);
    event SubAccountCollateralWithdrawn(address indexed trader, uint256 indexed subAccountId, address indexed collateralToken, uint256 amount, uint256 newBalance);
    event ReservedMarginUpdated(address indexed trader, uint256 newReserved, int256 change);
    event SubAccountReservedMarginUpdated(address indexed trader, uint256 indexed subAccountId, uint256 newReserved, int256 change);
    event FeeCharged(address indexed trader, uint256 feeAmount, uint256 insuranceCut);
    event TradingFeesRoutedToTreasury(uint256 amount, address indexed treasury, uint256 remainingFeePool);
    event PrivilegedModuleUpdated(address indexed module, bool enabled);
    event PrivilegedAccessControlUpdated(bool enabled);

    constructor(address _perpStorage) {
        perpStorage = PerpStorage(_perpStorage);
    }

    // Modifiers
    modifier notFrozen(address trader) {
        require(!perpStorage.frozenAccounts(trader), "Account frozen");
        _;
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    modifier onlyTreasuryModule() {
        if (privilegedAccessControlEnabled) {
            require(privilegedModules[msg.sender], "Only privileged modules can call");
        } else {
            require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        }
        _;
    }

    modifier onlyTransferModuleOrOwner() {
        if (privilegedAccessControlEnabled) {
            require(
                privilegedModules[msg.sender] || msg.sender == perpStorage.owner(),
                "Only privileged modules can call"
            );
        } else {
            require(
                perpStorage.authorizedModules(msg.sender) || msg.sender == perpStorage.owner(),
                "Only modules can call"
            );
        }
        _;
    }

    function setPrivilegedModule(address module, bool enabled) external {
        require(msg.sender == perpStorage.owner(), "Only owner can call");
        require(module != address(0), "Invalid module");
        privilegedModules[module] = enabled;
        emit PrivilegedModuleUpdated(module, enabled);
    }

    function setPrivilegedAccessControlEnabled(bool enabled) external {
        require(msg.sender == perpStorage.owner(), "Only owner can call");
        privilegedAccessControlEnabled = enabled;
        emit PrivilegedAccessControlUpdated(enabled);
    }

    /**
     * @notice User deposits collateral
     * @param amount Amount of collateral to deposit
     */
    function depositCollateral(uint256 amount) external notPaused notFrozen(msg.sender) {
        require(amount > 0, "Amount must be > 0");

        IERC20 collateral = perpStorage.collateral();
        collateral.safeTransferFrom(msg.sender, address(this), amount);

        uint256 newBalance = perpStorage.accountCollateral(msg.sender) + amount;
        perpStorage.setAccountCollateral(msg.sender, newBalance);

        emit CollateralDeposited(msg.sender, amount, newBalance);
    }

    /**
     * @notice User deposits collateral into a specific sub-account
     * @param subAccountId Target sub-account id
     * @param amount Amount of collateral to deposit
     */
    function depositCollateralToSubAccount(uint256 subAccountId, uint256 amount) external notPaused notFrozen(msg.sender) {
        require(amount > 0, "Amount must be > 0");

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(msg.sender, subAccountId);
        IERC20 collateralToken = IERC20(subAccount.collateralToken);
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 newBalance = subAccount.collateralBalance + amount;
        perpStorage.setSubAccountCollateralBalance(msg.sender, subAccountId, newBalance);

        emit SubAccountCollateralDeposited(msg.sender, subAccountId, subAccount.collateralToken, amount, newBalance);
    }

    /**
     * @notice User withdraws collateral
     * @param amount Amount to withdraw
     */
    function withdrawCollateral(uint256 amount) external notPaused notFrozen(msg.sender) {
        require(amount > 0, "Amount must be > 0");
        require(getAvailableCollateral(msg.sender) >= amount, "Insufficient available collateral");

        uint256 newBalance = perpStorage.accountCollateral(msg.sender) - amount;
        perpStorage.setAccountCollateral(msg.sender, newBalance);

        int256 equityAfter = _getAccountEquity(msg.sender);
        uint256 maintenanceAfter = _getAccountMaintenanceRequirement(msg.sender);
        require(equityAfter >= int256(maintenanceAfter), "Insufficient maintenance margin after withdraw");

        IERC20 collateral = perpStorage.collateral();
        collateral.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount, newBalance);
    }

    /**
     * @notice User withdraws collateral from a specific sub-account
     * @param subAccountId Source sub-account id
     * @param amount Amount to withdraw
     */
    function withdrawCollateralFromSubAccount(uint256 subAccountId, uint256 amount) external notPaused notFrozen(msg.sender) {
        require(amount > 0, "Amount must be > 0");
        require(getAvailableCollateralForSubAccount(msg.sender, subAccountId) >= amount, "Insufficient available collateral");

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(msg.sender, subAccountId);
        uint256 newBalance = subAccount.collateralBalance - amount;
        perpStorage.setSubAccountCollateralBalance(msg.sender, subAccountId, newBalance);

        IERC20 collateralToken = IERC20(subAccount.collateralToken);
        collateralToken.safeTransfer(msg.sender, amount);

        emit SubAccountCollateralWithdrawn(msg.sender, subAccountId, subAccount.collateralToken, amount, newBalance);
    }

    /**
     * @notice Get available collateral (total - reserved)
     */
    function getAvailableCollateral(address trader) public view returns (uint256) {
        int256 equity = _getAccountEquity(trader);
        if (equity <= 0) {
            return 0;
        }

        uint256 reserved = perpStorage.reservedMargin(trader);
        uint256 balance = uint256(equity);
        return balance > reserved ? balance - reserved : 0;
    }

    /**
     * @notice Get available collateral in a specific sub-account (balance - reserved)
     * @dev Phase-1 sub-account accounting only. Risk/equity normalization migrates in the next slice.
     */
    function getAvailableCollateralForSubAccount(address trader, uint256 subAccountId) public view returns (uint256) {
        int256 equity = _getSubAccountEquity(trader, subAccountId);
        if (equity <= 0) {
            return 0;
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        uint256 balance = uint256(equity);
        return balance > subAccount.reservedMarginBalance
            ? balance - subAccount.reservedMarginBalance
            : 0;
    }

    /**
     * @notice Get total collateral including reserved
     */
    function getTotalCollateral(address trader) external view returns (uint256) {
        return perpStorage.accountCollateral(trader);
    }

    function getTotalCollateralForSubAccount(address trader, uint256 subAccountId) external view returns (uint256) {
        return perpStorage.getSubAccount(trader, subAccountId).collateralBalance;
    }

    /**
     * @notice Get reserved margin for a trader
     */
    function getReservedMargin(address trader) external view returns (uint256) {
        return perpStorage.reservedMargin(trader);
    }

    function getReservedMarginForSubAccount(address trader, uint256 subAccountId) external view returns (uint256) {
        return perpStorage.getSubAccount(trader, subAccountId).reservedMarginBalance;
    }

    /**
     * @notice Add to reserved margin (called by PositionManager when opening positions)
     */
    function addReservedMargin(address trader, uint256 amount) external onlyModule {
        uint256 newReserved = perpStorage.reservedMargin(trader) + amount;
        perpStorage.setReservedMargin(trader, newReserved);
        emit ReservedMarginUpdated(trader, newReserved, int256(amount));
    }

    function addReservedMarginForSubAccount(address trader, uint256 subAccountId, uint256 amount) external onlyModule {
        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        uint256 newReserved = subAccount.reservedMarginBalance + amount;
        perpStorage.setSubAccountReservedMarginBalance(trader, subAccountId, newReserved);
        emit SubAccountReservedMarginUpdated(trader, subAccountId, newReserved, int256(amount));
    }

    /**
     * @notice Remove from reserved margin (called by PositionManager when closing positions)
     */
    function removeReservedMargin(address trader, uint256 amount) external onlyModule {
        uint256 current = perpStorage.reservedMargin(trader);
        require(current >= amount, "Insufficient reserved margin");
        
        uint256 newReserved = current - amount;
        perpStorage.setReservedMargin(trader, newReserved);
        emit ReservedMarginUpdated(trader, newReserved, -int256(amount));
    }

    function removeReservedMarginForSubAccount(address trader, uint256 subAccountId, uint256 amount) external onlyModule {
        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        require(subAccount.reservedMarginBalance >= amount, "Insufficient reserved margin");

        uint256 newReserved = subAccount.reservedMarginBalance - amount;
        perpStorage.setSubAccountReservedMarginBalance(trader, subAccountId, newReserved);
        emit SubAccountReservedMarginUpdated(trader, subAccountId, newReserved, -int256(amount));
    }

    /**
     * @notice Apply trading charges (fees only under current insurance policy)
     * @param trader The trader being charged
     * @param size Trade size
     * @param isMaker Whether trader is maker or taker
     */
    function chargeTradingFees(
        address trader,
        uint256 size,
        bool isMaker
    ) external onlyModule returns (uint256 totalCharge) {
        return chargeTradingFeesForMarket(trader, size, isMaker, perpStorage.marketFeedId());
    }

    function chargeTradingFeesForMarket(
        address trader,
        uint256 size,
        bool isMaker,
        bytes32 marketId
    ) public onlyModule returns (uint256 totalCharge) {
        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");

        uint256 makerFeeBps = market.makerFeeBps;
        uint256 takerFeeBps = market.takerFeeBps;
        (uint256 makerFee, uint256 takerFee, ) = FeeLib.calculateTradingFees(
            size,
            makerFeeBps,
            takerFeeBps,
            perpStorage.insuranceBps()
        );

        uint256 fee = isMaker ? makerFee : takerFee;
        // Policy: insurance is funded only from liquidation penalty distributions.
        uint256 insuranceCut = 0;
        
        totalCharge = fee + insuranceCut;
        
        // Deduct from collateral
        uint256 currentCollateral = perpStorage.accountCollateral(trader);
        require(currentCollateral >= totalCharge, "Insufficient collateral for fees");
        perpStorage.setAccountCollateral(trader, currentCollateral - totalCharge);

        // Keep trading fees inside the collateral vault until an explicit fee withdrawal.
        perpStorage.setFeePool(perpStorage.feePool() + fee);

        emit FeeCharged(trader, fee, insuranceCut);
    }

    function chargeTradingFeesForSubAccount(
        address trader,
        uint256 subAccountId,
        uint256 size,
        bool isMaker,
        bytes32 marketId
    ) external onlyModule returns (uint256 totalCharge) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            return chargeTradingFeesForMarket(trader, size, isMaker, marketId);
        }

        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");

        uint256 makerFeeBps = market.makerFeeBps;
        uint256 takerFeeBps = market.takerFeeBps;
        (uint256 makerFee, uint256 takerFee, ) = FeeLib.calculateTradingFees(
            size,
            makerFeeBps,
            takerFeeBps,
            perpStorage.insuranceBps()
        );

        uint256 fee = isMaker ? makerFee : takerFee;
        uint256 insuranceCut = 0;
        totalCharge = fee + insuranceCut;

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        require(subAccount.collateralBalance >= totalCharge, "Insufficient collateral for fees");

        perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance - totalCharge);

        emit FeeCharged(trader, fee, insuranceCut);
    }

    /**
     * @notice Move collateral held by this manager into insurance treasury.
     */
    function transferToInsurance(uint256 amount) external onlyTreasuryModule {
        _transferToInsurance(amount);
    }

    /**
     * @notice Move collateral held by this manager into protocol treasury.
     */
    function transferToTreasury(uint256 amount) external onlyTreasuryModule {
        _transferToTreasury(amount);
    }

    /**
     * @notice Route already-accrued trading fees from feePool to protocol treasury.
     * @dev Intended for tx-level batching by SettlementEngine.
     */
    function routeTradingFeesToTreasury(uint256 amount) external onlyTreasuryModule {
        if (amount == 0) return;

        uint256 currentFeePool = perpStorage.feePool();
        require(currentFeePool >= amount, "Insufficient fee pool");

        address treasury = perpStorage.protocolTreasury();
        require(treasury != address(0), "Protocol treasury not set");

        perpStorage.setFeePool(currentFeePool - amount);

        IERC20 collateral = perpStorage.collateral();
        collateral.forceApprove(treasury, amount);
        IProtocolTreasury(treasury).deposit(amount);

        _assertFeePoolCovered();

        emit TradingFeesRoutedToTreasury(amount, treasury, currentFeePool - amount);
    }

    /**
     * @notice Transfer collateral out to an external recipient (module-controlled)
     */
    function transferOut(address to, uint256 amount) external onlyTransferModuleOrOwner {
        if (amount == 0) return;
        IERC20 collateral = perpStorage.collateral();
        collateral.safeTransfer(to, amount);
        _assertFeePoolCovered();
    }

    function transferOutToken(address token, address to, uint256 amount) external onlyTransferModuleOrOwner {
        if (amount == 0) return;
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Pull collateral from trader wallet into vault for JIT margin flows.
     */
    function pullCollateralFromWalletForSubAccount(
        address trader,
        uint256 subAccountId,
        uint256 amount
    ) external onlyModule {
        if (amount == 0) return;

        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            IERC20 collateral = perpStorage.collateral();
            collateral.safeTransferFrom(trader, address(this), amount);

            uint256 newBalance = perpStorage.accountCollateral(trader) + amount;
            perpStorage.setAccountCollateral(trader, newBalance);
            emit CollateralDeposited(trader, amount, newBalance);
            return;
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        IERC20 collateralToken = IERC20(subAccount.collateralToken);
        collateralToken.safeTransferFrom(trader, address(this), amount);

        uint256 newSubBalance = subAccount.collateralBalance + amount;
        perpStorage.setSubAccountCollateralBalance(trader, subAccountId, newSubBalance);
        emit SubAccountCollateralDeposited(trader, subAccountId, subAccount.collateralToken, amount, newSubBalance);
    }

    /**
     * @notice Push all currently available collateral back to trader wallet for JIT flows.
     */
    function pushAvailableCollateralToWallet(address trader, uint256 subAccountId)
        external
        onlyModule
        returns (uint256 amountPushed)
    {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            amountPushed = getAvailableCollateral(trader);
            if (amountPushed == 0) return 0;

            uint256 newBalance = perpStorage.accountCollateral(trader) - amountPushed;
            perpStorage.setAccountCollateral(trader, newBalance);
            perpStorage.collateral().safeTransfer(trader, amountPushed);
            _assertFeePoolCovered();

            emit CollateralWithdrawn(trader, amountPushed, newBalance);
            return amountPushed;
        }

        amountPushed = getAvailableCollateralForSubAccount(trader, subAccountId);
        if (amountPushed == 0) return 0;

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        uint256 newSubBalance = subAccount.collateralBalance - amountPushed;
        perpStorage.setSubAccountCollateralBalance(trader, subAccountId, newSubBalance);
        IERC20(subAccount.collateralToken).safeTransfer(trader, amountPushed);

        emit SubAccountCollateralWithdrawn(trader, subAccountId, subAccount.collateralToken, amountPushed, newSubBalance);
    }

    function _transferToInsurance(uint256 amount) internal {
        if (amount == 0) return;

        IERC20 collateral = perpStorage.collateral();
        collateral.forceApprove(perpStorage.insuranceFund(), amount);
        IInsuranceTreasury(perpStorage.insuranceFund()).deposit(amount);
        _assertFeePoolCovered();
    }

    function _transferToTreasury(uint256 amount) internal {
        if (amount == 0) return;

        address pt = perpStorage.protocolTreasury();
        if (pt == address(0)) return;

        IERC20 collateral = perpStorage.collateral();
        collateral.forceApprove(pt, amount);
        IProtocolTreasury(pt).deposit(amount);

        _assertFeePoolCovered();

        perpStorage.addProtocolTreasuryNonTradingInflow(amount);
    }

    function getFeePoolCoverage() public view returns (
        uint256 vaultBalance,
        uint256 feePoolLiability,
        bool isCovered
    ) {
        vaultBalance = perpStorage.collateral().balanceOf(address(this));
        feePoolLiability = perpStorage.feePool();
        isCovered = vaultBalance >= feePoolLiability;
    }

    function assertFeePoolCovered() external view {
        _assertFeePoolCovered();
    }

    function _assertFeePoolCovered() internal view {
        (uint256 vaultBalance, uint256 feePoolLiability, bool isCovered) = getFeePoolCoverage();
        if (!isCovered) {
            revert FeePoolUndercollateralized(vaultBalance, feePoolLiability);
        }
    }

    /**
     * @notice Apply PnL delta to account
     * @param trader The trader
     * @param delta Positive (profit) or negative (loss)
     * @return badDebt Amount of bad debt if loss exceeds collateral
     */
    function applyAccountDelta(address trader, int256 delta) external onlyModule returns (uint256 badDebt) {
        uint256 currentCollateral = perpStorage.accountCollateral(trader);
        
        if (delta >= 0) {
            // Profit
            uint256 newCollateral = currentCollateral + uint256(delta);
            perpStorage.setAccountCollateral(trader, newCollateral);
            return 0;
        } else {
            // Loss
            uint256 loss = uint256(-delta);
            
            if (loss >= currentCollateral) {
                // Bad debt scenario
                badDebt = loss - currentCollateral;
                perpStorage.setAccountCollateral(trader, 0);
                perpStorage.addBadDebt(badDebt);
                
                // Update realized PnL (negative)
                int256 currentRealized = perpStorage.realizedPnl(trader);
                perpStorage.setRealizedPnl(trader, currentRealized - int256(currentCollateral));
            } else {
                // Normal loss within collateral
                perpStorage.setAccountCollateral(trader, currentCollateral - loss);
                
                // Update realized PnL
                int256 currentRealized = perpStorage.realizedPnl(trader);
                perpStorage.setRealizedPnl(trader, currentRealized - int256(loss));
            }
        }
    }

    function applyAccountDeltaForSubAccount(
        address trader,
        uint256 subAccountId,
        int256 delta
    ) external onlyModule returns (uint256 badDebt) {
        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        uint256 currentCollateral = subAccount.collateralBalance;

        if (delta >= 0) {
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, currentCollateral + uint256(delta));
            return 0;
        }

        uint256 loss = uint256(-delta);
        if (loss >= currentCollateral) {
            badDebt = loss - currentCollateral;
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, 0);
            perpStorage.addBadDebt(badDebt);

            int256 currentRealized = perpStorage.realizedPnl(trader);
            perpStorage.setRealizedPnl(trader, currentRealized - int256(currentCollateral));
        } else {
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, currentCollateral - loss);

            int256 currentRealized = perpStorage.realizedPnl(trader);
            perpStorage.setRealizedPnl(trader, currentRealized - int256(loss));
        }
    }

    /**
     * @notice Check if trader has sufficient available collateral
     * @param trader Address to check
     * @param required Amount required
     */
    function requireAvailableCollateral(address trader, uint256 required) external view {
        require(getAvailableCollateral(trader) >= required, "Insufficient available collateral");
    }

    function requireAvailableCollateralForSubAccount(address trader, uint256 subAccountId, uint256 required) external view {
        require(getAvailableCollateralForSubAccount(trader, subAccountId) >= required, "Insufficient available collateral");
    }

    function _getAccountEquity(address trader) internal view returns (int256 equity) {
        equity = int256(perpStorage.accountCollateral(trader));

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;

            bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
            require(market.exists, "Unknown market");

            uint256 markPrice = _getMarkPriceOrFallback(market.feedId, position.entryPrice);

            PnlLib.Position memory pnlPosition = PnlLib.Position({
                exposure: position.exposure,
                entryPrice: position.entryPrice,
                side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
            });

            int256 pnl = PnlLib.calculateUnrealizedPnl(pnlPosition, markPrice);
            int256 currentFunding = position.side == PerpStorage.Side.Long
                ? market.cumulativeFundingLong
                : market.cumulativeFundingShort;
            int256 funding = FundingLib.calculateFundingPayment(
                position.exposure,
                position.entryFunding,
                currentFunding
            );

            equity += pnl - funding;
        }

        equity += _getSpotPortfolioEquityContribution(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function _getAccountMaintenanceRequirement(address trader) internal view returns (uint256 totalReq) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);

        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;

            bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
            require(market.exists, "Unknown market");

            uint256 maintenanceBps = market.maintenanceMarginBps > 0
                ? market.maintenanceMarginBps
                : perpStorage.maintenanceMarginBps();

            totalReq += (position.exposure * maintenanceBps) / perpStorage.BPS_DENOMINATOR();
        }

        totalReq += _getSpotPortfolioMaintenanceRequirement(trader, perpStorage.LEGACY_SUBACCOUNT_ID());
    }

    function _getSubAccountEquity(address trader, uint256 subAccountId) internal view returns (int256 equity) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            return _getAccountEquity(trader);
        }

        PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
        equity = int256(subAccount.collateralBalance);

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;
            if (position.subAccountId != subAccountId) continue;

            bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
            require(market.exists, "Unknown market");

            uint256 markPrice = _getMarkPriceOrFallback(market.feedId, position.entryPrice);

            PnlLib.Position memory pnlPosition = PnlLib.Position({
                exposure: position.exposure,
                entryPrice: position.entryPrice,
                side: position.side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
            });

            int256 pnl = PnlLib.calculateUnrealizedPnl(pnlPosition, markPrice);
            int256 currentFunding = position.side == PerpStorage.Side.Long
                ? market.cumulativeFundingLong
                : market.cumulativeFundingShort;
            int256 funding = FundingLib.calculateFundingPayment(
                position.exposure,
                position.entryFunding,
                currentFunding
            );

            equity += pnl - funding;
        }

        equity += _getSpotPortfolioEquityContribution(trader, subAccountId);
    }

    function _getSubAccountMaintenanceRequirement(address trader, uint256 subAccountId) internal view returns (uint256 totalReq) {
        if (subAccountId == perpStorage.LEGACY_SUBACCOUNT_ID()) {
            return _getAccountMaintenanceRequirement(trader);
        }

        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        for (uint256 i = 0; i < positionIds.length; i++) {
            PerpStorage.Position memory position = perpStorage.getPosition(positionIds[i]);
            if (!position.active) continue;
            if (position.subAccountId != subAccountId) continue;

            bytes32 marketId = position.marketId == bytes32(0) ? perpStorage.marketFeedId() : position.marketId;
            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
            require(market.exists, "Unknown market");

            uint256 maintenanceBps = market.maintenanceMarginBps > 0
                ? market.maintenanceMarginBps
                : perpStorage.maintenanceMarginBps();

            totalReq += (position.exposure * maintenanceBps) / perpStorage.BPS_DENOMINATOR();
        }

        totalReq += _getSpotPortfolioMaintenanceRequirement(trader, subAccountId);
    }

    function _getSpotPortfolioEquityContribution(address trader, uint256 subAccountId) internal view returns (int256 equityDelta) {
        bytes32[] memory spotMarketIds = perpStorage.getTraderSpotMarketIds(trader, subAccountId);

        for (uint256 i = 0; i < spotMarketIds.length; i++) {
            PerpStorage.SpotBalance memory spotBalance = perpStorage.getSpotBalance(trader, subAccountId, spotMarketIds[i]);
            if (!spotBalance.exists) continue;

            PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(spotMarketIds[i]);
            require(market.exists, "Unknown market");

            uint256 markPrice = _getMarkPriceOrFallback(market.feedId, spotBalance.avgEntryPrice);

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
            require(market.exists, "Unknown market");

            uint256 markPrice = _getMarkPriceOrFallback(market.feedId, spotBalance.avgEntryPrice);

            uint256 grossValue = (spotBalance.quantity * markPrice) / 1e18;
            totalReq += spotBalance.borrowLiability;

            if (market.spotMaintenanceWeightBps > 0) {
                totalReq += (grossValue * market.spotMaintenanceWeightBps) / perpStorage.BPS_DENOMINATOR();
            }
        }
    }

    function _getMarkPriceOrFallback(bytes32 feedId, uint256 fallbackPrice) internal view returns (uint256) {
        address oracle = perpStorage.markOracle();
        if (oracle == address(0)) {
            return fallbackPrice;
        }

        uint256 markPrice = ICollateralMarkOracle(oracle).getMarkPrice(feedId);
        return markPrice > 0 ? markPrice : fallbackPrice;
    }

    /**
     * @notice Module access modifier
     */
    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    modifier onlyModuleOrOwner() {
        require(perpStorage.authorizedModules(msg.sender) || msg.sender == perpStorage.owner(), "Only modules can call");
        _;
    }
}