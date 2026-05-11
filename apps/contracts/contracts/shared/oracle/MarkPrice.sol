// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IOracle {
    function getIndexPrice(bytes32 feedId) external view returns (uint256 price, uint256 updatedAt);
    function isStale(bytes32 feedId) external view returns (bool);
}

interface ITwapEngineView {
    function getTwap(bytes32 feedId) external view returns (uint256 twap, uint256 observationsUsed);
}

/**
 * @title MarkPrice
 * @notice Implements IMarkOracle — consumed by RiskManager for PnL, margin, and liquidation.
 *
 *         Formula (once TWAP is warmed up, i.e. >= minTwapObservations):
 *           premium  = clamp((index - twap) / twap, -premiumCapBps, +premiumCapBps)
 *           mark     = twap * (10000 + premium) / 10000
 *
 *         Fallback (TWAP not warmed up): returns raw index price unchanged.
 *         Safety: reverts when the oracle index price is stale — liquidations
 *         fail safely rather than executing against stale data.
 *
 *         Deployment order:
 *           1. Deploy TwapEngine and Oracle
 *           2. Deploy MarkPrice(oracle, twapEngine)
 *           3. Oracle.setTwapEngine(twapEngine)
 *           4. TwapEngine.setOracle(oracle)
 *           5. perpStorage.setMarkOracle(address(markPrice))   ? cutover point
 *
 *         Tests: MockOracle in MockERC20.sol is still used by all Hardhat tests.
 *                MarkPrice is only active after step 5 above on a live network.
 */
contract MarkPrice is Ownable {
    IOracle         public oracle;
    ITwapEngineView public twapEngine;

    uint256 public premiumCapBps       = 200; // ±2 % max premium on TWAP
    uint256 public minTwapObservations = 2;   // observations needed before TWAP activates
    uint256 public constant BPS_DENOMINATOR = 10000;

    event OracleSet(address indexed oracle);
    event TwapEngineSet(address indexed twapEngine);
    event PremiumCapUpdated(uint256 newCapBps);
    event MinTwapObservationsUpdated(uint256 newMin);

    constructor(address _oracle, address _twapEngine) Ownable(msg.sender) {
        oracle     = IOracle(_oracle);
        twapEngine = ITwapEngineView(_twapEngine);
    }

    // ======================== ADMIN ========================

    function setOracle(address _oracle) external onlyOwner {
        oracle = IOracle(_oracle);
        emit OracleSet(_oracle);
    }

    function setTwapEngine(address _twapEngine) external onlyOwner {
        twapEngine = ITwapEngineView(_twapEngine);
        emit TwapEngineSet(_twapEngine);
    }

    function setPremiumCapBps(uint256 capBps) external onlyOwner {
        require(capBps <= 500, "MarkPrice: cap exceeds 5%");
        premiumCapBps = capBps;
        emit PremiumCapUpdated(capBps);
    }

    function setMinTwapObservations(uint256 minObs) external onlyOwner {
        require(minObs >= 1 && minObs <= 20, "MarkPrice: invalid min observations");
        minTwapObservations = minObs;
        emit MinTwapObservationsUpdated(minObs);
    }

    // ======================== IMarkOracle ========================

    /**
     * @notice Returns the mark price for a market feed.
     *         Called by RiskManager on every equity, maintenance, and liquidation check.
     */
    function getMarkPrice(bytes32 feedId) external view returns (uint256 markPrice) {
        require(!oracle.isStale(feedId), "MarkPrice: index price stale");

        (uint256 indexPrice,) = oracle.getIndexPrice(feedId);
        require(indexPrice > 0, "MarkPrice: zero index price");

        (uint256 twap, uint256 obsUsed) = twapEngine.getTwap(feedId);

        // TWAP not warmed up ? shadow/startup mode: use raw index
        if (twap == 0 || obsUsed < minTwapObservations) {
            return indexPrice;
        }

        // premium in signed bps: (index - twap) * 10000 / twap
        int256 premiumBps = (int256(indexPrice) - int256(twap)) * int256(BPS_DENOMINATOR) / int256(twap);
        int256 cap        = int256(premiumCapBps);
        if (premiumBps >  cap) premiumBps =  cap;
        if (premiumBps < -cap) premiumBps = -cap;

        markPrice = (twap * uint256(int256(BPS_DENOMINATOR) + premiumBps)) / BPS_DENOMINATOR;
        require(markPrice > 0, "MarkPrice: zero result");
    }

    // ======================== DIAGNOSTICS ========================

    /**
     * @notice Full breakdown for dashboards and backend shadow-price monitoring.
     *         Does NOT revert on staleness — intended for read-only diagnostics.
     */
    function getPriceBreakdown(bytes32 feedId) external view returns (
        uint256 indexPrice,
        uint256 indexUpdatedAt,
        uint256 twapPrice,
        uint256 twapObservations,
        uint256 markPrice,
        int256  premiumBps,
        bool    indexStale
    ) {
        indexStale = oracle.isStale(feedId);
        (indexPrice, indexUpdatedAt) = oracle.getIndexPrice(feedId);
        (twapPrice, twapObservations) = twapEngine.getTwap(feedId);

        if (indexPrice == 0 || twapPrice == 0 || twapObservations < minTwapObservations) {
            markPrice  = indexPrice;
            premiumBps = 0;
            return (indexPrice, indexUpdatedAt, twapPrice, twapObservations, markPrice, premiumBps, indexStale);
        }

        premiumBps = (int256(indexPrice) - int256(twapPrice)) * int256(BPS_DENOMINATOR) / int256(twapPrice);
        int256 cap = int256(premiumCapBps);
        if (premiumBps >  cap) premiumBps =  cap;
        if (premiumBps < -cap) premiumBps = -cap;

        markPrice = (twapPrice * uint256(int256(BPS_DENOMINATOR) + premiumBps)) / BPS_DENOMINATOR;
    }
}
