// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockMarkOracle {
    mapping(bytes32 => uint256) public prices;

    function setMarkPrice(bytes32 feedId, uint256 price) external {
        prices[feedId] = price;
    }

    function getMarkPrice(bytes32 feedId) external view returns (uint256) {
        return prices[feedId];
    }
}
