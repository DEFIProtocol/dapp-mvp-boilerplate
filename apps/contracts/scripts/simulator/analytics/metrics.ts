import { formatUnits, parseUnits } from 'ethers';

import type { SimulationState } from '../scenarios/scenarioController.ts';

export interface ProtocolMetrics {
  timestamp: number;
  blockNumber: number;

  price: number;
  openInterest: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  longShortRatio: number;
  tvl: bigint;

  averageLeverage: number;
  liquidationCount: number;
  positionsAtRisk: number;

  insuranceBalance: bigint;
  insurancePayouts: bigint;
  badDebt: bigint;
  insuranceCoverageRatio: number;

  protocolRevenue: bigint;
  volume24h: bigint;
  tradeCount: number;
  uniqueTraders: number;

  fundingRate: number;
  nextFundingTime: number;

  spreadBps: number;
  slippageBps: number;
  priceImpactBps: number;

  longPositions: number;
  shortPositions: number;
  largePositions: number;
  isInsolvent: boolean;
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

  private readonly provider: any;
  private readonly contracts: {
    perpStorage: string;
    collateralManager: string;
    positionManager: string;
    riskManager: string;
    liquidationEngine: string;
    settlementEngine: string;
    fundingEngine: string;
  };
  private readonly startBlock: number;

  constructor(
    provider: any,
    contracts: {
      perpStorage: string;
      collateralManager: string;
      positionManager: string;
      riskManager: string;
      liquidationEngine: string;
      settlementEngine: string;
      fundingEngine: string;
    },
    startBlock: number
  ) {
    this.provider = provider;
    this.contracts = contracts;
    this.startBlock = startBlock;
  }

  async collectMetrics(step: number, state: SimulationState): Promise<ProtocolMetrics> {
    void this.contracts;
    void this.startBlock;

    const block = await this.provider.getBlockNumber();

    const volumeWindow = this.metricsHistory.slice(Math.max(0, this.metricsHistory.length - 1440));
    const rollingVolume = volumeWindow.reduce((sum, m) => sum + m.volume24h, 0n);

    const imbalance = state.longShortRatio - 1;
    const fundingRate = this.clamp(imbalance * 0.0002, -0.002, 0.002);

    const insuranceCoverageRatio = Number(state.insuranceFundBalance) > 0
      ? Number(state.insuranceFundBalance) / Math.max(1, Number(state.openInterest) * 0.05)
      : 0;

    const metrics: ProtocolMetrics = {
      timestamp: Date.now(),
      blockNumber: block,

      price: state.price,
      openInterest: state.openInterest,
      longOpenInterest: state.longOpenInterest,
      shortOpenInterest: state.shortOpenInterest,
      longShortRatio: state.longShortRatio,
      tvl: state.tvl,

      averageLeverage: state.averageLeverage,
      liquidationCount: state.liquidations,
      positionsAtRisk: state.positionsAtRisk,

      insuranceBalance: state.insuranceFundBalance,
      insurancePayouts: state.insurancePayouts,
      badDebt: state.badDebt,
      insuranceCoverageRatio,

      protocolRevenue: state.protocolRevenue,
      volume24h: rollingVolume + BigInt(Math.floor(state.trades * 12000)),
      tradeCount: state.trades,
      uniqueTraders: state.uniqueTraders,

      fundingRate,
      nextFundingTime: Date.now() + 3600000,

      spreadBps: state.spreadBps,
      slippageBps: state.slippageBps,
      priceImpactBps: state.priceImpactBps,

      longPositions: Math.floor(state.uniqueTraders * (state.longShortRatio / (1 + state.longShortRatio || 1))),
      shortPositions: Math.max(0, state.uniqueTraders - Math.floor(state.uniqueTraders * (state.longShortRatio / (1 + state.longShortRatio || 1)))),
      largePositions: Math.max(0, Math.floor(state.openInterest > 0n ? Number(state.openInterest) / 2_500_000_000_000 : 0)),
      isInsolvent: state.badDebt > 0n,
    };

    this.metricsHistory.push(metrics);
    return metrics;
  }

