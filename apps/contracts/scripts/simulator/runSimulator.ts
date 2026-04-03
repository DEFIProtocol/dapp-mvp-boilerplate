import { network } from "hardhat";

import * as path from "path";
import { fileURLToPath } from "url";

import { deployLocal } from "./deployLocal.ts";
import { collectConsistencySnapshot } from "./analytics/consistency.ts";
import { evaluateAdlInvariantFailures } from "./analytics/adlInvariants.ts";
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
  marketId: string;
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
  adlRequested: bigint;
  adlCovered: bigint;
  adlRemaining: bigint;
  adlEvents: number;
  proactiveAdlEvents: number;
  proactiveAdlSoftEvents: number;
  proactiveAdlHardEvents: number;
  optionsTrades: number;
}

interface TraderBehavior {
  minTradeSize: number;
  maxTradeSize: number;
  minLeverage: number;
  maxLeverage: number;
}

interface TraderProfile extends TraderBehavior {
  agentType: string;
  tradeFrequency: number;
  maxPositions: number;
}

interface TradeIntent {
  trader: Signer;
  side: 0 | 1;
  exposure: bigint;
  leverage: number;
  agentType: string;
  reason: string;
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

const FIXED_SIMULATION_STEPS = 2000;
const ADL_QUEUE_REFRESH_INTERVAL = 25;
const OPTION_TRADE_INTERVAL = 5;
const OPTION_TRADERS_PER_STEP = 4;
const OPTION_TRADE_SIZE = 10n ** 16n;
const OPTION_SERIES_LIFETIME_SECONDS = 300 * 1000;
const STRESS_SCENARIOS = new Set([
  "blackSwan",
  "blackSwanDown",
  "blackSwanUp",
  "volatilityShock",
  "liquidityCrisis",
  "liquidationCascade",
  "oracleFailure",
]);

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
  const adlEngine = await ethers.getContractAt("ADLEngine", addresses.adlEngine);
  const settlementEngine = await ethers.getContractAt("SettlementEngine", addresses.settlementEngine);
  const fundingEngine = await ethers.getContractAt("FundingEngine", addresses.fundingEngine);
  const optionsEngine = await ethers.getContractAt("OptionsEngineModule", addresses.optionsEngine);
  const insuranceTreasury = await ethers.getContractAt("InsuranceTreasury", addresses.insuranceFund);
  const protocolTreasury = await ethers.getContractAt("ProtocolTreasury", addresses.protocolTreasury);

  const signers = await ethers.getSigners();
  const traderSigners: Signer[] = signers.slice(2);
  const liquidatorSigners = traderSigners.slice(0, Math.max(1, Math.min(3, traderSigners.length)));
  const matcher = signers[0];

  await seedTraderCollateral(ethers, usdc, collateralManager, traderSigners);

  const scenario = SCENARIOS[String(options.scenario)];
  const scenarioKey = String(options.scenario);
  const isStressScenario = STRESS_SCENARIOS.has(scenarioKey);
  const steps = FIXED_SIMULATION_STEPS;
  if (options.steps !== undefined && options.steps !== FIXED_SIMULATION_STEPS) {
    console.log(
      `Requested --steps ${options.steps} is ignored; using fixed ${FIXED_SIMULATION_STEPS} steps.`,
    );
  }
  const priceEngine = new MarketPriceEngine(scenario, options.seed);
  const random = new DeterministicRandom(options.seed + 1337);
  const nonceByTrader = new Map<string, bigint>();
  const defaultMarketId = await perpStorage.marketFeedId();
  const traderProfileByAddress = buildTraderProfileMap(addresses.agents);
  const priceHistory: number[] = [scenario.priceModel.initialPrice];

  const adlEnabled = await adlEngine.adlEnabled();
  console.log(`ADL Engine: ${addresses.adlEngine} (enabled=${adlEnabled ? "yes" : "no"})`);

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
    adlRequested: 0n,
    adlCovered: 0n,
    adlRemaining: 0n,
    adlEvents: 0,
    proactiveAdlEvents: 0,
    proactiveAdlSoftEvents: 0,
    proactiveAdlHardEvents: 0,
    optionsTrades: 0,
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
  await oracle.setPrice(toOraclePrice(ethers, initialPrice));
  const optionSeriesIds = await initializeOptionSeries({
    ethers,
    perpStorage,
    optionsEngine,
    marketId: defaultMarketId,
    collateralToken: addresses.usdc,
    initialPrice,
  });

  const initialAdlQueueStats = await refreshAdlQueuesOnChain({
    perpStorage,
    riskManager,
    adlEngine,
    traderSigners,
    ownerSigner: matcher,
    marketId: defaultMarketId,
  });
  console.log(
    `[ADL QUEUE] initial long=${initialAdlQueueStats.longQueued}/${initialAdlQueueStats.longCandidates} short=${initialAdlQueueStats.shortQueued}/${initialAdlQueueStats.shortCandidates}`,
  );

