// analytics/metrics.ts
import hre from "hardhat";
const { ethers } = hre;
// import { PerpEngineContract } from '../types/contracts.js'; // Disabled for simulation build

export interface ProtocolMetrics {
  // Core metrics
  timestamp: number;
  blockNumber: number;
  
  // Market stats
  price: number;
  openInterest: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  tvl: bigint; // Total Value Locked
  
  // Risk metrics
  averageLeverage: number;
  liquidationCount: number;
  positionsAtRisk: number; // positions with health < 1.2
  
  // Insurance fund
  insuranceBalance: bigint;
  insurancePayouts: bigint;
  badDebt: bigint;
  
  // Trading activity
  volume24h: bigint;
  tradeCount: number;
  uniqueTraders: number;
  
  // Funding rates
  fundingRate: number;
  nextFundingTime: number;
  
  // Position distribution
  longPositions: number;
  shortPositions: number;
  largePositions: number; // positions > $100k
}

export interface PositionDetail {
  trader: string;
  size: bigint;
  collateral: bigint;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  pnl: bigint;
  pnlPercent: number;
  health: number;
  isLiquidatable: boolean;
}

export class MetricsCollector {
  private metricsHistory: ProtocolMetrics[] = [];
  private positionsHistory: Map<number, PositionDetail[]> = new Map();
  private liquidationEvents: Array<{
    step: number;
    trader: string;
    size: bigint;
    insuranceUsed: bigint;
    timestamp: number;
  }> = [];
  
  constructor(
    private provider: ethers.Provider,
    private contracts: {
      perpStorage: string;
      collateralManager: string;
      positionManager: string;
      riskManager: string;
      liquidationEngine: string;
      settlementEngine: string;
      fundingEngine: string;
    },
    private startBlock: number
  ) {}
  
  async collectMetrics(
    step: number,
    currentPrice: number
  ): Promise<ProtocolMetrics> {
    // In real implementation, this would query the contracts
    // For now, we'll simulate with the pattern your contracts use
    
    const block = await this.provider.getBlockNumber();
    
    // These would be actual contract calls:
    // const perpStorage = new ethers.Contract(this.contracts.perpStorage, PerpStorageABI, this.provider);
    // const openInterest = await perpStorage.getOpenInterest();
    
    // Simulated data based on your contract structure
    const metrics: ProtocolMetrics = {
      timestamp: Date.now(),
      blockNumber: block,
      
      // Market stats
      price: currentPrice,
      openInterest: this.simulateOpenInterest(currentPrice),
      longOpenInterest: this.simulateLongOpenInterest(currentPrice),
      shortOpenInterest: this.simulateShortOpenInterest(currentPrice),
      tvl: this.simulateTVL(currentPrice),
      
      // Risk metrics
      averageLeverage: 3.5 + (Math.random() * 2 - 1),
      liquidationCount: Math.floor(Math.random() * 5),
      positionsAtRisk: Math.floor(Math.random() * 20),
      
      // Insurance fund
      insuranceBalance: this.simulateInsuranceBalance(),
      insurancePayouts: 0n,
      badDebt: 0n,
      
      // Trading activity
      volume24h: this.simulateVolume(),
      tradeCount: Math.floor(Math.random() * 50),
      uniqueTraders: Math.floor(Math.random() * 30),
      
      // Funding rates
      fundingRate: (Math.random() * 0.002) - 0.001, // -0.1% to +0.1%
      nextFundingTime: Date.now() + 3600000, // 1 hour
      
      // Position distribution
      longPositions: Math.floor(Math.random() * 100),
      shortPositions: Math.floor(Math.random() * 80),
      largePositions: Math.floor(Math.random() * 10),
    };
    
    this.metricsHistory.push(metrics);
    return metrics;
  }
  
  async collectPositions(step: number): Promise<PositionDetail[]> {
    // In real implementation, this would iterate through all traders
    // For now, simulate positions
    
    const positions: PositionDetail[] = [];
    const numPositions = Math.floor(Math.random() * 50);
    
    for (let i = 0; i < numPositions; i++) {
      const size = ethers.parseUnits((Math.random() * 100000).toFixed(0), 6);
      const collateral = ethers.parseUnits((Math.random() * 50000).toFixed(0), 6);
      const entryPrice = 2000 + (Math.random() * 200 - 100);
      const markPrice = entryPrice * (1 + (Math.random() * 0.1 - 0.05));
      
      const pnl = (markPrice - entryPrice) * Number(size) / entryPrice;
      const pnlPercent = (markPrice - entryPrice) / entryPrice * 100;
      
      const health = Number(collateral) / (Number(size) * 3.5); // Rough health calculation
      
      positions.push({
        trader: `0x${Math.random().toString(16).substring(2, 42)}`,
        size,
        collateral,
        leverage: Number(size) / Number(collateral),
        entryPrice,
        markPrice,
        pnl: ethers.parseUnits(pnl.toFixed(0), 6),
        pnlPercent,
        health,
        isLiquidatable: health < 1.0
      });
    }
    
    this.positionsHistory.set(step, positions);
    return positions;
  }
  
