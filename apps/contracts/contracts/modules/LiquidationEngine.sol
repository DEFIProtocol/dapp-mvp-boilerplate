// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../storage/PerpStorage.sol";
import "../library/LiquidationLib.sol";
import "../interfaces/IInsuranceTreasury.sol";
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
        uint256 insuranceUsed,
        uint256 penaltyCollected,
        uint256 marginReturned
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
        
        // Deactivate position through PositionManager
        // CollateralManager.applyAccountDelta() is the canonical source of bad debt.
        uint256 badDebt = _forceClosePosition(positionId, totalDelta);

        // Liquidation payout is based on position exposure and post-close available collateral.
        uint256 availableCollateral = collateralManager.getAvailableCollateral(position.trader);

        (uint256 reward, uint256 penalty, uint256 toInsurance, ) = LiquidationLib.calculateLiquidationPayouts(
            position.exposure,
            availableCollateral,
            perpStorage.liquidationRewardBps(),
            perpStorage.liquidationPenaltyBps()
        );
        
        // Apply liquidation distributions
        (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) = _distributeLiquidationProceeds(
            position.trader,
            liquidator,
            reward,
            penalty,
            toInsurance,
            badDebt
        );
        
        emit PositionLiquidated(
            positionId,
            position.trader,
            liquidator,
            rewardPaid,
            badDebt,
            insuranceContribution,
            penaltyCollected,
            marginReturned
        );
        
        if (badDebt > 0) {
            emit BadDebtRecorded(badDebt, position.trader);
        }
    }

    /**
     * @notice Force close a position during liquidation
     */
    function _forceClosePosition(uint256 positionId, int256 totalDelta) internal returns (uint256 badDebt) {
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
        
        // Apply PnL (returns bad debt created by this liquidation if any)
        badDebt = collateralManager.applyAccountDelta(position.trader, totalDelta);

        return badDebt;
    }

    /**
     * @notice Distribute liquidation proceeds
     */
    function _distributeLiquidationProceeds(
        address trader,
        address liquidator,
        uint256 reward,
        uint256 penalty,
        uint256 toInsurance,
        uint256 badDebt
    ) internal returns (uint256 rewardPaid, uint256 insuranceContribution, uint256 penaltyCollected, uint256 marginReturned) {
        uint256 remainingCollateral = perpStorage.accountCollateral(trader);

        // penalty = reward + toInsurance, both carved from within the same penalty pool.
        // Cap to available collateral and pro-rate the split if needed.
        penaltyCollected = penalty > remainingCollateral ? remainingCollateral : penalty;

        if (penaltyCollected < penalty && penalty > 0) {
            // Pro-rate reward and insurance when penalty is capped
            rewardPaid = (reward * penaltyCollected) / penalty;
            insuranceContribution = penaltyCollected - rewardPaid;
        } else {
            rewardPaid = reward;
            insuranceContribution = toInsurance;
        }

        // Liquidator reward exits CollateralManager ERC20 vault
        if (rewardPaid > 0) {
            collateralManager.transferOut(liquidator, rewardPaid);
        }

        // Insurance portion goes to InsuranceTreasury and updates on-chain balance
        if (insuranceContribution > 0) {
            perpStorage.depositToInsurance(insuranceContribution);
            collateralManager.transferToInsurance(insuranceContribution);
        }

        // Deduct full penalty from trader's collateral accounting
        uint256 newCollateral = remainingCollateral > penaltyCollected ? remainingCollateral - penaltyCollected : 0;
        perpStorage.setAccountCollateral(trader, newCollateral);
        marginReturned = newCollateral;

        if (badDebt > 0) {
            _coverBadDebtWithInsurance(badDebt);
        }
    }

    /**
     * @notice Use insurance fund to cover bad debt
     */
    function _coverBadDebtWithInsurance(uint256 badDebt) internal {
        uint256 insuranceBalance = perpStorage.insuranceFundBalance();
        uint256 totalBadDebt = perpStorage.totalBadDebt();
        uint256 treasuryBalance = IInsuranceTreasury(perpStorage.insuranceFund()).balance();
        
        if (insuranceBalance > 0 && treasuryBalance > 0 && badDebt > 0 && totalBadDebt > 0) {
            uint256 coverAmount = badDebt > insuranceBalance ? insuranceBalance : badDebt;
            if (coverAmount > treasuryBalance) {
                coverAmount = treasuryBalance;
            }
            if (coverAmount > totalBadDebt) {
                coverAmount = totalBadDebt;
            }

            if (coverAmount == 0) {
                return;
            }

            // Move funds back to CollateralManager where trader collateral accounting lives.
            IInsuranceTreasury(perpStorage.insuranceFund()).withdrawTo(address(collateralManager), coverAmount);
            
            perpStorage.setInsuranceFundBalance(insuranceBalance - coverAmount);
            perpStorage.setTotalBadDebt(totalBadDebt - coverAmount);
            
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

        (uint256 reward, , , ) = LiquidationLib.calculateLiquidationPayouts(
            pos.exposure,
            available,
            perpStorage.liquidationRewardBps(),
            perpStorage.liquidationPenaltyBps()
        );
        
        return reward;
    }
}