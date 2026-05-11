// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TwapEngine
 * @notice Accumulates price observations forwarded by Oracle.sol and computes
 *         a time-weighted average price (TWAP) over a configurable sliding window.
 *
 *         Ring buffer of MAX_OBSERVATIONS slots stores (price, timestamp) pairs.
 *         getTwap() walks the buffer newest?oldest, summing price*dt for observations
 *         within twapWindowSeconds, then divides by total time elapsed.
 *
 *         Fallback: if fewer than 2 distinct timestamps exist in the window, returns
 *         the latest raw observation price (start-up / low-liquidity mode).
 */
contract TwapEngine is Ownable {
    uint256 public constant MAX_OBSERVATIONS = 60;

    struct Observation {
        uint256 price;
        uint256 timestamp;
    }

    // Per-feed ring buffer indexed mod MAX_OBSERVATIONS
    mapping(bytes32 => Observation[60]) private _obs;
    mapping(bytes32 => uint256) public writeIndex;
    mapping(bytes32 => uint256) public observationCount;

    address public oracle;
    uint256 public twapWindowSeconds = 1800; // 30-minute default

    event ObservationRecorded(bytes32 indexed feedId, uint256 price, uint256 timestamp);
    event OracleSet(address indexed oracle);
    event TwapWindowUpdated(uint256 newWindow);

    modifier onlyOracle() {
        require(msg.sender == oracle || msg.sender == owner(), "TwapEngine: not oracle");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ======================== ADMIN ========================

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleSet(_oracle);
    }

    function setTwapWindow(uint256 windowSeconds) external onlyOwner {
        require(windowSeconds >= 60 && windowSeconds <= 86400, "TwapEngine: window out of range");
        twapWindowSeconds = windowSeconds;
        emit TwapWindowUpdated(windowSeconds);
    }

    // ======================== OBSERVATION ========================

    /**
     * @notice Record a price observation. Called by Oracle on every price update.
     */
    function recordObservation(bytes32 feedId, uint256 price) external onlyOracle {
        require(price > 0, "TwapEngine: invalid price");
        uint256 idx = writeIndex[feedId];
        _obs[feedId][idx] = Observation({ price: price, timestamp: block.timestamp });
        writeIndex[feedId] = (idx + 1) % MAX_OBSERVATIONS;
        if (observationCount[feedId] < MAX_OBSERVATIONS) {
            observationCount[feedId]++;
        }
        emit ObservationRecorded(feedId, price, block.timestamp);
    }

    // ======================== READS ========================

    /**
     * @notice Compute TWAP over the configured window.
     * @return twap            18-decimal TWAP. Returns 0 if no observations exist.
     * @return observationsUsed Number of observations that contributed.
     */
    function getTwap(bytes32 feedId) external view returns (uint256 twap, uint256 observationsUsed) {
        uint256 count = observationCount[feedId];
        if (count == 0) return (0, 0);

        uint256 cutoff = block.timestamp >= twapWindowSeconds
            ? block.timestamp - twapWindowSeconds
            : 0;

        uint256 wIdx        = writeIndex[feedId];
        uint256 weightedSum = 0;
        uint256 totalTime   = 0;
        uint256 prevTimestamp = block.timestamp;
        uint256 used        = 0;

        for (uint256 i = 0; i < count; i++) {
            uint256 slot = (wIdx + MAX_OBSERVATIONS - 1 - i) % MAX_OBSERVATIONS;
            Observation memory ob = _obs[feedId][slot];
            if (ob.timestamp < cutoff) break;

            uint256 dt = prevTimestamp - ob.timestamp;
            if (dt > 0) {
                weightedSum += ob.price * dt;
                totalTime   += dt;
            }
            prevTimestamp = ob.timestamp;
            unchecked { used++; }
        }

        if (totalTime == 0) {
            // Not enough temporal spread — return latest raw price
            uint256 latestSlot = (wIdx + MAX_OBSERVATIONS - 1) % MAX_OBSERVATIONS;
            return (_obs[feedId][latestSlot].price, 1);
        }

        return (weightedSum / totalTime, used);
    }

    /**
     * @notice Convenience view: latest recorded observation.
     */
    function getLatestObservation(bytes32 feedId) external view returns (uint256 price, uint256 timestamp) {
        uint256 count = observationCount[feedId];
        if (count == 0) return (0, 0);
        uint256 slot = (writeIndex[feedId] + MAX_OBSERVATIONS - 1) % MAX_OBSERVATIONS;
        Observation memory ob = _obs[feedId][slot];
        return (ob.price, ob.timestamp);
    }
}
