// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PerpStorage is Ownable {
    enum Side { Long, Short }

    struct Position {
        address trader;
        Side side;
        uint256 exposure;
        uint256 margin;
        uint256 entryPrice;
        int256 entryFunding;
        bool active;
    }

    struct Order {
        address trader;
        Side side;
        uint256 exposure;
        uint256 limitPrice;
        uint256 expiry;
        uint256 nonce;
    }

    // Constants
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_LEVERAGE = 100;
    uint256 public constant MIN_LEVERAGE = 1;

    // Token addresses
    IERC20 public collateral;
    address public insuranceFund;

    // Oracle
    address public markOracle;
    bytes32 public marketFeedId;

    // Parameters
    uint256 public makerFeeBps;
    uint256 public takerFeeBps;
    uint256 public insuranceBps;
    uint256 public maintenanceMarginBps;
    uint256 public liquidationRewardBps;
    uint256 public liquidationPenaltyBps;

    // Global state
    uint256 public feePool;
    uint256 public insuranceFundBalance;
    uint256 public totalBadDebt;
    int256 public cumulativeFundingLong;
    int256 public cumulativeFundingShort;
    uint256 public totalLongExposure;
    uint256 public totalShortExposure;
    uint256 public nextPositionId;
    uint256 public lastFundingUpdate;
    uint256 public fundingInterval = 1 hours;
    uint256 public nextFundingTime;

    // Per-account state
    mapping(address => uint256) public accountCollateral;
    mapping(address => uint256) public reservedMargin;
    mapping(address => uint256[]) public traderPositions;
    mapping(address => uint256) public positionCount;
    mapping(address => int256) public realizedPnl;

    // Position tracking
    mapping(uint256 => Position) public positions;
    mapping(uint256 => uint256) private traderPositionIndexPlusOne;
    mapping(address => mapping(uint256 => bool)) public hasPosition;

    // Order tracking
    mapping(address => uint256) public minValidNonce;
    mapping(address => mapping(uint256 => bool)) public cancelledNonce;
    mapping(bytes32 => uint256) public filledAmount;

    // Access control
    mapping(address => bool) public authorizedModules;
    bool public emergencyPause;
    mapping(address => bool) public frozenAccounts;

    // NO EVENTS HERE - they go in modules
    
    // MODIFIERS (only for access control)
    modifier onlyModule() {
        require(authorizedModules[msg.sender], "Not authorized");
        _;
    }

    modifier onlyOwnerOrModule() {
        require(owner() == msg.sender || authorizedModules[msg.sender], "Not authorized");
        _;
    }

    modifier notPaused() {
        require(!emergencyPause, "Paused");
        _;
    }

    constructor() Ownable(msg.sender) {}

    // SETTERS
    function setAuthorizedModule(address module, bool authorized) external onlyOwner {
        authorizedModules[module] = authorized;
    }

    function setEmergencyPause(bool paused) external onlyOwnerOrModule {
        emergencyPause = paused;
    }

    function setFrozenAccount(address trader, bool frozen) external onlyOwnerOrModule {
        frozenAccounts[trader] = frozen;
    }

    function setCollateral(IERC20 token) external onlyOwner {
        collateral = token;
    }

    function setInsuranceFund(address fund) external onlyOwner {
        insuranceFund = fund;
    }

    function setMarkOracle(address oracle) external onlyOwner {
        markOracle = oracle;
    }

    function setMarketFeedId(bytes32 feedId) external onlyOwner {
        marketFeedId = feedId;
    }

    function setMakerFeeBps(uint256 bps) external onlyOwner {
        makerFeeBps = bps;
    }

    function setTakerFeeBps(uint256 bps) external onlyOwner {
        takerFeeBps = bps;
    }

    function setInsuranceBps(uint256 bps) external onlyOwner {
        insuranceBps = bps;
    }

    function setMaintenanceMarginBps(uint256 bps) external onlyOwner {
        maintenanceMarginBps = bps;
    }

    function setLiquidationRewardBps(uint256 bps) external onlyOwner {
        liquidationRewardBps = bps;
    }

    function setLiquidationPenaltyBps(uint256 bps) external onlyOwner {
        liquidationPenaltyBps = bps;
    }

    function setFeePool(uint256 amount) external onlyOwnerOrModule {
        feePool = amount;
    }

    function setInsuranceFundBalance(uint256 amount) external onlyModule {
        insuranceFundBalance = amount;
    }

    function setTotalBadDebt(uint256 amount) external onlyModule {
        totalBadDebt = amount;
    }

    function setCumulativeFundingLong(int256 value) external onlyModule {
        cumulativeFundingLong = value;
    }

    function setCumulativeFundingShort(int256 value) external onlyModule {
        cumulativeFundingShort = value;
    }

    function setTotalLongExposure(uint256 value) external onlyModule {
        totalLongExposure = value;
    }

    function setTotalShortExposure(uint256 value) external onlyModule {
        totalShortExposure = value;
    }

    function setNextPositionId(uint256 value) external onlyModule {
        nextPositionId = value;
    }

    function setLastFundingUpdate(uint256 ts) external onlyOwnerOrModule {
        lastFundingUpdate = ts;
    }

    function setFundingInterval(uint256 interval) external onlyOwnerOrModule {
        fundingInterval = interval;
    }

    function setNextFundingTime(uint256 ts) external onlyOwnerOrModule {
        nextFundingTime = ts;
    }

    function setAccountCollateral(address trader, uint256 amount) external onlyModule {
        accountCollateral[trader] = amount;
    }

    function setReservedMargin(address trader, uint256 amount) external onlyModule {
        reservedMargin[trader] = amount;
    }

    function setRealizedPnl(address trader, int256 pnl) external onlyModule {
        realizedPnl[trader] = pnl;
    }

    function setMinValidNonce(address trader, uint256 nonce) external onlyModule {
        minValidNonce[trader] = nonce;
    }

    function setCancelledNonce(address trader, uint256 nonce, bool cancelled) external onlyModule {
        cancelledNonce[trader][nonce] = cancelled;
    }

    function setFilledAmount(bytes32 orderHash, uint256 amount) external onlyModule {
        filledAmount[orderHash] = amount;
    }

    function setPosition(uint256 positionId, Position calldata position) external onlyModule {
        positions[positionId] = position;
    }

    function setPositionActive(uint256 positionId, bool active) external onlyModule {
        positions[positionId].active = active;
    }

    function setPositionEntryFunding(uint256 positionId, int256 entryFunding) external onlyModule {
        positions[positionId].entryFunding = entryFunding;
    }

    function setPositionMargin(uint256 positionId, uint256 margin) external onlyModule {
        positions[positionId].margin = margin;
    }

    function setHasPosition(address trader, uint256 positionId, bool has) external onlyModule {
        hasPosition[trader][positionId] = has;
    }

    function pushTraderPosition(address trader, uint256 positionId) external onlyModule {
        traderPositions[trader].push(positionId);
    }

    function setTraderPositionAt(address trader, uint256 index, uint256 positionId) external onlyModule {
        traderPositions[trader][index] = positionId;
    }

    function popTraderPosition(address trader) external onlyModule {
        traderPositions[trader].pop();
    }

    function getTraderPositionsLength(address trader) external view returns (uint256) {
        return traderPositions[trader].length;
    }

    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return traderPositions[trader];
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    // Position helpers
    function setTraderPositionIndex(uint256 positionId, uint256 index) external onlyModule {
        traderPositionIndexPlusOne[positionId] = index;
    }

    function getTraderPositionIndex(uint256 positionId) external view returns (uint256) {
        return traderPositionIndexPlusOne[positionId];
    }

    function deleteTraderPositionIndex(uint256 positionId) external onlyModule {
        delete traderPositionIndexPlusOne[positionId];
    }

    function removeTraderPosition(address trader, uint256 positionId) external onlyModule {
        uint256 indexPlusOne = traderPositionIndexPlusOne[positionId];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = traderPositions[trader].length - 1;

        if (index != lastIndex) {
            uint256 lastPositionId = traderPositions[trader][lastIndex];
            traderPositions[trader][index] = lastPositionId;
            traderPositionIndexPlusOne[lastPositionId] = index + 1;
        }

        traderPositions[trader].pop();
        delete traderPositionIndexPlusOne[positionId];
    }

    // Counters
    function incrementPositionCount(address trader) external onlyModule {
        positionCount[trader]++;
    }

    function decrementPositionCount(address trader) external onlyModule {
        positionCount[trader]--;
    }

    // State updates
    function addBadDebt(uint256 amount) external onlyModule {
        totalBadDebt += amount;
    }

    function depositToInsurance(uint256 amount) external onlyModule {
        insuranceFundBalance += amount;
    }
}