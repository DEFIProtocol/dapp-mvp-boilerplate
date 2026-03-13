// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/FundingLib.sol";
import "./CollateralManager.sol";

/**
 * @title FundingEngine
 * @notice Updates global funding indices based on exposure imbalance
 * @dev Uses FundingLib for rate calculations
 */
contract FundingEngine {
    PerpStorage public perpStorage;
    CollateralManager public collateralManager;

    // Events
    event FundingRateUpdated(
        int256 longRate,
        int256 shortRate,
        uint256 timestamp
    );
    
    event FundingPaid(
        address indexed trader,
        int256 amount,
        uint256 positionCount
    );
    
    event FundingIntervalUpdated(uint256 oldInterval, uint256 newInterval);
    event MaxFundingRateUpdated(uint256 oldRate, uint256 newRate);

    // Funding parameters
    uint256 public maxFundingRate = 100; // 1% per interval (in bps)
    uint256 public fundingClampBps = 5000; // 50% clamp

    constructor(address _perpStorage, address _collateralManager) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == perpStorage.owner(), "Only owner");
        _;
    }

    /**
     * @notice Update funding rates based on exposure imbalance
     * @dev Should be called at regular intervals
     */
    function updateFunding() external returns (int256 longRate, int256 shortRate) {
        return updateFundingForMarket(perpStorage.marketFeedId());
    }

    /**
     * @notice Update funding rates for a specific market.
     */
    function updateFundingForMarket(bytes32 marketId) public returns (int256 longRate, int256 shortRate) {
        require(block.timestamp >= perpStorage.nextFundingTime(), "Too early for update");

        bytes32 resolvedMarketId = _resolveMarketId(marketId);
        uint256 longExposure = perpStorage.marketLongExposure(resolvedMarketId);
        uint256 shortExposure = perpStorage.marketShortExposure(resolvedMarketId);
        
        // Calculate funding rates using FundingLib
        (longRate, shortRate) = FundingLib.calculateFundingRate(
            longExposure,
            shortExposure,
            maxFundingRate,
            fundingClampBps
        );
        
        // Update cumulative funding indices
        // Funding accumulates over time
        uint256 timeElapsed = block.timestamp - perpStorage.lastFundingUpdate();
        uint256 interval = perpStorage.fundingInterval();
        
        int256 longAccrued = FundingLib.calculateTimeWeightedFunding(longRate, timeElapsed, interval);
        int256 shortAccrued = FundingLib.calculateTimeWeightedFunding(shortRate, timeElapsed, interval);

        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");
        perpStorage.setMarketFundingIndices(
            resolvedMarketId,
            market.cumulativeFundingLong + longAccrued,
            market.cumulativeFundingShort + shortAccrued
        );
        
        // Update timestamps
        perpStorage.setLastFundingUpdate(block.timestamp);
        perpStorage.setNextFundingTime(block.timestamp + interval);
        
        emit FundingRateUpdated(longRate, shortRate, block.timestamp);
        
        return (longRate, shortRate);
    }

    /**
     * @notice Manually set funding rates (emergency use only)
     */
    function setFundingRates(int256 longRate, int256 shortRate) external onlyModule {
        perpStorage.setCumulativeFundingLong(perpStorage.cumulativeFundingLong() + longRate);
        perpStorage.setCumulativeFundingShort(perpStorage.cumulativeFundingShort() + shortRate);
        
        emit FundingRateUpdated(longRate, shortRate, block.timestamp);
    }

    /**
     * @notice Settle funding for a specific trader (realize funding PnL)
     * @dev Called when positions are closed or at user request
     */
    function settleTraderFunding(address trader) external onlyModule returns (int256 totalFunding) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory position = perpStorage.getPosition(positionId);
            
            if (!position.active) continue;
            
            // Get current cumulative funding
            int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
            
            // Calculate funding owed
            int256 fundingPayment = FundingLib.calculateFundingPayment(
                position.exposure,
                position.entryFunding,
                currentFunding
            );
            
            // Update entry funding to current
            perpStorage.setPositionEntryFunding(positionId, currentFunding);
            
            // Add to total
            totalFunding += fundingPayment;
        }
        
        if (totalFunding != 0) {
            // Apply funding to collateral
            collateralManager.applyAccountDelta(trader, -totalFunding); // Negative because funding is paid
            
            emit FundingPaid(trader, totalFunding, positionIds.length);
        }
    }

    /**
     * @notice Get current funding rate without updating
     */
    function getCurrentFundingRate() external view returns (int256 longRate, int256 shortRate) {
        return getCurrentFundingRateForMarket(perpStorage.marketFeedId());
    }

    function getCurrentFundingRateForMarket(bytes32 marketId) public view returns (int256 longRate, int256 shortRate) {
        bytes32 resolvedMarketId = _resolveMarketId(marketId);
        uint256 longExposure = perpStorage.marketLongExposure(resolvedMarketId);
        uint256 shortExposure = perpStorage.marketShortExposure(resolvedMarketId);

        return FundingLib.calculateFundingRate(longExposure, shortExposure, maxFundingRate, fundingClampBps);
    }

    /**
     * @notice Get funding owed for a position without settling
     */
    function getPositionFundingOwed(uint256 positionId) external view returns (int256) {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        require(position.active, "Position not active");
        
        int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
        
        return FundingLib.calculateFundingPayment(
            position.exposure,
            position.entryFunding,
            currentFunding
        );
    }

    /**
     * @notice Get total funding owed by a trader
     */
    function getTraderFundingOwed(address trader) external view returns (int256 totalFunding) {
        uint256[] memory positionIds = perpStorage.getTraderPositions(trader);
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 positionId = positionIds[i];
            PerpStorage.Position memory position = perpStorage.getPosition(positionId);
            
            if (!position.active) continue;
            
            int256 currentFunding = _getCurrentFunding(position.side, position.marketId);
            
            totalFunding += FundingLib.calculateFundingPayment(
                position.exposure,
                position.entryFunding,
                currentFunding
            );
        }
    }

    /**
     * @notice Set funding interval (admin only)
     */
    function setFundingInterval(uint256 newInterval) external onlyOwner {
        require(newInterval >= 1 hours && newInterval <= 24 hours, "Invalid interval");
        
        uint256 oldInterval = perpStorage.fundingInterval();
        perpStorage.setFundingInterval(newInterval);
        
        emit FundingIntervalUpdated(oldInterval, newInterval);
    }

    /**
     * @notice Set max funding rate (admin only)
     */
    function setMaxFundingRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Rate too high"); // Max 10%
        
        uint256 oldRate = maxFundingRate;
        maxFundingRate = newRate;
        
        emit MaxFundingRateUpdated(oldRate, newRate);
    }

    /**
     * @notice Force update next funding time (emergency)
     */
    function setNextFundingTime(uint256 timestamp) external onlyModule {
        perpStorage.setNextFundingTime(timestamp);
    }

    function _resolveMarketId(bytes32 marketId) internal view returns (bytes32) {
        return marketId == bytes32(0) ? perpStorage.marketFeedId() : marketId;
    }

    function _getCurrentFunding(PerpStorage.Side side, bytes32 marketId) internal view returns (int256) {
        bytes32 resolvedMarketId = _resolveMarketId(marketId);
        PerpStorage.MarketConfig memory market = perpStorage.getMarketConfig(resolvedMarketId);
        require(market.exists, "Unknown market");
        return side == PerpStorage.Side.Long ? market.cumulativeFundingLong : market.cumulativeFundingShort;
    }
}