// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/LiquidationLib.sol";
import "./CollateralManager.sol";
import "./PositionManager.sol";
import "./RiskManager.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LiquidationEngine
 * @notice Handles liquidation of underwater positions
 * @dev Uses LiquidationLib for calculations, interacts with other modules
 */
contract LiquidationEngine {
    using SafeERC20 for IERC20;

    PerpStorage public perpStorage;
    CollateralManager public collateralManager;
    PositionManager public positionManager;
    RiskManager public riskManager;

    // Events
    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 reward,
        uint256 badDebt,
        uint256 insuranceUsed
    );
    
    event BadDebtRecorded(uint256 amount, address indexed trader);
    event InsuranceFundUsed(uint256 amount, uint256 remaining);

    constructor(
        address _perpStorage,
        address _collateralManager,
        address _positionManager,
        address _riskManager
    ) {
        perpStorage = PerpStorage(_perpStorage);
        collateralManager = CollateralManager(_collateralManager);
        positionManager = PositionManager(_positionManager);
        riskManager = RiskManager(_riskManager);
    }

    modifier onlyModule() {
        require(perpStorage.authorizedModules(msg.sender), "Only modules can call");
        _;
    }

    modifier notPaused() {
        require(!perpStorage.emergencyPause(), "Contract paused");
        _;
    }

    /**
     * @notice Liquidate a single position
     * @param positionId Position to liquidate
     */
    function liquidate(uint256 positionId) external notPaused {
        _liquidate(positionId, msg.sender, riskManager.getMarkPrice());
    }

    /**
     * @notice Liquidate with custom price (admin only for emergencies)
     */
    function liquidateWithPrice(uint256 positionId, uint256 price) external onlyModule {
        _liquidate(positionId, msg.sender, price);
    }

    /**
     * @notice Batch liquidate multiple positions
     */
    function batchLiquidate(uint256[] calldata positionIds) external notPaused {
        uint256 markPrice = riskManager.getMarkPrice();
        
        for (uint256 i = 0; i < positionIds.length; i++) {
            _liquidate(positionIds[i], msg.sender, markPrice);
        }
    }

    /**
     * @notice Internal liquidation logic
     */
    function _liquidate(uint256 positionId, address liquidator, uint256 markPrice) internal {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        require(position.active, "Position not active");
        require(!perpStorage.frozenAccounts(position.trader), "Account frozen");
        
        // Verify position is actually liquidatable
        bool isLiquidatable = riskManager.isPositionLiquidatable(positionId);
        require(isLiquidatable, "Position still healthy");
        
        // Calculate PnL and funding
        (int256 pnl, int256 funding) = riskManager.getPositionPnlAndFunding(position, markPrice);
        int256 totalDelta = pnl - funding;
        
        // Calculate liquidation payouts using LiquidationLib
        uint256 availableCollateral = collateralManager.getAvailableCollateral(position.trader);
        
        (uint256 reward, uint256 penalty, uint256 toInsurance) = LiquidationLib.calculateLiquidationPayouts(
            position.margin,
            availableCollateral,
            perpStorage.liquidationRewardBps(),
            perpStorage.liquidationPenaltyBps()
        );
        
        // Calculate bad debt
        uint256 badDebt = LiquidationLib.calculateBadDebt(
            pnl,
            funding,
            position.margin
        );
        
        // Deactivate position through PositionManager
        // We need to add a function to PositionManager for this
        _forceClosePosition(positionId, totalDelta);
        
        // Apply liquidation distributions
        _distributeLiquidationProceeds(
            position.trader,
            reward,
            penalty,
            toInsurance,
            badDebt
        );
        
        emit PositionLiquidated(
            positionId,
            position.trader,
            liquidator,
            reward,
            badDebt,
            toInsurance
        );
        
        if (badDebt > 0) {
            emit BadDebtRecorded(badDebt, position.trader);
        }
    }

    /**
     * @notice Force close a position during liquidation
     */
    function _forceClosePosition(uint256 positionId, int256 totalDelta) internal {
        PerpStorage.Position memory position = perpStorage.getPosition(positionId);
        
        // Mark inactive
        perpStorage.setPositionActive(positionId, false);
        
        // Remove from trader's position list
        _removeTraderPosition(position.trader, positionId);
        perpStorage.setHasPosition(position.trader, positionId, false);
        perpStorage.decrementPositionCount(position.trader);
        
        // Update global exposure
        if (position.side == PerpStorage.Side.Long) {
            perpStorage.setTotalLongExposure(perpStorage.totalLongExposure() - position.exposure);
        } else {
            perpStorage.setTotalShortExposure(perpStorage.totalShortExposure() - position.exposure);
        }
        
        // Release reserved margin
        collateralManager.removeReservedMargin(position.trader, position.margin);
        
        // Apply PnL (will create bad debt if negative)
        collateralManager.applyAccountDelta(position.trader, totalDelta);
    }

    /**
     * @notice Distribute liquidation proceeds
     */
    function _distributeLiquidationProceeds(
        address trader,
        uint256 reward,
        uint256 penalty,
        uint256 toInsurance,
        uint256 badDebt
    ) internal {
        uint256 remainingCollateral = perpStorage.accountCollateral(trader);

        // Deduct from trader's collateral
        if (reward > 0 && remainingCollateral > 0) {
            uint256 rewardPaid = reward > remainingCollateral ? remainingCollateral : reward;
            // Transfer reward to liquidator
            remainingCollateral -= rewardPaid;
            perpStorage.setAccountCollateral(trader, remainingCollateral);
            
            // In a real implementation, you'd transfer the actual tokens
            // IERC20(perpStorage.collateral()).transfer(liquidator, reward);
        }
        
        if (penalty > 0 && remainingCollateral > 0) {
            uint256 penaltyCollected = penalty > remainingCollateral ? remainingCollateral : penalty;
            // Penalty goes to fee pool
            remainingCollateral -= penaltyCollected;
            perpStorage.setAccountCollateral(trader, remainingCollateral);
            perpStorage.setFeePool(perpStorage.feePool() + penaltyCollected);
        }
        
        if (toInsurance > 0 && remainingCollateral > 0) {
            uint256 insuranceContribution = toInsurance > remainingCollateral ? remainingCollateral : toInsurance;
            // Send to insurance fund
            remainingCollateral -= insuranceContribution;
            perpStorage.setAccountCollateral(trader, remainingCollateral);
            perpStorage.depositToInsurance(insuranceContribution);
            
            // Transfer tokens to insurance fund
            IERC20 collateral = perpStorage.collateral();
            collateral.forceApprove(perpStorage.insuranceFund(), insuranceContribution);
        }
        
        if (badDebt > 0) {
            // Record bad debt
            perpStorage.setTotalBadDebt(perpStorage.totalBadDebt() + badDebt);
            
            // Use insurance fund to cover if available
            _coverBadDebtWithInsurance(badDebt);
        }
    }

    /**
     * @notice Use insurance fund to cover bad debt
     */
    function _coverBadDebtWithInsurance(uint256 badDebt) internal {
        uint256 insuranceBalance = perpStorage.insuranceFundBalance();
        
        if (insuranceBalance > 0 && badDebt > 0) {
            uint256 coverAmount = badDebt > insuranceBalance ? insuranceBalance : badDebt;
            
            perpStorage.setInsuranceFundBalance(insuranceBalance - coverAmount);
            perpStorage.setTotalBadDebt(perpStorage.totalBadDebt() - coverAmount);
            
            emit InsuranceFundUsed(coverAmount, insuranceBalance - coverAmount);
        }
    }

    /**
     * @notice Emergency function to socialize bad debt if insurance is insufficient
     */
    function socializeBadDebt(uint256 amount) external onlyModule {
        require(amount <= perpStorage.totalBadDebt(), "Insufficient bad debt");
        
        // This would implement a mechanism to spread losses across all traders
        // Complex logic - simplified for now
        perpStorage.setTotalBadDebt(perpStorage.totalBadDebt() - amount);
    }

    /**
     * @notice Remove position from trader's array
     */
    function _removeTraderPosition(address trader, uint256 positionId) internal {
        perpStorage.removeTraderPosition(trader, positionId);
    }

    /**
     * @notice Get estimated liquidation reward for a position
     */
    function getEstimatedLiquidationReward(uint256 positionId) external view returns (uint256) {
        PerpStorage.Position memory pos = perpStorage.getPosition(positionId);
        if (!pos.active) return 0;
        
        uint256 available = collateralManager.getAvailableCollateral(pos.trader);
        
        (uint256 reward, , ) = LiquidationLib.calculateLiquidationPayouts(
            pos.margin,
            available,
            perpStorage.liquidationRewardBps(),
            perpStorage.liquidationPenaltyBps()
        );
        
        return reward;
    }
}