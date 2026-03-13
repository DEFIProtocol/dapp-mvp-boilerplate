// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ITwapEngine {
    function recordObservation(bytes32 feedId, uint256 price) external;
}

/**
 * @title Oracle
 * @notice Stores keeper-relayed index prices for each market feed.
 *         Keepers post validated off-chain aggregate prices (Chainlink + Pyth median).
 *         TwapEngine is notified on every update to accumulate TWAP observations.
 *         Enforces staleness on write so no stale price is ever persisted.
 */
contract Oracle is Ownable {
    struct PriceRecord {
        uint256 price;      // 18 decimals
        uint256 updatedAt;  // unix timestamp (seconds)
        address keeper;
    }

    uint256 public maxStalenessSeconds = 120; // 2 minutes

    ITwapEngine public twapEngine;

    mapping(bytes32 => PriceRecord) public indexPrices;
    mapping(address => bool) public keepers;

    event PriceUpdated(bytes32 indexed feedId, uint256 price, uint256 timestamp, address indexed keeper);
    event KeeperAdded(address indexed keeper);
    event KeeperRemoved(address indexed keeper);
    event MaxStalenessUpdated(uint256 newMaxStaleness);
    event TwapEngineSet(address indexed twapEngine);

    modifier onlyKeeper() {
        require(keepers[msg.sender] || msg.sender == owner(), "Oracle: not a keeper");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ======================== ADMIN ========================

    function addKeeper(address keeper) external onlyOwner {
        keepers[keeper] = true;
        emit KeeperAdded(keeper);
    }

    function removeKeeper(address keeper) external onlyOwner {
        keepers[keeper] = false;
        emit KeeperRemoved(keeper);
    }

    function setTwapEngine(address _twapEngine) external onlyOwner {
        twapEngine = ITwapEngine(_twapEngine);
        emit TwapEngineSet(_twapEngine);
    }

    function setMaxStaleness(uint256 seconds_) external onlyOwner {
        require(seconds_ >= 30 && seconds_ <= 3600, "Oracle: staleness out of range");
        maxStalenessSeconds = seconds_;
        emit MaxStalenessUpdated(seconds_);
    }

    // ======================== PRICE UPDATE ========================

    /**
     * @notice Post a validated index price for a feed.
     * @param feedId    32-byte market feed identifier
     * @param price     18-decimal price
     * @param timestamp Unix timestamp of the external source observation (seconds)
     */
    function updatePrice(bytes32 feedId, uint256 price, uint256 timestamp) external onlyKeeper {
        require(feedId != bytes32(0), "Oracle: invalid feedId");
        require(price > 0, "Oracle: invalid price");
        require(timestamp <= block.timestamp, "Oracle: future timestamp");
        require(block.timestamp - timestamp <= maxStalenessSeconds, "Oracle: price too stale to post");
        require(timestamp > indexPrices[feedId].updatedAt, "Oracle: price not newer");

        indexPrices[feedId] = PriceRecord({ price: price, updatedAt: timestamp, keeper: msg.sender });

        if (address(twapEngine) != address(0)) {
            twapEngine.recordObservation(feedId, price);
        }

        emit PriceUpdated(feedId, price, timestamp, msg.sender);
    }

    // ======================== READS ========================

    function getIndexPrice(bytes32 feedId) external view returns (uint256 price, uint256 updatedAt) {
        PriceRecord memory r = indexPrices[feedId];
        return (r.price, r.updatedAt);
    }

    function isStale(bytes32 feedId) public view returns (bool) {
        uint256 updatedAt = indexPrices[feedId].updatedAt;
        if (updatedAt == 0) return true;
        return block.timestamp - updatedAt > maxStalenessSeconds;
    }
}
