// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../storage/PerpStorage.sol";
import "../../library/OrderLib.sol";
import "../../library/FeeLib.sol";
import "../account/CollateralManager.sol";
import "./PositionManager.sol";
import "../risk/RiskManager.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title SettlementEngine
 * @notice Matches long and short orders, creates positions
 * @dev Uses OrderLib for order validation, FeeLib for fees
 */
contract SettlementEngine is EIP712 {
    PerpStorage public perpStorage;
    CollateralManager public collateralManager;
    PositionManager public positionManager;
    RiskManager public riskManager;
    uint256 private constant BPS_DENOMINATOR = 10000;

    // Settlement policy: leverage used when opening matched positions.
    uint256 public executionLeverage = 10;

    // Events
    event MatchSettled(
        bytes32 indexed matchId,
        address indexed longTrader,
        address indexed shortTrader,
        uint256 size,
        uint256 price,
        uint256 longFee,
        uint256 shortFee
    );
    
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed trader,
        uint256 filledAmount,
        uint256 remainingAmount
    );

    event ExecutionLeverageUpdated(uint256 oldLeverage, uint256 newLeverage);

    constructor(
        address _perpStorage,
        address _collateralManager,
        address _positionManager,
        address _riskManager
    ) EIP712("PerpSettlement", "1") {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        positionManager = PositionManager(_positionManager);
        riskManager = RiskManager(_riskManager);
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    /**
     * @notice Exposes EIP712 digest helper for OrderLib
     */
    function hashTypedDataV4External(bytes32 structHash) external view returns (bytes32) {
        return _hashTypedDataV4(structHash);
    }

    /**
     * @notice Settle a single match between long and short orders
     */
    function settleMatch(
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize
    ) external notPaused returns (bytes32 matchId) {
        (matchId, ) = _settleMatch(
            longOrder,
            longSignature,
            shortOrder,
            shortSignature,
            matchSize,
            true,
            perpStorage.marketFeedId(),
            true
        );

        return matchId;
    }

    function settleMatchForMarket(
        bytes32 marketId,
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize
    ) external notPaused returns (bytes32 matchId) {
        (matchId, ) = _settleMatch(longOrder, longSignature, shortOrder, shortSignature, matchSize, true, marketId, true);
        return matchId;
    }

    /**
     * @notice Settle a single match with explicit taker side.
     * @param longIsTaker If true, long pays taker fee; else short pays taker fee.
     */
    function settleMatchWithRoles(
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize,
        bool longIsTaker
    ) external notPaused returns (bytes32 matchId) {
        (matchId, ) = _settleMatch(
            longOrder,
            longSignature,
            shortOrder,
            shortSignature,
            matchSize,
            longIsTaker,
            perpStorage.marketFeedId(),
            true
        );

        return matchId;
    }

    function settleMatchWithRolesForMarket(
        bytes32 marketId,
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize,
        bool longIsTaker
    ) external notPaused returns (bytes32 matchId) {
        (matchId, ) = _settleMatch(longOrder, longSignature, shortOrder, shortSignature, matchSize, longIsTaker, marketId, true);
        return matchId;
    }

    /**
     * @notice Settle multiple matches in batch
     */
    function settleMatches(
        OrderLib.Order[] calldata longOrders,
        bytes[] calldata longSignatures,
        OrderLib.Order[] calldata shortOrders,
        bytes[] calldata shortSignatures,
        uint256[] calldata sizes
    ) external notPaused returns (bytes32[] memory matchIds) {
        uint256 n = sizes.length;
        require(longOrders.length == n, "Long orders length mismatch");
        require(shortOrders.length == n, "Short orders length mismatch");
        require(longSignatures.length == n, "Long signatures length mismatch");
        require(shortSignatures.length == n, "Short signatures length mismatch");

        matchIds = new bytes32[](n);
        
        uint256 batchedFees;

        for (uint256 i = 0; i < n; i++) {
            uint256 matchFees;
            (matchIds[i], matchFees) = _settleMatch(
                longOrders[i],
                longSignatures[i],
                shortOrders[i],
                shortSignatures[i],
                sizes[i],
                true,
                perpStorage.marketFeedId(),
                false
            );
            batchedFees += matchFees;
        }

        if (batchedFees > 0) {
            collateralManager.routeTradingFeesToTreasury(batchedFees);
        }
    }

    /**
     * @notice Close or partially close caller position through a matched counterparty order.
     * @dev Caller is treated as taker, counterparty order is treated as maker.
     */
    function closePositionViaMatch(
        uint256 positionId,
        OrderLib.Order calldata counterOrder,
        bytes calldata counterSignature,
        uint256 matchSize
    ) external notPaused returns (bytes32 matchId) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        require(position.active, "Position not active");
        require(position.trader == msg.sender, "Not position owner");
        require(matchSize > 0 && matchSize <= position.exposure, "Invalid match size");

        bytes32 marketId = _resolveMarketId(position.marketId);
        _requireMarketTradeable(marketId);
        require(_resolveMarketId(counterOrder.marketId) == marketId, "Counter market mismatch");

        uint256 markPrice = riskManager.getMarkPriceForMarket(marketId);

        // Position side determines required opposite close side for caller.
        PerpStorage.Side callerCloseSide = position.side == PerpStorage.Side.Long
            ? PerpStorage.Side.Short
            : PerpStorage.Side.Long;

        // Counterparty must be opposite to caller close side, i.e. same as original position side.
        require(
            (position.side == PerpStorage.Side.Long && counterOrder.side == OrderLib.Side.Long) ||
            (position.side == PerpStorage.Side.Short && counterOrder.side == OrderLib.Side.Short),
            "Counter side mismatch"
        );
        require(counterOrder.trader != msg.sender, "Self match not allowed");

        _validateOrder(counterOrder, counterSignature);

        bytes32 counterHash = OrderLib.hashOrder(counterOrder, IOrderEIP712(address(this)));
        uint256 counterRemaining = _getRemainingFillable(counterOrder, counterHash);
        require(matchSize <= counterRemaining, "Counter order overfill");

        perpStorage.setFilledAmount(counterHash, perpStorage.filledAmount(counterHash) + matchSize);
        emit OrderFilled(counterHash, counterOrder.trader, matchSize, counterRemaining - matchSize);

        bool longIsTaker = callerCloseSide == PerpStorage.Side.Long;
        (uint256 longFee, uint256 shortFee) = _calculateMatchFees(matchSize, longIsTaker, marketId);

        uint256 takerFee = longIsTaker ? longFee : shortFee;
        uint256 makerFee = longIsTaker ? shortFee : longFee;

        collateralManager.requireAvailableCollateral(msg.sender, takerFee);
        collateralManager.requireAvailableCollateral(counterOrder.trader, _calculateRequiredMargin(matchSize) + makerFee);

        _chargeFeesAndMaybeRoute(msg.sender, false, counterOrder.trader, true, matchSize, marketId, true);

        uint256 matchPrice = _getSyntheticMatchPrice(counterOrder.limitPrice, markPrice);
        _requireWithinOracleDeviation(matchPrice, markPrice, marketId);

        _openMatchedPositions(
            msg.sender,
            callerCloseSide,
            executionLeverage,
            counterOrder.trader,
            position.side,
            executionLeverage,
            matchSize,
            matchPrice,
            marketId
        );

        address longTrader = longIsTaker ? msg.sender : counterOrder.trader;
        address shortTrader = longIsTaker ? counterOrder.trader : msg.sender;
        matchId = keccak256(abi.encodePacked(positionId, counterHash, block.timestamp, msg.sender));

        emit MatchSettled(matchId, longTrader, shortTrader, matchSize, matchPrice, longFee, shortFee);
    }

    /**
     * @notice Liquidate a position via matched execution where liquidator is taker.
     * @dev Uses synthetic maker leg for liquidated account.
     */
    function liquidatePositionViaMatch(uint256 positionId, uint256 matchSize) external notPaused returns (bytes32 matchId) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        require(position.active, "Position not active");
        require(position.trader != msg.sender, "Cannot self liquidate");
        require(matchSize > 0 && matchSize <= position.exposure, "Invalid match size");
        require(riskManager.isPositionLiquidatable(positionId), "Position still healthy");

        bytes32 marketId = _resolveMarketId(position.marketId);
        _requireMarketTradeable(marketId);

        uint256 matchPrice = riskManager.getMarkPriceForMarket(marketId);

        // Liquidated account takes opposite side to reduce/close; liquidator takes original side.
        PerpStorage.Side liquidatedCloseSide = position.side == PerpStorage.Side.Long
            ? PerpStorage.Side.Short
            : PerpStorage.Side.Long;
        PerpStorage.Side liquidatorSide = position.side;

        bool longIsTaker = liquidatorSide == PerpStorage.Side.Long;
        (uint256 longFee, uint256 shortFee) = _calculateMatchFees(matchSize, longIsTaker, marketId);

        uint256 liquidatorFee = longIsTaker ? longFee : shortFee;
        uint256 liquidatedMakerFee = longIsTaker ? shortFee : longFee;

        collateralManager.requireAvailableCollateral(msg.sender, _calculateRequiredMargin(matchSize) + liquidatorFee);
        collateralManager.requireAvailableCollateral(position.trader, liquidatedMakerFee);

        _chargeFeesAndMaybeRoute(msg.sender, false, position.trader, true, matchSize, marketId, true);

        _openMatchedPositions(
            position.trader,
            liquidatedCloseSide,
            executionLeverage,
            msg.sender,
            liquidatorSide,
            executionLeverage,
            matchSize,
            matchPrice,
            marketId
        );

        address longTrader = longIsTaker ? msg.sender : position.trader;
        address shortTrader = longIsTaker ? position.trader : msg.sender;
        matchId = keccak256(abi.encodePacked(positionId, msg.sender, block.timestamp));

        emit MatchSettled(matchId, longTrader, shortTrader, matchSize, matchPrice, longFee, shortFee);
    }

    /**
     * @notice Internal match settlement logic
     */
    function _settleMatch(
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize,
        bool longIsTaker,
        bytes32 marketId,
        bool routeFeesNow
    ) internal returns (bytes32 matchId, uint256 totalFees) {
        bytes32 resolvedMarketId = _resolveMarketId(marketId);
        _requireMarketTradeable(resolvedMarketId);
        require(_resolveMarketId(longOrder.marketId) == resolvedMarketId, "Long market mismatch");
        require(_resolveMarketId(shortOrder.marketId) == resolvedMarketId, "Short market mismatch");

        // Validate sides
        require(longOrder.side == OrderLib.Side.Long, "First order not long");
        require(shortOrder.side == OrderLib.Side.Short, "Second order not short");
        
        // Get mark price for reference
        uint256 markPrice = riskManager.getMarkPriceForMarket(resolvedMarketId);
        
        // Validate orders using OrderLib
        _validateOrder(longOrder, longSignature);
        _validateOrder(shortOrder, shortSignature);
        
        // Check if orders cross
        require(OrderLib.doOrdersCross(longOrder, shortOrder), "Orders do not cross");
        
        // Check remaining fillable amounts
        bytes32 longHash = OrderLib.hashOrder(longOrder, IOrderEIP712(address(this)));
        bytes32 shortHash = OrderLib.hashOrder(shortOrder, IOrderEIP712(address(this)));
        
        uint256 longRemaining = _getRemainingFillable(longOrder, longHash);
        uint256 shortRemaining = _getRemainingFillable(shortOrder, shortHash);
        
        require(matchSize <= longRemaining, "Long order overfill");
        require(matchSize <= shortRemaining, "Short order overfill");
        
        // Update filled amounts
        perpStorage.setFilledAmount(longHash, perpStorage.filledAmount(longHash) + matchSize);
        perpStorage.setFilledAmount(shortHash, perpStorage.filledAmount(shortHash) + matchSize);
        
        emit OrderFilled(longHash, longOrder.trader, matchSize, longRemaining - matchSize);
        emit OrderFilled(shortHash, shortOrder.trader, matchSize, shortRemaining - matchSize);
        
        // Calculate fees using FeeLib
        (uint256 longFee, uint256 shortFee) = _calculateMatchFees(matchSize, longIsTaker, resolvedMarketId);
        
        // Calculate required margins
        uint256 longMargin = _calculateRequiredMargin(matchSize);
        uint256 shortMargin = _calculateRequiredMargin(matchSize);
        
        // Check available collateral
        collateralManager.requireAvailableCollateral(longOrder.trader, longMargin + longFee);
        collateralManager.requireAvailableCollateral(shortOrder.trader, shortMargin + shortFee);
        
        // Apply fees
        totalFees = _chargeFeesAndMaybeRoute(
            longOrder.trader,
            !longIsTaker,
            shortOrder.trader,
            longIsTaker,
            matchSize,
            resolvedMarketId,
            routeFeesNow
        );
        
        // Get match price
        uint256 matchPrice = OrderLib.getMatchPrice(longOrder, shortOrder, markPrice);
        _requireWithinOracleDeviation(matchPrice, markPrice, resolvedMarketId);
        
        // Calculate leverage from margin (exposure / margin)
        uint256 longLeverage = matchSize / longMargin;
        uint256 shortLeverage = matchSize / shortMargin;
        
        // Open positions through PositionManager
        _openMatchedPositions(
            longOrder.trader,
            PerpStorage.Side.Long,
            longLeverage,
            shortOrder.trader,
            PerpStorage.Side.Short,
            shortLeverage,
            matchSize,
            matchPrice,
            resolvedMarketId
        );
        
        // Create unique match ID
        matchId = keccak256(abi.encodePacked(longHash, shortHash, block.timestamp));
        
        emit MatchSettled(
            matchId,
            longOrder.trader,
            shortOrder.trader,
            matchSize,
            matchPrice,
            longFee,
            shortFee
        );

        return (matchId, totalFees);
    }

    /**
     * @notice Validate a single order
     */
    function _validateOrder(OrderLib.Order calldata order, bytes calldata signature) internal view {
        // Check nonce
        require(order.nonce >= perpStorage.minValidNonce(order.trader), "Nonce too low");
        require(!perpStorage.cancelledNonce(order.trader, order.nonce), "Nonce cancelled");
        
        // Validate using OrderLib
        require(OrderLib.validateOrder(
            order,
            perpStorage.minValidNonce(order.trader),
            perpStorage.cancelledNonce(order.trader, order.nonce),
            type(uint256).max // No max exposure limit
        ), "Order validation failed");
        
        // Verify signature
        require(OrderLib.verifySignature(order, signature, IOrderEIP712(address(this))), "Invalid signature");
    }

    /**
     * @notice Get remaining fillable amount for an order
     */
    function _getRemainingFillable(OrderLib.Order calldata order, bytes32 orderHash) internal view returns (uint256) {
        uint256 filled = perpStorage.filledAmount(orderHash);
        if (filled >= order.exposure) return 0;
        return order.exposure - filled;
    }

    /**
     * @notice Calculate fees for a match
     */
    function _calculateMatchFees(
        uint256 size,
        bool longIsTaker,
        bytes32 marketId
    ) internal view returns (uint256 longFee, uint256 shortFee) {
        (uint256 makerFeeBps, uint256 takerFeeBps) = _getFeeBpsForMarket(marketId);
        uint256 insuranceBps = perpStorage.insuranceBps();

        uint256 makerFee;
        uint256 takerFee;

        (makerFee, takerFee, ) = FeeLib.calculateTradingFees(
            size,
            makerFeeBps,
            takerFeeBps,
            insuranceBps
        );

        longFee = longIsTaker ? takerFee : makerFee;
        shortFee = longIsTaker ? makerFee : takerFee;
        
        return (longFee, shortFee);
    }

    function _getSyntheticMatchPrice(uint256 makerLimitPrice, uint256 markPrice) internal pure returns (uint256) {
        return makerLimitPrice > 0 ? makerLimitPrice : markPrice;
    }

    function _chargeFeesAndMaybeRoute(
        address firstTrader,
        bool firstIsMaker,
        address secondTrader,
        bool secondIsMaker,
        uint256 matchSize,
        bytes32 marketId,
        bool routeFeesNow
    ) internal returns (uint256 totalFees) {
        uint256 firstCharge = collateralManager.chargeTradingFeesForMarket(firstTrader, matchSize, firstIsMaker, marketId);
        uint256 secondCharge = collateralManager.chargeTradingFeesForMarket(secondTrader, matchSize, secondIsMaker, marketId);
        totalFees = firstCharge + secondCharge;

        if (routeFeesNow && totalFees > 0) {
            collateralManager.routeTradingFeesToTreasury(totalFees);
        }
    }

    function _openMatchedPositions(
        address firstTrader,
        PerpStorage.Side firstSide,
        uint256 firstLeverage,
        address secondTrader,
        PerpStorage.Side secondSide,
        uint256 secondLeverage,
        uint256 matchSize,
        uint256 matchPrice,
        bytes32 marketId
    ) internal {
        positionManager.openPositionWithMarket(
            firstTrader,
            firstSide,
            matchSize,
            firstLeverage,
            matchPrice,
            marketId,
            _marginModeForTrader(firstTrader)
        );
        positionManager.openPositionWithMarket(
            secondTrader,
            secondSide,
            matchSize,
            secondLeverage,
            matchPrice,
            marketId,
            _marginModeForTrader(secondTrader)
        );
    }

    function _requireWithinOracleDeviation(uint256 executionPrice, uint256 markPrice, bytes32 marketId) internal view {
        if (markPrice == 0) revert("Invalid mark price");

        uint256 diff = executionPrice > markPrice
            ? executionPrice - markPrice
            : markPrice - executionPrice;

        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        uint256 maxDeviationBps = market.maxOracleDeviationBps > 0
            ? market.maxOracleDeviationBps
            : perpStorage.maxOracleDeviationBps();

        uint256 maxDiff = (markPrice * maxDeviationBps) / BPS_DENOMINATOR;
        require(diff <= maxDiff, "Price deviation > 5%");
    }

    /**
     * @notice Calculate required margin based on order exposure and leverage
     */
    function _calculateRequiredMargin(uint256 matchSize) internal view returns (uint256) {
        return OrderLib.calculateRequiredMargin(matchSize, executionLeverage);
    }

    function _resolveMarketId(bytes32 marketId) internal view returns (bytes32) {
        return marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
    }

    function _requireMarketTradeable(bytes32 marketId) internal view {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");
        require(market.enabled, "Market disabled");
        require(!market.paused, "Market paused");
    }

    function _getFeeBpsForMarket(bytes32 marketId) internal view returns (uint256 makerFeeBps, uint256 takerFeeBps) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");
        return (market.makerFeeBps, market.takerFeeBps);
    }

    function _marginModeForTrader(address trader) internal view returns (PerpStorage.MarginMode) {
        return perpStorage.isCrossMargin(trader)
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;
    }

    /**
     * @notice Set execution leverage policy for matched positions
     */
    function setExecutionLeverage(uint256 leverage) external onlyOwner {
        require(
            leverage >= perpStorage.MIN_LEVERAGE() && leverage <= perpStorage.MAX_LEVERAGE(),
            "Invalid leverage"
        );

        uint256 oldLeverage = executionLeverage;
        executionLeverage = leverage;

        emit ExecutionLeverageUpdated(oldLeverage, leverage);
    }

    /**
     * @notice Cancel a specific nonce
     */
    function cancelNonce(uint256 nonce) external {
        perpStorage.setCancelledNonce(msg.sender, nonce, true);
    }

    /**
     * @notice Cancel all nonces up to a value
     */
    function cancelUpTo(uint256 nonce) external {
        require(nonce > perpStorage.minValidNonce(msg.sender), "Invalid nonce");
        perpStorage.setMinValidNonce(msg.sender, nonce);
    }

    /**
     * @notice Get order fill status
     */
    function getOrderFillStatus(OrderLib.Order calldata order) external view returns (uint256 filled, uint256 remaining) {
        bytes32 orderHash = OrderLib.hashOrder(order, IOrderEIP712(address(this)));
        filled = perpStorage.filledAmount(orderHash);
        remaining = order.exposure > filled ? order.exposure - filled : 0;
    }
}