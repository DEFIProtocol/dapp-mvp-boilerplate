// utils/deterministicRandom.ts
export class DeterministicRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  // Simple PRNG (Mulberry32)
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  
  // Random between min and max
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  // Random integer between min and max (inclusive)
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  
  // Pick random item from array
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  // Weighted random choice
  weightedPick<T>(items: Array<{ item: T; weight: number }>): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = this.next() * totalWeight;
    
    for (const { item, weight } of items) {
      if (random < weight) return item;
      random -= weight;
    }
    
    return items[0].item;
  }
  
  // Generate random walk price movement
  randomWalk(current: number, volatility: number): number {
    const change = (this.next() * 2 - 1) * volatility;
    return current * (1 + change);
  }
  
  // Generate trend with momentum
  trendWithMomentum(current: number, trend: number, volatility: number): number {
    const momentum = trend * 0.01; // Trend strength
    const noise = (this.next() * 2 - 1) * volatility;
    return current * (1 + momentum + noise);
  }
  
  // Black swan event (70% drop)
  blackSwan(current: number): number {
    return current * 0.3; // 70% drop
  }
}