  async collectPositions(step: number): Promise<PositionDetail[]> {
    const positions: PositionDetail[] = [];
    const numPositions = 20 + (step % 40);

    for (let i = 0; i < numPositions; i++) {
      const size = parseUnits((1000 + ((i * 7919 + step * 73) % 100000)).toString(), 6);
      const collateral = parseUnits((500 + ((i * 1877 + step * 53) % 40000)).toString(), 6);
      const entryPrice = 1800 + ((i * 37 + step * 11) % 600);
      const markPrice = entryPrice * (1 + (((i * 17 + step * 5) % 120) - 60) / 1000);

      const pnl = (markPrice - entryPrice) * Number(size) / Math.max(entryPrice, 1);
      const pnlPercent = (markPrice - entryPrice) / Math.max(entryPrice, 1) * 100;
      const health = Number(collateral) / Math.max(1, Number(size) * 3.5);

      positions.push({
        trader: `0x${(i + 1).toString(16).padStart(40, '0')}`,
        size,
        collateral,
        leverage: Number(size) / Math.max(1, Number(collateral)),
        entryPrice,
        markPrice,
        pnl: parseUnits(pnl.toFixed(0), 6),
        pnlPercent,
        health,
        isLiquidatable: health < 1.0,
      });
    }

    this.positionsHistory.set(step, positions);
    return positions;
  }

  recordLiquidation(trader: string, size: bigint, insuranceUsed: bigint): void {
    void trader;
    void size;
    void insuranceUsed;
  }

  getMetricsHistory(): ProtocolMetrics[] {
    return this.metricsHistory;
  }

  getPositionsAtStep(step: number): PositionDetail[] | undefined {
    return this.positionsHistory.get(step);
  }

  calculateSummary(): any {
    if (this.metricsHistory.length === 0) return null;

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const first = this.metricsHistory[0];

    let peakInsurance = 0n;
    let maxDrawdown = 0n;

    for (const m of this.metricsHistory) {
      if (m.insuranceBalance > peakInsurance) peakInsurance = m.insuranceBalance;
      const drawdown = peakInsurance - m.insuranceBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const totalLiquidations = this.metricsHistory.reduce((sum, m) => sum + m.liquidationCount, 0);
    const insolventSteps = this.metricsHistory.filter((m) => m.isInsolvent).length;

    return {
      duration: this.metricsHistory.length,
      priceChange: ((latest.price - first.price) / first.price * 100).toFixed(2) + '%',
      openInterest: {
        start: formatUnits(first.openInterest, 6),
        end: formatUnits(latest.openInterest, 6),
        change: ((Number(latest.openInterest) - Number(first.openInterest)) / Math.max(1, Number(first.openInterest)) * 100).toFixed(2) + '%',
      },
      tvl: {
        start: formatUnits(first.tvl, 6),
        end: formatUnits(latest.tvl, 6),
      },
      insuranceFund: {
        start: formatUnits(first.insuranceBalance, 6),
        end: formatUnits(latest.insuranceBalance, 6),
        peak: formatUnits(peakInsurance, 6),
        maxDrawdown: formatUnits(maxDrawdown, 6),
        maxDrawdownPercent: peakInsurance > 0n ? ((Number(maxDrawdown) / Number(peakInsurance)) * 100).toFixed(2) + '%' : '0.00%',
      },
      liquidations: {
        total: totalLiquidations,
        insuranceUsed: formatUnits(latest.insurancePayouts, 6),
        avgPayout: totalLiquidations > 0 ? formatUnits(latest.insurancePayouts / BigInt(totalLiquidations), 6) : '0',
      },
      trading: {
        totalVolume: formatUnits(this.metricsHistory.reduce((sum, m) => sum + m.volume24h, 0n), 6),
        avgTradeCount: (this.metricsHistory.reduce((sum, m) => sum + m.tradeCount, 0) / this.metricsHistory.length).toFixed(0),
      },
      health: {
        avgLeverage: (this.metricsHistory.reduce((sum, m) => sum + m.averageLeverage, 0) / this.metricsHistory.length).toFixed(2),
        maxPositionsAtRisk: Math.max(...this.metricsHistory.map((m) => m.positionsAtRisk)),
        insolventSteps,
      },
      revenue: {
        protocolFees: formatUnits(latest.protocolRevenue, 6),
      },
      marketQuality: {
        avgSpreadBps: (this.metricsHistory.reduce((sum, m) => sum + m.spreadBps, 0) / this.metricsHistory.length).toFixed(2),
        avgSlippageBps: (this.metricsHistory.reduce((sum, m) => sum + m.slippageBps, 0) / this.metricsHistory.length).toFixed(2),
        avgPriceImpactBps: (this.metricsHistory.reduce((sum, m) => sum + m.priceImpactBps, 0) / this.metricsHistory.length).toFixed(2),
      },
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
