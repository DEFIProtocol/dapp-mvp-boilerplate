// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPerpSettlement {
    function updateFunding(int256 longFunding, int256 shortFunding) external;
    function liquidateWithPrice(uint256 positionId, uint256 markPrice) external;
    function liquidate(uint256 positionId) external;
}

contract SettlementEngine {
    IPerpSettlement public settlement;
    address public owner;

    event SettlementUpdated(address settlement);
    event OwnershipTransferred(address previousOwner, address newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _settlement) {
        owner = msg.sender;
        settlement = IPerpSettlement(_settlement);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "bad owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setSettlement(address _settlement) external onlyOwner {
        settlement = IPerpSettlement(_settlement);
        emit SettlementUpdated(_settlement);
    }

    function updateFunding(int256 longFunding, int256 shortFunding) external onlyOwner {
        settlement.updateFunding(longFunding, shortFunding);
    }

    function liquidate(uint256 positionId) external {
        settlement.liquidate(positionId);
    }

    function liquidateWithPrice(uint256 positionId, uint256 markPrice) external onlyOwner {
        settlement.liquidateWithPrice(positionId, markPrice);
    }
}