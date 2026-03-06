// contracts/mocks/MockERC20.sol
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        _mint(msg.sender, 1_000_000 * 10**_decimals);
    }
    
    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// contracts/mocks/MockOracle.sol
contract MockOracle {
    uint256 private price;
    
    function setPrice(uint256 _price) external {
        price = _price;
    }
    
    function getMarkPrice(bytes32) external view returns (uint256) {
        return price;
    }
}

// contracts/mocks/MockInsuranceFund.sol
contract MockInsuranceFund {
    function deposit(uint256 amount) external {
        // Mock deposit
    }
}