// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/OrderLib.sol";
import "../library/FeeLib.sol";
import "./CollateralManager.sol";
import "./PositionManager.sol";
import "./RiskManager.sol";
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
        return _settleMatch(longOrder, longSignature, shortOrder, shortSignature, matchSize);
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
        
        for (uint256 i = 0; i < n; i++) {
            matchIds[i] = _settleMatch(
                longOrders[i],
                longSignatures[i],
                shortOrders[i],
                shortSignatures[i],
                sizes[i]
            );
        }
    }

    /**
     * @notice Internal match settlement logic
     */
    function _settleMatch(
        OrderLib.Order calldata longOrder,
        bytes calldata longSignature,
        OrderLib.Order calldata shortOrder,
        bytes calldata shortSignature,
        uint256 matchSize
    ) internal returns (bytes32 matchId) {
        // Validate sides
        require(longOrder.side == OrderLib.Side.Long, "First order not long");
        require(shortOrder.side == OrderLib.Side.Short, "Second order not short");
        
        // Get mark price for reference
        uint256 markPrice = riskManager.getMarkPrice();
        
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
        (uint256 longFee, uint256 shortFee, uint256 insuranceCut) = _calculateMatchFees(
            matchSize,
            true, // long is taker
            false // short is maker
        );
        
        // Calculate required margins
        uint256 longMargin = _calculateRequiredMargin(matchSize);
        uint256 shortMargin = _calculateRequiredMargin(matchSize);
        
        // Check available collateral
        collateralManager.requireAvailableCollateral(longOrder.trader, longMargin + longFee + insuranceCut);
        collateralManager.requireAvailableCollateral(shortOrder.trader, shortMargin + shortFee);
        
        // Apply fees
        collateralManager.chargeTradingFees(longOrder.trader, matchSize, false); // false = not maker
        collateralManager.chargeTradingFees(shortOrder.trader, matchSize, true); // true = maker
        
        // Get match price
        uint256 matchPrice = OrderLib.getMatchPrice(longOrder, shortOrder, markPrice);
        
        // Calculate leverage from margin (exposure / margin)
        uint256 longLeverage = matchSize / longMargin;
        uint256 shortLeverage = matchSize / shortMargin;
        
        // Open positions through PositionManager
        positionManager.openPosition(
            longOrder.trader,
            PerpStorage.Side.Long,
            matchSize,
            longLeverage,
            matchPrice
        );
        
        positionManager.openPosition(
            shortOrder.trader,
            PerpStorage.Side.Short,
            matchSize,
            shortLeverage,
            matchPrice
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
        bool shortIsMaker
    ) internal view returns (uint256 longFee, uint256 shortFee, uint256 insuranceCut) {
        uint256 takerFeeBps = perpStorage.takerFeeBps();
        uint256 makerFeeBps = perpStorage.makerFeeBps();
        uint256 insuranceBps = perpStorage.insuranceBps();

        uint256 makerFee;
        uint256 takerFee;

        (makerFee, takerFee, insuranceCut) = FeeLib.calculateTradingFees(
            size,
            makerFeeBps,
            takerFeeBps,
            insuranceBps
        );

        longFee = longIsTaker ? takerFee : makerFee;
        shortFee = shortIsMaker ? makerFee : takerFee;
        
        return (longFee, shortFee, insuranceCut);
    }

    /**
     * @notice Calculate required margin based on order exposure and leverage
     */
    function _calculateRequiredMargin(uint256 matchSize) internal view returns (uint256) {
        return OrderLib.calculateRequiredMargin(matchSize, perpStorage.MAX_LEVERAGE());
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