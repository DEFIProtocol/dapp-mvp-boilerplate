// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../perps/storage/PerpStorage.sol";
import "../../perps/library/FeeLib.sol";
import "../../shared/account/CollateralManager.sol";

/**
 * @title SpotEngine
 * @notice Matched 1x spot settlement engine integrated with shared cross-margin accounting
 * @dev Spot inventory is stored in `PerpStorage.SpotBalance` and reuses CollateralManager fee routing.
 */
contract SpotEngine {
    uint256 private constant LEGACY_SUBACCOUNT_ID = type(uint256).max;

    PerpStorage public immutable perpStorage;
    CollateralManager public immutable collateralManager;

    event SpotMatchSettled(
        bytes32 indexed marketId,
        address indexed buyer,
        address indexed seller,
        uint256 buyerSubAccountId,
        uint256 sellerSubAccountId,
        uint256 quantity,
        uint256 price,
        uint256 quoteAmount,
        uint256 buyerFee,
        uint256 sellerFee
    );

    constructor(address _perpStorage, address _collateralManager) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    modifier onlyModuleOrOwner() {
        require(
            perpStorage.authorizedModules(msg.sender) || msg.sender == perpStorage.owner(),
            "Only modules can call"
        );
        _;
    }

    function settleSpotMatch(
        address buyer,
        uint256 buyerSubAccountId,
        address seller,
        uint256 sellerSubAccountId,
        bytes32 marketId,
        uint256 quantity,
        uint256 price,
        bool buyerIsTaker
    ) external notPaused onlyModuleOrOwner returns (uint256 quoteAmount) {
        require(buyer != address(0) && seller != address(0), "Invalid trader");
        require(buyer != seller, "Self match not allowed");
        require(quantity > 0, "Invalid quantity");
        require(price > 0, "Invalid price");

        bytes32 resolvedMarketId = marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");
        require(market.enabled, "Market disabled");
        require(!market.paused, "Market paused");
        require(!perpStorage.frozenAccounts(buyer) && !perpStorage.frozenAccounts(seller), "Account frozen");

        _requireCompatibleSettlementTokens(buyer, buyerSubAccountId, seller, sellerSubAccountId);

        quoteAmount = (quantity * price) / 1e18;
        require(quoteAmount > 0, "Quote too small");

        (uint256 buyerFee, uint256 sellerFee) = previewSpotFees(resolvedMarketId, quoteAmount, buyerIsTaker);

        uint256 buyerAvailable = _getAvailableCollateral(buyer, buyerSubAccountId);
        require(buyerAvailable >= quoteAmount + buyerFee, "Buyer insufficient collateral");

        PerpStorage.SpotBalance memory sellerBalance = perpStorage.getSpotBalance(seller, sellerSubAccountId, resolvedMarketId);
        require(sellerBalance.exists, "Seller has no spot balance");
        require(sellerBalance.quantity >= sellerBalance.reservedBase + quantity, "Seller insufficient spot inventory");

        uint256 buyerCollateralBalance = _getCollateralBalance(buyer, buyerSubAccountId);
        uint256 sellerCollateralBalance = _getCollateralBalance(seller, sellerSubAccountId);

        // Move quote collateral between the two parties first.
        _setCollateralBalance(buyer, buyerSubAccountId, buyerCollateralBalance - quoteAmount);
        _setCollateralBalance(seller, sellerSubAccountId, sellerCollateralBalance + quoteAmount);

        // Then charge product fees through the shared collateral manager so feePool/protocol routing stays unified.
        if (buyerFee > 0) {
            collateralManager.chargeTradingFeesForSubAccount(
                buyer,
                buyerSubAccountId,
                quoteAmount,
                !buyerIsTaker,
                resolvedMarketId
            );
        }

        if (sellerFee > 0) {
            collateralManager.chargeTradingFeesForSubAccount(
                seller,
                sellerSubAccountId,
                quoteAmount,
                buyerIsTaker,
                resolvedMarketId
            );
        }

        _increaseSpotBalance(buyer, buyerSubAccountId, resolvedMarketId, quantity, price);
        _decreaseSpotBalance(seller, sellerSubAccountId, resolvedMarketId, quantity);

        emit SpotMatchSettled(
            resolvedMarketId,
            buyer,
            seller,
            buyerSubAccountId,
            sellerSubAccountId,
            quantity,
            price,
            quoteAmount,
            buyerFee,
            sellerFee
        );
    }

    function previewSpotFees(
        bytes32 marketId,
        uint256 quoteAmount,
        bool buyerIsTaker
    ) public view returns (uint256 buyerFee, uint256 sellerFee) {
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(marketId);
        require(market.exists, "Unknown market");

        (uint256 makerFee, uint256 takerFee, ) = FeeLib.calculateTradingFees(
            quoteAmount,
            market.makerFeeBps,
            market.takerFeeBps,
            perpStorage.insuranceBps()
        );

        buyerFee = buyerIsTaker ? takerFee : makerFee;
        sellerFee = buyerIsTaker ? makerFee : takerFee;
    }

    function _increaseSpotBalance(
        address trader,
        uint256 subAccountId,
        bytes32 marketId,
        uint256 quantityDelta,
        uint256 executionPrice
    ) internal {
        PerpStorage.SpotBalance memory current = perpStorage.getSpotBalance(trader, subAccountId, marketId);
        uint256 newQuantity = current.quantity + quantityDelta;
        uint256 newAvgEntryPrice = newQuantity == 0
            ? 0
            : ((current.quantity * current.avgEntryPrice) + (quantityDelta * executionPrice)) / newQuantity;

        perpStorage.setSpotBalance(
            trader,
            subAccountId,
            marketId,
            newQuantity,
            newAvgEntryPrice,
            current.reservedBase,
            current.reservedQuote,
            current.borrowLiability
        );
    }

    function _decreaseSpotBalance(
        address trader,
        uint256 subAccountId,
        bytes32 marketId,
        uint256 quantityDelta
    ) internal {
        PerpStorage.SpotBalance memory current = perpStorage.getSpotBalance(trader, subAccountId, marketId);
        require(current.quantity >= quantityDelta, "Spot quantity underflow");

        uint256 newQuantity = current.quantity - quantityDelta;
        uint256 nextEntryPrice = newQuantity == 0 ? 0 : current.avgEntryPrice;

        perpStorage.setSpotBalance(
            trader,
            subAccountId,
            marketId,
            newQuantity,
            nextEntryPrice,
            current.reservedBase,
            current.reservedQuote,
            current.borrowLiability
        );
    }

    function _requireCompatibleSettlementTokens(
        address buyer,
        uint256 buyerSubAccountId,
        address seller,
        uint256 sellerSubAccountId
    ) internal view {
        require(
            _getSettlementToken(buyer, buyerSubAccountId) == _getSettlementToken(seller, sellerSubAccountId),
            "Settlement token mismatch"
        );
    }

    function _getSettlementToken(address trader, uint256 subAccountId) internal view returns (address) {
        if (_isLegacySubAccount(subAccountId)) {
            return address(perpStorage.collateral());
        }

        return perpStorage.getSubAccount(trader, subAccountId).collateralToken;
    }

    function _isLegacySubAccount(uint256 subAccountId) internal pure returns (bool) {
        return subAccountId == LEGACY_SUBACCOUNT_ID;
    }

    function _getAvailableCollateral(address trader, uint256 subAccountId) internal view returns (uint256) {
        if (_isLegacySubAccount(subAccountId)) {
            return collateralManager.getAvailableCollateral(trader);
        }

        return collateralManager.getAvailableCollateralForSubAccount(trader, subAccountId);
    }

    function _getCollateralBalance(address trader, uint256 subAccountId) internal view returns (uint256) {
        if (_isLegacySubAccount(subAccountId)) {
            return perpStorage.accountCollateral(trader);
        }

        return perpStorage.getSubAccount(trader, subAccountId).collateralBalance;
    }

    function _setCollateralBalance(address trader, uint256 subAccountId, uint256 amount) internal {
        if (_isLegacySubAccount(subAccountId)) {
            perpStorage.setAccountCollateral(trader, amount);
            return;
        }

        perpStorage.setSubAccountCollateralBalance(trader, subAccountId, amount);
    }
}
