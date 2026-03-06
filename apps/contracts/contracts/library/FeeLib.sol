// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library FeeLib {
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Calculate trading fees
    function calculateTradingFees(
        uint256 size,
        uint256 makerFeeBps,
        uint256 takerFeeBps,
        uint256 insuranceBps
    ) internal pure returns (uint256 makerFee, uint256 takerFee, uint256 insuranceCut) {
        makerFee = (size * makerFeeBps) / BPS_DENOMINATOR;
        takerFee = (size * takerFeeBps) / BPS_DENOMINATOR;
        insuranceCut = (size * insuranceBps) / BPS_DENOMINATOR;
    }

    // Calculate total fee for an order
    function calculateTotalFees(
        uint256 size,
        uint256 feeBps,
        uint256 insuranceBps
    ) internal pure returns (uint256 total) {
        return (size * (feeBps + insuranceBps)) / BPS_DENOMINATOR;
    }

    // Split fee between protocols
    function splitFee(
        uint256 fee,
        uint256 protocolShareBps
    ) internal pure returns (uint256 protocolShare, uint256 referrerShare) {
        protocolShare = (fee * protocolShareBps) / BPS_DENOMINATOR;
        referrerShare = fee - protocolShare;
    }

    // Calculate fee for closing position (if any)
    function calculateCloseFee(
        uint256 exposure,
        uint256 closeFeeBps
    ) internal pure returns (uint256) {
        return (exposure * closeFeeBps) / BPS_DENOMINATOR;
    }
}