import { network } from "hardhat";

import * as path from "path";
import { fileURLToPath } from "url";

import { deployLocal } from "./deployLocal.ts";
import { ScenarioController } from "./scenarios/scenarioController.ts";
import { MetricsCollector } from "./analytics/metrics.ts";
import { SimulationLogger } from "./analytics/logger.ts";
import { ChartGenerator } from "./analytics/charts.ts";
import { AGENT_CONFIGS } from "./config/agents.ts";
import { SCENARIOS } from "./config/scenarios.ts";

interface SimulationOptions {
  scenario: keyof typeof SCENARIOS;
  seed: number;
  steps?: number;
  deploy?: boolean;
  headless?: boolean;
  generateCharts?: boolean;
}

export async function runSimulation(options: SimulationOptions) {
  const connection = (await network.connect()) as unknown as { ethers: any };
  const { ethers } = connection;

  const startTime = Date.now();
  const simulationId = `${String(options.scenario)}_${options.seed}_${Date.now()}`;

  console.log("\n" + "=".repeat(60));
  console.log("PERP PROTOCOL SIMULATION");
  console.log("=".repeat(60));
  console.log(`Scenario: ${String(options.scenario)}`);
  console.log(`Seed: ${options.seed}`);
  console.log(`Simulation ID: ${simulationId}`);

  if (!options.deploy) {
    throw new Error("Non-deploy mode not implemented: please use --deploy");
  }

  const addresses = await deployLocal();

  const oracle = await ethers.getContractAt("MockOracle", addresses.mockOracle);
  const perpStorage = null;
  const liquidationEngine = null;

  const controller = new ScenarioController(String(options.scenario), options.seed);
  await controller.initialize();

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

  const logger = new SimulationLogger(simulationId);
  logger.setConfig({
    scenario: String(options.scenario),
    seed: options.seed,
    agentCount: AGENT_CONFIGS.reduce((sum, c) => sum + c.count, 0),
  });

  const scenario = SCENARIOS[String(options.scenario)];
  const steps = options.steps ?? scenario.duration;
  const initialPrice = scenario.priceModel.initialPrice;
  await oracle.setPrice(ethers.parseUnits(initialPrice.toFixed(8), 8));

  console.log("\nRunning simulation...\n");

  for (let step = 0; step < steps; step++) {
    const state = await controller.runStep();
    await oracle.setPrice(ethers.parseUnits(state.price.toFixed(8), 8));

    const metrics = await metricsCollector.collectMetrics(step, state);

    const liquidatablePositions = await checkLiquidations(
      liquidationEngine,
      perpStorage,
      addresses.insuranceFund
    );

    for (const pos of liquidatablePositions) {
      metricsCollector.recordLiquidation(pos.trader, pos.size, pos.insuranceUsed);
      logger.logLiquidation(pos.trader, pos.size, pos.insuranceUsed);
    }

    logger.logMetrics(step, metrics);

    if (step % 100 === 0) {
      const positions = await metricsCollector.collectPositions(step);
      logger.logPositions(step, positions);
    }

    if (!options.headless) {
      const elapsed = Date.now() - startTime;
      logger.logStep(step + 1, steps, metrics, elapsed);
    }
  }

  console.log("\n\nCalculating final results...");
  const summary = metricsCollector.calculateSummary();
  logger.saveFinalLog(summary);

  if (options.generateCharts) {
    console.log("\nGenerating charts...");
    const chartGenerator = new ChartGenerator(`./simulation-results/${simulationId}/charts`);
    await chartGenerator.generateAllCharts(metricsCollector.getMetricsHistory());
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log("SIMULATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Time elapsed: ${elapsedSeconds}s`);
  console.log(`Results saved to: ./simulation-results/${simulationId}`);

  if (summary?.insuranceFund && parseFloat(summary.insuranceFund.maxDrawdownPercent) > 50) {
    console.log("\nWARNING: Insurance fund drawdown exceeded 50%!");
  }

  if (summary?.liquidations && summary.liquidations.total > 0) {
    console.log(`Total liquidations: ${summary.liquidations.total}`);
    console.log(`Insurance used: $${summary.liquidations.insuranceUsed}`);
  }

  return {
    simulationId,
    summary,
    metrics: metricsCollector.getMetricsHistory(),
  };
}

async function checkLiquidations(
  liquidationEngine: unknown,
  perpStorage: unknown,
  insuranceFundAddress: string
): Promise<Array<{ trader: string; size: bigint; insuranceUsed: bigint }>> {
  void liquidationEngine;
  void perpStorage;
  void insuranceFundAddress;
  return [];
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  const args = process.argv.slice(2);
  const hasChartsFlag = args.includes("--charts");
  const hasNoChartsFlag = args.includes("--no-charts");

  const options: SimulationOptions = {
    scenario: ((args[0] as keyof typeof SCENARIOS) || "normal"),
    seed: Number.parseInt(args[1] ?? "12345", 10),
    deploy: args.includes("--deploy"),
    headless: args.includes("--headless"),
    // Explicit --charts wins when both flags are present.
    generateCharts: hasChartsFlag ? true : !hasNoChartsFlag,
  };

  if (args.includes("--steps")) {
    const stepsIndex = args.indexOf("--steps");
    if (stepsIndex >= 0 && stepsIndex < args.length - 1) {
      options.steps = Number.parseInt(args[stepsIndex + 1], 10);
    }
  }

  runSimulation(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("\nSimulation failed:", error);
      process.exit(1);
    });
}
