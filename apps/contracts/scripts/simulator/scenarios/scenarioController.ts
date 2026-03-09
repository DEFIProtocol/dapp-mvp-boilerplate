import { formatUnits, parseUnits } from 'ethers';

import { LiquidatorAgent } from '../agents/liquidatorAgent.ts';
import { MarketMakerAgent, MomentumTraderAgent, RetailTraderAgent, WhaleAgent } from '../agents/traderAgent.ts';
import type { BaseAgent } from '../agents/baseAgent.ts';
import { AGENT_CONFIGS } from '../config/agents.ts';
import { SCENARIOS } from '../config/scenarios.ts';
import { MarketPriceEngine } from '../core/markPrice.ts';
import { DeterministicRandom } from '../utils/deterministicRandom.ts';

export interface SimulationState {
  step: number;
  price: number;
  openInterest: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  tvl: bigint;
  insuranceFundBalance: bigint;
  insurancePayouts: bigint;
  protocolRevenue: bigint;
  badDebt: bigint;
  trades: number;
  totalTrades: number;
  liquidations: number;
  totalLiquidations: number;
  averageLeverage: number;
  positionsAtRisk: number;
  uniqueTraders: number;
  spreadBps: number;
  slippageBps: number;
  priceImpactBps: number;
  longShortRatio: number;
}

export class ScenarioController {
  private readonly random: DeterministicRandom;
  private readonly marketPrice: MarketPriceEngine;
  private readonly agents: BaseAgent[] = [];

  private state: SimulationState;
  private readonly priceHistory: number[] = [];
  private readonly stateHistory: SimulationState[] = [];

  public scenarioName: string;
  private seed: number;

  constructor(scenarioName: string, seed: number = 12345) {
    this.scenarioName = scenarioName;
    this.seed = seed;

    const scenario = SCENARIOS[scenarioName];
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }

    this.random = new DeterministicRandom(seed);
    this.marketPrice = new MarketPriceEngine(scenario, seed);

    const initialPrice = scenario.priceModel.initialPrice;
    const initialOi = parseUnits('3000000', 6);
    const initialLongOi = parseUnits('1600000', 6);
    const initialShortOi = parseUnits('1400000', 6);

    this.state = {
      step: 0,
      price: initialPrice,
      openInterest: initialOi,
      longOpenInterest: initialLongOi,
      shortOpenInterest: initialShortOi,
      tvl: parseUnits('5000000', 6),
      insuranceFundBalance: parseUnits('1000000', 6),
      insurancePayouts: 0n,
      protocolRevenue: 0n,
      badDebt: 0n,
      trades: 0,
      totalTrades: 0,
      liquidations: 0,
      totalLiquidations: 0,
      averageLeverage: 2.5,
      positionsAtRisk: 0,
      uniqueTraders: 0,
      spreadBps: 8,
      slippageBps: 5,
      priceImpactBps: 3,
      longShortRatio: Number(initialLongOi) / Number(initialShortOi),
    };

