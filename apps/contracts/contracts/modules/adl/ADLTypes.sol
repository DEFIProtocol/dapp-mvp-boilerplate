// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ADLTypes {
    struct ADLRank {
        uint256 positionId;
        uint256 score;
    }

    struct ADLParams {
        uint256 weightPnL;
        uint256 weightLeverage;
        uint256 maxReductionBpsPerEvent;
        uint256 maxStepsPerTx;
    }

    struct QueueKey {
        bytes32 marketId;
        bool longSide;
    }
}