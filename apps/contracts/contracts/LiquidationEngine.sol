// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISettlement {
    function liquidate(uint256 positionId) external;
}

contract LiquidationEngine {

    ISettlement public settlement;

    constructor(address _settlement) {
        settlement = ISettlement(_settlement);
    }

    function liquidatePosition(uint256 positionId) external {
        settlement.liquidate(positionId);
    }
}