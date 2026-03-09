import { DeterministicRandom } from '../utils/deterministicRandom.ts';
import type { ScenarioConfig } from '../config/scenarios.ts';

export class MarketPriceEngine {
  private currentPrice: number;
  private random: DeterministicRandom;
  private step: number = 0;
  private shockApplied: boolean = false;
  private scenario: ScenarioConfig;
  
  constructor(scenario: ScenarioConfig, seed: number) {
    this.scenario = scenario;
    this.currentPrice = scenario.priceModel.initialPrice;
    this.random = new DeterministicRandom(seed);
  }
  
  updatePrice(): number {
    this.step++;
    const model = this.scenario.priceModel;
    
    // Check for shock events
    if (!this.shockApplied && model.shockStep && this.step >= model.shockStep) {
      this.shockApplied = true;
      this.currentPrice = this.applyShock(this.currentPrice, model.shockMagnitude || 0);
      return this.currentPrice;
    }
    
    // Apply price model
    switch (model.type) {
      case 'randomWalk':
        this.currentPrice = this.random.randomWalk(this.currentPrice, model.volatility);
        break;
        
      case 'trending':
        if (model.trend !== undefined) {
          this.currentPrice = this.random.trendWithMomentum(
            this.currentPrice, 
            model.trend, 
            model.volatility
          );
        }
        break;
        
      case 'volatilityShock':
        // After shock, increase volatility
        const effectiveVolatility = this.shockApplied ? model.volatility * 3 : model.volatility;
        this.currentPrice = this.random.randomWalk(this.currentPrice, effectiveVolatility);
        break;
        
      case 'blackSwan':
        if (this.shockApplied) {
          // After crash, high volatility
          this.currentPrice = this.random.randomWalk(this.currentPrice, model.volatility * 4);
        } else {
          this.currentPrice = this.random.randomWalk(this.currentPrice, model.volatility);
        }
        break;

      case 'frozen':
        // Simulate oracle freeze by keeping the mark price unchanged.
        break;
    }
    
    // Ensure price doesn't go negative
    this.currentPrice = Math.max(this.currentPrice, 0.01);
    return this.currentPrice;
  }
  
  private applyShock(price: number, magnitude: number): number {
    return price * (1 + magnitude);
  }
  
  getCurrentPrice(): number {
    return this.currentPrice;
  }
  
  getStep(): number {
    return this.step;
  }
}