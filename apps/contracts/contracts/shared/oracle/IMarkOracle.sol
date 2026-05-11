// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}
