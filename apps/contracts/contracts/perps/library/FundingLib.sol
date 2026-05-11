// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library FundingLib {
    uint256 public constant PRECISION = 1e18;

    // Calculate funding payment for a position
    function calculateFundingPayment(
        uint256 exposure,
        int256 entryFunding,
        int256 currentCumulativeFunding
    ) internal pure returns (int256 funding) {
        int256 fundingDiff = currentCumulativeFunding - entryFunding;
        return (int256(exposure) * fundingDiff) / int256(PRECISION);
    }

    // Calculate funding rate based on exposure imbalance
    function calculateFundingRate(
        uint256 longExposure,
        uint256 shortExposure,
        uint256 maxFundingRate,
        uint256 clampBps
    ) internal pure returns (int256 longRate, int256 shortRate) {
        if (longExposure == 0 && shortExposure == 0) {
            return (0, 0);
        }

        uint256 totalExposure = longExposure + shortExposure;
        
        // Imbalance as percentage: (long - short) / total
        int256 imbalance;
        if (longExposure > shortExposure) {
            imbalance = int256((longExposure - shortExposure) * PRECISION / totalExposure);
        } else {
            imbalance = -int256((shortExposure - longExposure) * PRECISION / totalExposure);
        }

        // Apply max funding rate
        int256 rate = (imbalance * int256(maxFundingRate)) / int256(PRECISION);
        
        // Clamp to bounds
        int256 maxClamp = int256(maxFundingRate * clampBps / 10000);
        if (rate > maxClamp) rate = maxClamp;
        if (rate < -maxClamp) rate = -maxClamp;

        return (rate, -rate);
    }

    // Time-weighted funding accumulation
    function calculateTimeWeightedFunding(
        int256 rate,
        uint256 timeElapsed,
        uint256 interval
    ) internal pure returns (int256) {
        return rate * int256(timeElapsed) / int256(interval);
    }
}