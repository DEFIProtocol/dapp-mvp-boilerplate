// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IOrderEIP712 {
    function hashTypedDataV4External(bytes32 structHash) external view returns (bytes32);
}

library OrderLib {
    using ECDSA for bytes32;

    bytes32 public constant ORDER_TYPEHASH =
        keccak256("Order(address trader,uint8 side,uint256 exposure,uint256 limitPrice,uint256 expiry,uint256 nonce)");

    enum Side { Long, Short }

    struct Order {
        address trader;
        Side side;
        uint256 exposure;
        uint256 limitPrice;
        uint256 expiry;
        uint256 nonce;
    }

    // Validate order parameters
    function validateOrder(
        Order calldata order,
        uint256 minNonce,
        bool isCancelled,
        uint256 maxExposure
    ) internal view returns (bool) {
        if (order.exposure == 0) return false;
        if (order.exposure > maxExposure) return false;
        if (order.expiry <= block.timestamp) return false;
        if (order.nonce < minNonce) return false;
        if (isCancelled) return false;
        return true;
    }

    // Calculate required margin from exposure (simplified - actual leverage from order book)
    function calculateRequiredMargin(
        uint256 exposure,
        uint256 leverage
    ) internal pure returns (uint256) {
        require(leverage > 0, "Zero leverage");
        return (exposure + leverage - 1) / leverage; // Ceiling division
    }

    // Check if orders cross (match condition)
    function doOrdersCross(
        Order calldata longOrder,
        Order calldata shortOrder
    ) internal pure returns (bool) {
        if (longOrder.side != Side.Long) return false;
        if (shortOrder.side != Side.Short) return false;
        
        // If either has no limit price, they cross (market orders)
        if (longOrder.limitPrice == 0 || shortOrder.limitPrice == 0) {
            return true;
        }
        
        // Limit orders cross if long limit >= short limit
        return longOrder.limitPrice >= shortOrder.limitPrice;
    }

    // Get match price from crossing orders
    function getMatchPrice(
        Order calldata longOrder,
        Order calldata shortOrder,
        uint256 markPrice
    ) internal pure returns (uint256) {
        if (longOrder.limitPrice > 0 && shortOrder.limitPrice > 0) {
            // Both limit orders - use midpoint
            return (longOrder.limitPrice + shortOrder.limitPrice) / 2;
        }
        // If one is market order, use mark price
        return markPrice;
    }

    // Hash order for EIP712
    function hashOrder(Order calldata order, IOrderEIP712 eip712) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.trader,
                order.side,
                order.exposure,
                order.limitPrice,
                order.expiry,
                order.nonce
            )
        );

        return eip712.hashTypedDataV4External(structHash);
    }

    // Verify order signature
    function verifySignature(
        Order calldata order,
        bytes calldata signature,
        IOrderEIP712 eip712
    ) internal view returns (bool) {
        bytes32 digest = hashOrder(order, eip712);
        address signer = digest.recover(signature);
        return signer == order.trader;
    }
}