    console.log(`\nInitializing scenario: ${scenario.name}`);
    console.log(`${scenario.description}`);
    console.log(`Seed: ${seed}\n`);
  }

  async initialize(): Promise<void> {
    for (const config of AGENT_CONFIGS) {
      for (let i = 0; i < config.count; i++) {
        this.agents.push(this.createAgent(config.type, i, config));
      }
    }

    console.log(`Created ${this.agents.length} agents`);
    this.logAgentSummary();
  }

  private createAgent(type: string, index: number, config: any): BaseAgent {
    const mockProvider = {} as any;
    const mockSigner = {} as any;

    switch (type) {
      case 'marketMaker':
        return new MarketMakerAgent(config, index, this.seed + index, mockProvider, mockSigner);
      case 'momentum':
        return new MomentumTraderAgent(config, index, this.seed + index, mockProvider, mockSigner);
      case 'retail':
        return new RetailTraderAgent(config, index, this.seed + index, mockProvider, mockSigner);
      case 'whale':
        return new WhaleAgent(config, index, this.seed + index, mockProvider, mockSigner);
      case 'liquidator':
        return new LiquidatorAgent(config, index, this.seed + index, mockProvider, mockSigner);
      case 'arbitrageur':
        return new RetailTraderAgent(config, index, this.seed + index, mockProvider, mockSigner);
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  async runStep(): Promise<SimulationState> {
    const scenario = SCENARIOS[this.scenarioName];
    const prevPrice = this.state.price;

    this.state.step++;
    this.state.price = this.marketPrice.updatePrice();
    this.priceHistory.push(this.state.price);

    const trend = this.determineTrend();

    for (const agent of this.agents) {
      await agent.act(this.state.price, trend);
    }

    const priceReturn = prevPrice > 0 ? (this.state.price - prevPrice) / prevPrice : 0;
    const absReturn = Math.abs(priceReturn);

    const baselineTrades = this.agents.length * scenario.traderActivity.baseFrequency * 1.4;
    const volTradeBoost = 1 + absReturn * 40;
    const shockBoost = this.isShockRegime() ? 1.45 : 1;
    const trades = Math.max(1, Math.floor(baselineTrades * volTradeBoost * shockBoost));

    const avgNotional = this.getAvgTradeNotional();
    const totalStepVolumeUsd = trades * avgNotional;

    const trendBias = trend === 'up' ? 0.08 : trend === 'down' ? -0.08 : 0;
    const scenarioBias = scenario.name.includes('Bull') ? 0.06 : scenario.name.includes('Bear') ? -0.06 : 0;
    const longShare = this.clamp(0.5 + trendBias + scenarioBias + this.random.range(-0.06, 0.06), 0.2, 0.8);
    const shortShare = 1 - longShare;

    const stepOiDelta = totalStepVolumeUsd * this.random.range(0.08, 0.18);
    const longDelta = stepOiDelta * longShare;
    const shortDelta = stepOiDelta * shortShare;

    const oiDecay = this.isShockRegime() ? 0.992 : 0.997;
    const updatedLongOi = Math.max(0, Number(this.state.longOpenInterest) * oiDecay + longDelta);
    const updatedShortOi = Math.max(0, Number(this.state.shortOpenInterest) * oiDecay + shortDelta);

    this.state.longOpenInterest = BigInt(Math.floor(updatedLongOi));
    this.state.shortOpenInterest = BigInt(Math.floor(updatedShortOi));
    this.state.openInterest = this.state.longOpenInterest + this.state.shortOpenInterest;
    this.state.longShortRatio = updatedShortOi > 0 ? updatedLongOi / updatedShortOi : 0;

    const leverageBase = scenario.name.includes('Liquidity Crisis') ? 4.8 : 3.1;
    const leverageVolBump = absReturn * 45;
    const leverageNoise = this.random.range(-0.35, 0.35);
    this.state.averageLeverage = this.clamp(leverageBase + leverageVolBump + leverageNoise, 1.1, 12);

    const riskBase = this.state.averageLeverage * 1.8 + absReturn * 200;
    const riskShockBoost = this.isShockRegime() ? 18 : 0;
    this.state.positionsAtRisk = Math.max(0, Math.floor(riskBase + riskShockBoost + this.random.range(0, 8)));

    const liqPressure = this.state.positionsAtRisk * (0.04 + absReturn * 2.2);
    this.state.liquidations = Math.floor(Math.max(0, liqPressure + this.random.range(0, 1.5)));
    this.state.totalLiquidations += this.state.liquidations;

    const payoutPerLiq = avgNotional * this.state.averageLeverage * this.random.range(0.05, 0.16);
    const stepInsurancePayout = this.state.liquidations * payoutPerLiq;
    const feeRate = 0.0005;
    const fundingRate = (this.state.longShortRatio - 1) * 0.0002;
    const fundingFlow = Math.max(0, Number(this.state.openInterest) * Math.abs(fundingRate) * 0.00002);
    const stepFees = totalStepVolumeUsd * feeRate + fundingFlow;

    const insuranceContribution = stepFees * 0.35;
    this.state.protocolRevenue += BigInt(Math.floor(stepFees));
    this.state.insurancePayouts += BigInt(Math.floor(stepInsurancePayout));

    const insuranceNext = Number(this.state.insuranceFundBalance) + insuranceContribution - stepInsurancePayout;
    if (insuranceNext < 0) {
      this.state.badDebt += BigInt(Math.floor(Math.abs(insuranceNext)));
      this.state.insuranceFundBalance = 0n;
    } else {
      this.state.insuranceFundBalance = BigInt(Math.floor(insuranceNext));
    }

    const collateralBase = 4500000 + Number(this.state.insuranceFundBalance) * 0.4;
    const pnlDrag = this.state.totalLiquidations * avgNotional * 0.015;
    const flowNoise = this.random.range(-80000, 120000);
    const tvlRaw = Math.max(500000, collateralBase + flowNoise - pnlDrag);
    this.state.tvl = BigInt(Math.floor(tvlRaw));

    const marketStress = this.state.positionsAtRisk / 100 + absReturn * 10;
    const liquidityPenalty = scenario.name.includes('Liquidity Crisis') ? 8 : 0;
    this.state.spreadBps = this.clamp(6 + marketStress * 2.4 + liquidityPenalty + this.random.range(-1, 1), 4, 120);
    this.state.slippageBps = this.clamp(4 + marketStress * 3.1 + liquidityPenalty * 0.7 + this.random.range(-1, 2), 2, 180);
    this.state.priceImpactBps = this.clamp(2 + marketStress * 2.7 + liquidityPenalty * 0.6 + this.random.range(-0.5, 1.5), 1, 150);

    const activeRatio = this.clamp(scenario.traderActivity.baseFrequency * this.random.range(0.8, 1.2), 0.05, 0.9);
    this.state.uniqueTraders = Math.floor(this.agents.length * activeRatio);
    this.state.trades = trades;
    this.state.totalTrades += trades;

    this.stateHistory.push({ ...this.state });

    return this.state;
  }

  private determineTrend(): 'up' | 'down' | 'neutral' {
    if (this.priceHistory.length < 20) return 'neutral';

    const recent = this.priceHistory.slice(-20);
    const start = recent[0];
    const end = recent[recent.length - 1];
    const change = (end - start) / start;

    if (change > 0.01) return 'up';
    if (change < -0.01) return 'down';
    return 'neutral';
  }

  private isShockRegime(): boolean {
    if (this.priceHistory.length < 4) return false;
    const p0 = this.priceHistory[this.priceHistory.length - 1];
    const p1 = this.priceHistory[this.priceHistory.length - 2];
    const ret = Math.abs((p0 - p1) / p1);
    return ret > 0.02;
  }

  private getAvgTradeNotional(): number {
    const scenario = SCENARIOS[this.scenarioName];
    const base = 12000 * scenario.traderActivity.volumeMultiplier;
    const stressScale = this.isShockRegime() ? 1.35 : 1;
    return base * stressScale * this.random.range(0.7, 1.4);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private logAgentSummary(): void {
    const counts: Record<string, number> = {};
    const balances: Record<string, bigint> = {};

    for (const agent of this.agents) {
      counts[agent.config.type] = (counts[agent.config.type] || 0) + 1;
      balances[agent.config.type] = (balances[agent.config.type] || 0n) + agent.balance;
    }

    console.log('\nAgent Summary:');
    for (const [type, count] of Object.entries(counts)) {
      const totalBalance = formatUnits(balances[type] || 0n, 6);
      console.log(`  ${type.padEnd(15)}: ${count} agents, $${totalBalance} total balance`);
    }
    console.log('');
  }

  getState(): SimulationState {
    return this.state;
  }

  getHistory(): SimulationState[] {
    return this.stateHistory;
  }
}
