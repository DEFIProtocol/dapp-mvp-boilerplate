// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title InsuranceTreasury
 * @notice Holds protocol insurance reserves and pays out bad-debt coverage.
 *
 * Withdrawal policy (Stage 2 hardening):
 *  - Module-triggered withdrawals are bounded by two additive constraints:
 *      1. maxSingleWithdrawalBps  – a single call cannot withdraw more than this
 *         fraction of the current balance (default 5000 = 50%).
 *      2. minimumReserve          – modules can never draw below this floor; only the
 *         owner (timelock) can access those funds via emergencyWithdrawTo.
 *  - The owner (governance timelock) can call emergencyWithdrawTo at any time to
 *    move any amount, bypassing the module caps.  This path must route through the
 *    timelock delay, providing the human-review window required by Stage 1.
 */
contract InsuranceTreasury is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral;
    mapping(address => bool) public authorizedModules;

    uint256 public maxSingleWithdrawalBps; // basis-points cap per module call (10 000 = 100%)
    uint256 public minimumReserve;         // absolute floor that modules cannot touch

    event ModuleAuthorizationUpdated(address indexed module, bool authorized);
    event InsuranceDeposited(address indexed module, uint256 amount, uint256 newBalance);
    event InsuranceWithdrawn(address indexed module, address indexed to, uint256 amount, uint256 newBalance);
    event EmergencyWithdrawn(address indexed caller, address indexed to, uint256 amount, uint256 newBalance);
    event WithdrawalPolicyUpdated(uint256 maxSingleWithdrawalBps, uint256 minimumReserve);

    modifier onlyModule() {
        require(authorizedModules[msg.sender], "Not authorized module");
        _;
    }

    constructor(address _collateral, address _owner) Ownable(_owner) {
        require(_collateral != address(0), "Invalid collateral");
        collateral = IERC20(_collateral);
        maxSingleWithdrawalBps = 5000; // 50% per call by default
    }

    function setAuthorizedModule(address module, bool authorized) external onlyOwner {
        require(module != address(0), "Invalid module");
        authorizedModules[module] = authorized;
        emit ModuleAuthorizationUpdated(module, authorized);
    }

    /**
     * @notice Governance sets per-call withdrawal cap and minimum reserve floor.
     * @param _maxSingleWithdrawalBps  Max fraction of balance withdrawable in one call (bps, max 10 000).
     * @param _minimumReserve          Absolute token amount that modules can never withdraw below.
     */
    function setWithdrawalPolicy(uint256 _maxSingleWithdrawalBps, uint256 _minimumReserve) external onlyOwner {
        require(_maxSingleWithdrawalBps <= 10000, "Exceeds 100%");
        maxSingleWithdrawalBps = _maxSingleWithdrawalBps;
        minimumReserve = _minimumReserve;
        emit WithdrawalPolicyUpdated(_maxSingleWithdrawalBps, _minimumReserve);
    }

    /**
     * @notice Returns the maximum amount a module may withdraw in the current call.
     *         This is the lesser of: (balance − minimumReserve) and (balance × maxSingleWithdrawalBps / 10000).
     */
    function maxWithdrawable() external view returns (uint256) {
        uint256 bal = collateral.balanceOf(address(this));
        if (bal <= minimumReserve) return 0;
        uint256 aboveFloor = bal - minimumReserve;
        uint256 cappedByBps = (bal * maxSingleWithdrawalBps) / 10000;
        return aboveFloor < cappedByBps ? aboveFloor : cappedByBps;
    }

    /**
     * @notice Pull collateral from an authorized module into treasury.
     */
    function deposit(uint256 amount) external onlyModule {
        require(amount > 0, "Zero amount");
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        emit InsuranceDeposited(msg.sender, amount, collateral.balanceOf(address(this)));
    }

    /**
     * @notice Send collateral from treasury to target (e.g. CollateralManager).
     *         Subject to withdrawal-policy constraints: per-call cap and minimum reserve.
     */
    function withdrawTo(address to, uint256 amount) external onlyModule {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        uint256 bal = collateral.balanceOf(address(this));
        require(bal > minimumReserve, "Below minimum reserve");
        uint256 aboveFloor = bal - minimumReserve;
        uint256 cappedByBps = (bal * maxSingleWithdrawalBps) / 10000;
        uint256 maxAllowed = aboveFloor < cappedByBps ? aboveFloor : cappedByBps;
        require(amount <= maxAllowed, "Exceeds withdrawal cap");
        collateral.safeTransfer(to, amount);
        emit InsuranceWithdrawn(msg.sender, to, amount, collateral.balanceOf(address(this)));
    }

    /**
     * @notice Governance emergency path — bypasses module withdrawal cap and reserve floor.
     *         Must route through the timelock (Stage 1) to reach this call.
     */
    function emergencyWithdrawTo(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        collateral.safeTransfer(to, amount);
        emit EmergencyWithdrawn(msg.sender, to, amount, collateral.balanceOf(address(this)));
    }

    function balance() external view returns (uint256) {
        return collateral.balanceOf(address(this));
    }
}
