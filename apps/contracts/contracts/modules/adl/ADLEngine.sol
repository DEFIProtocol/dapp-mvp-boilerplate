// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../storage/PerpStorage.sol";
import "../risk/RiskManager.sol";
import "../trading/PositionManager.sol";
import "./ADLTypes.sol";
import "./ADLMath.sol";
import "./ADLQueue.sol";

contract ADLEngine {
    using ADLMath for uint256;

    uint256 private constant BPS_DENOMINATOR = 10000;

    PerpStorage public perpStorage;
    RiskManager public riskManager;
    PositionManager public positionManager;

    mapping(bytes32 => uint256[]) private adlQueues;
    mapping(bytes32 => uint256) public adlEventCursor;
    mapping(bytes32 => mapping(uint256 => uint256)) public reducedNotionalByEvent;

    uint256 public weightPnL = 5e17;
    uint256 public weightLeverage = 5e17;
    uint256 public maxReductionBpsPerEvent = 2000;
    uint256 public maxStepsPerTx = 25;
    bool public adlEnabled = true;

    event ADLQueueUpdated(bytes32 indexed marketId, bool indexed longSide, uint256 count);
    event ADLParamsUpdated(uint256 weightPnL, uint256 weightLeverage, uint256 maxReductionBpsPerEvent, uint256 maxStepsPerTx);
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
        require(params.maxReductionBpsPerEvent > 0 && params.maxReductionBpsPerEvent <= BPS_DENOMINATOR, "Invalid ADL cap");
        require(params.maxStepsPerTx > 0, "Invalid ADL steps");

        weightPnL = params.weightPnL;
        weightLeverage = params.weightLeverage;
        maxReductionBpsPerEvent = params.maxReductionBpsPerEvent;
        maxStepsPerTx = params.maxStepsPerTx;

        emit ADLParamsUpdated(weightPnL, weightLeverage, maxReductionBpsPerEvent, maxStepsPerTx);
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

    function calculateScore(uint256 positionId, uint256 markPrice) public view returns (uint256) {
        PerpStorage.Position memory p = perpStorage.getPosition(positionId);

        if (!p.active || p.margin == 0 || p.entryPrice == 0) return 0;

        uint256 positionValue = p.exposure;

        (int256 pnl, int256 funding) = riskManager.getPositionPnlAndFunding(p, markPrice);
        int256 netPnl = pnl - funding;
        if (netPnl <= 0) return 0;

        uint256 pnlPct =
            ADLMath.pnlPercent(netPnl, positionValue);

        uint256 lev =
            ADLMath.leverage(positionValue, p.margin);

        return ADLMath.score(
            pnlPct,
            lev,
            weightPnL,
            weightLeverage
        );
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
        uint256 steps = 0;
        uint256 markPrice = riskManager.getMarkPriceForMarket(marketId);

        while (remainingDeficit > 0 && cursor < queue.length && steps < maxStepsPerTx) {
            uint256 positionId = queue[cursor];
            cursor++;
            steps++;

            (uint256 reduction, address trader) = _tryReduceCandidate(
                eHash,
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
        bytes32 eHash,
        bytes32 marketId,
        bool targetLongSide,
        uint256 positionId,
        uint256 remainingDeficit,
        uint256 markPrice
    ) internal returns (uint256 reduction, address trader) {
        PerpStorage.Position memory p = perpStorage.getPosition(positionId);
        trader = p.trader;

        if (!p.active || p.marketId != marketId) {
            return (0, trader);
        }
        if ((p.side == PerpStorage.Side.Long) != targetLongSide) {
            return (0, trader);
        }
        if (calculateScore(positionId, markPrice) == 0) {
            return (0, trader);
        }

        uint256 maxReductionForPosition = ADLMath.cappedReductionByBps(p.exposure, maxReductionBpsPerEvent);
        if (maxReductionForPosition == 0) {
            return (0, trader);
        }
        uint256 alreadyReduced = reducedNotionalByEvent[eHash][positionId];
        if (alreadyReduced >= maxReductionForPosition) {
            return (0, trader);
        }

        uint256 remainingCap = maxReductionForPosition - alreadyReduced;
        reduction = ADLMath.min3(remainingDeficit, remainingCap, p.exposure);
        if (reduction == 0) {
            return (0, trader);
        }

        positionManager.forceReducePosition(positionId, reduction, markPrice);
        reducedNotionalByEvent[eHash][positionId] = alreadyReduced + reduction;

        return (reduction, trader);
    }
}