// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PerpStorage is Ownable {
    error AlreadyInitialized();
    error CoreConfigIncomplete();

    enum Side { Long, Short }
    enum MarginMode { Isolated, Cross }
    enum OptionType { Call, Put }
    enum OptionSeriesStatus { Uninitialized, Active, Expired, Settled }

    struct SubAccount {
        bool exists;
        address collateralToken;
        uint256 collateralBalance;
        uint256 reservedMarginBalance;
        MarginMode marginMode;
    }

    struct SubAccountView {
        uint256 subAccountId;
        address collateralToken;
        uint256 collateralBalance;
        uint256 reservedMarginBalance;
        MarginMode marginMode;
        uint256 positionCount;
        bool isDefault;
    }

    struct MarketConfig {
        bool exists;
        bool enabled;
        bool paused;
        bytes32 feedId;
        uint256 maxOracleDeviationBps;
        uint256 makerFeeBps;
        uint256 takerFeeBps;
        uint256 maintenanceMarginBps;
        uint256 liquidationRewardBps;
        uint256 liquidationPenaltyBps;
        int256 cumulativeFundingLong;
        int256 cumulativeFundingShort;
        uint256 maxLongExposure;   // 0 = no cap
        uint256 maxShortExposure;  // 0 = no cap
        uint256 spotCollateralHaircutBps;
        uint256 spotMaintenanceWeightBps;
    }

    struct Position {
        address trader;
        Side side;
        uint256 exposure;
        uint256 margin;
        uint256 entryPrice;
        uint256 liquidationPrice;
        uint256 bankruptcyPrice;
        int256 entryFunding;
        MarginMode marginMode;
        bytes32 marketId;
        uint256 subAccountId;
        address collateralToken;
        bool active;
    }

    struct Order {
        address trader;
        Side side;
        uint256 exposure;
        uint256 limitPrice;
        uint256 expiry;
        uint256 nonce;
        bytes32 marketId;
    }

    struct OptionSeries {
        bool exists;
        bool isCall;
        bytes32 marketId;
        uint256 strikePrice;
        uint256 expiry;
        uint256 ivBps;
        uint256 riskFreeRateBps;
        address collateralToken;
        OptionSeriesStatus status;
    }

    struct OptionPosition {
        address trader;
        uint256 seriesId;
        uint256 size;
        uint256 premium;
        uint256 marginLocked;
        uint256 subAccountId;
        bool isLong;
        bool active;
        bool settled;
    }

    struct SpotBalance {
        bool exists;
        uint256 quantity;
        uint256 avgEntryPrice;
        uint256 reservedBase;
        uint256 reservedQuote;
        uint256 borrowLiability;
    }

    // Constants
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MAX_LEVERAGE = 100;
    uint256 public constant MIN_LEVERAGE = 1;
    uint256 public constant RATIO_SCALE = 1e18;
    uint256 public constant LEGACY_SUBACCOUNT_ID = type(uint256).max;

    // Token addresses
    IERC20 public collateral;
    address public insuranceFund;
    address public protocolTreasury;
    address public optionsPricer;

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
    uint256 public maxOracleDeviationBps;
    bool public oracleStaleAutoPauseEnabled;
    bool public allowLiquidationWhenOracleStalePaused;
    uint256 public adlSoftTriggerCoverageRatio;
    uint256 public adlHardTriggerCoverageRatio;
    bool public jitModeEnabled;
    uint256 public optionDeepItmHaircutBps;
    uint256 public optionAtmHaircutBps;
    uint256 public optionSlightOtmHaircutBps;
    uint256 public optionDeepOtmHaircutBps;
    uint256 public optionAtmThresholdBps;
    uint256 public optionSlightOtmThresholdBps;
    uint256 public optionDeepItmThresholdBps;
    uint256 public optionAdversePriceShockBps;
    uint256 public optionCreationFeeBps;
    uint256 public optionExerciseFeeBps;
    uint256 public optionSecondaryTransferFeeBps;

    // Size-based tiered initial margin (0 = tiers disabled)
    uint256 public sizeBasedMarginTier1Cap;  // max exposure for tier-1 rate; 0 = all tiers disabled
    uint256 public sizeBasedMarginTier2Cap;  // max exposure for tier-2 rate; 0 = only 2 tiers
    uint256 public sizeBasedMarginTier1Bps;  // IM rate bps for tier 1 (e.g. 500 = 5%)
    uint256 public sizeBasedMarginTier2Bps;  // IM rate bps for tier 2 (e.g. 1000 = 10%)
    uint256 public sizeBasedMarginTier3Bps;  // IM rate bps for tier 3 (e.g. 2500 = 25%)

    // Global state
    uint256 public feePool;
    uint256 public protocolTreasuryNonTradingInflow;
    uint256 public insuranceFundBalance;
    uint256 public totalBadDebt;
    int256 public cumulativeFundingLong;
    int256 public cumulativeFundingShort;
    uint256 public totalLongExposure;
    uint256 public totalShortExposure;
    mapping(bytes32 => uint256) public marketLongExposure;
    mapping(bytes32 => uint256) public marketShortExposure;
    uint256 public nextPositionId;
    uint256 public fillNonce;
    uint256 public lastFundingUpdate;
    uint256 public fundingInterval = 1 hours;
    uint256 public nextFundingTime;
    uint256 public nextOptionSeriesId;
    uint256 public nextOptionPositionId;

    // Per-account state
    mapping(address => uint256) public accountCollateral;
    mapping(address => uint256) public reservedMargin;
    mapping(address => uint256[]) public traderPositions;
    mapping(address => uint256) public positionCount;
    mapping(address => int256) public realizedPnl;
    mapping(address => bool) public isCrossMargin;
    mapping(address => mapping(uint256 => SubAccount)) private subAccounts;
    mapping(address => uint256[]) private traderSubAccountIds;
    mapping(address => uint256) public nextSubAccountId;
    mapping(address => uint256) public defaultSubAccountId;
    mapping(address => bool) public hasDefaultSubAccount;

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
    bool public initialized;

    // Market registry
    mapping(bytes32 => MarketConfig) public markets;
    bytes32[] public marketIds;
    mapping(bytes32 => bool) public marketOracleStalePaused;
    mapping(bytes32 => uint256) public marketOracleStaleDetectedAt;

    // Options domain (unified storage)
    mapping(uint256 => OptionSeries) public optionSeries;
    mapping(uint256 => OptionPosition) public optionPositions;
    mapping(address => uint256[]) public traderOptionPositions;
    mapping(uint256 => uint256) private traderOptionPositionIndexPlusOne;
    mapping(uint256 => uint256) public seriesOpenInterestLong;
    mapping(uint256 => uint256) public seriesOpenInterestShort;

    // Spot inventory domain (shared cross-margin foundation)
    mapping(address => mapping(uint256 => mapping(bytes32 => SpotBalance))) private spotBalances;
    mapping(address => mapping(uint256 => bytes32[])) private traderSpotMarketIds;
    mapping(address => mapping(uint256 => mapping(bytes32 => uint256))) private traderSpotMarketIndexPlusOne;

    event ModuleAuthorizationUpdated(address indexed module, bool authorized, address indexed caller);
    event EmergencyPauseUpdated(bool paused, address indexed caller);
    event FrozenAccountUpdated(address indexed trader, bool frozen, address indexed caller);
    event CollateralUpdated(address indexed collateralToken);
    event InsuranceFundUpdated(address indexed insuranceFund);
    event ProtocolTreasuryUpdated(address indexed treasury);
    event OptionsPricerUpdated(address indexed pricer);
    event MarkOracleUpdated(address indexed oracle);
    event MarketFeedIdUpdated(bytes32 indexed feedId);
    event MarketAdded(bytes32 indexed marketId, bytes32 indexed feedId);
    event MarketPauseUpdated(bytes32 indexed marketId, bool paused, address indexed caller);
    event MarketOracleStalePauseUpdated(bytes32 indexed marketId, bool paused, address indexed caller);
    event InitializationFinalized(address indexed caller);

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

    modifier onlyBeforeInitializationFinalized() {
        if (initialized) revert AlreadyInitialized();
        _;
    }

    constructor() Ownable(msg.sender) {
        maxOracleDeviationBps = 500;
        oracleStaleAutoPauseEnabled = true;
        adlSoftTriggerCoverageRatio = 11e17;
        adlHardTriggerCoverageRatio = 1e18;
        optionDeepItmHaircutBps = 9000;
        optionAtmHaircutBps = 7000;
        optionSlightOtmHaircutBps = 3500;
        optionDeepOtmHaircutBps = 500;
        optionAtmThresholdBps = 300;
        optionSlightOtmThresholdBps = 1000;
        optionDeepItmThresholdBps = 1000;
        optionAdversePriceShockBps = 500;
        optionCreationFeeBps = 5;
        optionExerciseFeeBps = 5;
        optionSecondaryTransferFeeBps = 5;
    }

    // SETTERS
    function setAuthorizedModule(address module, bool authorized) external onlyOwner {
        require(module != address(0), "Invalid module");
        authorizedModules[module] = authorized;
        emit ModuleAuthorizationUpdated(module, authorized, msg.sender);
    }

    function setEmergencyPause(bool paused) external {
        if (paused) {
            require(owner() == msg.sender || authorizedModules[msg.sender], "Not authorized");
        } else {
            require(owner() == msg.sender, "Only owner can unpause");
        }

        emergencyPause = paused;
        emit EmergencyPauseUpdated(paused, msg.sender);
    }

    function setFrozenAccount(address trader, bool frozen) external {
        require(trader != address(0), "Invalid trader");

        if (frozen) {
            require(owner() == msg.sender || authorizedModules[msg.sender], "Not authorized");
        } else {
            require(owner() == msg.sender, "Only owner can unfreeze");
        }

        frozenAccounts[trader] = frozen;
        emit FrozenAccountUpdated(trader, frozen, msg.sender);
    }

    function setCollateral(IERC20 token) external onlyOwner onlyBeforeInitializationFinalized {
        require(address(token) != address(0), "Invalid collateral");
        collateral = token;
        emit CollateralUpdated(address(token));
    }

    function setInsuranceFund(address fund) external onlyOwner onlyBeforeInitializationFinalized {
        require(fund != address(0), "Invalid insurance fund");
        insuranceFund = fund;
        emit InsuranceFundUpdated(fund);
    }

    function setProtocolTreasury(address _treasury) external onlyOwner onlyBeforeInitializationFinalized {
        protocolTreasury = _treasury;
        emit ProtocolTreasuryUpdated(_treasury);
    }

    function setOptionsPricer(address pricer) external onlyOwner onlyBeforeInitializationFinalized {
        require(pricer != address(0), "Invalid pricer");
        optionsPricer = pricer;
        emit OptionsPricerUpdated(pricer);
    }

    function setMarkOracle(address oracle) external onlyOwner onlyBeforeInitializationFinalized {
        markOracle = oracle;
        emit MarkOracleUpdated(oracle);
    }

    function setMarketFeedId(bytes32 feedId) external onlyOwner onlyBeforeInitializationFinalized {
        require(feedId != bytes32(0), "Invalid feed");
        marketFeedId = feedId;
        emit MarketFeedIdUpdated(feedId);
    }

    function addMarket(
        bytes32 marketId,
        bytes32 feedId,
        uint256 _makerFeeBps,
        uint256 _takerFeeBps,
        uint256 _maintenanceMarginBps,
        uint256 _liquidationRewardBps,
        uint256 _liquidationPenaltyBps
    ) external onlyOwner onlyBeforeInitializationFinalized {
        require(marketId != bytes32(0), "Invalid market");
        require(feedId != bytes32(0), "Invalid feed");
        require(!markets[marketId].exists, "Market exists");
        require(_makerFeeBps <= BPS_DENOMINATOR, "Invalid maker fee");
        require(_takerFeeBps <= BPS_DENOMINATOR, "Invalid taker fee");
        require(_maintenanceMarginBps <= BPS_DENOMINATOR, "Invalid maintenance");
        require(_liquidationPenaltyBps <= BPS_DENOMINATOR, "Invalid penalty");
        require(_liquidationRewardBps <= _liquidationPenaltyBps, "Reward exceeds penalty");

        markets[marketId] = MarketConfig({
            exists: true,
            enabled: true,
            paused: false,
            feedId: feedId,
            maxOracleDeviationBps: 0,
            makerFeeBps: _makerFeeBps,
            takerFeeBps: _takerFeeBps,
            maintenanceMarginBps: _maintenanceMarginBps,
            liquidationRewardBps: _liquidationRewardBps,
            liquidationPenaltyBps: _liquidationPenaltyBps,
            cumulativeFundingLong: 0,
            cumulativeFundingShort: 0,
            maxLongExposure: 0,
            maxShortExposure: 0,
            spotCollateralHaircutBps: 9000,
            spotMaintenanceWeightBps: 0
        });

        marketIds.push(marketId);
        emit MarketAdded(marketId, feedId);
    }

    function finalizeInitialization() external onlyOwner onlyBeforeInitializationFinalized {
        if (
            address(collateral) == address(0) ||
            insuranceFund == address(0) ||
            markOracle == address(0) ||
            marketFeedId == bytes32(0) ||
            !markets[marketFeedId].exists
        ) {
            revert CoreConfigIncomplete();
        }

        initialized = true;
        emit InitializationFinalized(msg.sender);
    }

    /**
     * @notice Add a new market after initialization has been finalized.
     * @dev Owner-only, no finalization restriction. Allows adding markets without redeploying.
     */
    function addMarketAdmin(
        bytes32 marketId,
        bytes32 feedId,
        uint256 _makerFeeBps,
        uint256 _takerFeeBps,
        uint256 _maintenanceMarginBps,
        uint256 _liquidationRewardBps,
        uint256 _liquidationPenaltyBps
    ) external onlyOwner {
        require(marketId != bytes32(0), "Invalid market");
        require(feedId != bytes32(0), "Invalid feed");
        require(!markets[marketId].exists, "Market exists");
        require(_makerFeeBps <= BPS_DENOMINATOR, "Invalid maker fee");
        require(_takerFeeBps <= BPS_DENOMINATOR, "Invalid taker fee");
        require(_maintenanceMarginBps <= BPS_DENOMINATOR, "Invalid maintenance");
        require(_liquidationPenaltyBps <= BPS_DENOMINATOR, "Invalid penalty");
        require(_liquidationRewardBps <= _liquidationPenaltyBps, "Reward exceeds penalty");

        markets[marketId] = MarketConfig({
            exists: true,
            enabled: true,
            paused: false,
            feedId: feedId,
            maxOracleDeviationBps: 0,
            makerFeeBps: _makerFeeBps,
            takerFeeBps: _takerFeeBps,
            maintenanceMarginBps: _maintenanceMarginBps,
            liquidationRewardBps: _liquidationRewardBps,
            liquidationPenaltyBps: _liquidationPenaltyBps,
            cumulativeFundingLong: 0,
            cumulativeFundingShort: 0,
            maxLongExposure: 0,
            maxShortExposure: 0,
            spotCollateralHaircutBps: 9000,
            spotMaintenanceWeightBps: 0
        });

        marketIds.push(marketId);
        emit MarketAdded(marketId, feedId);
    }

    function setMarketEnabled(bytes32 marketId, bool enabled) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        markets[marketId].enabled = enabled;
    }

    function setMarketPaused(bytes32 marketId, bool paused) external {
        require(markets[marketId].exists, "Unknown market");

        if (paused) {
            require(owner() == msg.sender || authorizedModules[msg.sender], "Not authorized");
        } else {
            require(owner() == msg.sender, "Only owner can unpause market");
        }

        markets[marketId].paused = paused;
        emit MarketPauseUpdated(marketId, paused, msg.sender);
    }

    function setMarketFeed(bytes32 marketId, bytes32 feedId) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        require(feedId != bytes32(0), "Invalid feed");
        markets[marketId].feedId = feedId;
    }

    function setMarketFeeParams(bytes32 marketId, uint256 _makerFeeBps, uint256 _takerFeeBps) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        require(_makerFeeBps <= BPS_DENOMINATOR, "Invalid maker fee");
        require(_takerFeeBps <= BPS_DENOMINATOR, "Invalid taker fee");
        markets[marketId].makerFeeBps = _makerFeeBps;
        markets[marketId].takerFeeBps = _takerFeeBps;
    }

    function setMarketRiskParams(
        bytes32 marketId,
        uint256 _maintenanceMarginBps,
        uint256 _liquidationRewardBps,
        uint256 _liquidationPenaltyBps
    ) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        require(_maintenanceMarginBps <= BPS_DENOMINATOR, "Invalid maintenance");
        require(_liquidationPenaltyBps <= BPS_DENOMINATOR, "Invalid penalty");
        require(_liquidationRewardBps <= _liquidationPenaltyBps, "Reward exceeds penalty");
        markets[marketId].maintenanceMarginBps = _maintenanceMarginBps;
        markets[marketId].liquidationRewardBps = _liquidationRewardBps;
        markets[marketId].liquidationPenaltyBps = _liquidationPenaltyBps;
    }

    function setMarketSpotRiskParams(
        bytes32 marketId,
        uint256 haircutBps,
        uint256 maintenanceWeightBps
    ) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        require(haircutBps <= BPS_DENOMINATOR, "Invalid spot haircut");
        require(maintenanceWeightBps <= BPS_DENOMINATOR, "Invalid spot maintenance");

        markets[marketId].spotCollateralHaircutBps = haircutBps;
        markets[marketId].spotMaintenanceWeightBps = maintenanceWeightBps;
    }

    function setMaxOracleDeviationBps(uint256 bps) external onlyOwner {
        require(bps > 0 && bps <= BPS_DENOMINATOR, "Invalid oracle deviation");
        maxOracleDeviationBps = bps;
    }

    function setOracleStaleAutoPauseEnabled(bool enabled) external onlyOwner {
        oracleStaleAutoPauseEnabled = enabled;
    }

    function setAllowLiquidationWhenOracleStalePaused(bool allowed) external onlyOwner {
        allowLiquidationWhenOracleStalePaused = allowed;
    }

    function setJitModeEnabled(bool enabled) external onlyOwner {
        jitModeEnabled = enabled;
    }

    function setOptionHaircuts(
        uint256 deepItmHaircutBps,
        uint256 atmHaircutBps,
        uint256 slightOtmHaircutBps,
        uint256 deepOtmHaircutBps
    ) external onlyOwner {
        require(deepItmHaircutBps <= BPS_DENOMINATOR, "Invalid deep ITM haircut");
        require(atmHaircutBps <= BPS_DENOMINATOR, "Invalid ATM haircut");
        require(slightOtmHaircutBps <= BPS_DENOMINATOR, "Invalid slight OTM haircut");
        require(deepOtmHaircutBps <= BPS_DENOMINATOR, "Invalid deep OTM haircut");

        optionDeepItmHaircutBps = deepItmHaircutBps;
        optionAtmHaircutBps = atmHaircutBps;
        optionSlightOtmHaircutBps = slightOtmHaircutBps;
        optionDeepOtmHaircutBps = deepOtmHaircutBps;
    }

    function setOptionMoneynessThresholds(
        uint256 deepItmThresholdBps,
        uint256 atmThresholdBps,
        uint256 slightOtmThresholdBps
    ) external onlyOwner {
        require(atmThresholdBps <= slightOtmThresholdBps, "ATM threshold too high");

        optionDeepItmThresholdBps = deepItmThresholdBps;
        optionAtmThresholdBps = atmThresholdBps;
        optionSlightOtmThresholdBps = slightOtmThresholdBps;
    }

    function setOptionAdversePriceShockBps(uint256 shockBps) external onlyOwner {
        require(shockBps <= BPS_DENOMINATOR, "Invalid option shock");
        optionAdversePriceShockBps = shockBps;
    }

    function setOptionFeeBps(uint256 creationFeeBps, uint256 exerciseFeeBps) external onlyOwner {
        require(creationFeeBps <= BPS_DENOMINATOR, "Invalid creation fee");
        require(exerciseFeeBps <= BPS_DENOMINATOR, "Invalid exercise fee");
        optionCreationFeeBps = creationFeeBps;
        optionExerciseFeeBps = exerciseFeeBps;
    }

    function setOptionSecondaryTransferFeeBps(uint256 secondaryTransferFeeBps) external onlyOwner {
        require(secondaryTransferFeeBps <= BPS_DENOMINATOR, "Invalid secondary fee");
        optionSecondaryTransferFeeBps = secondaryTransferFeeBps;
    }

    function setMarketOracleStalePause(bytes32 marketId, bool paused) external {
        require(markets[marketId].exists, "Unknown market");

        if (paused) {
            require(owner() == msg.sender || authorizedModules[msg.sender], "Not authorized");
        } else {
            require(owner() == msg.sender, "Only owner can clear stale pause");
        }

        marketOracleStalePaused[marketId] = paused;
        if (paused) {
            if (marketOracleStaleDetectedAt[marketId] == 0) {
                marketOracleStaleDetectedAt[marketId] = block.timestamp;
            }
        } else {
            marketOracleStaleDetectedAt[marketId] = 0;
        }

        emit MarketOracleStalePauseUpdated(marketId, paused, msg.sender);
    }

    function setMarketOracleDeviationBps(bytes32 marketId, uint256 bps) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        require(bps <= BPS_DENOMINATOR, "Invalid oracle deviation");
        markets[marketId].maxOracleDeviationBps = bps;
    }

    function setMarketExposureCaps(bytes32 marketId, uint256 maxLong, uint256 maxShort) external onlyOwner {
        require(markets[marketId].exists, "Unknown market");
        markets[marketId].maxLongExposure = maxLong;
        markets[marketId].maxShortExposure = maxShort;
    }

    function setSizeBasedMarginTiers(
        uint256 _tier1Cap,
        uint256 _tier2Cap,
        uint256 _tier1Bps,
        uint256 _tier2Bps,
        uint256 _tier3Bps
    ) external onlyOwner {
        require(_tier1Cap == 0 || _tier2Cap == 0 || _tier1Cap <= _tier2Cap, "Tier1 cap must be <= tier2");
        require(_tier1Bps > 0 && _tier2Bps > 0 && _tier3Bps > 0, "IM rate must be > 0");
        sizeBasedMarginTier1Cap = _tier1Cap;
        sizeBasedMarginTier2Cap = _tier2Cap;
        sizeBasedMarginTier1Bps = _tier1Bps;
        sizeBasedMarginTier2Bps = _tier2Bps;
        sizeBasedMarginTier3Bps = _tier3Bps;
    }

    function setAdlCoverageTriggerRatios(uint256 softRatio, uint256 hardRatio) external onlyOwner {
        require(softRatio >= hardRatio, "Soft ratio must be >= hard ratio");
        require(hardRatio > 0, "Hard ratio must be > 0");
        require(softRatio <= 3 * RATIO_SCALE, "Soft ratio too high");

        adlSoftTriggerCoverageRatio = softRatio;
        adlHardTriggerCoverageRatio = hardRatio;
    }

    function setMarketFundingIndices(bytes32 marketId, int256 longIndex, int256 shortIndex) external onlyModule {
        require(markets[marketId].exists, "Unknown market");
        markets[marketId].cumulativeFundingLong = longIndex;
        markets[marketId].cumulativeFundingShort = shortIndex;
    }

    function getMarketConfig(bytes32 marketId) external view returns (MarketConfig memory) {
        return markets[marketId];
    }

    function getMarketIds() external view returns (bytes32[] memory) {
        return marketIds;
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

    function addProtocolTreasuryNonTradingInflow(uint256 amount) external onlyModule {
        protocolTreasuryNonTradingInflow += amount;
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

    function setMarketLongExposure(bytes32 marketId, uint256 value) external onlyModule {
        marketLongExposure[marketId] = value;
    }

    function setMarketShortExposure(bytes32 marketId, uint256 value) external onlyModule {
        marketShortExposure[marketId] = value;
    }

    function setNextPositionId(uint256 value) external onlyModule {
        nextPositionId = value;
    }

    function getFillNonce() external view returns (uint256) {
        return fillNonce;
    }

    function setFillNonce(uint256 value) external onlyModule {
        fillNonce = value;
    }

    function incrementFillNonce() external onlyModule returns (uint256) {
        return ++fillNonce;
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

    function createSubAccount(
        address trader,
        address collateralToken,
        MarginMode marginMode
    ) external onlyOwnerOrModule returns (uint256 subAccountId) {
        require(trader != address(0), "Invalid trader");
        require(collateralToken != address(0), "Invalid collateral token");

        subAccountId = nextSubAccountId[trader];
        nextSubAccountId[trader] = subAccountId + 1;

        SubAccount storage subAccount = subAccounts[trader][subAccountId];
        require(!subAccount.exists, "Sub-account exists");

        subAccount.exists = true;
        subAccount.collateralToken = collateralToken;
        subAccount.marginMode = marginMode;
        traderSubAccountIds[trader].push(subAccountId);

        if (!hasDefaultSubAccount[trader]) {
            defaultSubAccountId[trader] = subAccountId;
            hasDefaultSubAccount[trader] = true;
        }
    }

    function setDefaultSubAccount(address trader, uint256 subAccountId) external onlyOwnerOrModule {
        require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        defaultSubAccountId[trader] = subAccountId;
        hasDefaultSubAccount[trader] = true;
    }

    function setSubAccountCollateralBalance(
        address trader,
        uint256 subAccountId,
        uint256 amount
    ) external onlyModule {
        require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        subAccounts[trader][subAccountId].collateralBalance = amount;
    }

    function setSubAccountReservedMarginBalance(
        address trader,
        uint256 subAccountId,
        uint256 amount
    ) external onlyModule {
        require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        subAccounts[trader][subAccountId].reservedMarginBalance = amount;
    }

    function setSubAccountMarginMode(
        address trader,
        uint256 subAccountId,
        MarginMode marginMode
    ) external onlyOwnerOrModule {
        require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        subAccounts[trader][subAccountId].marginMode = marginMode;
    }

    function setReservedMargin(address trader, uint256 amount) external onlyModule {
        reservedMargin[trader] = amount;
    }

    function setRealizedPnl(address trader, int256 pnl) external onlyModule {
        realizedPnl[trader] = pnl;
    }

    function setIsCrossMargin(address trader, bool enabled) external onlyOwnerOrModule {
        isCrossMargin[trader] = enabled;
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

    function setPositionExposure(uint256 positionId, uint256 exposure) external onlyModule {
        positions[positionId].exposure = exposure;
    }

    function setPositionEntryPrice(uint256 positionId, uint256 entryPrice) external onlyModule {
        positions[positionId].entryPrice = entryPrice;
    }

    function setPositionLiquidationPrice(uint256 positionId, uint256 liquidationPrice) external onlyModule {
        positions[positionId].liquidationPrice = liquidationPrice;
    }

    function setPositionBankruptcyPrice(uint256 positionId, uint256 bankruptcyPrice) external onlyModule {
        positions[positionId].bankruptcyPrice = bankruptcyPrice;
    }

    function setPositionMarginMode(uint256 positionId, MarginMode marginMode) external onlyModule {
        positions[positionId].marginMode = marginMode;
    }

    function setPositionMarketId(uint256 positionId, bytes32 marketId) external onlyModule {
        positions[positionId].marketId = marketId;
    }

    function setPositionSubAccountId(uint256 positionId, uint256 subAccountId) external onlyModule {
        positions[positionId].subAccountId = subAccountId;
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

    function subAccountExists(address trader, uint256 subAccountId) external view returns (bool) {
        return subAccounts[trader][subAccountId].exists;
    }

    function getSubAccount(address trader, uint256 subAccountId) external view returns (SubAccount memory) {
        require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        return subAccounts[trader][subAccountId];
    }

    function getTraderSubAccountIds(address trader) external view returns (uint256[] memory) {
        return traderSubAccountIds[trader];
    }

    function getSubAccountView(address trader, uint256 subAccountId) public view returns (SubAccountView memory) {
        SubAccount memory subAccount = subAccounts[trader][subAccountId];
        require(subAccount.exists, "Unknown sub-account");

        return SubAccountView({
            subAccountId: subAccountId,
            collateralToken: subAccount.collateralToken,
            collateralBalance: subAccount.collateralBalance,
            reservedMarginBalance: subAccount.reservedMarginBalance,
            marginMode: subAccount.marginMode,
            positionCount: 0,
            isDefault: hasDefaultSubAccount[trader] && defaultSubAccountId[trader] == subAccountId
        });
    }

    function getTraderSubAccounts(address trader) external view returns (SubAccountView[] memory) {
        uint256[] memory ids = traderSubAccountIds[trader];
        SubAccountView[] memory subAccountViews = new SubAccountView[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            subAccountViews[i] = getSubAccountView(trader, ids[i]);
        }

        return subAccountViews;
    }

    function setSpotBalance(
        address trader,
        uint256 subAccountId,
        bytes32 marketId,
        uint256 quantity,
        uint256 avgEntryPrice,
        uint256 reservedBase,
        uint256 reservedQuote,
        uint256 borrowLiability
    ) external onlyModule {
        require(trader != address(0), "Invalid trader");
        require(markets[marketId].exists, "Unknown market");

        if (subAccountId != LEGACY_SUBACCOUNT_ID) {
            require(subAccounts[trader][subAccountId].exists, "Unknown sub-account");
        }

        bool hasExposure = quantity > 0 || reservedBase > 0 || reservedQuote > 0 || borrowLiability > 0;
        SpotBalance storage spotBalance = spotBalances[trader][subAccountId][marketId];

        if (hasExposure && !spotBalance.exists) {
            traderSpotMarketIds[trader][subAccountId].push(marketId);
            traderSpotMarketIndexPlusOne[trader][subAccountId][marketId] = traderSpotMarketIds[trader][subAccountId].length;
        }

        if (!hasExposure) {
            if (spotBalance.exists) {
                _removeTraderSpotMarketId(trader, subAccountId, marketId);
            }
            delete spotBalances[trader][subAccountId][marketId];
            return;
        }

        spotBalance.exists = true;
        spotBalance.quantity = quantity;
        spotBalance.avgEntryPrice = avgEntryPrice;
        spotBalance.reservedBase = reservedBase;
        spotBalance.reservedQuote = reservedQuote;
        spotBalance.borrowLiability = borrowLiability;
    }

    function _removeTraderSpotMarketId(address trader, uint256 subAccountId, bytes32 marketId) internal {
        uint256 indexPlusOne = traderSpotMarketIndexPlusOne[trader][subAccountId][marketId];
        if (indexPlusOne == 0) {
            return;
        }

        bytes32[] storage trackedMarketIds = traderSpotMarketIds[trader][subAccountId];
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = trackedMarketIds.length - 1;

        if (index != lastIndex) {
            bytes32 lastMarketId = trackedMarketIds[lastIndex];
            trackedMarketIds[index] = lastMarketId;
            traderSpotMarketIndexPlusOne[trader][subAccountId][lastMarketId] = index + 1;
        }

        trackedMarketIds.pop();
        delete traderSpotMarketIndexPlusOne[trader][subAccountId][marketId];
    }

    function getSpotBalance(address trader, uint256 subAccountId, bytes32 marketId) external view returns (SpotBalance memory) {
        return spotBalances[trader][subAccountId][marketId];
    }

    function getTraderSpotMarketIds(address trader, uint256 subAccountId) external view returns (bytes32[] memory) {
        return traderSpotMarketIds[trader][subAccountId];
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

    // ============ OPTIONS DOMAIN ============

    function setNextOptionSeriesId(uint256 value) external onlyModule {
        nextOptionSeriesId = value;
    }

    function setNextOptionPositionId(uint256 value) external onlyModule {
        nextOptionPositionId = value;
    }

    function setOptionSeries(uint256 seriesId, OptionSeries calldata series) external onlyModule {
        optionSeries[seriesId] = series;
    }

    function setOptionSeriesStatus(uint256 seriesId, OptionSeriesStatus status) external onlyModule {
        optionSeries[seriesId].status = status;
    }

    function setOptionSeriesIvBps(uint256 seriesId, uint256 ivBps) external onlyModule {
        optionSeries[seriesId].ivBps = ivBps;
    }

    function getOptionSeries(uint256 seriesId) external view returns (OptionSeries memory) {
        return optionSeries[seriesId];
    }

    function setOptionPosition(uint256 positionId, OptionPosition calldata position) external onlyModule {
        optionPositions[positionId] = position;
    }

    function setOptionPositionActive(uint256 positionId, bool active) external onlyModule {
        optionPositions[positionId].active = active;
    }

    function setOptionPositionSettled(uint256 positionId, bool settled) external onlyModule {
        optionPositions[positionId].settled = settled;
    }

    function getOptionPosition(uint256 positionId) external view returns (OptionPosition memory) {
        return optionPositions[positionId];
    }

    function pushTraderOptionPosition(address trader, uint256 positionId) external onlyModule {
        traderOptionPositions[trader].push(positionId);
    }

    function setTraderOptionPositionAt(address trader, uint256 index, uint256 positionId) external onlyModule {
        traderOptionPositions[trader][index] = positionId;
    }

    function popTraderOptionPosition(address trader) external onlyModule {
        traderOptionPositions[trader].pop();
    }

    function getTraderOptionPositionsLength(address trader) external view returns (uint256) {
        return traderOptionPositions[trader].length;
    }

    function getTraderOptionPositions(address trader) external view returns (uint256[] memory) {
        return traderOptionPositions[trader];
    }

    function setTraderOptionPositionIndex(uint256 positionId, uint256 index) external onlyModule {
        traderOptionPositionIndexPlusOne[positionId] = index;
    }

    function getTraderOptionPositionIndex(uint256 positionId) external view returns (uint256) {
        return traderOptionPositionIndexPlusOne[positionId];
    }

    function deleteTraderOptionPositionIndex(uint256 positionId) external onlyModule {
        delete traderOptionPositionIndexPlusOne[positionId];
    }

    function removeTraderOptionPosition(address trader, uint256 positionId) external onlyModule {
        uint256 indexPlusOne = traderOptionPositionIndexPlusOne[positionId];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = traderOptionPositions[trader].length - 1;

        if (index != lastIndex) {
            uint256 lastPositionId = traderOptionPositions[trader][lastIndex];
            traderOptionPositions[trader][index] = lastPositionId;
            traderOptionPositionIndexPlusOne[lastPositionId] = index + 1;
        }

        traderOptionPositions[trader].pop();
        delete traderOptionPositionIndexPlusOne[positionId];
    }

    function setSeriesOpenInterestLong(uint256 seriesId, uint256 value) external onlyModule {
        seriesOpenInterestLong[seriesId] = value;
    }

    function setSeriesOpenInterestShort(uint256 seriesId, uint256 value) external onlyModule {
        seriesOpenInterestShort[seriesId] = value;
    }
}