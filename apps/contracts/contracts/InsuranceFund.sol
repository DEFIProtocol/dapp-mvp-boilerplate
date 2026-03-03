// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract InsuranceFund is Ownable {
    IERC20 public immutable collateral;

    uint256 public totalReserves;
    uint256 public lastDistribution;
    uint256 public constant DISTRIBUTION_INTERVAL = 7 days;

    event Deposited(uint256 amount);
    event Distributed(uint256 amount);

    constructor(address _collateral) Ownable(msg.sender) {
        collateral = IERC20(_collateral);
        lastDistribution = block.timestamp;
    }

    function deposit(uint256 amount) external {
        collateral.transferFrom(msg.sender, address(this), amount);
        totalReserves += amount;
        emit Deposited(amount);
    }

    function distribute(address to, uint256 amount) external onlyOwner {
        require(block.timestamp >= lastDistribution + DISTRIBUTION_INTERVAL, "Too early");
        require(amount <= totalReserves, "Insufficient reserves");

        totalReserves -= amount;
        lastDistribution = block.timestamp;

        collateral.transfer(to, amount);
        emit Distributed(amount);
    }
}