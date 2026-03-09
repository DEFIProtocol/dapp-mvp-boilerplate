// runSimulation.ts
import hre from "hardhat";

import * as path from "path";
import * as fs from "fs";

import { deployLocal } from "./deployLocal.js";
import { ScenarioController } from "./scenarios/scenarioController.js";
import { MetricsCollector } from "./analytics/metrics.js";
import { SimulationLogger } from "./analytics/logger.js";
import { ChartGenerator } from "./analytics/charts.js";
import { AGENT_CONFIGS } from "./config/agents.js";
import { SCENARIOS } from "./config/scenarios.js";

// Import agent implementations
import { MarketMakerAgent } from "./agents.ts/traderAgent.js";
import { MomentumTraderAgent } from "./agents.ts/traderAgent.js";
import { RetailTraderAgent } from "./agents.ts/traderAgent.js";
import { WhaleAgent } from "./agents.ts/traderAgent.js";
import { LiquidatorAgent } from "./agents.ts/liquidatorAgent.js";
import { DeterministicRandom } from "./utils/deterministicRandom.js";

interface SimulationOptions {
  scenario: keyof typeof SCENARIOS;
  seed: number;
  steps?: number; // override scenario steps
  deploy?: boolean; // whether to deploy fresh contracts
  headless?: boolean; // minimal logging
  generateCharts?: boolean;
}

