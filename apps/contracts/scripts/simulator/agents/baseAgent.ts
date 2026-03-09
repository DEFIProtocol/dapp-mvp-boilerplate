// agents/baseAgent.ts
import hre from 'hardhat';
import { AgentConfig } from '../config/agents.js';
import { DeterministicRandom } from '../utils/deterministicRandom.js';

const { ethers } = hre;

export interface Position {
  id: string;
  size: bigint;
  side: 'long' | 'short';
  entryPrice: number;
  leverage: number;
  timestamp: number;
}

export abstract class BaseAgent {
  public id: string;
  public address: string;
  public balance: bigint;
  public positions: Position[] = [];
  protected random: DeterministicRandom;
  
  constructor(
    public config: AgentConfig,
    index: number,
    seed: number,
    protected provider: ethers.Provider,
    protected signer: ethers.Signer
  ) {
    this.id = `${config.type}-${index}`;
    this.address = ''; // Will be set after deployment
    this.balance = ethers.parseUnits(config.balance, 6);
    this.random = new DeterministicRandom(seed + index);
  }
  
  abstract act(
    currentPrice: number,
    marketTrend?: 'up' | 'down' | 'neutral'
  ): Promise<void>;
  
  protected canTrade(): boolean {
    // Check if agent has enough balance for minimum trade
    const minTrade = ethers.parseUnits(this.config.behavior.minTradeSize, 6);
    return this.balance >= minTrade;
  }
  
  protected getMarketTrend(priceHistory: number[]): 'up' | 'down' | 'neutral' {
    if (priceHistory.length < 10) return 'neutral';
    
    const recent = priceHistory.slice(-10);
    const changes = recent.slice(1).map((price, i) => price - recent[i]);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    
    if (avgChange > 0.01) return 'up';
    if (avgChange < -0.01) return 'down';
    return 'neutral';
  }
  
  protected async updateBalance(newBalance: bigint): Promise<void> {
    this.balance = newBalance;
  }
  
  protected addPosition(position: Position): void {
    this.positions.push(position);
  }
  
  protected removePosition(positionId: string): void {
    this.positions = this.positions.filter(p => p.id !== positionId);
  }
}