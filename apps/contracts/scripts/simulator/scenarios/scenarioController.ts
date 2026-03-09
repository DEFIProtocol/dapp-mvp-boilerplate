// scenarios/scenarioController.ts
import { DeterministicRandom } from '../utils/deterministicRandom.js';
import { MarketPriceEngine } from '../core/marketPrice.js';
import { OrderGenerator, Order } from '../core/orderGenerator.js';
import { BaseAgent } from '../agents/baseAgent.js';
import hre from 'hardhat';

import { MarketMakerAgent } from '../agents/traderAgent.js';
import { MomentumTraderAgent } from '../agents/traderAgent.js';
import { RetailTraderAgent } from '../agents/traderAgent.js';
import { WhaleAgent } from '../agents/traderAgent.js';
import { LiquidatorAgent } from '../agents/liquidatorAgent.js';
import { AGENT_CONFIGS } from '../config/agents.js';
import { SCENARIOS, ScenarioConfig } from '../config/scenarios.js';
const { ethers } = hre;

export interface SimulationState {
  step: number;
  price: number;
  openInterest: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  tvl: bigint; // Total Value Locked
  insuranceFundBalance: bigint;
  liquidations: number;
  trades: number;
  badDebt: bigint;
}

export class ScenarioController {
  private random: DeterministicRandom;
  private marketPrice: MarketPriceEngine;
  private orderGenerator: OrderGenerator;
  private agents: BaseAgent[] = [];
  
  private state: SimulationState = {
    step: 0,
    price: 0,
    openInterest: 0n,
    longOpenInterest: 0n,
    shortOpenInterest: 0n,
    tvl: 0n,
    insuranceFundBalance: 0n,
    liquidations: 0,
    trades: 0,
    badDebt: 0n
  };
  
  private priceHistory: number[] = [];
  private stateHistory: SimulationState[] = [];
  
