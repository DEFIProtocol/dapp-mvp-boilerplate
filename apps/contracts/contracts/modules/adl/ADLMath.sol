// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ADLMath {

    uint256 constant PRECISION = 1e18;
    uint256 constant BPS_DENOMINATOR = 10000;

    function pnlPercent(
        int256 pnl,
        uint256 positionValue
    ) internal pure returns (uint256) {
        if (pnl <= 0 || positionValue == 0) return 0;

        return uint256(pnl) * PRECISION / positionValue;
    }

    function leverage(
        uint256 positionValue,
        uint256 collateral
    ) internal pure returns (uint256) {

        if (collateral == 0) return 0;

        return positionValue * PRECISION / collateral;
    }

    function score(
        uint256 pnlPct,
        uint256 lev,
        uint256 w1,
        uint256 w2
    ) internal pure returns (uint256) {
        return (pnlPct * w1 + lev * w2) / 1e18;
    }

    function min2(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function min3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return min2(min2(a, b), c);
    }

    function cappedReductionByBps(uint256 notional, uint256 capBps) internal pure returns (uint256) {
        return (notional * capBps) / BPS_DENOMINATOR;
    }
}