export async function runSimulation(options: SimulationOptions) {
    const { ethers } = hre; 
  const startTime = Date.now();
  const simulationId = `${options.scenario}_${options.seed}_${Date.now()}`;
  
  console.log("\n" + "═".repeat(60));
  console.log("🚀 PERP PROTOCOL SIMULATION");
  console.log("═".repeat(60));
  console.log(`Scenario: ${options.scenario}`);
  console.log(`Seed: ${options.seed}`);
  console.log(`Simulation ID: ${simulationId}`);
  
  // 1. Deploy contracts if needed
  let addresses;
  if (options.deploy) {
    addresses = await deployLocal();
  } else {
    // Load from previous deployment
    const deployPath = path.join(process.cwd(), "deployments", "localhost.json");
    if (!fs.existsSync(deployPath)) {
      throw new Error("No deployment found. Run with deploy: true first.");
    }
    addresses = JSON.parse(fs.readFileSync(deployPath, "utf-8"));
    console.log("📦 Loaded existing deployment");
  }
  
  // 2. Get contract instances
  const [deployer, ...signers] = await ethers.getSigners(); // Use ethers for signers
  
  // Create contract instances
  const usdc = await ethers.getContractAt("MockERC20", addresses.usdc);
  const oracle = await ethers.getContractAt("MockOracle", addresses.mockOracle);
  const perpStorage = await ethers.getContractAt("IPerpStorage", addresses.perpStorage);
  const collateralManager = await ethers.getContractAt("ICollateralManager", addresses.collateralManager);
  const positionManager = await ethers.getContractAt("IPositionManager", addresses.positionManager);
  const liquidationEngine = await ethers.getContractAt("ILiquidationEngine", addresses.liquidationEngine);
  
  console.log("\n📊 Contract instances ready");
  
  // 3. Initialize scenario controller
  const controller = new ScenarioController(options.scenario, options.seed);
  await controller.initialize();
  
  // 4. Initialize metrics collector
  const metricsCollector = new MetricsCollector(
    ethers.provider,
    {
      perpStorage: addresses.perpStorage,
      collateralManager: addresses.collateralManager,
      positionManager: addresses.positionManager,
      riskManager: addresses.riskManager,
      liquidationEngine: addresses.liquidationEngine,
      settlementEngine: addresses.settlementEngine,
      fundingEngine: addresses.fundingEngine,
    },
    await ethers.provider.getBlockNumber()
  );
  
  // 5. Initialize logger
  const logger = new SimulationLogger(simulationId, "./simulation-results");
  logger.setConfig({
    scenario: options.scenario,
    seed: options.seed,
    agentCount: AGENT_CONFIGS.reduce((sum, c) => sum + c.count, 0)
  });
  
  // 6. Create agent instances with real signers
  console.log("\n🤖 Initializing agents...");
  
  const agents: any[] = [];
  let signerIndex = 0;
  
  for (const config of AGENT_CONFIGS) {
    const typeAddresses = addresses.agents[config.type] || [];
    
    for (let i = 0; i < config.count; i++) {
      // Get signer for this agent
      const agentSigner = signers[signerIndex % signers.length];
      signerIndex++;
      
      // Get or create agent instance
      let agent;
      const seed = options.seed + i + (config.type === 'liquidator' ? 1000 : 0);
      
      switch (config.type) {
        case 'marketMaker':
          agent = new MarketMakerAgent(config, i, seed, ethers.provider, agentSigner);
          break;
        case 'momentum':
          agent = new MomentumTraderAgent(config, i, seed, ethers.provider, agentSigner);
          break;
        case 'retail':
          agent = new RetailTraderAgent(config, i, seed, ethers.provider, agentSigner);
          break;
        case 'whale':
          agent = new WhaleAgent(config, i, seed, ethers.provider, agentSigner);
          break;
        case 'liquidator':
          agent = new LiquidatorAgent(config, i, seed, ethers.provider, agentSigner);
          break;
        default:
          continue;
      }
      
      // Set agent address from deployment
      if (typeAddresses[i]) {
        agent.address = typeAddresses[i];
      }
      
      agents.push(agent);
    }
  }
  
  console.log(`✅ Created ${agents.length} agents`);
  
  // 7. Set up price feed (mock oracle)
  const initialPrice = SCENARIOS[options.scenario].priceModel.initialPrice;
  await oracle.setPrice(ethers.parseUnits(initialPrice.toString(), 8));
  
  // 8. Run simulation loop
  console.log("\n🏃 Running simulation...\n");
  
  const scenario = SCENARIOS[options.scenario];
  const steps = options.steps || scenario.duration;
  
  for (let step = 0; step < steps; step++) {
    // Update price based on scenario
    const newPrice = controller['marketPrice'].updatePrice();
    await oracle.setPrice(ethers.parseUnits(newPrice.toString(), 8));
    
    // Let agents act
    const trend = controller['determineTrend']();
    
    for (const agent of agents) {
      try {
        await agent.act(newPrice, trend);
      } catch (error) {
        console.error(`Agent ${agent.id} failed:`, error);
      }
    }
    
    // Collect metrics
    const metrics = await metricsCollector.collectMetrics(step, newPrice);
    
    // Check for liquidations (in real implementation, this would happen via bots)
    const liquidatablePositions = await checkLiquidations(
      liquidationEngine,
      perpStorage,
      addresses.insuranceFund
    );
    
    for (const pos of liquidatablePositions) {
      metricsCollector.recordLiquidation(
        pos.trader,
        pos.size,
        pos.insuranceUsed
      );
    }
    
    // Log metrics
    logger.logMetrics(step, metrics);
    
    // Periodic position snapshots
    if (step % 100 === 0) {
      const positions = await metricsCollector.collectPositions(step);
      logger.logPositions(step, positions);
    }
    
    // Progress logging
    if (!options.headless) {
      const elapsed = Date.now() - startTime;
      logger.logStep(step, metrics, elapsed);
    }
    
    // Small delay to avoid overwhelming the node (optional)
    // await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // 9. Calculate final summary
  console.log("\n\n📈 Calculating final results...");
  const summary = metricsCollector.calculateSummary();
  logger.saveFinalLog(summary);
  
  // 10. Generate charts
  if (options.generateCharts) {
    console.log("\n🎨 Generating charts...");
    const chartGenerator = new ChartGenerator(`./simulation-results/${simulationId}/charts`);
    await chartGenerator.generateAllCharts(metricsCollector.getMetricsHistory());
  }
  
  // 11. Print final summary
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log("✅ SIMULATION COMPLETE");
  console.log("═".repeat(60));
  console.log(`Time elapsed: ${elapsedSeconds}s`);
  console.log(`Results saved to: ./simulation-results/${simulationId}`);
  
  // Print key metrics
  if (summary.insuranceFund.maxDrawdownPercent > 50) {
    console.log("\n⚠️  WARNING: Insurance fund drawdown exceeded 50%!");
  }
  
  if (summary.liquidations.total > 0) {
    console.log(`💀 Total liquidations: ${summary.liquidations.total}`);
    console.log(`🛡️  Insurance used: $${summary.liquidations.insuranceUsed}`);
  }
  
  return {
    simulationId,
    summary,
    metrics: metricsCollector.getMetricsHistory()
  };
}

async function checkLiquidations(
  liquidationEngine: any,
  perpStorage: any,
  insuranceFundAddress: string
): Promise<any[]> {
  // This would call your contract's view functions to get liquidatable positions
  // For now, return empty array - we'll implement this when integrating real contracts
  return [];
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: SimulationOptions = {
    scenario: (args[0] as keyof typeof SCENARIOS) || 'normal',
    seed: parseInt(args[1]) || 12345,
    deploy: args.includes('--deploy'),
    headless: args.includes('--headless'),
    generateCharts: !args.includes('--no-charts')
  };
  
  if (args.includes('--steps')) {
    const stepsIndex = args.indexOf('--steps');
    if (stepsIndex >= 0 && stepsIndex < args.length - 1) {
      options.steps = parseInt(args[stepsIndex + 1]);
    }
  }
  
  runSimulation(options)
    .then(() => process.exit(0))
    .catch(error => {
      console.error("\n❌ Simulation failed:", error);
      process.exit(1);
    });
}