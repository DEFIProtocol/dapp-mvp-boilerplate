// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/FeeLib.sol";
import "../library/PnlLib.sol";
import "../library/FundingLib.sol";
import "../interfaces/IInsuranceTreasury.sol";
import "../interfaces/IProtocolTreasury.sol";
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

    PerpStorage public perpStorage;

    // Events
    event CollateralDeposited(address indexed trader, uint256 amount, uint256 newBalance);
    event CollateralWithdrawn(address indexed trader, uint256 amount, uint256 newBalance);
    event ReservedMarginUpdated(address indexed trader, uint256 newReserved, int256 change);
    event FeeCharged(address indexed trader, uint256 feeAmount, uint256 insuranceCut);

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
     * @notice User withdraws collateral
     * @param amount Amount to withdraw
     */
    function withdrawCollateral(uint256 amount) external notPaused notFrozen(msg.sender) {
        require(amount > 0, "Amount must be > 0");
        require(getAvailableCollateral(msg.sender) >= amount, "Insufficient available collateral");

        uint256 newBalance = perpStorage.accountCollateral(msg.sender) - amount;
        perpStorage.setAccountCollateral(msg.sender, newBalance);

        IERC20 collateral = perpStorage.collateral();
        collateral.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount, newBalance);
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
     * @notice Get total collateral including reserved
     */
    function getTotalCollateral(address trader) external view returns (uint256) {
        return perpStorage.accountCollateral(trader);
    }

    /**
     * @notice Get reserved margin for a trader
     */
    function getReservedMargin(address trader) external view returns (uint256) {
        return perpStorage.reservedMargin(trader);
    }

    /**
     * @notice Add to reserved margin (called by PositionManager when opening positions)
     */
    function addReservedMargin(address trader, uint256 amount) external onlyModule {
        uint256 newReserved = perpStorage.reservedMargin(trader) + amount;
        perpStorage.setReservedMargin(trader, newReserved);
        emit ReservedMarginUpdated(trader, newReserved, int256(amount));
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

    /**
     * @notice Move collateral held by this manager into insurance treasury.
     */
    function transferToInsurance(uint256 amount) external onlyModule {
        _transferToInsurance(amount);
    }

    /**
     * @notice Move collateral held by this manager into protocol treasury.
     */
    function transferToTreasury(uint256 amount) external onlyModule {
        _transferToTreasury(amount);
    }

    /**
     * @notice Transfer collateral out to an external recipient (module-controlled)
     */
    function transferOut(address to, uint256 amount) external onlyModuleOrOwner {
        if (amount == 0) return;
        IERC20 collateral = perpStorage.collateral();
        collateral.safeTransfer(to, amount);
    }

    function _transferToInsurance(uint256 amount) internal {
        if (amount == 0) return;

        IERC20 collateral = perpStorage.collateral();
        collateral.forceApprove(perpStorage.insuranceFund(), amount);
        IInsuranceTreasury(perpStorage.insuranceFund()).deposit(amount);
    }

    function _transferToTreasury(uint256 amount) internal {
        if (amount == 0) return;

        address pt = perpStorage.protocolTreasury();
        if (pt == address(0)) return;

        IERC20 collateral = perpStorage.collateral();
        collateral.forceApprove(pt, amount);
        IProtocolTreasury(pt).deposit(amount);

        perpStorage.addProtocolTreasuryNonTradingInflow(amount);
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

    /**
     * @notice Check if trader has sufficient available collateral
     * @param trader Address to check
     * @param required Amount required
     */
    function requireAvailableCollateral(address trader, uint256 required) external view {
        require(getAvailableCollateral(trader) >= required, "Insufficient available collateral");
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

            uint256 markPrice = ICollateralMarkOracle(perpStorage.markOracle()).getMarkPrice(market.feedId);
            require(markPrice > 0, "Invalid mark price");

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