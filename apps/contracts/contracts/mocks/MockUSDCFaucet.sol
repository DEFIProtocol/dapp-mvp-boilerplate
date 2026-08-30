// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDCFaucet
 * @notice Testnet-only mock USDC token. Standard OpenZeppelin ERC20 (instead of
 *      a hand-rolled token) so wallet security providers (e.g. Blockaid, used by
 *      MetaMask) can recognize well-known, audited bytecode.
 * @dev An earlier version let any wallet call a permissionless, rate-limited
 *      `mint()` directly - safe on-chain, but a brand-new contract exposing a
 *      public mint() is exactly the shape Blockaid's heuristics flag as a
 *      likely scam/drainer token, regardless of the rate limit. That function
 *      has been removed entirely: end users never call this contract
 *      directly anymore. Instead, the backend (owner) tops up a large
 *      treasury balance into its own wallet via the owner-only `ownerMint`
 *      below, and distributes to users with plain ERC20 `transfer()` calls -
 *      the most common, least-suspicious action there is.
 *
 * @custom:security-contact security@yourdapp.com
 * @custom:security This is a Base Sepolia TESTNET-ONLY faucet token. It holds no
 *      real value and is not deployed to any production network.
 */
contract MockUSDCFaucet is ERC20, Ownable {
    uint8 private immutable _decimalsValue;

    event OwnerMint(address indexed to, uint256 amount);

    error AmountMustBePositive();

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimalsParam,
        address initialOwner
    ) ERC20(_name, _symbol) Ownable(initialOwner) {
        _decimalsValue = _decimalsParam;
    }

    /**
     * @notice Mint test USDC to any address. Owner-only (the backend's treasury
     *      wallet), uncapped, used to top up the treasury that the backend then
     *      distributes from via plain `transfer()`. Not callable by end users.
     * @param to Address to credit.
     * @param amount Amount to mint, in token base units (respects `decimals`).
     */
    function ownerMint(address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert AmountMustBePositive();
        _mint(to, amount);
        emit OwnerMint(to, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimalsValue;
    }
}
