// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title ProtocolTimelock
 * @notice Thin local wrapper around OpenZeppelin's TimelockController so the artifact is compiled and deployable through the repo's standard Hardhat flow.
 */
contract ProtocolTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
