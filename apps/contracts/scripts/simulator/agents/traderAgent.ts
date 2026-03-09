import { BaseAgent } from './baseAgent.ts';
import type { Position } from './baseAgent.ts';

export class MarketMakerAgent extends BaseAgent {
  private targetSpread = 0.01; // 1% spread target
  private inventoryTarget = 0.5; // 50/50 long/short target
  
  async act(currentPrice: number, marketTrend?: 'up' | 'down' | 'neutral'): Promise<void> {
    // Market makers provide liquidity by placing both long and short orders
    
    // Calculate current inventory imbalance
    const longExposure = this.positions
      .filter(p => p.side === 'long')
      .reduce((sum, p) => sum + Number(p.size), 0);
    
    const shortExposure = this.positions
      .filter(p => p.side === 'short')
      .reduce((sum, p) => sum + Number(p.size), 0);
    
    const totalExposure = longExposure + shortExposure;
    const longRatio = totalExposure === 0 ? 0.5 : longExposure / totalExposure;
    
    // Adjust prices based on inventory
    const longPrice = currentPrice * (1 - this.targetSpread / 2);
    const shortPrice = currentPrice * (1 + this.targetSpread / 2);
    
    // If we're too heavy on longs, make short orders more attractive
    if (longRatio > this.inventoryTarget + 0.1) {
      // Place larger short orders to rebalance
      await this.placeOrder('short', shortPrice, this.config.behavior.maxTradeSize);
    } else if (longRatio < this.inventoryTarget - 0.1) {
      // Place larger long orders to rebalance
      await this.placeOrder('long', longPrice, this.config.behavior.maxTradeSize);
    } else {
      // Balanced - place both sides
      await this.placeOrder('long', longPrice, this.config.behavior.minTradeSize);
      await this.placeOrder('short', shortPrice, this.config.behavior.minTradeSize);
    }
  }
  
  private async placeOrder(side: 'long' | 'short', price: number, sizeStr: string): Promise<void> {
    // This will later call the actual contract
    console.log(`${this.id} placing ${side} order at $${price.toFixed(2)} for $${sizeStr}`);
  }
}

export class MomentumTraderAgent extends BaseAgent {
  private lookbackPeriod = 20; // Check last 20 price movements
  private priceHistory: number[] = [];
  private momentumThreshold = 0.02; // 2% movement needed to trigger
  
  async act(currentPrice: number, marketTrend?: 'up' | 'down' | 'neutral'): Promise<void> {
    this.priceHistory.push(currentPrice);
    if (this.priceHistory.length > this.lookbackPeriod) {
      this.priceHistory.shift();
    }
    
    if (this.priceHistory.length < this.lookbackPeriod) return;
    
    // Calculate momentum
    const startPrice = this.priceHistory[0];
    const endPrice = this.priceHistory[this.priceHistory.length - 1];
    const momentum = (endPrice - startPrice) / startPrice;
    
    // Strong momentum signal
    if (Math.abs(momentum) > this.momentumThreshold) {
      const side = momentum > 0 ? 'long' : 'short';
      
      // Check if we already have positions in this direction
      const existingDirection = this.positions.filter(p => p.side === side).length;
      
      if (existingDirection < 2) { // Limit positions per direction
        const size = this.random.range(
          Number(this.config.behavior.minTradeSize),
          Number(this.config.behavior.maxTradeSize)
        );
        
        console.log(`${this.id} momentum ${side} signal (${(momentum * 100).toFixed(1)}%) - placing order for $${size}`);
        // Place order logic here
      }
    }
    
    // Take profits on opposite moves
    if (this.positions.length > 0) {
      for (const pos of this.positions) {
        const pnl = pos.side === 'long' 
          ? (currentPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - currentPrice) / pos.entryPrice;
        
        if (pnl > 0.1) { // 10% profit target
          console.log(`${this.id} taking profit on ${pos.side} position`);
          // Close position logic here
        }
      }
    }
  }
}

export class RetailTraderAgent extends BaseAgent {
  async act(currentPrice: number, marketTrend?: 'up' | 'down' | 'neutral'): Promise<void> {
    // Pure chaos - random trades, random sizes
    if (this.random.next() > 0.3) return; // 30% chance to trade
    
    const side = this.random.next() > 0.5 ? 'long' : 'short';
    
    // Random size with positive skew toward smaller trades
    const sizeFactor = Math.pow(this.random.next(), 2); // Skews toward 0
    const minSize = Number(this.config.behavior.minTradeSize);
    const maxSize = Number(this.config.behavior.maxTradeSize);
    const size = minSize + (maxSize - minSize) * sizeFactor;
    
    // Retail is modeled as highly levered.
    const leverage = this.random.range(this.config.behavior.minLeverage, this.config.behavior.maxLeverage);
    
    console.log(`${this.id} (retail) placing random ${side} of $${size.toFixed(0)} with ${leverage}x leverage`);
    
    // Sometimes close positions randomly
    if (this.positions.length > 0 && this.random.next() > 0.7) {
      const posToClose = this.random.pick(this.positions);
      console.log(`${this.id} randomly closing position`);
      // Close position logic
    }
  }
}

export class WhaleAgent extends BaseAgent {
  async act(currentPrice: number, marketTrend?: 'up' | 'down' | 'neutral'): Promise<void> {
    // Whales move markets - they take large positions and hold
    
    // Only trade occasionally
    if (this.random.next() > 0.1) return; // 10% chance
    
    // Whales have strong convictions - if they have a position, they often add to it
    if (this.positions.length > 0) {
      const existingPos = this.positions[0];
      
      // 70% chance to add to position, 30% chance to reverse
      if (this.random.next() > 0.3) {
        // Add to position
        const additionalSize = this.random.range(
          Number(this.config.behavior.minTradeSize) * 0.5,
          Number(this.config.behavior.maxTradeSize) * 0.3
        );
        
        const leverage = this.random.range(this.config.behavior.minLeverage, this.config.behavior.maxLeverage);
        console.log(`${this.id} (whale) adding to ${existingPos.side} position: +$${additionalSize.toFixed(0)} at ${leverage.toFixed(1)}x`);
      } else {
        // Reverse position (close + open opposite)
        console.log(`${this.id} (whale) reversing position from ${existingPos.side} to ${existingPos.side === 'long' ? 'short' : 'long'}`);
        // Close all positions logic
      }
    } else {
      // No position - take a massive directional bet based on market trend
      let side: 'long' | 'short';
      
      if (marketTrend === 'up') {
        side = this.random.next() > 0.2 ? 'long' : 'short'; // 80% follow trend
      } else if (marketTrend === 'down') {
        side = this.random.next() > 0.2 ? 'short' : 'long';
      } else {
        side = this.random.next() > 0.5 ? 'long' : 'short';
      }
      
      const size = this.random.range(
        Number(this.config.behavior.minTradeSize) * 0.8,
        Number(this.config.behavior.maxTradeSize)
      );
      const leverage = this.random.range(this.config.behavior.minLeverage, this.config.behavior.maxLeverage);
      
      console.log(`${this.id} (whale) opening massive ${side} position: $${size.toFixed(0)} at ${leverage.toFixed(1)}x`);
    }
  }
}