  console.log("\nRunning simulation...\n");
  console.log(`ADL invariant policy: ${isStressScenario ? "hard-fail" : "warn-only"}`);

  for (let step = 0; step < steps; step++) {
    const previousPrice = priceEngine.getCurrentPrice();
    const nextPrice = priceEngine.updatePrice();
    priceHistory.push(nextPrice);
    await oracle.setPrice(toOraclePrice(ethers, nextPrice));

    await advanceTime(ethers.provider, 300);

    const [makerBpsRaw, takerBpsRaw] = await Promise.all([
      perpStorage.makerFeeBps(),
      perpStorage.takerFeeBps(),
    ]);
    const makerBps = BigInt(makerBpsRaw);
    const takerBps = BigInt(takerBpsRaw);

    let stepTradeCount = 0;
    let stepOptionsTrades = 0;
    let stepNewOrders = 0;
    let stepFilledOrders = 0;
    let stepCancelledOrders = 0;
    let stepVolume = 0n;
    let stepFundingTransferred = 0n;
    const marketTrend = deriveMarketTrend(priceHistory);
    const intents = buildStepIntents(
      ethers,
      traderSigners,
      traderProfileByAddress,
      scenario.traderActivity.baseFrequency,
      scenario.traderActivity.volumeMultiplier,
      marketTrend,
      previousPrice,
      nextPrice,
      random
    );

    for (const intent of intents) {
      logger.logExecutionEvent({
        step,
        eventType: "intent",
        trader: intent.trader.address,
        agentType: intent.agentType,
        side: intent.side === 0 ? "long" : "short",
        exposure: intent.exposure,
        leverage: intent.leverage,
        reason: intent.reason,
      });
    }

    const { pairs, unmatched } = pairIntents(intents, random);
    const stepIntentLeverages = intents.map((intent) => intent.leverage);

    stepNewOrders = intents.length;
    stepCancelledOrders += unmatched.length;

    for (const unmatchedIntent of unmatched) {
      logger.logExecutionEvent({
        step,
        eventType: "cancelled",
        trader: unmatchedIntent.trader.address,
        agentType: unmatchedIntent.agentType,
        side: unmatchedIntent.side === 0 ? "long" : "short",
        exposure: unmatchedIntent.exposure,
        leverage: unmatchedIntent.leverage,
        reason: "unmatched-side",
      });
    }

    for (const pair of pairs) {
      const longIntent = pair.long;
      const shortIntent = pair.short;
      const longTrader = longIntent.trader;
      const shortTrader = shortIntent.trader;
      const size = longIntent.exposure < shortIntent.exposure ? longIntent.exposure : shortIntent.exposure;
      const nowTs = BigInt((await ethers.provider.getBlock("latest")).timestamp);

      const longOrder: TraderOrder = {
        trader: longTrader.address,
        side: 0,
        exposure: size,
        limitPrice: 0n,
        expiry: nowTs + 3600n,
        nonce: nonceByTrader.get(longTrader.address) ?? 0n,
        marketId: defaultMarketId,
      };

      const shortOrder: TraderOrder = {
        trader: shortTrader.address,
        side: 1,
        exposure: size,
        limitPrice: 0n,
        expiry: nowTs + 3600n,
        nonce: nonceByTrader.get(shortTrader.address) ?? 0n,
        marketId: defaultMarketId,
      };

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
        logger.logExecutionEvent({
          step,
          eventType: "failed",
          trader: longTrader.address,
          counterparty: shortTrader.address,
          agentType: longIntent.agentType,
          side: "long",
          exposure: size,
          leverage: longIntent.leverage,
          reason: "settlement-revert",
        });
        logger.logExecutionEvent({
          step,
          eventType: "failed",
          trader: shortTrader.address,
          counterparty: longTrader.address,
          agentType: shortIntent.agentType,
          side: "short",
          exposure: size,
          leverage: shortIntent.leverage,
          reason: "settlement-revert",
        });
        continue;
      }

      nonceByTrader.set(longTrader.address, longOrder.nonce + 1n);
      nonceByTrader.set(shortTrader.address, shortOrder.nonce + 1n);

      stepTradeCount++;
      stepFilledOrders += 2;
      stepVolume += size;

      logger.logExecutionEvent({
        step,
        eventType: "filled",
        trader: longTrader.address,
        counterparty: shortTrader.address,
        agentType: longIntent.agentType,
        side: "long",
        exposure: size,
        leverage: longIntent.leverage,
        reason: longIntent.reason,
      });
      logger.logExecutionEvent({
        step,
        eventType: "filled",
        trader: shortTrader.address,
        counterparty: longTrader.address,
        agentType: shortIntent.agentType,
        side: "short",
        exposure: size,
        leverage: shortIntent.leverage,
        reason: shortIntent.reason,
      });

      const makerFee = (size * makerBps) / 10000n;
      const takerFee = (size * takerBps) / 10000n;
      cumulative.makerFees += makerFee;
      cumulative.takerFees += takerFee;
    }

