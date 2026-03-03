// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        address to,
        uint256 amount
    ) ERC20(name_, symbol_) {
        _mint(to, amount);
    }
}
