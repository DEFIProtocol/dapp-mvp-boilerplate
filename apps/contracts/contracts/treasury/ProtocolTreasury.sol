// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProtocolTreasury
 * @notice Holds protocol revenue (maker/taker fees and overflow liquidation residuals).
 */
contract ProtocolTreasury is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral;
    mapping(address => bool) public authorizedModules;

    event ModuleAuthorizationUpdated(address indexed module, bool authorized);
    event TreasuryDeposited(address indexed module, uint256 amount, uint256 newBalance);
    event TreasuryWithdrawn(address indexed caller, address indexed to, uint256 amount, uint256 newBalance);

    modifier onlyModule() {
        require(authorizedModules[msg.sender], "Not authorized module");
        _;
    }

    constructor(address _collateral, address _owner) Ownable(_owner) {
        require(_collateral != address(0), "Invalid collateral");
        collateral = IERC20(_collateral);
    }

    function setAuthorizedModule(address module, bool authorized) external onlyOwner {
        authorizedModules[module] = authorized;
        emit ModuleAuthorizationUpdated(module, authorized);
    }

    /**
     * @notice Pull collateral from an authorized module into treasury.
     */
    function deposit(uint256 amount) external onlyModule {
        require(amount > 0, "Zero amount");
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        emit TreasuryDeposited(msg.sender, amount, collateral.balanceOf(address(this)));
    }

    /**
     * @notice Send collateral from treasury to a target address.
     */
    function withdrawTo(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        collateral.safeTransfer(to, amount);
        emit TreasuryWithdrawn(msg.sender, to, amount, collateral.balanceOf(address(this)));
    }

    function balance() external view returns (uint256) {
        return collateral.balanceOf(address(this));
    }
}