// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IInsuranceFund {
    function deposit(uint256 amount) external;
}

interface IMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}

contract PerpSettlement is EIP712, Ownable {

    using ECDSA for bytes32;

    IERC20 public immutable collateral;
    IInsuranceFund public insuranceFund;
    IMarkOracle public markOracle;
    bytes32 public marketFeedId;

    uint256 public makerFeeBps = 5;
    uint256 public takerFeeBps = 10;
    uint256 public insuranceBps = 200; // 2%
    uint256 public maintenanceMarginBps = 1000; // 10%
    uint256 public liquidationRewardBps = 500; // 5%

    uint256 public feePool;

    int256 public cumulativeFundingLong;
    int256 public cumulativeFundingShort;

    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(address trader,uint8 side,uint256 exposure,uint256 leverage,uint256 limitPrice,uint256 expiry,uint256 nonce)"
        );

    struct Order {
        address trader;
        uint8 side; // 0 long, 1 short
        uint256 exposure;
        uint256 leverage;
        uint256 limitPrice;
        uint256 expiry;
        uint256 nonce;
    }

    struct Position {
        address trader;
        uint8 side;
        uint256 exposure;
        uint256 leverage;
        uint256 margin;
        uint256 entryPrice;
        int256 entryFunding;
        bool active;
    }

    mapping(bytes32 => bool) public usedOrderHash;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256) public accountCollateral;
    mapping(address => uint256) public reservedMargin;
    uint256 public nextPositionId;

    event PositionOpened(uint256 id, address trader, uint8 side, uint256 exposure, uint256 entryPrice, uint256 margin);
    event PositionClosed(uint256 id, address trader, int256 pnl, int256 funding);
    event PositionLiquidated(uint256 id, address trader, address liquidator, uint256 reward, uint256 badDebt);
    event MatchSettled(address longTrader, address shortTrader, uint256 size);
    event FundingUpdated(int256 longFunding, int256 shortFunding);
    event CollateralDeposited(address indexed trader, uint256 amount);
    event CollateralWithdrawn(address indexed trader, uint256 amount);
    event RiskParamsUpdated(uint256 maintenanceMarginBps, uint256 liquidationRewardBps);
    event OracleUpdated(address oracle, bytes32 feedId);

    constructor(address _collateral, address _insurance, address _oracle, bytes32 _feedId)
        EIP712("PerpSettlement", "1")
        Ownable(msg.sender)
    {
        collateral = IERC20(_collateral);
        insuranceFund = IInsuranceFund(_insurance);
        markOracle = IMarkOracle(_oracle);
        marketFeedId = _feedId;
    }

    function setOracle(address _oracle, bytes32 _feedId) external onlyOwner {
        require(_oracle != address(0), "bad oracle");
        markOracle = IMarkOracle(_oracle);
        marketFeedId = _feedId;
        emit OracleUpdated(_oracle, _feedId);
    }

    function setRiskParams(uint256 _maintenanceMarginBps, uint256 _liquidationRewardBps) external onlyOwner {
        require(_maintenanceMarginBps <= 5000, "maintenance too high");
        require(_liquidationRewardBps <= 2000, "liq reward too high");
        maintenanceMarginBps = _maintenanceMarginBps;
        liquidationRewardBps = _liquidationRewardBps;
        emit RiskParamsUpdated(_maintenanceMarginBps, _liquidationRewardBps);
    }

    function depositCollateral(uint256 amount) external {
        require(amount > 0, "bad amount");
        collateral.transferFrom(msg.sender, address(this), amount);
        accountCollateral[msg.sender] += amount;
        emit CollateralDeposited(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "bad amount");
        require(getAvailableCollateral(msg.sender) >= amount, "insufficient available");
        accountCollateral[msg.sender] -= amount;
        collateral.transfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    function getAvailableCollateral(address trader) public view returns (uint256) {
        uint256 balance = accountCollateral[trader];
        uint256 reserved = reservedMargin[trader];
        return balance > reserved ? balance - reserved : 0;
    }

    function getMarkPrice() public view returns (uint256) {
        uint256 mark = markOracle.getMarkPrice(marketFeedId);
        require(mark > 0, "bad mark");
        return mark;
    }

    // ========================
    // MATCH SETTLEMENT
    // ========================

    function settleMatch(
        Order calldata longOrder,
        bytes calldata longSig,
        Order calldata shortOrder,
        bytes calldata shortSig,
        uint256 matchSize
    ) external {

        require(longOrder.side == 0, "Not long");
        require(shortOrder.side == 1, "Not short");

        require(block.timestamp <= longOrder.expiry, "Long expired");
        require(block.timestamp <= shortOrder.expiry, "Short expired");

        bytes32 longHash = _hashOrder(longOrder);
        bytes32 shortHash = _hashOrder(shortOrder);

        require(!usedOrderHash[longHash], "Long used");
        require(!usedOrderHash[shortHash], "Short used");

        require(_verify(longOrder, longSig), "Bad long sig");
        require(_verify(shortOrder, shortSig), "Bad short sig");

        require(longOrder.leverage > 0, "bad long lev");
        require(shortOrder.leverage > 0, "bad short lev");

        usedOrderHash[longHash] = true;
        usedOrderHash[shortHash] = true;

        uint256 fee = (matchSize * takerFeeBps) / 10000;
        uint256 insuranceCut = (matchSize * insuranceBps) / 10000;
        uint256 longMargin = (matchSize + longOrder.leverage - 1) / longOrder.leverage;
        uint256 shortMargin = (matchSize + shortOrder.leverage - 1) / shortOrder.leverage;

        _requireAvailableCollateral(longOrder.trader, longMargin + fee + insuranceCut);
        _requireAvailableCollateral(shortOrder.trader, shortMargin + fee + insuranceCut);

        _applyTradingCharges(longOrder.trader, fee, insuranceCut);
        _applyTradingCharges(shortOrder.trader, fee, insuranceCut);

        uint256 entryPrice = (longOrder.limitPrice + shortOrder.limitPrice) / 2;
        if (entryPrice == 0) {
            entryPrice = getMarkPrice();
        }

        _openPosition(longOrder.trader, 0, matchSize, longOrder.leverage, longMargin, entryPrice);
        _openPosition(shortOrder.trader, 1, matchSize, shortOrder.leverage, shortMargin, entryPrice);

        emit MatchSettled(longOrder.trader, shortOrder.trader, matchSize);
    }

    function _openPosition(
        address trader,
        uint8 side,
        uint256 exposure,
        uint256 leverage,
        uint256 margin,
        uint256 entryPrice
    ) internal {

        reservedMargin[trader] += margin;

        int256 fundingSnapshot = side == 0 ? cumulativeFundingLong : cumulativeFundingShort;

        positions[nextPositionId] = Position({
            trader: trader,
            side: side,
            exposure: exposure,
            leverage: leverage,
            margin: margin,
            entryPrice: entryPrice,
            entryFunding: fundingSnapshot,
            active: true
        });

        emit PositionOpened(nextPositionId, trader, side, exposure, entryPrice, margin);
        nextPositionId++;
    }

    // ========================
    // CLOSE POSITION
    // ========================

    function closePosition(uint256 id) external {
        Position storage p = positions[id];
        require(p.active, "Inactive");
        require(p.trader == msg.sender, "Not owner");

        uint256 markPrice = getMarkPrice();
        (int256 pnl, int256 funding) = _computePositionPnlAndFunding(p, markPrice);
        int256 netDelta = pnl - funding;

        p.active = false;
        reservedMargin[p.trader] -= p.margin;

        _applyAccountDelta(p.trader, netDelta);

        emit PositionClosed(id, p.trader, pnl, funding);
    }

    function liquidate(uint256 positionId) external {
        _liquidateWithMark(positionId, getMarkPrice(), msg.sender);
    }

    function liquidateWithPrice(uint256 positionId, uint256 markPrice) external onlyOwner {
        _liquidateWithMark(positionId, markPrice, msg.sender);
    }

    function _liquidateWithMark(uint256 positionId, uint256 markPrice, address liquidator) internal {
        Position storage p = positions[positionId];
        require(p.active, "Inactive");

        (int256 pnl, int256 funding) = _computePositionPnlAndFunding(p, markPrice);
        int256 netDelta = pnl - funding;

        int256 equity = int256(p.margin) + netDelta;
        uint256 maintenanceMargin = (p.exposure * maintenanceMarginBps) / 10000;
        require(equity < int256(maintenanceMargin), "Position healthy");

        p.active = false;
        reservedMargin[p.trader] -= p.margin;

        uint256 badDebt = _applyAccountDelta(p.trader, netDelta);

        uint256 reward = (p.margin * liquidationRewardBps) / 10000;
        uint256 available = getAvailableCollateral(p.trader);
        if (reward > available) {
            reward = available;
        }

        if (reward > 0) {
            accountCollateral[p.trader] -= reward;
            collateral.transfer(liquidator, reward);
        }

        emit PositionLiquidated(positionId, p.trader, liquidator, reward, badDebt);
    }


    // ========================
    // FUNDING UPDATE
    // ========================

    function updateFunding(int256 longFunding, int256 shortFunding) external onlyOwner {
        cumulativeFundingLong += longFunding;
        cumulativeFundingShort += shortFunding;
        emit FundingUpdated(longFunding, shortFunding);
    }

    function _computePositionPnlAndFunding(Position storage p, uint256 markPrice)
        internal
        view
        returns (int256 pnl, int256 funding)
    {
        require(p.entryPrice > 0, "bad entry");

        int256 exposure = int256(p.exposure);
        int256 mark = int256(markPrice);
        int256 entry = int256(p.entryPrice);

        if (p.side == 0) {
            pnl = (exposure * (mark - entry)) / entry;
            funding = (exposure * (cumulativeFundingLong - p.entryFunding)) / 1e18;
        } else {
            pnl = (exposure * (entry - mark)) / entry;
            funding = (exposure * (cumulativeFundingShort - p.entryFunding)) / 1e18;
        }
    }

    function _applyAccountDelta(address trader, int256 delta) internal returns (uint256 badDebt) {
        if (delta >= 0) {
            accountCollateral[trader] += uint256(delta);
            return 0;
        }

        uint256 loss = uint256(-delta);
        uint256 balance = accountCollateral[trader];

        if (loss >= balance) {
            badDebt = loss - balance;
            accountCollateral[trader] = 0;
            return badDebt;
        }

        accountCollateral[trader] = balance - loss;
        return 0;
    }

    function _requireAvailableCollateral(address trader, uint256 amount) internal view {
        require(getAvailableCollateral(trader) >= amount, "insufficient collateral");
    }

    function _applyTradingCharges(address trader, uint256 fee, uint256 insuranceCut) internal {
        uint256 totalCharge = fee + insuranceCut;
        accountCollateral[trader] -= totalCharge;
        feePool += fee;

        if (insuranceCut > 0) {
            collateral.approve(address(insuranceFund), insuranceCut);
            insuranceFund.deposit(insuranceCut);
        }
    }

    // ========================
    // SIGNATURE VERIFICATION
    // ========================

    function _hashOrder(Order calldata order) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.trader,
                    order.side,
                    order.exposure,
                    order.leverage,
                    order.limitPrice,
                    order.expiry,
                    order.nonce
                )
            )
        );
    }

    function _verify(Order calldata order, bytes calldata signature)
        internal
        view
        returns (bool)
    {
        address signer = _hashOrder(order).recover(signature);
        return signer == order.trader;
    }

    // ========================
    // FEE WITHDRAWAL
    // ========================

    function withdrawFees(address to, uint256 amount) external onlyOwner {
        require(amount <= feePool, "Too much");
        feePool -= amount;
        collateral.transfer(to, amount);
    }
}