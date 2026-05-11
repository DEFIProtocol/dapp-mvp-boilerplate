// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ADLTypes.sol";

library ADLQueue {
	function queueHash(bytes32 marketId, bool longSide) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(marketId, longSide));
	}

	function eventHash(bytes32 marketId, bool longSide, uint256 eventId) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(marketId, longSide, eventId));
	}

	function validateMonotonicDescending(ADLTypes.ADLRank[] calldata ranked) internal pure {
		if (ranked.length <= 1) return;

		uint256 prev = ranked[0].score;
		for (uint256 i = 1; i < ranked.length; i++) {
			uint256 current = ranked[i].score;
			require(current <= prev, "ADL queue not sorted");
			prev = current;
		}
	}
}

