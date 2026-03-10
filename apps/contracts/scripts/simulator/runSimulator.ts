import { network } from "hardhat";

import * as path from "path";
import { fileURLToPath } from "url";

import { deployLocal } from "./deployLocal.ts";
import { MetricsCollector } from "./analytics/metrics.ts";
import { SimulationLogger } from "./analytics/logger.ts";
import { ChartGenerator } from "./analytics/charts.ts";
import { AGENT_CONFIGS } from "./config/agents.ts";
import { SCENARIOS } from "./config/scenarios.ts";
import { MarketPriceEngine } from "./core/markPrice.ts";
import { DeterministicRandom } from "./utils/deterministicRandom.ts";

type Signer = any;
type Contract = any;

interface TraderOrder {
  trader: string;
  side: number;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
}

interface CumulativeFlows {
  makerFees: bigint;
  takerFees: bigint;
  insuranceInflow: bigint;
  insuranceOutflow: bigint;
  liquidationInsuranceInflow: bigint;
  liquidatorRewards: bigint;
  liquidationPenalty: bigint;
  marginReturned: bigint;
  fundingTransferred: bigint;
}

interface TraderBehavior {
  minTradeSize: number;
  maxTradeSize: number;
  minLeverage: number;
  maxLeverage: number;
}

interface PositionStats {
  uniqueTraders: number;
  positionsAtRisk: number;
  averageLeverage: number;
  longPositions: number;
  shortPositions: number;
  details: Array<{
    trader: string;
    positionId: bigint;
    size: bigint;
    collateral: bigint;
    leverage: number;
    entryPrice: number;
    markPrice: number;
    pnl: bigint;
    pnlPercent: number;
    health: number;
    isLiquidatable: boolean;
  }>;
}

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

  const addresses = await deployLocal(ethers);

  const oracle = await ethers.getContractAt("MockOracle", addresses.mockOracle);
  const usdc = await ethers.getContractAt("MockERC20", addresses.usdc);
  const perpStorage = await ethers.getContractAt("PerpStorage", addresses.perpStorage);
  const collateralManager = await ethers.getContractAt("CollateralManager", addresses.collateralManager);
  const positionManager = await ethers.getContractAt("PositionManager", addresses.positionManager);
  const riskManager = await ethers.getContractAt("RiskManager", addresses.riskManager);
  const liquidationEngine = await ethers.getContractAt("LiquidationEngine", addresses.liquidationEngine);
  const settlementEngine = await ethers.getContractAt("SettlementEngine", addresses.settlementEngine);
  const fundingEngine = await ethers.getContractAt("FundingEngine", addresses.fundingEngine);

  const signers = await ethers.getSigners();
  const traderSigners: Signer[] = signers.slice(2);
  const liquidatorSigners = traderSigners.slice(0, Math.max(1, Math.min(3, traderSigners.length)));
  const matcher = signers[0];

  await seedTraderCollateral(ethers, usdc, collateralManager, traderSigners);

  const scenario = SCENARIOS[String(options.scenario)];
  const steps = options.steps ?? scenario.duration;
  const priceEngine = new MarketPriceEngine(scenario, options.seed);
  const random = new DeterministicRandom(options.seed + 1337);
  const nonceByTrader = new Map<string, bigint>();
  const traderBehaviorByAddress = buildTraderBehaviorMap(addresses.agents);
  const traderIntentLeverage = new Map<string, { long: number[]; short: number[] }>();

  const cumulative: CumulativeFlows = {
    makerFees: 0n,
    takerFees: 0n,
    insuranceInflow: 0n,
    insuranceOutflow: 0n,
    liquidationInsuranceInflow: 0n,
    liquidatorRewards: 0n,
    liquidationPenalty: 0n,
    marginReturned: 0n,
    fundingTransferred: 0n,
  };

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

  const initialPrice = scenario.priceModel.initialPrice;
  await oracle.setPrice(ethers.parseUnits(initialPrice.toFixed(8), 8));

  console.log("\nRunning simulation...\n");

  for (let step = 0; step < steps; step++) {
    const previousPrice = priceEngine.getCurrentPrice();
    const nextPrice = priceEngine.updatePrice();
    await oracle.setPrice(ethers.parseUnits(nextPrice.toFixed(8), 8));

    await advanceTime(ethers.provider, 300);

    const [makerBpsRaw, takerBpsRaw] = await Promise.all([
      perpStorage.makerFeeBps(),
      perpStorage.takerFeeBps(),
    ]);
    const makerBps = BigInt(makerBpsRaw);
    const takerBps = BigInt(takerBpsRaw);

    const tradesTarget = Math.max(1, Math.floor(traderSigners.length * scenario.traderActivity.baseFrequency));
    let stepTradeCount = 0;
    let stepNewOrders = 0;
    let stepFilledOrders = 0;
    let stepCancelledOrders = 0;
    let stepVolume = 0n;
    let stepFundingTransferred = 0n;
    let stepIntentLeverageNotional = 0;
    let stepIntentLeverageWeighted = 0;

    for (let i = 0; i < tradesTarget; i++) {
      const longTrader = random.pick(traderSigners) as Signer;
      let shortTrader = random.pick(traderSigners) as Signer;
      if (shortTrader.address === longTrader.address) {
        shortTrader = random.pick(traderSigners.filter((s: Signer) => s.address !== longTrader.address)) as Signer;
      }

      const longBehavior = traderBehaviorByAddress.get(longTrader.address) ?? getDefaultTraderBehavior();
      const shortBehavior = traderBehaviorByAddress.get(shortTrader.address) ?? getDefaultTraderBehavior();

      const minTradeUsd = Math.max(100, Math.min(longBehavior.minTradeSize, shortBehavior.minTradeSize));
      const maxTradeUsd = Math.max(minTradeUsd, Math.min(longBehavior.maxTradeSize, shortBehavior.maxTradeSize));
      const tradeUsd = Math.floor(random.range(minTradeUsd, maxTradeUsd) * scenario.traderActivity.volumeMultiplier);
      const size = ethers.parseUnits(String(Math.max(100, tradeUsd)), 6);
      const nowTs = BigInt((await ethers.provider.getBlock("latest")).timestamp);

      const longOrder: TraderOrder = {
        trader: longTrader.address,
        side: 0,
        exposure: size,
        limitPrice: 0n,
        expiry: nowTs + 3600n,
        nonce: nonceByTrader.get(longTrader.address) ?? 0n,
      };

      const shortOrder: TraderOrder = {
        trader: shortTrader.address,
        side: 1,
        exposure: size,
        limitPrice: 0n,
        expiry: nowTs + 3600n,
        nonce: nonceByTrader.get(shortTrader.address) ?? 0n,
      };

      stepNewOrders += 2;
      const settled = await trySettleMatch(
        ethers,
        settlementEngine,
        matcher,
        longTrader,
        shortTrader,
        longOrder,
        shortOrder,
        size
      );

      if (!settled) {
        stepCancelledOrders += 2;
        continue;
      }

      nonceByTrader.set(longTrader.address, longOrder.nonce + 1n);
      nonceByTrader.set(shortTrader.address, shortOrder.nonce + 1n);

      stepTradeCount++;
      stepFilledOrders += 2;
      stepVolume += size;

      const sampledLongLeverage = random.range(longBehavior.minLeverage, longBehavior.maxLeverage);
      const sampledShortLeverage = random.range(shortBehavior.minLeverage, shortBehavior.maxLeverage);

      const longIntent = traderIntentLeverage.get(longTrader.address) ?? { long: [], short: [] };
      longIntent.long.push(sampledLongLeverage);
      traderIntentLeverage.set(longTrader.address, longIntent);

      const shortIntent = traderIntentLeverage.get(shortTrader.address) ?? { long: [], short: [] };
      shortIntent.short.push(sampledShortLeverage);
      traderIntentLeverage.set(shortTrader.address, shortIntent);

      const notionalUsd = Number(size) / 1e6;
      stepIntentLeverageNotional += notionalUsd * 2;
      stepIntentLeverageWeighted += (sampledLongLeverage * notionalUsd) + (sampledShortLeverage * notionalUsd);

      const makerFee = (size * makerBps) / 10000n;
      const takerFee = (size * takerBps) / 10000n;
      cumulative.makerFees += makerFee;
      cumulative.takerFees += takerFee;
    }

    const nextFundingTime = await perpStorage.nextFundingTime();
    const currentTs = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    if (currentTs >= nextFundingTime) {
      const [longRate, shortRate] = await fundingEngine.getCurrentFundingRate();
      await (await fundingEngine.updateFunding()).wait();
      const effective = (BigInt(longRate >= 0 ? longRate : -longRate) + BigInt(shortRate >= 0 ? shortRate : -shortRate)) / 2n;
      stepFundingTransferred = effective;
      cumulative.fundingTransferred += stepFundingTransferred;
    }

    const liquidatablePositions = await findLiquidatablePositions(perpStorage, riskManager, traderSigners);
    let stepLiquidations = 0;
    let stepLiquidatorOrders = 0;

    for (const pos of liquidatablePositions) {
      stepLiquidatorOrders++;
      const liquidator = random.pick(liquidatorSigners);

      const result = await tryLiquidate(liquidationEngine, liquidator, pos.positionId);
      if (!result.ok) {
        continue;
      }

      stepLiquidations++;
      logger.logLiquidation(pos.trader, pos.exposure, result.coverAmount);

      cumulative.liquidatorRewards += result.reward;
      cumulative.liquidationPenalty += result.penaltyCollected;

      if (result.coverAmount > 0n) {
        cumulative.insuranceOutflow += result.coverAmount;
      }

      if (result.insuranceInflow > 0n) {
        cumulative.insuranceInflow += result.insuranceInflow;
        cumulative.liquidationInsuranceInflow += result.insuranceInflow;
      }

      cumulative.marginReturned += result.marginReturned;
    }

    const [insuranceBalance, feePool, badDebt, nextFunding, longOiRaw, shortOiRaw] = await Promise.all([
      perpStorage.insuranceFundBalance(),
      perpStorage.feePool(),
      perpStorage.totalBadDebt(),
      perpStorage.nextFundingTime(),
      perpStorage.totalLongExposure(),
      perpStorage.totalShortExposure(),
    ]);

    const longOi = BigInt(longOiRaw);
    const shortOi = BigInt(shortOiRaw);
    const openInterest = longOi + shortOi;
    const tvl = await usdc.balanceOf(addresses.collateralManager);

    const positionStats = await collectPositionStats(perpStorage, positionManager, riskManager, traderSigners, nextPrice, ethers);
    const longShortRatio = shortOi > 0n ? Number(longOi) / Number(shortOi) : 0;
    const priceMoveBps = previousPrice > 0 ? Math.abs(((nextPrice - previousPrice) / previousPrice) * 10000) : 0;
    const averageIntentLeverage = computeIntentAverageLeverage(traderIntentLeverage, stepIntentLeverageWeighted, stepIntentLeverageNotional);

    const metrics = await metricsCollector.collectMetrics(step, {
      price: nextPrice,
      openInterest,
      longOpenInterest: longOi,
      shortOpenInterest: shortOi,
      longShortRatio,
      tvl,
      averageLeverage: averageIntentLeverage,
      liquidations: stepLiquidations,
      positionsAtRisk: positionStats.positionsAtRisk,
      insuranceFundBalance: insuranceBalance,
      insurancePayouts: cumulative.insuranceOutflow,
      badDebt,
      protocolRevenue: feePool,
      makerFeesCollected: cumulative.makerFees,
      takerFeesCollected: cumulative.takerFees,
      fundingFeesTransferred: cumulative.fundingTransferred,
      insuranceFundInflow: cumulative.insuranceInflow,
      insuranceFundOutflow: cumulative.insuranceOutflow,
      liquidationInsuranceInflow: cumulative.liquidationInsuranceInflow,
      liquidatorOrders: stepLiquidatorOrders,
      liquidatorRewardsPaid: cumulative.liquidatorRewards,
      liquidationPenaltyCollected: cumulative.liquidationPenalty,
      marginReturnedFromLiquidation: cumulative.marginReturned,
      stepVolume,
      trades: stepTradeCount,
      uniqueTraders: positionStats.uniqueTraders,
      openOrders: 0,
      newOrders: stepNewOrders,
      filledOrders: stepFilledOrders,
      cancelledOrders: stepCancelledOrders,
      spreadBps: priceMoveBps,
      slippageBps: Math.floor(priceMoveBps * 0.6),
      priceImpactBps: Math.floor(priceMoveBps * 0.4),
      nextFundingTime: Number(nextFunding) * 1000,
    });

    logger.logMetrics(step, metrics);

    if (step % 100 === 0) {
      logger.logPositions(step, positionStats.details);
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

async function seedTraderCollateral(
  ethers: any,
  usdc: Contract,
  collateralManager: Contract,
  traderSigners: Signer[]
): Promise<void> {
  const depositCap = ethers.parseUnits("5000", 6);

  for (const trader of traderSigners) {
    const balance = await usdc.balanceOf(trader.address);
    if (balance === 0n) continue;
    const depositAmount = balance > depositCap ? depositCap : balance;

    await (await usdc.connect(trader).approve(await collateralManager.getAddress(), depositAmount)).wait();
    await (await collateralManager.connect(trader).depositCollateral(depositAmount)).wait();
  }
}

async function trySettleMatch(
  ethers: any,
  settlementEngine: Contract,
  matcher: Signer,
  longTrader: Signer,
  shortTrader: Signer,
  longOrder: TraderOrder,
  shortOrder: TraderOrder,
  size: bigint
): Promise<boolean> {
  const networkInfo = await ethers.provider.getNetwork();
  const domain = {
    name: "PerpSettlement",
    version: "1",
    chainId: Number(networkInfo.chainId),
    verifyingContract: await settlementEngine.getAddress(),
  };

  const types = {
    Order: [
      { name: "trader", type: "address" },
      { name: "side", type: "uint8" },
      { name: "exposure", type: "uint256" },
      { name: "limitPrice", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };

  try {
    const longSig = await longTrader.signTypedData(domain, types, longOrder);
    const shortSig = await shortTrader.signTypedData(domain, types, shortOrder);

    await (
      await settlementEngine.connect(matcher).settleMatch(longOrder, longSig, shortOrder, shortSig, size)
    ).wait();
    return true;
  } catch {
    return false;
  }
}

async function findLiquidatablePositions(
  perpStorage: Contract,
  riskManager: Contract,
  traderSigners: Signer[]
): Promise<Array<{ positionId: bigint; trader: string; exposure: bigint; side: number }>> {
  const positions: Array<{ positionId: bigint; trader: string; exposure: bigint; side: number }> = [];

  for (const trader of traderSigners) {
    const ids: bigint[] = await perpStorage.getTraderPositions(trader.address);
    for (const id of ids) {
      const position = await perpStorage.getPosition(id);
      if (!position.active) continue;

      try {
        const liquidatable = await riskManager.isPositionLiquidatable(id);
        if (liquidatable) {
          positions.push({
            positionId: id,
            trader: trader.address,
            exposure: position.exposure,
            side: Number(position.side),
          });
        }
      } catch {
        // Ignore stale IDs in position arrays.
      }
    }
  }

  return positions;
}

function buildTraderBehaviorMap(agentAddressMap: Record<string, string[]>): Map<string, TraderBehavior> {
  const behaviorMap = new Map<string, TraderBehavior>();

  for (const config of AGENT_CONFIGS) {
    if (config.type === "liquidator") continue;
    const addresses = agentAddressMap[config.type] ?? [];
    const behavior: TraderBehavior = {
      minTradeSize: Number(config.behavior.minTradeSize),
      maxTradeSize: Number(config.behavior.maxTradeSize),
      minLeverage: config.behavior.minLeverage,
      maxLeverage: config.behavior.maxLeverage,
    };

    for (const address of addresses) {
      behaviorMap.set(address, behavior);
    }
  }

  return behaviorMap;
}

function getDefaultTraderBehavior(): TraderBehavior {
  return {
    minTradeSize: 500,
    maxTradeSize: 5000,
    minLeverage: 3,
    maxLeverage: 8,
  };
}

function computeIntentAverageLeverage(
  traderIntentLeverage: Map<string, { long: number[]; short: number[] }>,
  stepIntentLeverageWeighted: number,
  stepIntentLeverageNotional: number
): number {
  let sum = 0;
  let count = 0;

  for (const intents of traderIntentLeverage.values()) {
    for (const lev of intents.long) {
      sum += lev;
      count++;
    }
    for (const lev of intents.short) {
      sum += lev;
      count++;
    }
  }

  if (count > 0) return sum / count;
  if (stepIntentLeverageNotional > 0) return stepIntentLeverageWeighted / stepIntentLeverageNotional;
  return 0;
}

async function tryLiquidate(
  liquidationEngine: Contract,
  liquidator: Signer,
  positionId: bigint
): Promise<{ ok: boolean; reward: bigint; coverAmount: bigint; insuranceInflow: bigint; penaltyCollected: bigint; marginReturned: bigint }> {
  try {
    const tx = await liquidationEngine.connect(liquidator).liquidate(positionId);
    const receipt = await tx.wait();
    let reward = 0n;
    let coverAmount = 0n;
    let insuranceInflow = 0n;
    let penaltyCollected = 0n;
    let marginReturned = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = liquidationEngine.interface.parseLog(log);
        if (parsed.name === "PositionLiquidated") {
          reward = BigInt(parsed.args.reward);
          insuranceInflow = BigInt(parsed.args.insuranceUsed);
          penaltyCollected = BigInt(parsed.args.penaltyCollected ?? 0n);
          marginReturned = BigInt(parsed.args.marginReturned ?? 0n);
        }
        if (parsed.name === "InsuranceFundUsed") {
          coverAmount = BigInt(parsed.args.amount);
        }
      } catch {
        // Ignore unrelated logs.
      }
    }

    return { ok: true, reward, coverAmount, insuranceInflow, penaltyCollected, marginReturned };
  } catch {
    return { ok: false, reward: 0n, coverAmount: 0n, insuranceInflow: 0n, penaltyCollected: 0n, marginReturned: 0n };
  }
}

async function collectPositionStats(
  perpStorage: Contract,
  positionManager: Contract,
  riskManager: Contract,
  traderSigners: Signer[],
  markPrice: number,
  ethers: any
): Promise<PositionStats> {
  const details: PositionStats["details"] = [];
  let totalLeverage = 0;
  let leverageCount = 0;
  let positionsAtRisk = 0;
  let longPositions = 0;
  let shortPositions = 0;
  const tradersWithPositions = new Set<string>();

  const markPriceOnChain = ethers.parseUnits(markPrice.toFixed(8), 8);

  for (const trader of traderSigners) {
    const ids: bigint[] = await perpStorage.getTraderPositions(trader.address);
    for (const id of ids) {
      const position = await perpStorage.getPosition(id);
      if (!position.active) continue;

      tradersWithPositions.add(trader.address);

      const leverage = Number(position.margin) > 0 ? Number(position.exposure) / Number(position.margin) : 0;
      totalLeverage += leverage;
      leverageCount++;

      const isLiquidatable = await riskManager.isPositionLiquidatable(id);
      if (isLiquidatable) positionsAtRisk++;

      if (Number(position.side) === 0) longPositions++;
      else shortPositions++;

      const [, pnl, , equity] = await positionManager.getPositionWithPnL(id, markPriceOnChain);
      const health = Number(position.margin) > 0 ? Number(equity > 0 ? equity : 0n) / Number(position.margin) : 0;
      const pnlPercent = Number(position.margin) > 0 ? (Number(pnl) / Number(position.margin)) * 100 : 0;

      details.push({
        trader: trader.address,
        positionId: id,
        size: position.exposure,
        collateral: position.margin,
        leverage,
        entryPrice: Number(position.entryPrice) / 1e8,
        markPrice,
        pnl,
        pnlPercent,
        health,
        isLiquidatable,
      });
    }
  }

  return {
    uniqueTraders: tradersWithPositions.size,
    positionsAtRisk,
    averageLeverage: leverageCount > 0 ? totalLeverage / leverageCount : 0,
    longPositions,
    shortPositions,
    details,
  };
}

async function advanceTime(provider: any, seconds: number): Promise<void> {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
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
