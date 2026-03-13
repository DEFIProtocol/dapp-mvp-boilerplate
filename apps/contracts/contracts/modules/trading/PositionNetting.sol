// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../storage/PerpStorage.sol";
import "../../library/PnlLib.sol";
import "../../library/FundingLib.sol";

library PositionNetting {
	function calculateWeightedEntryPrice(
		uint256 currentExposure,
		uint256 currentEntryPrice,
		uint256 addedExposure,
		uint256 addedEntryPrice
	) internal pure returns (uint256) {
		uint256 totalExposure = currentExposure + addedExposure;
		require(totalExposure > 0, "Zero total exposure");

		uint256 currentNotional = currentExposure * currentEntryPrice;
		uint256 addedNotional = addedExposure * addedEntryPrice;
		return (currentNotional + addedNotional) / totalExposure;
	}

	function calculateReductionDelta(
		PerpStorage.Side side,
		uint256 reductionExposure,
		uint256 entryPrice,
		uint256 closePrice,
		int256 entryFunding,
		int256 currentFunding
	) internal pure returns (int256 pnl, int256 funding, int256 totalDelta) {
		PnlLib.Position memory reducedPosition = PnlLib.Position({
			exposure: reductionExposure,
			entryPrice: entryPrice,
			side: side == PerpStorage.Side.Long ? PnlLib.Side.Long : PnlLib.Side.Short
		});

		pnl = PnlLib.calculateUnrealizedPnl(reducedPosition, closePrice);
		funding = FundingLib.calculateFundingPayment(reductionExposure, entryFunding, currentFunding);
		totalDelta = pnl - funding;
	}

	function calculateProportionalMarginRelease(
		uint256 currentMargin,
		uint256 currentExposure,
		uint256 reductionExposure
	) internal pure returns (uint256) {
		if (reductionExposure >= currentExposure) {
			return currentMargin;
		}
		return (currentMargin * reductionExposure) / currentExposure;
	}
}
