// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IInsuranceTreasury {
    function deposit(uint256 amount) external;
    function withdrawTo(address to, uint256 amount) external;
    function balance() external view returns (uint256);
}
