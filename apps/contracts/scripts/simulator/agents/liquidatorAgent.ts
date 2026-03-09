// agents/liquidatorAgent.ts
import { BaseAgent } from './baseAgent.js';

interface PositionToLiquidate {
  traderId: string;
  positionId: string;
  size: bigint;
  health: number; // < 1.0 means undercollateralized
  liquidationBonus: number;
}

export class LiquidatorAgent extends BaseAgent {
  private scannedPositions = new Map<string, number>(); // positionId -> lastHealth
  
  async act(currentPrice: number, marketTrend?: 'up' | 'down' | 'neutral'): Promise<void> {
    // In a real implementation, this would query the protocol for liquidatable positions
    // For now, we'll simulate scanning
    
    const liquidatablePositions = await this.scanForLiquidations(currentPrice);
    
    for (const pos of liquidatablePositions) {
      console.log(`${this.id} found liquidatable position: ${pos.traderId} health=${pos.health.toFixed(2)}`);
      
      // Race to liquidate - fastest bot wins
      await this.executeLiquidation(pos);
      
      // Track liquidation success
      this.recordLiquidation(pos);
    }
  }
  
  private async scanForLiquidations(currentPrice: number): Promise<PositionToLiquidate[]> {
    // This would call the protocol's getLiquidatablePositions() function
    // For simulation, we'll generate mock data
    
    const liquidatable: PositionToLiquidate[] = [];
    
    // Mock logic - in reality this would come from the contract
    for (const pos of this.positions) { // In real version, scan all traders' positions
      const health = this.calculateHealth(pos, currentPrice);
      
      if (health < 1.0) {
        liquidatable.push({
          traderId: pos.id,
          positionId: pos.id,
          size: pos.size,
          health,
          liquidationBonus: 0.05 // 5% bonus
        });
      }
    }
    
    return liquidatable;
  }
  
  private calculateHealth(position: any, currentPrice: number): number {
    // Mock health calculation
    // In reality, this would be: (collateral * price) / (position size * leverage)
    const mockHealth = 0.8 + (this.random.next() * 0.4 - 0.2);
    return mockHealth;
  }
  
  private async executeLiquidation(position: PositionToLiquidate): Promise<void> {
    console.log(`${this.id} liquidating position ${position.positionId} for ${position.liquidationBonus * 100}% bonus`);
    // This would call the protocol's liquidate() function
  }
  
  private recordLiquidation(position: PositionToLiquidate): void {
    // Track for analytics
    console.log(`${this.id} successfully liquidated position, earned bonus`);
  }
}