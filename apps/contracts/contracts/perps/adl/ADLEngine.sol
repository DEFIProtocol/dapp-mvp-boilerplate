// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../risk/RiskManager.sol";
import "../trading/PositionManager.sol";
import "./ADLTypes.sol";
import "./ADLMath.sol";
import "./ADLQueue.sol";

contract ADLEngine {
    using ADLMath for uint256;

    uint256 private constant PROFITABLE_SCORE_BONUS = 1e30;

    PerpStorage public perpStorage;
    RiskManager public riskManager;
    PositionManager public positionManager;

    mapping(bytes32 => uint256[]) private adlQueues;
    mapping(bytes32 => uint256) public adlEventCursor;

    uint256 public weightPnL = 5e17;
    uint256 public weightLeverage = 5e17;
    bool public adlEnabled = true;

    event ADLQueueUpdated(bytes32 indexed marketId, bool indexed longSide, uint256 count);
    event ADLParamsUpdated(uint256 weightPnL, uint256 weightLeverage);
    event ADLEnabledUpdated(bool enabled);
    event ADLPositionReduced(
        uint256 indexed eventId,
        uint256 positionId,
        address trader,
        uint256 reductionNotional,
        uint256 remainingDeficit
    );

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules");
        _;
    }

    constructor(address _perpStorage, address _riskManager, address _positionManager) {
        perpStorage = PerpStorage(_perpStorage);
        riskManager = RiskManager(_riskManager);
        positionManager = PositionManager(_positionManager);
    }

    function setParams(ADLTypes.ADLParams calldata params) external onlyOwner {
        weightPnL = params.weightPnL;
        weightLeverage = params.weightLeverage;

        emit ADLParamsUpdated(weightPnL, weightLeverage);
    }

    function setAdlEnabled(bool enabled) external onlyOwner {
        adlEnabled = enabled;
        emit ADLEnabledUpdated(enabled);
    }

    function setQueue(
        bytes32 marketId,
        bool longSide,
        ADLTypes.ADLRank[] calldata ranked
    ) external onlyOwner {
        ADLQueue.validateMonotonicDescending(ranked);

        bytes32 qHash = ADLQueue.queueHash(marketId, longSide);
        delete adlQueues[qHash];
        for (uint256 i = 0; i < ranked.length; i++) {
            adlQueues[qHash].push(ranked[i].positionId);
        }

        emit ADLQueueUpdated(marketId, longSide, ranked.length);
    }

    function getQueue(bytes32 marketId, bool longSide) external view returns (uint256[] memory) {
        return adlQueues[ADLQueue.queueHash(marketId, longSide)];
    }

    function executeAutoDeleverage(
        bytes32 marketId,
        bool targetLongSide,
        uint256 deficit,
        uint256 eventId
    ) external onlyModule returns (uint256 covered, uint256 remainingDeficit) {
        remainingDeficit = deficit;
        if (!adlEnabled || deficit == 0) {
            return (0, deficit);
        }

        bytes32 qHash = ADLQueue.queueHash(marketId, targetLongSide);
        uint256[] storage queue = adlQueues[qHash];
        if (queue.length == 0) {
            return (0, deficit);
        }

        bytes32 eHash = ADLQueue.eventHash(marketId, targetLongSide, eventId);
        uint256 cursor = adlEventCursor[eHash];
        uint256 markPrice = riskManager.getMarkPriceForMarket(marketId);

        while (remainingDeficit > 0 && cursor < queue.length) {
            uint256 positionId = queue[cursor];
            cursor++;

            (uint256 reduction, address trader) = _tryReduceCandidate(
                marketId,
                targetLongSide,
                positionId,
                remainingDeficit,
                markPrice
            );
            if (reduction == 0) {
                continue;
            }

            covered += reduction;
            remainingDeficit -= reduction;
            emit ADLPositionReduced(eventId, positionId, trader, reduction, remainingDeficit);
        }

        adlEventCursor[eHash] = cursor;
        return (covered, remainingDeficit);
    }

    function clearAdlEventCursor(bytes32 marketId, bool longSide, uint256 eventId) external onlyOwner {
        bytes32 eHash = ADLQueue.eventHash(marketId, longSide, eventId);
        adlEventCursor[eHash] = 0;
    }

    function _tryReduceCandidate(
        bytes32 marketId,
        bool targetLongSide,
        uint256 positionId,
        uint256 remainingDeficit,
        uint256 markPrice
    ) internal returns (uint256 reduction, address trader) {
        PerpStorage.Position memory p = perpStorage.getPosition(positionId);
        trader = p.trader;

        bytes32 positionMarketId = p.marketId == bytes32(0) ? perpStorage.marketFeedId() : p.marketId;
        if (!p.active || positionMarketId != marketId) {
            return (0, trader);
        }
        if ((p.side == PerpStorage.Side.Long) != targetLongSide) {
            return (0, trader);
        }
        if (calculateScore(positionId, markPrice) == 0) {
            return (0, trader);
        }

        reduction = ADLMath.min2(remainingDeficit, p.exposure);
        if (reduction == 0) {
            return (0, trader);
        }

        positionManager.forceReducePosition(positionId, reduction, markPrice);

        return (reduction, trader);
    }

    function calculateScore(uint256 positionId, uint256 markPrice) public view returns (uint256) {
        PerpStorage.Position memory p = perpStorage.getPosition(positionId);

        if (!p.active || p.margin == 0 || p.entryPrice == 0) return 0;

        uint256 positionValue = p.exposure;
        uint256 lev = ADLMath.leverage(positionValue, p.margin);
        if (lev == 0) {
            return 0;
        }

        (int256 pnl, int256 funding) = riskManager.getPositionPnlAndFunding(p, markPrice);
        int256 netPnl = pnl - funding;

        if (netPnl <= 0) {
            return lev;
        }

        uint256 pnlPct = ADLMath.pnlPercent(netPnl, positionValue);
        uint256 profitableScore = ADLMath.score(
            pnlPct,
            lev,
            weightPnL,
            weightLeverage
        );

        return PROFITABLE_SCORE_BONUS + profitableScore;
    }
}