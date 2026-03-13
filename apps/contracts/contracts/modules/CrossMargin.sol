// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";

contract CrossMargin {
	PerpStorage public perpStorage;

	event CrossMarginModeUpdated(address indexed trader, bool enabled);

	constructor(address _perpStorage) {
		perpStorage = PerpStorage(_perpStorage);
	}

	modifier onlyOwner() {
		require(msg.sender == perpStorage.owner(), "Only owner");
		_;
	}

	function setCrossMarginForTrader(address trader, bool enabled) external onlyOwner {
		perpStorage.setIsCrossMargin(trader, enabled);
		emit CrossMarginModeUpdated(trader, enabled);
	}

	function setMyCrossMarginMode(bool enabled) external {
		perpStorage.setIsCrossMargin(msg.sender, enabled);
		emit CrossMarginModeUpdated(msg.sender, enabled);
	}

	function isCrossMarginEnabled(address trader) external view returns (bool) {
		return perpStorage.isCrossMargin(trader);
	}
}