    stepOptionsTrades = await runStepOptionTrades({
      step,
      random,
      traderSigners,
      traderProfileByAddress,
      optionsEngine,
      optionSeriesIds,
      logger,
      cumulative,
    });

    await expireAndSettleOptions({
      perpStorage,
      optionsEngine,
      optionSeriesIds,
    });

    const nextFundingTime = await perpStorage.nextFundingTime();
    const currentTs = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    if (currentTs >= nextFundingTime) {
      const [longRate, shortRate] = await fundingEngine.getCurrentFundingRate();
      await (await fundingEngine.updateFunding()).wait();
      const effective = (BigInt(longRate >= 0 ? longRate : -longRate) + BigInt(shortRate >= 0 ? shortRate : -shortRate)) / 2n;
      stepFundingTransferred = effective;
      cumulative.fundingTransferred += stepFundingTransferred;
    }

    if (step % ADL_QUEUE_REFRESH_INTERVAL === 0) {
      const adlQueueStats = await refreshAdlQueuesOnChain({
        perpStorage,
        riskManager,
        adlEngine,
        traderSigners,
        ownerSigner: matcher,
        marketId: defaultMarketId,
      });

      if (!options.headless || step === 0) {
        console.log(
          `[ADL QUEUE] step=${step} long=${adlQueueStats.longQueued}/${adlQueueStats.longCandidates} short=${adlQueueStats.shortQueued}/${adlQueueStats.shortCandidates} eligibleScores(long=${adlQueueStats.longEligibleScores},short=${adlQueueStats.shortEligibleScores})`,
        );
      }
    }

    const liquidatablePositions = await findLiquidatablePositions(perpStorage, riskManager, traderSigners);
    let stepLiquidations = 0;
    let stepLiquidatorOrders = 0;
    let stepAdlEvents = 0;
    let stepProactiveAdlEvents = 0;

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

      if (result.adlEvents > 0) {
        cumulative.adlEvents += result.adlEvents;
        cumulative.adlRequested += result.adlRequested;
        cumulative.adlCovered += result.adlCovered;
        cumulative.adlRemaining += result.adlRemaining;
        stepAdlEvents += result.adlEvents;
      }

      if (result.proactiveAdlEvents > 0) {
        cumulative.proactiveAdlEvents += result.proactiveAdlEvents;
        cumulative.proactiveAdlSoftEvents += result.proactiveAdlSoftEvents;
        cumulative.proactiveAdlHardEvents += result.proactiveAdlHardEvents;
        stepProactiveAdlEvents += result.proactiveAdlEvents;
      }

      cumulative.marginReturned += result.marginReturned;

