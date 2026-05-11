// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../perps/storage/PerpStorage.sol";
import "../../shared/account/CollateralManager.sol";
import "../library/OptionsPricer.sol";

interface IOptionsMarkOracle {
    function getMarkPrice(bytes32 feedId) external view returns (uint256);
}

contract OptionsEngineModule {
    uint256 private constant WAD = 1e18;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant LEGACY_SUBACCOUNT_ID = type(uint256).max;

    PerpStorage public immutable perpStorage;
    CollateralManager public immutable collateralManager;
    OptionsPricerCore public optionsPricer;

    event OptionSeriesRegistered(
        uint256 indexed seriesId,
        bytes32 indexed marketId,
        bool isCall,
        uint256 strikePrice,
        uint256 expiry,
        uint256 ivBps,
        uint256 riskFreeRateBps,
        address collateralToken
    );
    event OptionSeriesExpired(uint256 indexed seriesId, uint256 expiryPrice);
    event OptionOpened(
        uint256 indexed positionId,
        uint256 indexed seriesId,
        address indexed trader,
        bool isLong,
        uint256 size,
        uint256 premium,
        uint256 marginLocked,
        uint256 subAccountId
    );
    event OptionSettled(
        uint256 indexed positionId,
        uint256 indexed seriesId,
        address indexed trader,
        bool isLong,
        uint256 payout,
        int256 deltaApplied
    );
    event OptionPositionTransferred(
        uint256 indexed positionId,
        uint256 indexed seriesId,
        address indexed oldOwner,
        address newOwner,
        uint256 salePrice,
        uint256 sellerFee,
        uint256 buyerFee,
        uint256 newSubAccountId
    );
    event OptionsPricerUpdated(address indexed oldPricer, address indexed newPricer);

    constructor(address _perpStorage, address _collateralManager, address _optionsPricer) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        optionsPricer = OptionsPricerCore(_optionsPricer);
    }

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    function setOptionsPricer(address newPricer) external onlyOwner {
        require(newPricer != address(0), "Invalid pricer");
        address old = address(optionsPricer);
        optionsPricer = OptionsPricerCore(newPricer);
        emit OptionsPricerUpdated(old, newPricer);
    }

    function registerOptionSeries(
        bytes32 marketId,
        bool isCall,
        uint256 strikePrice,
        uint256 expiry,
        uint256 ivBps,
        uint256 riskFreeRateBps,
        address collateralToken
    ) external onlyOwner returns (uint256 seriesId) {
        require(marketId != bytes32(0), "Invalid market");
        require(strikePrice > 0, "Invalid strike");
        require(expiry > block.timestamp, "Invalid expiry");
        require(ivBps > 0, "Invalid IV");
        require(collateralToken != address(0), "Invalid collateral token");

        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");

        seriesId = perpStorage.nextOptionSeriesId();
        perpStorage.setNextOptionSeriesId(seriesId + 1);

        PerpStorage.OptionSeries memory series = PerpStorage.OptionSeries({
            exists: true,
            isCall: isCall,
            marketId: marketId,
            strikePrice: strikePrice,
            expiry: expiry,
            ivBps: ivBps,
            riskFreeRateBps: riskFreeRateBps,
            collateralToken: collateralToken,
            status: PerpStorage.OptionSeriesStatus.Active
        });

        perpStorage.setOptionSeries(seriesId, series);

        emit OptionSeriesRegistered(
            seriesId,
            marketId,
            isCall,
            strikePrice,
            expiry,
            ivBps,
            riskFreeRateBps,
            collateralToken
        );
    }

    function openLongOption(uint256 seriesId, uint256 size) external notPaused returns (uint256 positionId) {
        return _openLongOption(seriesId, size, LEGACY_SUBACCOUNT_ID);
    }

    function openLongOptionForSubAccount(
        uint256 seriesId,
        uint256 size,
        uint256 subAccountId
    ) external notPaused returns (uint256 positionId) {
        return _openLongOption(seriesId, size, subAccountId);
    }

    function openShortOption(uint256 seriesId, uint256 size) external notPaused returns (uint256 positionId) {
        return _openShortOption(seriesId, size, LEGACY_SUBACCOUNT_ID);
    }

    function openShortOptionForSubAccount(
        uint256 seriesId,
        uint256 size,
        uint256 subAccountId
    ) external notPaused returns (uint256 positionId) {
        return _openShortOption(seriesId, size, subAccountId);
    }

    function expireSeries(uint256 seriesId) external {
        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(seriesId);
        require(series.exists, "Unknown series");
        require(series.status == PerpStorage.OptionSeriesStatus.Active, "Series not active");
        require(block.timestamp >= series.expiry, "Series not expired");

        perpStorage.setOptionSeriesStatus(seriesId, PerpStorage.OptionSeriesStatus.Expired);

        uint256 spot = _getSpotPrice(series.marketId);
        emit OptionSeriesExpired(seriesId, spot);
    }

    function settleOption(uint256 positionId) external {
        PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(positionId);
        require(position.active, "Position not active");
        require(!position.settled, "Already settled");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(position.seriesId);
        require(series.exists, "Unknown series");
        require(block.timestamp >= series.expiry, "Series not expired");

        if (series.status == PerpStorage.OptionSeriesStatus.Active) {
            perpStorage.setOptionSeriesStatus(position.seriesId, PerpStorage.OptionSeriesStatus.Expired);
        }

        uint256 spot = _getSpotPrice(series.marketId);
        uint256 intrinsicPerUnit = _intrinsicValue(series.isCall, series.strikePrice, spot);
        uint256 payout = (intrinsicPerUnit * position.size) / WAD;
        uint256 exerciseFee = payout > 0
            ? (payout * perpStorage.optionExerciseFeeBps()) / BPS_DENOMINATOR
            : 0;

        int256 deltaApplied;
        if (position.isLong) {
            if (payout > 0) {
                uint256 netPayout = payout > exerciseFee ? payout - exerciseFee : 0;
                if (netPayout > 0) {
                    _applyDelta(position.trader, position.subAccountId, int256(netPayout));
                    deltaApplied = int256(netPayout);
                }
                _collectOptionFee(position.trader, position.subAccountId, exerciseFee);
            }
            uint256 longOi = perpStorage.seriesOpenInterestLong(position.seriesId);
            perpStorage.setSeriesOpenInterestLong(position.seriesId, longOi - position.size);
        } else {
            if (payout > 0) {
                uint256 netPayout = payout > exerciseFee ? payout - exerciseFee : 0;
                if (netPayout > 0) {
                    _applyDelta(position.trader, position.subAccountId, -int256(netPayout));
                    deltaApplied = -int256(netPayout);
                }
                _collectOptionFee(position.trader, position.subAccountId, exerciseFee);
            }

            _releaseWriterMargin(position.trader, position.subAccountId, position.marginLocked);

            uint256 shortOi = perpStorage.seriesOpenInterestShort(position.seriesId);
            perpStorage.setSeriesOpenInterestShort(position.seriesId, shortOi - position.size);
        }

        perpStorage.setOptionPositionActive(positionId, false);
        perpStorage.setOptionPositionSettled(positionId, true);

        emit OptionSettled(
            positionId,
            position.seriesId,
            position.trader,
            position.isLong,
            payout,
            deltaApplied
        );

        if (
            perpStorage.seriesOpenInterestLong(position.seriesId) == 0
                && perpStorage.seriesOpenInterestShort(position.seriesId) == 0
                && perpStorage.getOptionSeries(position.seriesId).status == PerpStorage.OptionSeriesStatus.Expired
        ) {
            perpStorage.setOptionSeriesStatus(position.seriesId, PerpStorage.OptionSeriesStatus.Settled);
        }
    }

    function transferOptionPosition(
        uint256 positionId,
        address newOwner,
        uint256 salePrice
    ) external notPaused {
        _transferOptionPosition(positionId, newOwner, LEGACY_SUBACCOUNT_ID, salePrice);
    }

    function transferOptionPositionForSubAccount(
        uint256 positionId,
        address newOwner,
        uint256 newSubAccountId,
        uint256 salePrice
    ) external notPaused {
        _transferOptionPosition(positionId, newOwner, newSubAccountId, salePrice);
    }

    function _openLongOption(uint256 seriesId, uint256 size, uint256 subAccountId) internal returns (uint256 positionId) {
        require(size > 0, "Invalid size");
        require(!perpStorage.frozenAccounts(msg.sender), "Account frozen");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(seriesId);
        require(series.exists, "Unknown series");
        require(series.status == PerpStorage.OptionSeriesStatus.Active, "Series not active");
        require(block.timestamp < series.expiry, "Series expired");
        _validateSettlementToken(series.collateralToken, msg.sender, subAccountId);

        uint256 spot = _getSpotPrice(series.marketId);
        uint256 premiumPerUnit = optionsPricer.getMarkPremium(
            series.isCall,
            series.strikePrice,
            spot,
            series.expiry - block.timestamp,
            series.ivBps,
            series.riskFreeRateBps
        );
        uint256 premium = (premiumPerUnit * size) / WAD;
        uint256 notional = (series.strikePrice * size) / WAD;
        uint256 creationFee = (notional * perpStorage.optionCreationFeeBps()) / BPS_DENOMINATOR;

        _ensureAndCharge(msg.sender, subAccountId, premium, creationFee);

        positionId = perpStorage.nextOptionPositionId();
        perpStorage.setNextOptionPositionId(positionId + 1);

        PerpStorage.OptionPosition memory position = PerpStorage.OptionPosition({
            trader: msg.sender,
            seriesId: seriesId,
            size: size,
            premium: premium,
            marginLocked: 0,
            subAccountId: subAccountId,
            isLong: true,
            active: true,
            settled: false
        });

        perpStorage.setOptionPosition(positionId, position);
        perpStorage.pushTraderOptionPosition(msg.sender, positionId);
        perpStorage.setTraderOptionPositionIndex(positionId, perpStorage.getTraderOptionPositionsLength(msg.sender));
        perpStorage.setSeriesOpenInterestLong(seriesId, perpStorage.seriesOpenInterestLong(seriesId) + size);

        emit OptionOpened(positionId, seriesId, msg.sender, true, size, premium, 0, subAccountId);
    }

    function _openShortOption(uint256 seriesId, uint256 size, uint256 subAccountId) internal returns (uint256 positionId) {
        require(size > 0, "Invalid size");
        require(!perpStorage.frozenAccounts(msg.sender), "Account frozen");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(seriesId);
        require(series.exists, "Unknown series");
        require(series.status == PerpStorage.OptionSeriesStatus.Active, "Series not active");
        require(block.timestamp < series.expiry, "Series expired");
        _validateSettlementToken(series.collateralToken, msg.sender, subAccountId);

        uint256 spot = _getSpotPrice(series.marketId);
        uint256 writerMargin = optionsPricer.getWriterMargin(
            series.isCall,
            series.strikePrice,
            size,
            spot,
            series.expiry - block.timestamp,
            series.ivBps,
            series.riskFreeRateBps
        );
        uint256 notional = (series.strikePrice * size) / WAD;
        uint256 creationFee = (notional * perpStorage.optionCreationFeeBps()) / BPS_DENOMINATOR;

        _ensureAndReserve(msg.sender, subAccountId, writerMargin, creationFee);

        positionId = perpStorage.nextOptionPositionId();
        perpStorage.setNextOptionPositionId(positionId + 1);

        PerpStorage.OptionPosition memory position = PerpStorage.OptionPosition({
            trader: msg.sender,
            seriesId: seriesId,
            size: size,
            premium: 0,
            marginLocked: writerMargin,
            subAccountId: subAccountId,
            isLong: false,
            active: true,
            settled: false
        });

        perpStorage.setOptionPosition(positionId, position);
        perpStorage.pushTraderOptionPosition(msg.sender, positionId);
        perpStorage.setTraderOptionPositionIndex(positionId, perpStorage.getTraderOptionPositionsLength(msg.sender));
        perpStorage.setSeriesOpenInterestShort(seriesId, perpStorage.seriesOpenInterestShort(seriesId) + size);

        emit OptionOpened(positionId, seriesId, msg.sender, false, size, 0, writerMargin, subAccountId);
    }

    function _transferOptionPosition(
        uint256 positionId,
        address newOwner,
        uint256 newSubAccountId,
        uint256 salePrice
    ) internal {
        require(newOwner != address(0), "Invalid new owner");

        PerpStorage.OptionPosition memory position = perpStorage.getOptionPosition(positionId);
        require(position.active, "Position not active");
        require(!position.settled, "Already settled");
        require(msg.sender == position.trader, "Only owner can transfer");
        require(newOwner != position.trader, "New owner must differ");
        require(!perpStorage.frozenAccounts(position.trader), "Account frozen");
        require(!perpStorage.frozenAccounts(newOwner), "Account frozen");

        PerpStorage.OptionSeries memory series = perpStorage.getOptionSeries(position.seriesId);
        require(series.exists, "Unknown series");
        _validateSettlementToken(series.collateralToken, newOwner, newSubAccountId);

        uint256 sellerFee = (salePrice * perpStorage.optionSecondaryTransferFeeBps()) / BPS_DENOMINATOR;
        uint256 buyerFee = sellerFee;

        uint256 buyerRequired = salePrice + buyerFee;
        if (!position.isLong) {
            buyerRequired += position.marginLocked;
        }

        _ensureBuyerCapacity(newOwner, newSubAccountId, buyerRequired);
        _debitCollateral(newOwner, newSubAccountId, salePrice + buyerFee);
        _creditCollateral(position.trader, position.subAccountId, salePrice);
        _debitCollateral(position.trader, position.subAccountId, sellerFee);
        perpStorage.setFeePool(perpStorage.feePool() + sellerFee + buyerFee);

        if (!position.isLong && position.marginLocked > 0) {
            _releaseWriterMargin(position.trader, position.subAccountId, position.marginLocked);

            if (newSubAccountId == LEGACY_SUBACCOUNT_ID) {
                collateralManager.addReservedMargin(newOwner, position.marginLocked);
            } else {
                collateralManager.addReservedMarginForSubAccount(newOwner, newSubAccountId, position.marginLocked);
            }
        }

        perpStorage.removeTraderOptionPosition(position.trader, positionId);
        perpStorage.pushTraderOptionPosition(newOwner, positionId);
        perpStorage.setTraderOptionPositionIndex(positionId, perpStorage.getTraderOptionPositionsLength(newOwner));

        position.trader = newOwner;
        position.subAccountId = newSubAccountId;
        perpStorage.setOptionPosition(positionId, position);

        emit OptionPositionTransferred(
            positionId,
            position.seriesId,
            msg.sender,
            newOwner,
            salePrice,
            sellerFee,
            buyerFee,
            newSubAccountId
        );
    }

    function _validateSettlementToken(address expectedCollateralToken, address trader, uint256 subAccountId) internal view {
        require(_getSettlementToken(trader, subAccountId) == expectedCollateralToken, "Settlement token mismatch");
    }

    function _getSettlementToken(address trader, uint256 subAccountId) internal view returns (address) {
        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            return address(perpStorage.collateral());
        }

        return perpStorage.getSubAccount(trader, subAccountId).collateralToken;
    }

    function _ensureAndCharge(address trader, uint256 subAccountId, uint256 premium, uint256 creationFee) internal {
        uint256 totalCharge = premium + creationFee;
        if (totalCharge == 0) return;

        if (perpStorage.jitModeEnabled()) {
            collateralManager.pullCollateralFromWalletForSubAccount(trader, subAccountId, totalCharge);
        }

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            collateralManager.requireAvailableCollateral(trader, totalCharge);
            perpStorage.setAccountCollateral(trader, perpStorage.accountCollateral(trader) - totalCharge);
            perpStorage.setFeePool(perpStorage.feePool() + creationFee);
        } else {
            collateralManager.requireAvailableCollateralForSubAccount(trader, subAccountId, totalCharge);
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance - totalCharge);
            perpStorage.setFeePool(perpStorage.feePool() + creationFee);
        }
    }

    function _ensureAndReserve(address trader, uint256 subAccountId, uint256 writerMargin, uint256 creationFee) internal {
        uint256 totalRequired = writerMargin + creationFee;
        if (totalRequired == 0) return;

        if (perpStorage.jitModeEnabled()) {
            collateralManager.pullCollateralFromWalletForSubAccount(trader, subAccountId, totalRequired);
        }

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            collateralManager.requireAvailableCollateral(trader, totalRequired);
            collateralManager.addReservedMargin(trader, writerMargin);
            perpStorage.setAccountCollateral(trader, perpStorage.accountCollateral(trader) - creationFee);
            perpStorage.setFeePool(perpStorage.feePool() + creationFee);
        } else {
            collateralManager.requireAvailableCollateralForSubAccount(trader, subAccountId, totalRequired);
            collateralManager.addReservedMarginForSubAccount(trader, subAccountId, writerMargin);
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance - creationFee);
            perpStorage.setFeePool(perpStorage.feePool() + creationFee);
        }
    }

    function _releaseWriterMargin(address trader, uint256 subAccountId, uint256 amount) internal {
        if (amount == 0) return;

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            collateralManager.removeReservedMargin(trader, amount);
        } else {
            collateralManager.removeReservedMarginForSubAccount(trader, subAccountId, amount);
        }
    }

    function _applyDelta(address trader, uint256 subAccountId, int256 delta) internal {
        if (delta == 0) return;

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            collateralManager.applyAccountDelta(trader, delta);
        } else {
            collateralManager.applyAccountDeltaForSubAccount(trader, subAccountId, delta);
        }
    }

    function _getSpotPrice(bytes32 marketId) internal view returns (uint256) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");
        require(market.feedId != bytes32(0), "Invalid market feed");

        uint256 spot = IOptionsMarkOracle(perpStorage.markOracle()).getMarkPrice(market.feedId);
        require(spot > 0, "Invalid spot");
        return spot;
    }

    function _intrinsicValue(bool isCall, uint256 strikePrice, uint256 spotPrice) internal pure returns (uint256) {
        if (isCall) {
            return spotPrice > strikePrice ? spotPrice - strikePrice : 0;
        }
        return strikePrice > spotPrice ? strikePrice - spotPrice : 0;
    }

    function _collectOptionFee(address trader, uint256 subAccountId, uint256 fee) internal {
        if (fee == 0) return;

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            uint256 current = perpStorage.accountCollateral(trader);
            require(current >= fee, "Insufficient collateral for option fee");
            perpStorage.setAccountCollateral(trader, current - fee);
        } else {
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            require(subAccount.collateralBalance >= fee, "Insufficient collateral for option fee");
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance - fee);
        }

        perpStorage.setFeePool(perpStorage.feePool() + fee);
    }

    function _ensureBuyerCapacity(address trader, uint256 subAccountId, uint256 required) internal {
        if (required == 0) return;

        if (perpStorage.jitModeEnabled()) {
            uint256 available = subAccountId == LEGACY_SUBACCOUNT_ID
                ? collateralManager.getAvailableCollateral(trader)
                : collateralManager.getAvailableCollateralForSubAccount(trader, subAccountId);

            if (available < required) {
                collateralManager.pullCollateralFromWalletForSubAccount(trader, subAccountId, required - available);
            }
        }

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            collateralManager.requireAvailableCollateral(trader, required);
        } else {
            collateralManager.requireAvailableCollateralForSubAccount(trader, subAccountId, required);
        }
    }

    function _debitCollateral(address trader, uint256 subAccountId, uint256 amount) internal {
        if (amount == 0) return;

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            uint256 current = perpStorage.accountCollateral(trader);
            require(current >= amount, "Insufficient collateral");
            perpStorage.setAccountCollateral(trader, current - amount);
        } else {
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            require(subAccount.collateralBalance >= amount, "Insufficient collateral");
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance - amount);
        }
    }

    function _creditCollateral(address trader, uint256 subAccountId, uint256 amount) internal {
        if (amount == 0) return;

        if (subAccountId == LEGACY_SUBACCOUNT_ID) {
            perpStorage.setAccountCollateral(trader, perpStorage.accountCollateral(trader) + amount);
        } else {
            PerpStorage.SubAccount memory subAccount = perpStorage.getSubAccount(trader, subAccountId);
            perpStorage.setSubAccountCollateralBalance(trader, subAccountId, subAccount.collateralBalance + amount);
        }
    }
}