  constructor(
    public scenarioName: string,
    private seed: number = 12345
  ) {
    const scenario = SCENARIOS[scenarioName];
    if (!scenario) {
      throw new Error(`Scenario ${scenarioName} not found`);
    }
    
    this.random = new DeterministicRandom(seed);
    this.marketPrice = new MarketPriceEngine(scenario, seed);
    this.orderGenerator = new OrderGenerator(this.random);
    
    console.log(`\n🚀 Initializing scenario: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(`🎲 Seed: ${seed}\n`);
  }
  
  async initialize(): Promise<void> {
    // Create agents based on config
    let agentIndex = 0;
    
    for (const config of AGENT_CONFIGS) {
      for (let i = 0; i < config.count; i++) {
        const agent = this.createAgent(config.type, i, config);
        this.agents.push(agent);
        agentIndex++;
      }
    }
    
    console.log(`✅ Created ${this.agents.length} agents`);
    
    // Initialize protocol state
    this.state.insuranceFundBalance = ethers.parseUnits("1000000", 6); // 1M USDC initial insurance
    
    // Log initial allocation
    this.logAgentSummary();
  }
  
  private createAgent(type: string, index: number, config: any): BaseAgent {
    // This would need proper signer/provider - for now using mock
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
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }
  
  async runStep(): Promise<SimulationState> {
    const scenario = SCENARIOS[this.scenarioName];
    this.state.step++;
    
    // 1. Update price
    this.state.price = this.marketPrice.updatePrice();
    this.priceHistory.push(this.state.price);
    
    // 2. Determine market trend
    const trend = this.determineTrend();
    
    // 3. Let agents act
    for (const agent of this.agents) {
      await agent.act(this.state.price, trend);
    }
    
    // 4. Process orders (in real version, this would interact with contracts)
    await this.processOrders();
    
    // 5. Check for liquidations
    await this.checkLiquidations();
    
    // 6. Update metrics
    await this.updateMetrics();
    
    // 7. Record state
    this.stateHistory.push({ ...this.state });
    
    // 8. Log progress periodically
    if (this.state.step % 1000 === 0) {
      this.logProgress();
    }
    
    return this.state;
  }
  
  private determineTrend(): 'up' | 'down' | 'neutral' {
    if (this.priceHistory.length < 20) return 'neutral';
    
    const recent = this.priceHistory.slice(-20);
    const start = recent[0];
    const end = recent[recent.length - 1];
    const change = (end - start) / start;
    
    if (change > 0.02) return 'up';
    if (change < -0.02) return 'down';
    return 'neutral';
  }
  
  private async processOrders(): Promise<void> {
    // This will later call the actual contract
    // For now, just track that trades happened
    this.state.trades += Math.floor(this.random.next() * 10);
  }
  
  private async checkLiquidations(): Promise<void> {
    // This will later query the protocol
    const newLiquidations = Math.floor(this.random.next() * 3);
    this.state.liquidations += newLiquidations;
    
    // Simulate insurance fund usage
    if (newLiquidations > 0 && this.random.next() > 0.7) {
      const loss = ethers.parseUnits((this.random.next() * 10000).toFixed(0), 6);
      this.state.insuranceFundBalance -= loss;
      
      if (loss > this.state.insuranceFundBalance) {
        this.state.badDebt += loss - this.state.insuranceFundBalance;
        this.state.insuranceFundBalance = 0n;
      }
    }
  }
  
  private async updateMetrics(): Promise<void> {
    // Simulate TVL and open interest changes
    const price = this.state.price;
    const volatility = SCENARIOS[this.scenarioName].priceModel.volatility;
    
    // These would come from the protocol in reality
    this.state.tvl = ethers.parseUnits(
      (5000000 * (1 + (this.random.next() - 0.5) * volatility)).toFixed(0), 
      6
    );
    
    this.state.openInterest = ethers.parseUnits(
      (8000000 * (1 + (this.random.next() - 0.5) * volatility * 2)).toFixed(0), 
      6
    );
  }
  
  async runFull(): Promise<SimulationState[]> {
    const scenario = SCENARIOS[this.scenarioName];
    
    console.log(`\n🏃 Running simulation for ${scenario.duration} steps...\n`);
    
    for (let i = 0; i < scenario.duration; i++) {
      await this.runStep();
    }
    
    console.log(`\n✅ Simulation complete!`);
    this.logFinalResults();
    
    return this.stateHistory;
  }
  
  private logAgentSummary(): void {
    const counts: Record<string, number> = {};
    const balances: Record<string, bigint> = {};
    
    for (const agent of this.agents) {
      counts[agent.config.type] = (counts[agent.config.type] || 0) + 1;
      balances[agent.config.type] = (balances[agent.config.type] || 0n) + agent.balance;
    }
    
    console.log('\n📊 Agent Summary:');
    for (const [type, count] of Object.entries(counts)) {
      const totalBalance = ethers.formatUnits(balances[type] || 0n, 6);
      console.log(`  ${type.padEnd(15)}: ${count} agents, $${totalBalance} total balance`);
    }
    console.log('');
  }
  
  private logProgress(): void {
    console.log(
      `Step ${this.state.step.toString().padStart(6)} | ` +
      `Price: $${this.state.price.toFixed(2).padStart(8)} | ` +
      `Trades: ${this.state.trades} | ` +
      `Liquidations: ${this.state.liquidations} | ` +
      `Insurance: $${ethers.formatUnits(this.state.insuranceFundBalance, 6)}`
    );
  }
  
  private logFinalResults(): void {
    console.log('\n📈 FINAL RESULTS');
    console.log('═'.repeat(50));
    console.log(`Scenario: ${SCENARIOS[this.scenarioName].name}`);
    console.log(`Steps completed: ${this.state.step}`);
    console.log(`Final price: $${this.state.price.toFixed(2)}`);
    console.log(`Total trades: ${this.state.trades}`);
    console.log(`Total liquidations: ${this.state.liquidations}`);
    console.log(`Final TVL: $${ethers.formatUnits(this.state.tvl, 6)}`);
    console.log(`Final Open Interest: $${ethers.formatUnits(this.state.openInterest, 6)}`);
    console.log(`Insurance Fund: $${ethers.formatUnits(this.state.insuranceFundBalance, 6)}`);
    console.log(`Bad Debt: $${ethers.formatUnits(this.state.badDebt, 6)}`);
    
    if (this.state.badDebt > 0n) {
      console.log('\n⚠️  WARNING: Bad debt detected! Protocol insolvent!');
    } else {
      console.log('\n✅ Protocol solvent - insurance fund covered all losses');
    }
  }
  
  getState(): SimulationState {
    return this.state;
  }
  
  getHistory(): SimulationState[] {
    return this.stateHistory;
  }
}