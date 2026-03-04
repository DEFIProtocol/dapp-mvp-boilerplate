// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FeeBatcher is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral;

    uint256 public lastDistribution;
    uint256 public constant WEEK = 7 days;

    uint256 public accumulatedFees;

    event FeesRecorded(uint256 amount);
    event Distributed(address to, uint256 amount);

    constructor(address _collateral) Ownable(msg.sender) {
        collateral = IERC20(_collateral);
        lastDistribution = block.timestamp;
    }

    function recordFee(uint256 amount) external {
        accumulatedFees += amount;
        emit FeesRecorded(amount);
    }

    function distribute(address to) external onlyOwner nonReentrant {
        require(block.timestamp >= lastDistribution + WEEK, "Too early");

        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        lastDistribution = block.timestamp;

        collateral.safeTransfer(to, amount);

        emit Distributed(to, amount);
    }
}