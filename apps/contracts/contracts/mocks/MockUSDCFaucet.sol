// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUSDCFaucet
 * @notice Testnet-only mock USDC token with a permissionless, self-serve faucet.
 * @dev Anyone can call `mint` to credit their own wallet directly. There is no
 *      global supply cap and no owner/allowlist gate - the only restriction is
 *      a per-call cap (`MAX_MINT_PER_CALL`) so a single transaction can't mint
 *      an absurd amount. Callers can simply call `mint` again for more.
 */
contract MockUSDCFaucet {
    string public name;
    string public symbol;
    uint8 public decimals;

    /// @notice Maximum amount that can be minted in a single call (in token base units).
    uint256 public immutable maxMintPerCall;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Mint(address indexed to, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        maxMintPerCall = 10_000 * (10 ** uint256(_decimals));
    }

    /**
     * @notice Mint test USDC directly into the caller's own wallet.
     * @dev Permissionless by design - this is a testnet faucet token only.
     * @param amount Amount to mint, in token base units (respects `decimals`).
     */
    function mint(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(amount <= maxMintPerCall, "Exceeds max mint per call");
        balanceOf[msg.sender] += amount;
        emit Mint(msg.sender, amount);
        emit Transfer(address(0), msg.sender, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