      const liquidatorProfile = traderProfileByAddress.get(liquidator.address) ?? getDefaultTraderProfile();
      logger.logExecutionEvent({
        step,
        eventType: "liquidation",
        trader: liquidator.address,
        counterparty: pos.trader,
        agentType: liquidatorProfile.agentType,
        side: pos.side === 0 ? "long" : "short",
        exposure: pos.exposure,
        leverage: 1,
        reason: `position:${pos.positionId.toString()}`,
      });
    }

    const liquidatableOptionPositions = await findLiquidatableOptionPositions(perpStorage, riskManager);
    for (const optionPosition of liquidatableOptionPositions) {
      stepLiquidatorOrders++;
      const liquidator = random.pick(liquidatorSigners);

      const result = await tryLiquidateOptionPosition(liquidationEngine, liquidator, optionPosition.positionId);
      if (!result.ok) {
        continue;
      }

      stepLiquidations++;
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

      const liquidatorProfile = traderProfileByAddress.get(liquidator.address) ?? getDefaultTraderProfile();
      logger.logExecutionEvent({
        step,
        eventType: "liquidation",
        trader: liquidator.address,
        counterparty: optionPosition.trader,
        agentType: liquidatorProfile.agentType,
        side: "short",
        exposure: optionPosition.size,
        leverage: 1,
        reason: `option-position:${optionPosition.positionId.toString()}`,
      });
    }

    const adlInvariantFailures = evaluateAdlInvariantFailures({
      step,
      cumulativeRequested: cumulative.adlRequested,
      cumulativeCovered: cumulative.adlCovered,
      cumulativeRemaining: cumulative.adlRemaining,
      cumulativeProactive: cumulative.proactiveAdlEvents,
      cumulativeProactiveSoft: cumulative.proactiveAdlSoftEvents,
      cumulativeProactiveHard: cumulative.proactiveAdlHardEvents,
    });

    if (adlInvariantFailures.length > 0) {
      const adlMessage = `[ADL INVARIANTS] step ${step}: ${adlInvariantFailures.join(" | ")}`;
      if (isStressScenario) {
        throw new Error(adlMessage);
      }
      console.warn(adlMessage);
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
    const averageIntentLeverage = stepIntentLeverages.length > 0
      ? stepIntentLeverages.reduce((sum, leverage) => sum + leverage, 0) / stepIntentLeverages.length
      : 0;

    const snapshot = await collectConsistencySnapshot(step, nextPrice, traderSigners, {
      provider: ethers.provider,
      usdc,
      perpStorage,
      collateralManager,
      riskManager,
      fundingEngine,
      insuranceTreasury,
      protocolTreasury,
    });

    const metrics = await metricsCollector.collectMetrics(step, {
      price: nextPrice,
      openInterest,
      longOpenInterest: longOi,
      shortOpenInterest: shortOi,
      longShortRatio,
      tvl,
      marginVaultBalance: snapshot.onChain.collateralManagerBalance,
      averageLeverage: averageIntentLeverage,
      liquidations: stepLiquidations,
      positionsAtRisk: positionStats.positionsAtRisk,
      insuranceFundBalance: snapshot.onChain.insuranceFundBalance,
      protocolTreasuryBalance: snapshot.onChain.protocolTreasuryBalance,
      insurancePayouts: cumulative.insuranceOutflow,
      badDebt: snapshot.onChain.totalBadDebt,
      sumAccountCollateral: snapshot.onChain.sumAccountCollateral,
      sumReservedMargin: snapshot.onChain.sumReservedMargin,
      sumAvailableCollateral: snapshot.onChain.sumAvailableCollateral,
      sumTraderFundingOwed: snapshot.onChain.sumTraderFundingOwed,
      totalBooked: snapshot.onChain.totalBooked,
      totalContractBalance: snapshot.onChain.totalContractBalance,
      protocolRevenue: snapshot.onChain.feePool,
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
      adlRequestedNotional: cumulative.adlRequested,
      adlCoveredNotional: cumulative.adlCovered,
      adlRemainingDeficit: cumulative.adlRemaining,
      adlEvents: cumulative.adlEvents,
      proactiveAdlEvents: cumulative.proactiveAdlEvents,
      proactiveAdlSoftEvents: cumulative.proactiveAdlSoftEvents,
      proactiveAdlHardEvents: cumulative.proactiveAdlHardEvents,
      stepAdlEvents,
      stepProactiveAdlEvents,
      stepVolume,
      trades: stepTradeCount,
      optionsTrades: stepOptionsTrades,
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
    logger.logSnapshot(step, snapshot);

    const failedAssertions = snapshot.assertions.filter((assertion) => !assertion.ok);
    if (failedAssertions.length > 0) {
      const details = failedAssertions
        .slice(0, 8)
        .map((assertion) => `${assertion.name}: expected ${assertion.expected ?? "?"}, actual ${assertion.actual ?? "?"}`)
        .join(" | ");

      const forensic = [
        `totalContractBalance=${snapshot.onChain.totalContractBalance.toString()}`,
        `externalWalletBalances=${snapshot.onChain.externalWalletBalances.toString()}`,
        `totalBooked=${snapshot.onChain.totalBooked.toString()}`,
        `insuranceTreasuryBalance=${snapshot.onChain.insuranceTreasuryBalance.toString()}`,
        `insuranceFundBalance=${snapshot.onChain.insuranceFundBalance.toString()}`,
        `activeLongExposure=${snapshot.onChain.activeLongExposure.toString()}`,
        `activeShortExposure=${snapshot.onChain.activeShortExposure.toString()}`,
        `totalLongExposure=${snapshot.onChain.totalLongExposure.toString()}`,
        `totalShortExposure=${snapshot.onChain.totalShortExposure.toString()}`,
        `sumAccountCollateral=${snapshot.onChain.sumAccountCollateral.toString()}`,
        `sumReservedMargin=${snapshot.onChain.sumReservedMargin.toString()}`,
        `sumAvailableCollateral=${snapshot.onChain.sumAvailableCollateral.toString()}`,
      ].join(" | ");

      throw new Error(
        `Consistency check failed at step ${step} (block ${snapshot.blockNumber}, ts ${snapshot.timestamp}, price ${snapshot.scenarioPrice}): ${details} || ${forensic}`
      );
    }

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
      { name: "marketId", type: "bytes32" },
    ],
  };

  try {
    const longSig = await longTrader.signTypedData(domain, types, longOrder);
    const shortSig = await shortTrader.signTypedData(domain, types, shortOrder);

    if (String(longOrder.marketId).toLowerCase() !== String(shortOrder.marketId).toLowerCase()) {
      return false;
    }

    const marketId = String(longOrder.marketId);

    await (
      await settlementEngine
        .connect(matcher)
        .settleMatchForMarket(marketId, longOrder, longSig, shortOrder, shortSig, size)
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

async function refreshAdlQueuesOnChain(params: {
  perpStorage: Contract;
  riskManager: Contract;
  adlEngine: Contract;
  traderSigners: Signer[];
  ownerSigner: Signer;
  marketId: string;
}): Promise<{
  longCandidates: number;
  shortCandidates: number;
  longEligibleScores: number;
  shortEligibleScores: number;
  longQueued: number;
  shortQueued: number;
}> {
  const {
    perpStorage,
    riskManager,
    adlEngine,
    traderSigners,
    ownerSigner,
    marketId,
  } = params;

  const longRanks: Array<{ positionId: bigint; score: bigint }> = [];
  const shortRanks: Array<{ positionId: bigint; score: bigint }> = [];
  const zeroMarketId = "0x" + "0".repeat(64);
  const markPrice = await riskManager.getMarkPriceForMarket(marketId);

  let longCandidates = 0;
  let shortCandidates = 0;
  let longEligibleScores = 0;
  let shortEligibleScores = 0;

  for (const trader of traderSigners) {
    const ids: bigint[] = await perpStorage.getTraderPositions(trader.address);

    for (const id of ids) {
      try {
        const position = await perpStorage.getPosition(id);
        if (!position.active) continue;

        const positionMarketId = String(position.marketId);
        const resolvedMarketId = positionMarketId === zeroMarketId ? marketId : positionMarketId;
        if (resolvedMarketId.toLowerCase() !== marketId.toLowerCase()) continue;

        const isLong = Number(position.side) === 0;
        if (isLong) {
          longCandidates += 1;
        } else {
          shortCandidates += 1;
        }

        const scoreRaw = await adlEngine.calculateScore(id, markPrice);
        const score = BigInt(scoreRaw);
        if (score <= 0n) continue;

        if (isLong) {
          longEligibleScores += 1;
          longRanks.push({ positionId: BigInt(id), score });
        } else {
          shortEligibleScores += 1;
          shortRanks.push({ positionId: BigInt(id), score });
        }
      } catch {
        // Ignore stale/non-resolvable positions during queue refresh.
      }
    }
  }

  longRanks.sort((a, b) => {
    if (a.score === b.score) return 0;
    return a.score > b.score ? -1 : 1;
  });
  shortRanks.sort((a, b) => {
    if (a.score === b.score) return 0;
    return a.score > b.score ? -1 : 1;
  });

  const longQueuePayload = longRanks.map((entry) => ({
    positionId: entry.positionId,
    score: entry.score,
  }));
  const shortQueuePayload = shortRanks.map((entry) => ({
    positionId: entry.positionId,
    score: entry.score,
  }));

  await (await adlEngine.connect(ownerSigner).setQueue(marketId, true, longQueuePayload)).wait();
  await (await adlEngine.connect(ownerSigner).setQueue(marketId, false, shortQueuePayload)).wait();

  return {
    longCandidates,
    shortCandidates,
    longEligibleScores,
    shortEligibleScores,
    longQueued: longQueuePayload.length,
    shortQueued: shortQueuePayload.length,
  };
}

function buildTraderProfileMap(agentAddressMap: Record<string, string[]>): Map<string, TraderProfile> {
  const profileMap = new Map<string, TraderProfile>();

  for (const config of AGENT_CONFIGS) {
    if (config.type === "liquidator") continue;
    const addresses = agentAddressMap[config.type] ?? [];
    const profile: TraderProfile = {
      agentType: config.type,
      minTradeSize: Number(config.behavior.minTradeSize),
      maxTradeSize: Number(config.behavior.maxTradeSize),
      minLeverage: config.behavior.minLeverage,
      maxLeverage: config.behavior.maxLeverage,
      tradeFrequency: config.behavior.tradeFrequency,
      maxPositions: config.behavior.maxPositions ?? 5,
    };

    for (const address of addresses) {
      profileMap.set(address, profile);
    }
  }

  return profileMap;
}

function getDefaultTraderProfile(): TraderProfile {
  return {
    agentType: "fallback",
    minTradeSize: 500,
    maxTradeSize: 5000,
    minLeverage: 3,
    maxLeverage: 8,
    tradeFrequency: 0.1,
    maxPositions: 5,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deriveMarketTrend(priceHistory: number[]): "up" | "down" | "neutral" {
  if (priceHistory.length < 8) return "neutral";

  const recent = priceHistory.slice(-8);
  const start = recent[0];
  const end = recent[recent.length - 1];
  if (start <= 0) return "neutral";

  const change = (end - start) / start;
  if (change > 0.01) return "up";
  if (change < -0.01) return "down";
  return "neutral";
}

function shuffleDeterministic<T>(items: T[], random: DeterministicRandom): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
}

function chooseDirectionalSide(
  agentType: string,
  marketTrend: "up" | "down" | "neutral",
  random: DeterministicRandom,
  stepMoveBps: number
): 0 | 1 {
  if (agentType === "momentum") {
    if (marketTrend === "up") return random.next() > 0.2 ? 0 : 1;
    if (marketTrend === "down") return random.next() > 0.2 ? 1 : 0;
  }

  if (agentType === "arbitrageur") {
    if (Math.abs(stepMoveBps) > 35) {
      return stepMoveBps > 0 ? 1 : 0;
    }
  }

  if (agentType === "whale") {
    if (marketTrend === "up") return random.next() > 0.25 ? 0 : 1;
    if (marketTrend === "down") return random.next() > 0.25 ? 1 : 0;
  }

  return random.next() > 0.5 ? 0 : 1;
}

function buildStepIntents(
  ethers: any,
  traderSigners: Signer[],
  profileByAddress: Map<string, TraderProfile>,
  scenarioBaseFrequency: number,
  volumeMultiplier: number,
  marketTrend: "up" | "down" | "neutral",
  previousPrice: number,
  nextPrice: number,
  random: DeterministicRandom
): TradeIntent[] {
  const intents: TradeIntent[] = [];
  const activityScale = clamp(0.5 + (scenarioBaseFrequency * 2), 0.4, 1.8);
  const stepMoveBps = previousPrice > 0 ? ((nextPrice - previousPrice) / previousPrice) * 10000 : 0;

  for (const trader of traderSigners) {
    const profile = profileByAddress.get(trader.address) ?? getDefaultTraderProfile();
    const effectiveFrequency = clamp(profile.tradeFrequency * activityScale, 0.01, 0.95);
    if (random.next() > effectiveFrequency) {
      continue;
    }

    if (profile.agentType === "marketMaker") {
      const baseUsd = Math.floor(random.range(profile.minTradeSize, profile.maxTradeSize) * volumeMultiplier * 0.7);
      const exposure = ethers.parseUnits(String(Math.max(100, baseUsd)), 6);
      const leverage = random.range(profile.minLeverage, profile.maxLeverage);
      intents.push({
        trader,
        side: 0,
        exposure,
        leverage,
        agentType: profile.agentType,
        reason: "two-sided-liquidity",
      });
      intents.push({
        trader,
        side: 1,
        exposure,
        leverage,
        agentType: profile.agentType,
        reason: "two-sided-liquidity",
      });
      continue;
    }

    const side = chooseDirectionalSide(profile.agentType, marketTrend, random, stepMoveBps);
    const baseUsd = Math.floor(random.range(profile.minTradeSize, profile.maxTradeSize) * volumeMultiplier);
    const exposure = ethers.parseUnits(String(Math.max(100, baseUsd)), 6);
    const leverage = random.range(profile.minLeverage, profile.maxLeverage);

    intents.push({
      trader,
      side,
      exposure,
      leverage,
      agentType: profile.agentType,
      reason: marketTrend === "neutral" ? "random-entry" : `trend-${marketTrend}`,
    });

    if (profile.agentType === "retail" && random.next() > 0.75) {
      const secondSide = random.next() > 0.5 ? 0 : 1;
      const secondUsd = Math.floor(random.range(profile.minTradeSize, profile.maxTradeSize) * volumeMultiplier);
      intents.push({
        trader,
        side: secondSide,
        exposure: ethers.parseUnits(String(Math.max(100, secondUsd)), 6),
        leverage: random.range(profile.minLeverage, profile.maxLeverage),
        agentType: profile.agentType,
        reason: "retail-follow-up",
      });
    }
  }

  return intents;
}

function pairIntents(
  intents: TradeIntent[],
  random: DeterministicRandom
): { pairs: Array<{ long: TradeIntent; short: TradeIntent }>; unmatched: TradeIntent[] } {
  const longs = shuffleDeterministic(intents.filter((intent) => intent.side === 0), random);
  const shorts = shuffleDeterministic(intents.filter((intent) => intent.side === 1), random);
  const pairs: Array<{ long: TradeIntent; short: TradeIntent }> = [];
  const unmatched: TradeIntent[] = [];

  for (const longIntent of longs) {
    const shortIndex = shorts.findIndex((shortIntent) => shortIntent.trader.address !== longIntent.trader.address);
    if (shortIndex < 0) {
      unmatched.push(longIntent);
      continue;
    }

    const shortIntent = shorts.splice(shortIndex, 1)[0];
    pairs.push({ long: longIntent, short: shortIntent });
  }

  unmatched.push(...shorts);
  return { pairs, unmatched };
}

async function tryLiquidate(
  liquidationEngine: Contract,
  liquidator: Signer,
  positionId: bigint
): Promise<{
  ok: boolean;
  reward: bigint;
  coverAmount: bigint;
  insuranceInflow: bigint;
  penaltyCollected: bigint;
  marginReturned: bigint;
  adlRequested: bigint;
  adlCovered: bigint;
  adlRemaining: bigint;
  adlEvents: number;
  proactiveAdlEvents: number;
  proactiveAdlSoftEvents: number;
  proactiveAdlHardEvents: number;
}> {
  try {
    const tx = await liquidationEngine.connect(liquidator).liquidate(positionId);
    const receipt = await tx.wait();
    let reward = 0n;
    let coverAmount = 0n;
    let insuranceInflow = 0n;
    let penaltyCollected = 0n;
    let marginReturned = 0n;
    let adlRequested = 0n;
    let adlCovered = 0n;
    let adlRemaining = 0n;
    let adlEvents = 0;
    let proactiveAdlEvents = 0;
    let proactiveAdlSoftEvents = 0;
    let proactiveAdlHardEvents = 0;

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
        if (parsed.name === "ADLExecuted") {
          adlEvents += 1;
          adlRequested += BigInt(parsed.args.requestedDeficit ?? 0n);
          adlCovered += BigInt(parsed.args.covered ?? 0n);
          adlRemaining += BigInt(parsed.args.remainingDeficit ?? 0n);
        }
        if (parsed.name === "ADLProactiveTriggered") {
          proactiveAdlEvents += 1;
          if (Boolean(parsed.args.hardTrigger)) {
            proactiveAdlHardEvents += 1;
          } else {
            proactiveAdlSoftEvents += 1;
          }
        }
      } catch {
        // Ignore unrelated logs.
      }
    }

    return {
      ok: true,
      reward,
      coverAmount,
      insuranceInflow,
      penaltyCollected,
      marginReturned,
      adlRequested,
      adlCovered,
      adlRemaining,
      adlEvents,
      proactiveAdlEvents,
      proactiveAdlSoftEvents,
      proactiveAdlHardEvents,
    };
  } catch {
    return {
      ok: false,
      reward: 0n,
      coverAmount: 0n,
      insuranceInflow: 0n,
      penaltyCollected: 0n,
      marginReturned: 0n,
      adlRequested: 0n,
      adlCovered: 0n,
      adlRemaining: 0n,
      adlEvents: 0,
      proactiveAdlEvents: 0,
      proactiveAdlSoftEvents: 0,
      proactiveAdlHardEvents: 0,
    };
  }
}

async function initializeOptionSeries(params: {
  ethers: any;
  perpStorage: Contract;
  optionsEngine: Contract;
  marketId: string;
  collateralToken: string;
  initialPrice: number;
}): Promise<bigint[]> {
  const {
    ethers,
    perpStorage,
    optionsEngine,
    marketId,
    collateralToken,
    initialPrice,
  } = params;

  const latestBlock = await ethers.provider.getBlock("latest");
  const startTimestamp = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
  const expiry = startTimestamp + BigInt(OPTION_SERIES_LIFETIME_SECONDS);
  const strike = toOraclePrice(ethers, initialPrice);

  await (await optionsEngine.registerOptionSeries(marketId, true, strike, expiry, 8000, 100, collateralToken)).wait();
  const callSeriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

  await (await optionsEngine.registerOptionSeries(marketId, false, strike, expiry, 8000, 100, collateralToken)).wait();
  const putSeriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

  return [callSeriesId, putSeriesId];
}

async function runStepOptionTrades(params: {
  step: number;
  random: DeterministicRandom;
  traderSigners: Signer[];
  traderProfileByAddress: Map<string, TraderProfile>;
  optionsEngine: Contract;
  optionSeriesIds: bigint[];
  logger: SimulationLogger;
  cumulative: CumulativeFlows;
}): Promise<number> {
  const {
    step,
    random,
    traderSigners,
    traderProfileByAddress,
    optionsEngine,
    optionSeriesIds,
    logger,
    cumulative,
  } = params;

  if (step % OPTION_TRADE_INTERVAL !== 0 || traderSigners.length === 0 || optionSeriesIds.length === 0) {
    return 0;
  }

  let stepOptionsTrades = 0;
  const selectedTraders = shuffleDeterministic(traderSigners, random).slice(0, Math.min(OPTION_TRADERS_PER_STEP, traderSigners.length));

  for (const trader of selectedTraders) {
    const seriesId = random.pick(optionSeriesIds);
    const openLong = random.next() < 0.7;
    const profile = traderProfileByAddress.get(trader.address) ?? getDefaultTraderProfile();

    try {
      if (openLong) {
        await (await optionsEngine.connect(trader).openLongOption(seriesId, OPTION_TRADE_SIZE)).wait();
      } else {
        await (await optionsEngine.connect(trader).openShortOption(seriesId, OPTION_TRADE_SIZE)).wait();
      }

      stepOptionsTrades += 1;
      cumulative.optionsTrades += 1;

      logger.logExecutionEvent({
        step,
        eventType: "option-filled",
        trader: trader.address,
        agentType: profile.agentType,
        side: openLong ? "long" : "short",
        exposure: OPTION_TRADE_SIZE,
        leverage: 1,
        reason: `series:${seriesId.toString()}`,
      });
    } catch {
      logger.logExecutionEvent({
        step,
        eventType: "option-failed",
        trader: trader.address,
        agentType: profile.agentType,
        side: openLong ? "long" : "short",
        exposure: OPTION_TRADE_SIZE,
        leverage: 1,
        reason: `series:${seriesId.toString()}`,
      });
    }
  }

  return stepOptionsTrades;
}

async function expireAndSettleOptions(params: {
  perpStorage: Contract;
  optionsEngine: Contract;
  optionSeriesIds: bigint[];
}): Promise<void> {
  const {
    perpStorage,
    optionsEngine,
    optionSeriesIds,
  } = params;

  const provider = optionsEngine.runner?.provider;
  const latestBlock = provider ? await provider.getBlock("latest") : null;
  const currentTimestamp = BigInt(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));

  for (const seriesId of optionSeriesIds) {
    const series = await perpStorage.getOptionSeries(seriesId);
    const status = Number(series.status);
    const expiry = BigInt(series.expiry);

    if (status === 1 && currentTimestamp >= expiry) {
      try {
        await (await optionsEngine.expireSeries(seriesId)).wait();
      } catch {
        // Ignore expiry races once the series has already transitioned.
      }
    }

    const refreshedSeries = await perpStorage.getOptionSeries(seriesId);
    if (Number(refreshedSeries.status) !== 2) {
      continue;
    }

    const nextOptionPositionId = BigInt(await perpStorage.nextOptionPositionId());
    for (let positionId = 0n; positionId < nextOptionPositionId; positionId += 1n) {
      try {
        const position = await perpStorage.getOptionPosition(positionId);
        if (!position.active || position.settled) continue;
        if (BigInt(position.seriesId) !== seriesId) continue;

        await (await optionsEngine.settleOption(positionId)).wait();
      } catch {
        // Ignore positions that are no longer actionable.
      }
    }
  }
}

async function findLiquidatableOptionPositions(
  perpStorage: Contract,
  riskManager: Contract,
): Promise<Array<{ positionId: bigint; trader: string; size: bigint }>> {
  const positions: Array<{ positionId: bigint; trader: string; size: bigint }> = [];
  const nextOptionPositionId = BigInt(await perpStorage.nextOptionPositionId());

  for (let positionId = 0n; positionId < nextOptionPositionId; positionId += 1n) {
    try {
      const position = await perpStorage.getOptionPosition(positionId);
      if (!position.active || position.settled || position.isLong) continue;

      const liquidatable = await riskManager.isOptionPositionLiquidatable(positionId);
      if (!liquidatable) continue;

      positions.push({
        positionId,
        trader: position.trader,
        size: BigInt(position.size),
      });
    } catch {
      // Ignore uninitialized ids and positions that no longer resolve cleanly.
    }
  }

  return positions;
}

async function tryLiquidateOptionPosition(
  liquidationEngine: Contract,
  liquidator: Signer,
  optionPositionId: bigint,
): Promise<{
  ok: boolean;
  reward: bigint;
  coverAmount: bigint;
  insuranceInflow: bigint;
  penaltyCollected: bigint;
  marginReturned: bigint;
}> {
  try {
    const tx = await liquidationEngine.connect(liquidator).liquidateOptionPosition(optionPositionId);
    const receipt = await tx.wait();
    let reward = 0n;
    let coverAmount = 0n;
    let insuranceInflow = 0n;
    let penaltyCollected = 0n;
    let marginReturned = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = liquidationEngine.interface.parseLog(log);
        if (parsed.name === "OptionPositionLiquidated") {
          reward = BigInt(parsed.args.reward ?? 0n);
          insuranceInflow = BigInt(parsed.args.insuranceUsed ?? 0n);
          penaltyCollected = BigInt(parsed.args.penaltyCollected ?? 0n);
          marginReturned = BigInt(parsed.args.marginReturned ?? 0n);
        }
        if (parsed.name === "InsuranceFundUsed") {
          coverAmount = BigInt(parsed.args.amount ?? 0n);
        }
      } catch {
        // Ignore unrelated logs.
      }
    }

    return {
      ok: true,
      reward,
      coverAmount,
      insuranceInflow,
      penaltyCollected,
      marginReturned,
    };
  } catch {
    return {
      ok: false,
      reward: 0n,
      coverAmount: 0n,
      insuranceInflow: 0n,
      penaltyCollected: 0n,
      marginReturned: 0n,
    };
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

  const markPriceOnChain = toOraclePrice(ethers, markPrice);

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
        entryPrice: Number(position.entryPrice) / 1e18,
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

function toOraclePrice(ethers: any, price: number): bigint {
  return ethers.parseUnits(price.toFixed(8), 18);
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