  recordLiquidation(
    trader: string,
    size: bigint,
    insuranceUsed: bigint
  ): void {
    this.liquidationEvents.push({
      step: this.metricsHistory.length,
      trader,
      size,
      insuranceUsed,
      timestamp: Date.now()
    });
  }
  
  // Simulation helpers (will be replaced with real contract calls)
  private simulateOpenInterest(price: number): bigint {
    return ethers.parseUnits((8000000 * (1 + (Math.random() * 0.1 - 0.05))).toFixed(0), 6);
  }
  
  private simulateLongOpenInterest(price: number): bigint {
    return ethers.parseUnits((4500000 * (1 + (Math.random() * 0.1 - 0.05))).toFixed(0), 6);
  }
  
  private simulateShortOpenInterest(price: number): bigint {
    return ethers.parseUnits((3500000 * (1 + (Math.random() * 0.1 - 0.05))).toFixed(0), 6);
  }
  
  private simulateTVL(price: number): bigint {
    return ethers.parseUnits((5000000 * (1 + (Math.random() * 0.05 - 0.025))).toFixed(0), 6);
  }
  
  private simulateInsuranceBalance(): bigint {
    return ethers.parseUnits((1000000 * (1 + (Math.random() * 0.02 - 0.01))).toFixed(0), 6);
  }
  
  private simulateVolume(): bigint {
    return ethers.parseUnits((2000000 * (1 + (Math.random() * 0.3 - 0.15))).toFixed(0), 6);
  }
  
  // Getters for analysis
  getMetricsHistory(): ProtocolMetrics[] {
    return this.metricsHistory;
  }
  
  getLiquidationEvents(): any[] {
    return this.liquidationEvents;
  }
  
  getPositionsAtStep(step: number): PositionDetail[] | undefined {
    return this.positionsHistory.get(step);
  }
  
  // Calculate key statistics
  calculateSummary(): any {
    if (this.metricsHistory.length === 0) return null;
    
    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const first = this.metricsHistory[0];
    
    // Find worst insurance fund drawdown
    let maxDrawdown = 0n;
    let maxDrawdownPercent = 0;
    let peakInsurance = 0n;
    
    for (const m of this.metricsHistory) {
      if (m.insuranceBalance > peakInsurance) {
        peakInsurance = m.insuranceBalance;
      }
      
      const drawdown = peakInsurance - m.insuranceBalance;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = Number(drawdown) / Number(peakInsurance) * 100;
      }
    }
    
    // Calculate total liquidations
    const totalLiquidations = this.liquidationEvents.length;
    const totalInsuranceUsed = this.liquidationEvents.reduce(
      (sum, e) => sum + e.insuranceUsed, 0n
    );
    
    return {
      duration: this.metricsHistory.length,
      priceChange: ((latest.price - first.price) / first.price * 100).toFixed(2) + '%',
      
      openInterest: {
        start: ethers.formatUnits(first.openInterest, 6),
        end: ethers.formatUnits(latest.openInterest, 6),
        change: ((Number(latest.openInterest) - Number(first.openInterest)) / Number(first.openInterest) * 100).toFixed(2) + '%'
      },
      
      tvl: {
        start: ethers.formatUnits(first.tvl, 6),
        end: ethers.formatUnits(latest.tvl, 6)
      },
      
      insuranceFund: {
        start: ethers.formatUnits(first.insuranceBalance, 6),
        end: ethers.formatUnits(latest.insuranceBalance, 6),
        peak: ethers.formatUnits(peakInsurance, 6),
        maxDrawdown: ethers.formatUnits(maxDrawdown, 6),
        maxDrawdownPercent: maxDrawdownPercent.toFixed(2) + '%'
      },
      
      liquidations: {
        total: totalLiquidations,
        insuranceUsed: ethers.formatUnits(totalInsuranceUsed, 6),
        avgPayout: totalLiquidations > 0 
          ? ethers.formatUnits(totalInsuranceUsed / BigInt(totalLiquidations), 6)
          : '0'
      },
      
      trading: {
        totalVolume: ethers.formatUnits(
          this.metricsHistory.reduce((sum, m) => sum + m.volume24h, 0n), 
          6
        ),
        avgTradeCount: (this.metricsHistory.reduce((sum, m) => sum + m.tradeCount, 0) / this.metricsHistory.length).toFixed(0)
      },
      
      health: {
        avgLeverage: (this.metricsHistory.reduce((sum, m) => sum + m.averageLeverage, 0) / this.metricsHistory.length).toFixed(2),
        maxPositionsAtRisk: Math.max(...this.metricsHistory.map(m => m.positionsAtRisk))
      }
    };
  }
}