// core/orderGenerator.ts
import { DeterministicRandom } from '../utils/deterministicRandom.js';
import { AgentConfig } from '../config/agents.js';
import hre from 'hardhat';
const { ethers } = hre; 

export interface Order {
  traderId: string;
  traderType: string;
  side: 'long' | 'short';
  size: bigint; // in USDC (6 decimals)
  leverage: number;
  price: number; // execution price
  timestamp: number;
  reduceOnly?: boolean;
}

export class OrderGenerator {
  constructor(private random: DeterministicRandom) {}
  
  generateOrder(
    traderId: string,
    config: AgentConfig,
    currentPrice: number,
    marketTrend?: 'up' | 'down' | 'neutral',
    existingPositions?: { size: bigint; side: string }[]
  ): Order | null {
    
    // Check trade probability
    if (this.random.next() > config.behavior.tradeFrequency) {
      return null;
    }
    
    // Check max positions
    if (config.behavior.maxPositions && 
        existingPositions && 
        existingPositions.length >= config.behavior.maxPositions) {
      return null;
    }
    
    // Determine side based on trader type
    let side = this.determineSide(config.type, marketTrend, existingPositions);
    
    // Determine size
    const minSize = ethers.parseUnits(config.behavior.minTradeSize, 6);
    const maxSize = ethers.parseUnits(config.behavior.maxTradeSize, 6);
    const size = this.generateSize(minSize, maxSize, config.type);
    
    // Determine leverage
    const leverage = this.random.range(
      config.behavior.minLeverage,
      config.behavior.maxLeverage
    );
    
    return {
      traderId,
      traderType: config.type,
      side,
      size,
      leverage,
      price: currentPrice,
      timestamp: Date.now()
    };
  }
  
  private determineSide(
    traderType: string,
    marketTrend?: 'up' | 'down' | 'neutral',
    existingPositions?: { size: bigint; side: string }[]
  ): 'long' | 'short' {
    
    switch (traderType) {
      case 'marketMaker':
        // Market makers provide both sides
        return this.random.next() > 0.5 ? 'long' : 'short';
        
      case 'momentum':
        // Momentum traders follow trend
        if (marketTrend === 'up') return 'long';
        if (marketTrend === 'down') return 'short';
        return this.random.next() > 0.5 ? 'long' : 'short';
        
      case 'retail':
        // Pure chaos
        return this.random.next() > 0.5 ? 'long' : 'short';
        
      case 'whale':
        // Whales can be directional
        if (existingPositions && existingPositions.length > 0) {
          // Sometimes add to position, sometimes reverse
          const dominantSide = existingPositions[0].side;
          return this.random.next() > 0.7 ? 
            (dominantSide === 'long' ? 'short' : 'long') : 
            dominantSide as 'long' | 'short';
        }
        return this.random.next() > 0.5 ? 'long' : 'short';
        
      case 'arbitrageur':
        // Arbitrage would be based on price differences
        // For simulation, we'll make them contrarian
        return marketTrend === 'up' ? 'short' : 'long';
        
      default:
        return this.random.next() > 0.5 ? 'long' : 'short';
    }
  }
  
  private generateSize(minSize: bigint, maxSize: bigint, traderType: string): bigint {
    const min = Number(minSize);
    const max = Number(maxSize);
    
    // Different distributions for different trader types
    switch (traderType) {
      case 'whale':
        // Whales take large positions
        return BigInt(Math.floor(this.random.range(max * 0.7, max)));
        
      case 'retail':
        // Retail takes mostly small positions
        if (this.random.next() > 0.8) {
          return BigInt(Math.floor(this.random.range(min, max)));
        }
        return BigInt(Math.floor(this.random.range(min, max * 0.3)));
        
      default:
        return BigInt(Math.floor(this.random.range(min, max)));
    }
  }
}