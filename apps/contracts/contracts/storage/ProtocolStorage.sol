// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../perps/storage/PerpStorage.sol";

// Alias wrapper for phased migration from PerpStorage naming.
contract ProtocolStorage is PerpStorage {
    constructor() PerpStorage() {}
}