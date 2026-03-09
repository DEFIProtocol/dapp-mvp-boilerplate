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
      this.currentPrice = this.applyShock(this.currentPrice, model);
      return this.currentPrice;
    }
    
    // Apply price model
    switch (model.type) {
      case 'randomWalk':
        this.currentPrice = this.randomWalkBounded(this.currentPrice, 0, model.volatility, model.maxStepMovePct);
        break;
        
      case 'trending':
        this.currentPrice = this.trendingStep(this.currentPrice, model);
        break;
        
      case 'volatilityShock':
        // After shock, increase volatility
        const effectiveVolatility = this.shockApplied ? model.volatility * 3 : model.volatility;
        this.currentPrice = this.randomWalkBounded(this.currentPrice, 0, effectiveVolatility, model.maxStepMovePct);
        break;
        
      case 'blackSwan':
        // Outside the one-off event, black swan behaves like a normal sideways regime.
        this.currentPrice = this.randomWalkBounded(this.currentPrice, 0, model.volatility, model.maxStepMovePct);
        break;

      case 'frozen':
        // Simulate oracle freeze by keeping the mark price unchanged.
        break;
    }
    
    // Ensure price doesn't go negative
    this.currentPrice = Math.max(this.currentPrice, 0.01);
    return this.currentPrice;
  }
  
  private applyShock(price: number, model: ScenarioConfig['priceModel']): number {
    let magnitude = model.shockMagnitude ?? 0;

    if (model.type === 'blackSwan') {
      const min = model.shockMagnitudeMin ?? 0.6;
      const max = model.shockMagnitudeMax ?? 0.8;
      const shockStrength = this.random.range(min, max);
      const direction = this.pickShockDirection(model.shockDirection ?? 'either');

      magnitude = direction === 'up'
        ? this.random.range(5.0, 6.0) // +500% to +600%
        : -shockStrength;             // -60% to -80%
    }

    return price * (1 + magnitude);
  }

  private pickShockDirection(mode: 'up' | 'down' | 'either'): 'up' | 'down' {
    if (mode === 'up' || mode === 'down') return mode;
    return this.random.next() >= 0.5 ? 'up' : 'down';
  }

  private trendingStep(price: number, model: ScenarioConfig['priceModel']): number {
    const targetReturn = model.targetReturnPct;
    const horizonSteps = model.targetReturnHorizonSteps ?? this.scenario.duration;
    const baseTrend = targetReturn !== undefined
      ? this.getPerStepTrendFromTargetReturn(targetReturn, horizonSteps)
      : (model.trend ?? 0);

    return this.randomWalkBounded(price, baseTrend, model.volatility, model.maxStepMovePct);
  }

  private getPerStepTrendFromTargetReturn(targetReturnPct: number, steps: number): number {
    const totalMultiplier = 1 + targetReturnPct / 100;
    if (totalMultiplier <= 0 || steps <= 0) return 0;
    return Math.pow(totalMultiplier, 1 / steps) - 1;
  }

  private randomWalkBounded(
    price: number,
    drift: number,
    volatility: number,
    maxStepMovePct?: number
  ): number {
    const noise = this.random.range(-volatility, volatility);
    let change = drift + noise;
    if (maxStepMovePct !== undefined) {
      const cap = Math.max(0, maxStepMovePct);
      change = Math.max(-cap, Math.min(cap, change));
    }
    return price * (1 + change);
  }
  
  getCurrentPrice(): number {
    return this.currentPrice;
  }
  
  getStep(): number {
    return this.step;
  }
}