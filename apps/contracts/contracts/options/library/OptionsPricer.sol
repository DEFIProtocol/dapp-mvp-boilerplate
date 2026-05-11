// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OptionsPricerCore {
    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR_SECONDS = 365 days;

    // 1 / sqrt(2*pi) and sqrt(2*pi) in 1e18 fixed-point.
    int256 private constant INV_SQRT_2PI_WAD = 398942280401432677;
    int256 private constant SQRT_2PI_WAD = 2506628274631000500;
    int256 private constant LN2_WAD = 693147180559945309;

    // Abramowitz-Stegun CDF approximation constants in 1e18 fixed-point.
    int256 private constant CDF_P = 231641900000000000;
    int256 private constant CDF_B1 = 319381530000000000;
    int256 private constant CDF_B2 = -356563782000000000;
    int256 private constant CDF_B3 = 1781477937000000000;
    int256 private constant CDF_B4 = -1821255978000000000;
    int256 private constant CDF_B5 = 1330274429000000000;

    function getMarkPremium(
        bool isCall,
        uint256 strikePrice,
        uint256 spotPrice,
        uint256 secondsToExpiry,
        uint256 ivBps,
        uint256 riskFreeRateBps
    ) external pure returns (uint256) {
        return _blackScholesPrice(
            isCall,
            strikePrice,
            spotPrice,
            secondsToExpiry,
            ivBps,
            riskFreeRateBps
        );
    }

    function getWriterMargin(
        bool isCall,
        uint256 strikePrice,
        uint256 size,
        uint256 spotPrice,
        uint256 secondsToExpiry,
        uint256 ivBps,
        uint256 riskFreeRateBps
    ) external pure returns (uint256) {
        require(size > 0, "Invalid size");
        uint256 premiumPerUnit = _blackScholesPrice(
            isCall,
            strikePrice,
            spotPrice,
            secondsToExpiry,
            ivBps,
            riskFreeRateBps
        );

        uint256 intrinsic = _intrinsicValue(isCall, strikePrice, spotPrice);
        uint256 stressBuffer = (spotPrice * 2000) / BPS;
        uint256 floorBuffer = (spotPrice * 1000) / BPS;
        uint256 perUnitMargin = intrinsic + stressBuffer;
        if (perUnitMargin < floorBuffer) {
            perUnitMargin = floorBuffer;
        }

        uint256 marginNotional = (perUnitMargin * size) / WAD;
        uint256 premiumBuffer = ((premiumPerUnit * size) / WAD) / 2;
        return marginNotional + premiumBuffer;
    }

    function _blackScholesPrice(
        bool isCall,
        uint256 strikePrice,
        uint256 spotPrice,
        uint256 secondsToExpiry,
        uint256 ivBps,
        uint256 riskFreeRateBps
    ) internal pure returns (uint256 premium) {
        require(strikePrice > 0, "Invalid strike");
        require(spotPrice > 0, "Invalid spot");
        require(ivBps > 0, "Invalid IV");

        if (secondsToExpiry == 0) {
            return _intrinsicValue(isCall, strikePrice, spotPrice);
        }

        int256 tWad = int256((secondsToExpiry * WAD) / YEAR_SECONDS);
        int256 sigmaWad = int256(ivBps) * 1e14;
        int256 rWad = int256(riskFreeRateBps) * 1e14;

        int256 sqrtT = _sqrtWad(tWad);
        int256 sigmaSqrtT = (sigmaWad * sqrtT) / int256(WAD);
        require(sigmaSqrtT > 0, "Invalid sigma sqrtT");

        int256 lnSk = _lnWad((int256(spotPrice) * int256(WAD)) / int256(strikePrice));
        int256 sigma2 = (sigmaWad * sigmaWad) / int256(WAD);
        int256 drift = (rWad + (sigma2 / 2)) * tWad / int256(WAD);

        int256 d1 = ((lnSk + drift) * int256(WAD)) / sigmaSqrtT;
        int256 d2 = d1 - sigmaSqrtT;

        int256 nd1 = _normalCdf(d1);
        int256 nd2 = _normalCdf(d2);

        int256 discount = _expWad(-(rWad * tWad / int256(WAD)));
        int256 sTerm = (int256(spotPrice) * nd1) / int256(WAD);
        int256 kTerm = (((int256(strikePrice) * discount) / int256(WAD)) * nd2) / int256(WAD);

        int256 price;
        if (isCall) {
            price = sTerm - kTerm;
        } else {
            int256 nMinusD1 = int256(WAD) - nd1;
            int256 nMinusD2 = int256(WAD) - nd2;
            int256 putStrikeTerm = (((int256(strikePrice) * discount) / int256(WAD)) * nMinusD2) / int256(WAD);
            int256 putSpotTerm = (int256(spotPrice) * nMinusD1) / int256(WAD);
            price = putStrikeTerm - putSpotTerm;
        }

        if (price <= 0) {
            return _intrinsicValue(isCall, strikePrice, spotPrice);
        }

        premium = uint256(price);
        uint256 intrinsicFloor = _intrinsicValue(isCall, strikePrice, spotPrice);
        if (premium < intrinsicFloor) {
            premium = intrinsicFloor;
        }
    }

    function _intrinsicValue(bool isCall, uint256 strikePrice, uint256 spotPrice) internal pure returns (uint256) {
        if (isCall) {
            return spotPrice > strikePrice ? spotPrice - strikePrice : 0;
        }
        return strikePrice > spotPrice ? strikePrice - spotPrice : 0;
    }

    function _normalCdf(int256 xWad) internal pure returns (int256) {
        if (xWad < 0) {
            return int256(WAD) - _normalCdf(-xWad);
        }

        int256 pdf = _normalPdf(xWad);
        int256 t = (int256(WAD) * int256(WAD)) / (int256(WAD) + (CDF_P * xWad) / int256(WAD));
        int256 t2 = (t * t) / int256(WAD);
        int256 t3 = (t2 * t) / int256(WAD);
        int256 t4 = (t3 * t) / int256(WAD);
        int256 t5 = (t4 * t) / int256(WAD);

        int256 poly = (CDF_B1 * t) / int256(WAD)
            + (CDF_B2 * t2) / int256(WAD)
            + (CDF_B3 * t3) / int256(WAD)
            + (CDF_B4 * t4) / int256(WAD)
            + (CDF_B5 * t5) / int256(WAD);

        int256 cdf = int256(WAD) - ((pdf * poly) / int256(WAD));
        if (cdf < 0) return 0;
        if (cdf > int256(WAD)) return int256(WAD);
        return cdf;
    }

    function _normalPdf(int256 xWad) internal pure returns (int256) {
        int256 x2 = (xWad * xWad) / int256(WAD);
        int256 exponent = -(x2 / 2);
        int256 e = _expWad(exponent);
        return (e * INV_SQRT_2PI_WAD) / int256(WAD);
    }

    function _sqrtWad(int256 xWad) internal pure returns (int256) {
        require(xWad >= 0, "Negative sqrt input");
        if (xWad == 0) return 0;

        uint256 n = uint256(xWad) * WAD;
        uint256 z = (n + 1) / 2;
        uint256 y = n;
        while (z < y) {
            y = z;
            z = (n / z + z) / 2;
        }

        return int256(y);
    }

    function _lnWad(int256 xWad) internal pure returns (int256) {
        require(xWad > 0, "Invalid ln input");

        int256 y = xWad;
        int256 k = 0;

        while (y >= 2 * int256(WAD)) {
            y /= 2;
            k += 1;
        }

        while (y < int256(WAD)) {
            y *= 2;
            k -= 1;
        }

        int256 z = ((y - int256(WAD)) * int256(WAD)) / (y + int256(WAD));
        int256 z2 = (z * z) / int256(WAD);

        int256 series = z;
        int256 term = z;
        term = (term * z2) / int256(WAD);
        series += term / 3;
        term = (term * z2) / int256(WAD);
        series += term / 5;
        term = (term * z2) / int256(WAD);
        series += term / 7;
        term = (term * z2) / int256(WAD);
        series += term / 9;
        term = (term * z2) / int256(WAD);
        series += term / 11;

        return 2 * series + k * LN2_WAD;
    }

    function _expWad(int256 xWad) internal pure returns (int256) {
        if (xWad <= -42 * int256(WAD)) {
            return 0;
        }
        if (xWad >= 135 * int256(WAD)) {
            revert("exp overflow");
        }

        int256 k = xWad / LN2_WAD;
        int256 r = xWad - k * LN2_WAD;

        int256 sum = int256(WAD);
        int256 term = int256(WAD);
        for (uint256 i = 1; i <= 14; i++) {
            term = (term * r) / (int256(WAD) * int256(i));
            sum += term;
        }

        if (k >= 0) {
            return sum * int256(1 << uint256(k));
        }
        return sum / int256(1 << uint256(-k));
    }
}
