// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDCFaucet
 * @notice Testnet-only mock USDC token with a permissionless, self-serve faucet.
 * @dev Standard OpenZeppelin ERC20 implementation (instead of a hand-rolled token)
 *      so wallet security providers (e.g. Blockaid, used by MetaMask) can recognize
 *      well-known, audited bytecode rather than flagging an unfamiliar/unverified
 *      contract as a potential drainer.
 *
 *      Anyone can call `mint` to credit their own wallet directly - there is no
 *      owner/allowlist gate - but claims are capped at `maxMintPerWalletPerDay`
 *      base units per wallet in any rolling 24 hour window. This removes the
 *      "unlimited/open-ended admin mint" heuristic that trips drainer-detection
 *      tooling while still allowing self-serve testnet funding.
 *
 * @custom:security-contact security@yourdapp.com
 * @custom:security This is a Base Sepolia TESTNET-ONLY faucet token. It holds no
 *      real value and is not deployed to any production network.
 */
contract MockUSDCFaucet is ERC20 {
    uint8 private immutable _decimalsValue;

    /// @notice Maximum amount a single wallet may mint within any rolling 24h window (base units).
    uint256 public immutable maxMintPerWalletPerDay;

    /// @notice Length of the rolling rate-limit window.
    uint256 public constant MINT_WINDOW = 1 days;

    /// @notice Amount minted by `wallet` within the current rolling window.
    mapping(address => uint256) public mintedInWindow;

    /// @notice Timestamp when `wallet`'s current rolling window started.
    mapping(address => uint256) public windowStartedAt;

    event Mint(address indexed to, uint256 amount);

    error AmountMustBePositive();
    error DailyMintLimitExceeded(uint256 requested, uint256 alreadyMinted, uint256 limit);

    constructor(string memory _name, string memory _symbol, uint8 _decimalsParam) ERC20(_name, _symbol) {
        _decimalsValue = _decimalsParam;
        maxMintPerWalletPerDay = 10_000 * (10 ** uint256(_decimalsParam));
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimalsValue;
    }

    /**
     * @notice Mint test USDC directly into the caller's own wallet.
     * @dev Permissionless by design - this is a testnet faucet token only.
     *      Enforces a rolling 24h/`maxMintPerWalletPerDay` cap per wallet: once a
     *      wallet's window starts, it must wait the full `MINT_WINDOW` from that
     *      first claim before the window resets and it can claim up to the cap again.
     * @param amount Amount to mint, in token base units (respects `decimals`).
     */
    function mint(uint256 amount) external {
        if (amount == 0) revert AmountMustBePositive();

        uint256 windowStart = windowStartedAt[msg.sender];
        if (windowStart == 0 || block.timestamp >= windowStart + MINT_WINDOW) {
            // No active window, or the previous window has fully elapsed - start a fresh one.
            windowStartedAt[msg.sender] = block.timestamp;
            mintedInWindow[msg.sender] = 0;
            windowStart = block.timestamp;
        }

        uint256 alreadyMinted = mintedInWindow[msg.sender];
        uint256 newTotal = alreadyMinted + amount;
        if (newTotal > maxMintPerWalletPerDay) {
            revert DailyMintLimitExceeded(amount, alreadyMinted, maxMintPerWalletPerDay);
        }

        mintedInWindow[msg.sender] = newTotal;
        _mint(msg.sender, amount);
        emit Mint(msg.sender, amount);
    }

    /**
     * @notice How many base units `wallet` may still mint in its current rolling window.
     * @dev Returns the full `maxMintPerWalletPerDay` if the wallet has no active window
     *      or its previous window has fully elapsed.
     */
    function remainingMintAllowance(address wallet) external view returns (uint256) {
        uint256 windowStart = windowStartedAt[wallet];
        if (windowStart == 0 || block.timestamp >= windowStart + MINT_WINDOW) {
            return maxMintPerWalletPerDay;
        }
        uint256 alreadyMinted = mintedInWindow[wallet];
        if (alreadyMinted >= maxMintPerWalletPerDay) return 0;
        return maxMintPerWalletPerDay - alreadyMinted;
    }

    /// @notice Unix timestamp when `wallet`'s current rolling window resets (0 if no active window).
    function windowResetsAt(address wallet) external view returns (uint256) {
        uint256 windowStart = windowStartedAt[wallet];
        if (windowStart == 0 || block.timestamp >= windowStart + MINT_WINDOW) {
            return 0;
        }
        return windowStart + MINT_WINDOW;
    }
}
