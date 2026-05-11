// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../perps/storage/PerpStorage.sol";

contract SubAccountManager {
    PerpStorage public perpStorage;

    event SubAccountCreated(
        address indexed trader,
        uint256 indexed subAccountId,
        address indexed collateralToken,
        PerpStorage.MarginMode marginMode
    );
    event DefaultSubAccountUpdated(address indexed trader, uint256 indexed subAccountId);
    event SubAccountMarginModeUpdated(
        address indexed trader,
        uint256 indexed subAccountId,
        PerpStorage.MarginMode marginMode
    );

    constructor(address _perpStorage) {
        perpStorage = PerpStorage(_perpStorage);
    }

    modifier notFrozen(address trader) {
        require(!perpStorage.frozenAccounts(trader), "Account frozen");
        _;
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    function createSubAccount(
        address collateralToken,
        bool crossMarginEnabled
    ) external notPaused notFrozen(msg.sender) returns (uint256 subAccountId) {
        PerpStorage.MarginMode marginMode = crossMarginEnabled
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;

        subAccountId = perpStorage.createSubAccount(msg.sender, collateralToken, marginMode);
        emit SubAccountCreated(msg.sender, subAccountId, collateralToken, marginMode);
    }

    function createSubAccountForTrader(
        address trader,
        address collateralToken,
        bool crossMarginEnabled
    ) external onlyOwner returns (uint256 subAccountId) {
        PerpStorage.MarginMode marginMode = crossMarginEnabled
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;

        subAccountId = perpStorage.createSubAccount(trader, collateralToken, marginMode);
        emit SubAccountCreated(trader, subAccountId, collateralToken, marginMode);
    }

    function setDefaultSubAccount(uint256 subAccountId) external notPaused notFrozen(msg.sender) {
        perpStorage.setDefaultSubAccount(msg.sender, subAccountId);
        emit DefaultSubAccountUpdated(msg.sender, subAccountId);
    }

    function setDefaultSubAccountForTrader(address trader, uint256 subAccountId) external onlyOwner {
        perpStorage.setDefaultSubAccount(trader, subAccountId);
        emit DefaultSubAccountUpdated(trader, subAccountId);
    }

    function setSubAccountCrossMarginMode(uint256 subAccountId, bool enabled) external notPaused notFrozen(msg.sender) {
        PerpStorage.MarginMode marginMode = enabled
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;

        perpStorage.setSubAccountMarginMode(msg.sender, subAccountId, marginMode);
        emit SubAccountMarginModeUpdated(msg.sender, subAccountId, marginMode);
    }

    function setSubAccountCrossMarginModeForTrader(
        address trader,
        uint256 subAccountId,
        bool enabled
    ) external onlyOwner {
        PerpStorage.MarginMode marginMode = enabled
            ? PerpStorage.MarginMode.Cross
            : PerpStorage.MarginMode.Isolated;

        perpStorage.setSubAccountMarginMode(trader, subAccountId, marginMode);
        emit SubAccountMarginModeUpdated(trader, subAccountId, marginMode);
    }

    function getSubAccount(address trader, uint256 subAccountId)
        external
        view
        returns (PerpStorage.SubAccountView memory)
    {
        return perpStorage.getSubAccountView(trader, subAccountId);
    }

    function getSubAccounts(address trader)
        external
        view
        returns (PerpStorage.SubAccountView[] memory)
    {
        return perpStorage.getTraderSubAccounts(trader);
    }
}