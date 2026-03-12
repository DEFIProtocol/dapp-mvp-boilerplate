"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, DollarSign, Play, Pause, RefreshCw, Shield, SlidersHorizontal } from "lucide-react";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type SettlementParams = {
  makerFeeBps: number;
  takerFeeBps: number;
  insuranceBps: number;
  maintenanceMarginBps: number;
  liquidationRewardBps: number;
  liquidationPenaltyBps: number;
};

type Side = "LONG" | "SHORT";

type SimPosition = {
  id: number;
  side: Side;
  exposureUsd: number;
  leverage: number;
  marginUsd: number;
  entryPrice: number;
  openedAtTick: number;
  fundingPaidUsd: number;
  active: boolean;
  realizedPnlUsd: number;
  liquidationTick?: number;
  liquidationReason?: string;
};

type LiquidationRecord = {
  positionId: number;
  side: Side;
  tick: number;
  markPrice: number;
  equityUsd: number;
  badDebtUsd: number;
  leftoverEquityUsd: number;
  rewardUsd: number;
  penaltyUsd: number;
  rewardPctOfLeftover: number;
  penaltyPctOfLeftover: number;
};

type SimStats = {
  totalOrders: number;
  activePositions: number;
  liquidatedPositions: number;
  fundingFeesGeneratedUsd: number;
  feePoolUsd: number;
  distributedFeesUsd: number;
  insuranceFundUsd: number;
  insurancePaidUsd: number;
  uncoveredBadDebtUsd: number;
  liquidationPenaltyCollectedUsd: number;
  liquidationRewardPaidUsd: number;
  totalNotionalUsd: number;
  openPositionValueUsd: number;
  avgLeverage: number;
  estWeeklyDistributionUsd: number;
};

type SweepResult = {
  mode: "fees" | "safety";
  makerFeeBps: number;
  takerFeeBps: number;
  liquidationPenaltyBps: number;
  maintenanceMarginBps: number;
  insuranceBps: number;
  liquidationCount: number;
  uncoveredBadDebtUsd: number;
  distributedFeesUsd: number;
  insuranceEndingUsd: number;
  activePositions: number;
  score: number;
};

type ReplayRun = {
  id: string;
  createdAt: string;
  scenario?: string;
  seed?: number;
  metricCount?: number;
  hasCompleteJson: boolean;
  hasSummary: boolean;
};

type ReplayMetric = {
  timestamp: number;
  blockNumber: number;
  price: number;
  openInterest: string;
  longOpenInterest: string;
  shortOpenInterest: string;
  longShortRatio: number;
  tvl: string;
  marginVaultBalance: string;
  marginVaultDelta: string;
  liquidationCount: number;
  positionsAtRisk: number;
  insuranceBalance: string;
  insuranceBalanceDelta: string;
  badDebt: string;
  badDebtDelta: string;
  insuranceCoverageRatio: number;
  protocolTreasuryBalance: string;
  protocolTreasuryDelta: string;
  protocolRevenue: string;
  protocolRevenueDelta: string;
  insuranceFundInflow: string;
  insuranceFundOutflow: string;
  liquidationInsuranceInflow: string;
  liquidatorRewardsPaid: string;
  liquidationPenaltyCollected: string;
  marginReturnedFromLiquidation: string;
  volume24h: string;
  tradeCount: number;
  uniqueTraders: number;
  openOrders: number;
  newOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  liquidationsPer100Orders: number;
  sumAccountCollateral: string;
  accountCollateralDelta: string;
  sumReservedMargin: string;
  reservedMarginDelta: string;
  sumAvailableCollateral: string;
  availableCollateralDelta: string;
  sumTraderFundingOwed: string;
  traderFundingOwedDelta: string;
  totalBooked: string;
  totalContractBalance: string;
  solvencyBuffer: string;
  fundingRate: number;
  nextFundingTime: number;
  spreadBps: number;
  slippageBps: number;
  priceImpactBps: number;
  longPositions: number;
  shortPositions: number;
  largePositions: number;
  averageLeverage: number;
  isInsolvent: boolean;
};

type ReplayPosition = {
  trader: string;
  positionId: string;
  size: string;
  collateral: string;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  pnl: string;
  pnlPercent: number;
  health: number;
  isLiquidatable: boolean;
};

type ReplayAssertion = {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
};

type ReplaySnapshot = {
  step: number;
  blockNumber: number;
  timestamp: number;
  scenarioPrice: number;
  onChain: {
    collateralManagerBalance: string;
    insuranceTreasuryBalance: string;
    protocolTreasuryBalance: string;
    feePool: string;
    insuranceFundBalance: string;
    totalBadDebt: string;
    totalLongExposure: string;
    totalShortExposure: string;
    sumAccountCollateral: string;
    sumReservedMargin: string;
    sumAvailableCollateral: string;
    sumTraderFundingOwed: string;
    activeLongExposure: string;
    activeShortExposure: string;
    activePositionCount: number;
    totalBooked: string;
    totalContractBalance: string;
  };
  assertions: ReplayAssertion[];
};

type ReplaySummary = {
  duration?: number;
  priceChange?: string;
  openInterest?: {
    start?: string;
    end?: string;
    change?: string;
  };
  tvl?: {
    start?: string;
    end?: string;
  };
  insuranceFund?: {
    start?: string;
    end?: string;
    peak?: string;
    maxDrawdown?: string;
    maxDrawdownPercent?: string;
  };
  liquidations?: {
    total?: number;
    insuranceUsed?: string;
    avgPayout?: string;
    per100Orders?: string;
  };
};

type ReplayData = {
  config?: {
    scenario?: string;
    seed?: number;
    agentCount?: number;
    startTime?: string;
  };
  metrics?: ReplayMetric[];
  positions?: Record<string, ReplayPosition[]>;
  snapshots?: Record<string, ReplaySnapshot>;
  liquidations?: Array<{
    step: number;
    trader: string;
    size: string;
    insuranceUsed: string;
    timestamp: number;
  }>;
  summary?: ReplaySummary;
  provenance?: {
    inputs?: string[];
    onChain?: string[];
    derived?: string[];
    assertions?: string[];
  };
};

const DEFAULT_PARAMS: SettlementParams = {
  makerFeeBps: 5,
  takerFeeBps: 10,
  insuranceBps: 200,
  maintenanceMarginBps: 1000,
  liquidationRewardBps: 500,
  liquidationPenaltyBps: 1000,
};

const INITIAL_INSURANCE_USD = 250_000;
const TICKS_PER_WEEK = 30;

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function parseScaledNumber(value: string | number | undefined, decimals = 6): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric / 10 ** decimals;
}

function formatScaledUsd(value: string | number | undefined, decimals = 6): string {
  return formatUsd(parseScaledNumber(value, decimals));
}

function formatSignedScaledUsd(value: string | number | undefined, decimals = 6): string {
  const parsed = parseScaledNumber(value, decimals);
  const prefix = parsed > 0 ? "+" : "";
  return `${prefix}${formatUsd(parsed)}`;
}

function formatPercent(value: number | string | undefined, digits = 2): string {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "--";
  return `${numeric.toFixed(digits)}%`;
}

function formatRatio(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)}x`;
}

function formatAddress(value: string | undefined): string {
  if (!value) return "--";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatStepLabel(step: number, timestamp: number | undefined): string {
  if (!timestamp) return `Step ${step}`;
  return `Step ${step} • ${new Date(timestamp).toLocaleString()}`;
}

export default function TokensSimulationPage() {
  const [params, setParams] = useState<SettlementParams>(DEFAULT_PARAMS);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsStatus, setParamsStatus] = useState("");

  const [orderCount, setOrderCount] = useState(200);
  const [minLeverage, setMinLeverage] = useState(2);
  const [maxLeverage, setMaxLeverage] = useState(25);
  const [minExposure, setMinExposure] = useState(1_000);
  const [maxExposure, setMaxExposure] = useState(25_000);

  const [liveEthPrice, setLiveEthPrice] = useState<number | null>(null);
  const [livePriceStatus, setLivePriceStatus] = useState("idle");
  const [useLiveAsMark, setUseLiveAsMark] = useState(true);
  const [manualMarkPrice, setManualMarkPrice] = useState(3200);
  const [markPrice, setMarkPrice] = useState(3200);
  const [driftPctPerTick, setDriftPctPerTick] = useState(0);
  const [volatilityPctPerTick, setVolatilityPctPerTick] = useState(1.5);
  const [fundingBpsPerTick, setFundingBpsPerTick] = useState(1);
  const [crashDropPct, setCrashDropPct] = useState(35);
  const [crashTicks, setCrashTicks] = useState(8);

  const [positions, setPositions] = useState<SimPosition[]>([]);
  const [liquidations, setLiquidations] = useState<LiquidationRecord[]>([]);
  const [tick, setTick] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [feePoolUsd, setFeePoolUsd] = useState(0);
  const [distributedFeesUsd, setDistributedFeesUsd] = useState(0);
  const [insuranceFundUsd, setInsuranceFundUsd] = useState(INITIAL_INSURANCE_USD);
  const [insurancePaidUsd, setInsurancePaidUsd] = useState(0);
  const [uncoveredBadDebtUsd, setUncoveredBadDebtUsd] = useState(0);
  const [fundingFeesGeneratedUsd, setFundingFeesGeneratedUsd] = useState(0);
  const [liquidationPenaltyCollectedUsd, setLiquidationPenaltyCollectedUsd] = useState(0);
  const [liquidationRewardPaidUsd, setLiquidationRewardPaidUsd] = useState(0);

  const [priceHistory, setPriceHistory] = useState<number[]>([3200]);
  const [simNote, setSimNote] = useState("");
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepResults, setSweepResults] = useState<SweepResult[]>([]);
  const [sweepMode, setSweepMode] = useState<"fees" | "safety">("fees");
  const [replayRuns, setReplayRuns] = useState<ReplayRun[]>([]);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [replayStatus, setReplayStatus] = useState("Loading latest replay...");
  const [replayLoading, setReplayLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [comparisonRunId, setComparisonRunId] = useState("");
  const [comparisonReplayData, setComparisonReplayData] = useState<ReplayData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [selectedReplayStep, setSelectedReplayStep] = useState(0);
  const nextPositionId = useRef(0);
  const deferredReplayStep = useDeferredValue(selectedReplayStep);

  const loadReplayRun = async (runId: string) => {
    if (!runId) return;

    setReplayLoading(true);
    setReplayStatus(`Loading replay ${runId}...`);

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/contract-sim/runs/${runId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || `Failed loading replay ${runId}`);
      }

      startTransition(() => {
        setReplayData(result as ReplayData);
        setSelectedRunId(runId);
        setSelectedReplayStep(Math.max((result?.metrics?.length ?? 1) - 1, 0));
      });

      setReplayStatus(`Loaded replay ${runId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed loading replay ${runId}`;
      setReplayStatus(message);
    } finally {
      setReplayLoading(false);
    }
  };

  const loadComparisonRun = async (runId: string) => {
    if (!runId) {
      setComparisonRunId("");
      setComparisonReplayData(null);
      return;
    }

    setComparisonLoading(true);
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/contract-sim/runs/${runId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || `Failed loading comparison run ${runId}`);
      }

      setComparisonRunId(runId);
      setComparisonReplayData(result as ReplayData);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed loading comparison run ${runId}`;
      setReplayStatus(message);
    } finally {
      setComparisonLoading(false);
    }
  };

  const loadReplayDashboard = async () => {
    setReplayLoading(true);
    setReplayStatus("Loading latest replay...");

    try {
      const [runsResponse, latestResponse] = await Promise.all([
        fetch(`${BACKEND_BASE_URL}/api/contract-sim/runs`),
        fetch(`${BACKEND_BASE_URL}/api/contract-sim/latest`),
      ]);

      const runsPayload = await runsResponse.json();
      const latestPayload = await latestResponse.json();

      if (!runsResponse.ok) {
        throw new Error(runsPayload?.error || "Failed loading replay runs");
      }

      if (!latestResponse.ok) {
        throw new Error(latestPayload?.error || "Failed loading latest replay");
      }

      const runs = Array.isArray(runsPayload?.runs) ? (runsPayload.runs as ReplayRun[]) : [];

      startTransition(() => {
        setReplayRuns(runs);
        setReplayData(latestPayload as ReplayData);
        setSelectedRunId(runs[0]?.id ?? "");
        setSelectedReplayStep(Math.max((latestPayload?.metrics?.length ?? 1) - 1, 0));
      });

      setReplayStatus(runs.length > 0 ? `Loaded latest replay and ${runs.length} saved runs.` : "Loaded latest replay.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed loading replay data";
      setReplayStatus(message);
    } finally {
      setReplayLoading(false);
    }
  };

  const loadParams = async () => {
    setParamsLoading(true);
    setParamsStatus("");
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/smart-contracts/params`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed loading params");
      }

      const source = result.data ?? result.params;
      if (!source) {
        throw new Error("No params in response");
      }

      setParams({
        makerFeeBps: Number(source.makerFeeBps),
        takerFeeBps: Number(source.takerFeeBps),
        insuranceBps: Number(source.insuranceBps),
        maintenanceMarginBps: Number(source.maintenanceMarginBps),
        liquidationRewardBps: Number(source.liquidationRewardBps),
        liquidationPenaltyBps: Number(source.liquidationPenaltyBps),
      });
      setParamsStatus("Loaded on-chain fee/risk params.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed loading params";
      setParamsStatus(message);
    } finally {
      setParamsLoading(false);
    }
  };

  const fetchEthPrice = async () => {
    setLivePriceStatus("loading");
    try {
      const candidates = [
        `${BACKEND_BASE_URL}/api/pyth/price/ethereum/eth%2Fusd`,
        `${BACKEND_BASE_URL}/api/pyth/price/ethereum/eth/usd`,
        `${BACKEND_BASE_URL}/api/prices`,
      ];

      let price: number | null = null;

      for (const url of candidates) {
        const response = await fetch(url);
        if (!response.ok) continue;
        const result = await response.json();

        if (url.includes("/api/prices")) {
          const ethCandidate =
            Number(result?.ETH?.price) ||
            Number(result?.eth?.price) ||
            Number(result?.data?.ETH?.price) ||
            Number(result?.data?.eth?.price);
          if (Number.isFinite(ethCandidate) && ethCandidate > 0) {
            price = ethCandidate;
            break;
          }
          continue;
        }

        const p = Number(result?.data?.price);
        if (Number.isFinite(p) && p > 0) {
          price = p;
          break;
        }
      }

      if (!price) {
        throw new Error("ETH price endpoint unavailable");
      }

      setLiveEthPrice(price);
      if (useLiveAsMark) {
        setMarkPrice(price);
        setPriceHistory((prev) => [...prev.slice(-119), price]);
      }
      setLivePriceStatus("ok");
    } catch {
      setLivePriceStatus("error");
    }
  };

  useEffect(() => {
    loadParams();
    fetchEthPrice();
    loadReplayDashboard();
  }, []);

  useEffect(() => {
    if (!useLiveAsMark) return;
    const interval = setInterval(fetchEthPrice, 10_000);
    return () => clearInterval(interval);
  }, [useLiveAsMark]);

  useEffect(() => {
    if (useLiveAsMark && liveEthPrice) {
      setMarkPrice(liveEthPrice);
    }
  }, [useLiveAsMark, liveEthPrice]);

  useEffect(() => {
    if (!useLiveAsMark) {
      setMarkPrice(manualMarkPrice);
    }
  }, [useLiveAsMark, manualMarkPrice]);

  const generateOrders = () => {
    if (maxLeverage < minLeverage || maxExposure < minExposure) {
      setSimNote("Check min/max inputs before generating orders.");
      return;
    }

    const created: SimPosition[] = [];
    let addedFees = 0;
    let addedInsurance = 0;

    for (let i = 0; i < orderCount; i++) {
      const side: Side = i % 2 === 0 ? "LONG" : "SHORT";
      const leverage = Math.floor(Math.random() * (maxLeverage - minLeverage + 1)) + minLeverage;
      const exposureUsd = Math.round(minExposure + Math.random() * (maxExposure - minExposure));
      const marginUsd = exposureUsd / leverage;
      const entryNoise = (Math.random() - 0.5) * 0.015;

      created.push({
        id: nextPositionId.current++,
        side,
        exposureUsd,
        leverage,
        marginUsd,
        entryPrice: markPrice * (1 + entryNoise),
        openedAtTick: tick,
        fundingPaidUsd: 0,
        active: true,
        realizedPnlUsd: 0,
      });

      const makerFee = (exposureUsd * params.makerFeeBps) / 10_000;
      const takerFee = (exposureUsd * params.takerFeeBps) / 10_000;
      const insuranceCut = (exposureUsd * params.insuranceBps) / 10_000;
      addedFees += makerFee + takerFee;
      addedInsurance += insuranceCut;
    }

    setPositions((prev) => [...prev, ...created]);
    setFeePoolUsd((prev) => prev + addedFees);
    setInsuranceFundUsd((prev) => prev + addedInsurance);
    setSimNote(`Generated ${created.length} simulated orders at mark ${formatUsd(markPrice)}.`);
  };

  const computePnl = (position: SimPosition, price: number): number => {
    const pctMove = (price - position.entryPrice) / position.entryPrice;
    const directional = position.side === "LONG" ? pctMove : -pctMove;
    return directional * position.exposureUsd;
  };

  const runSingleTick = (forcedMovePct?: number) => {
    const randomShock = forcedMovePct ?? (Math.random() * 2 - 1) * (volatilityPctPerTick / 100);
    const drift = driftPctPerTick / 100;
    const nextMark = clamp(markPrice * (1 + drift + randomShock), 300, 20_000);
    const tickAfter = tick + 1;

    let nextFeePool = feePoolUsd;
    let nextDistributed = distributedFeesUsd;
    let nextInsuranceFund = insuranceFundUsd;
    let nextInsurancePaid = insurancePaidUsd;
    let nextUncovered = uncoveredBadDebtUsd;
    let nextFundingGenerated = fundingFeesGeneratedUsd;
    let nextPenaltyCollected = liquidationPenaltyCollectedUsd;
    let nextRewardPaid = liquidationRewardPaidUsd;

    const newLiquidations: LiquidationRecord[] = [];

    const nextPositions = positions.map((position) => {
      if (!position.active) return position;

      const fundingDelta = (position.exposureUsd * fundingBpsPerTick) / 10_000;
      const fundingPaid = position.side === "LONG" ? fundingDelta : -fundingDelta;
      const cumulativeFunding = position.fundingPaidUsd + fundingPaid;
      nextFundingGenerated += Math.abs(fundingDelta);

      const pnl = computePnl(position, nextMark);
      const equity = position.marginUsd + pnl - cumulativeFunding;
      const maintenance = (position.exposureUsd * params.maintenanceMarginBps) / 10_000;

      if (equity < maintenance) {
        const leftoverEquity = Math.max(0, equity);
        let reward = (position.marginUsd * params.liquidationRewardBps) / 10_000;
        let penalty = (position.marginUsd * params.liquidationPenaltyBps) / 10_000;

        if (leftoverEquity > 0) {
          reward = Math.min(reward, leftoverEquity);
          penalty = Math.min(penalty, Math.max(0, leftoverEquity - reward));
        } else {
          reward = 0;
          penalty = 0;
        }

        const badDebt = Math.max(0, -equity);
        const insuranceCovered = Math.min(nextInsuranceFund, badDebt);

        nextInsuranceFund -= insuranceCovered;
        nextInsurancePaid += insuranceCovered;
        nextUncovered += badDebt - insuranceCovered;

        nextPenaltyCollected += penalty;
        nextRewardPaid += reward;
        nextFeePool += penalty - reward;

        newLiquidations.push({
          positionId: position.id,
          side: position.side,
          tick: tickAfter,
          markPrice: nextMark,
          equityUsd: equity,
          badDebtUsd: badDebt,
          leftoverEquityUsd: leftoverEquity,
          rewardUsd: reward,
          penaltyUsd: penalty,
          rewardPctOfLeftover: leftoverEquity > 0 ? (reward / leftoverEquity) * 100 : 0,
          penaltyPctOfLeftover: leftoverEquity > 0 ? (penalty / leftoverEquity) * 100 : 0,
        });

        return {
          ...position,
          active: false,
          fundingPaidUsd: cumulativeFunding,
          realizedPnlUsd: pnl,
          liquidationTick: tickAfter,
          liquidationReason: badDebt > 0 ? "Underwater" : "Maintenance breach",
        };
      }

      return {
        ...position,
        fundingPaidUsd: cumulativeFunding,
      };
    });

    if (tickAfter % TICKS_PER_WEEK === 0) {
      nextDistributed += nextFeePool;
      nextFeePool = 0;
    }

    const totalNotional = nextPositions.reduce((sum, p) => sum + (p.active ? p.exposureUsd : 0), 0);
    if (totalNotional > nextInsuranceFund * 25) {
      setSimNote("Failsafe watch: notional is much larger than insurance fund (future close-all trigger).");
    }

    setMarkPrice(nextMark);
    setPriceHistory((prev) => [...prev.slice(-119), nextMark]);
    setTick(tickAfter);
    setPositions(nextPositions);
    setFeePoolUsd(nextFeePool);
    setDistributedFeesUsd(nextDistributed);
    setInsuranceFundUsd(nextInsuranceFund);
    setInsurancePaidUsd(nextInsurancePaid);
    setUncoveredBadDebtUsd(nextUncovered);
    setFundingFeesGeneratedUsd(nextFundingGenerated);
    setLiquidationPenaltyCollectedUsd(nextPenaltyCollected);
    setLiquidationRewardPaidUsd(nextRewardPaid);

    if (newLiquidations.length > 0) {
      setLiquidations((prev) => [...newLiquidations, ...prev].slice(0, 300));
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(runSingleTick, 500);
    return () => clearInterval(interval);
  });

  const resetSimulation = () => {
    setPositions([]);
    setLiquidations([]);
    setTick(0);
    setFeePoolUsd(0);
    setDistributedFeesUsd(0);
    setInsuranceFundUsd(INITIAL_INSURANCE_USD);
    setInsurancePaidUsd(0);
    setUncoveredBadDebtUsd(0);
    setFundingFeesGeneratedUsd(0);
    setLiquidationPenaltyCollectedUsd(0);
    setLiquidationRewardPaidUsd(0);
    setPriceHistory([markPrice]);
    setSimNote("Simulation reset.");
    setIsRunning(false);
  };

  const runCrashScenario = () => {
    setIsRunning(false);

    if (positions.length === 0) {
      const previousOrderCount = orderCount;
      setOrderCount(200);
      generateOrders();
      setOrderCount(previousOrderCount);
    }

    const steps = clamp(crashTicks, 1, 100);
    const perTickDrop = -Math.abs(crashDropPct) / 100 / steps;
    let step = 0;

    const interval = setInterval(() => {
      runSingleTick(perTickDrop);
      step += 1;
      if (step >= steps) {
        clearInterval(interval);
        setSimNote(`Crash run complete: ${crashDropPct}% move over ${steps} ticks.`);
      }
    }, 180);
  };

  const runParameterSweep = (mode: "fees" | "safety") => {
    setSweepMode(mode);
    setSweepRunning(true);

    const makerGrid = [2, 5, 10, 20];
    const takerGrid = [5, 10, 20, 35];
    const penaltyGrid = [500, 1000, 1500, 2000];
    const maintenanceGrid = [700, 1000, 1300, 1600];
    const insuranceGrid = [100, 200, 300, 500];
    const horizonTicks = 90;

    const simulateScenario = (scenario: SettlementParams): SweepResult => {
      const rng = createRng(1337);
      let localPrice = markPrice;
      let localFeePool = 0;
      let localDistributed = 0;
      let localInsurance = INITIAL_INSURANCE_USD;
      let localUncovered = 0;
      let liquidationCount = 0;

      const localPositions: SimPosition[] = [];

      for (let i = 0; i < orderCount; i++) {
        const side: Side = i % 2 === 0 ? "LONG" : "SHORT";
        const leverage = Math.floor(rng() * (maxLeverage - minLeverage + 1)) + minLeverage;
        const exposureUsd = Math.round(minExposure + rng() * (maxExposure - minExposure));
        const marginUsd = exposureUsd / leverage;
        const entryNoise = (rng() - 0.5) * 0.015;

        localPositions.push({
          id: i,
          side,
          exposureUsd,
          leverage,
          marginUsd,
          entryPrice: localPrice * (1 + entryNoise),
          openedAtTick: 0,
          fundingPaidUsd: 0,
          active: true,
          realizedPnlUsd: 0,
        });

        const makerFee = (exposureUsd * scenario.makerFeeBps) / 10_000;
        const takerFee = (exposureUsd * scenario.takerFeeBps) / 10_000;
        const insuranceCut = (exposureUsd * scenario.insuranceBps) / 10_000;
        localFeePool += makerFee + takerFee;
        localInsurance += insuranceCut;
      }

      for (let t = 1; t <= horizonTicks; t++) {
        const randomShock = (rng() * 2 - 1) * (volatilityPctPerTick / 100);
        const drift = driftPctPerTick / 100;
        localPrice = clamp(localPrice * (1 + drift + randomShock), 300, 20_000);

        for (const position of localPositions) {
          if (!position.active) continue;

          const fundingDelta = (position.exposureUsd * fundingBpsPerTick) / 10_000;
          const fundingPaid = position.side === "LONG" ? fundingDelta : -fundingDelta;
          const cumulativeFunding = position.fundingPaidUsd + fundingPaid;

          const pctMove = (localPrice - position.entryPrice) / position.entryPrice;
          const directional = position.side === "LONG" ? pctMove : -pctMove;
          const pnl = directional * position.exposureUsd;
          const equity = position.marginUsd + pnl - cumulativeFunding;
          const maintenance = (position.exposureUsd * scenario.maintenanceMarginBps) / 10_000;

          if (equity < maintenance) {
            const reward = (position.marginUsd * scenario.liquidationRewardBps) / 10_000;
            const penalty = (position.marginUsd * scenario.liquidationPenaltyBps) / 10_000;
            const badDebt = Math.max(0, -equity);

            const insurancePaid = Math.min(localInsurance, badDebt);
            localInsurance -= insurancePaid;
            localUncovered += badDebt - insurancePaid;

            localFeePool += penalty - reward;
            liquidationCount += 1;
            position.active = false;
            position.fundingPaidUsd = cumulativeFunding;
            position.realizedPnlUsd = pnl;
          } else {
            position.fundingPaidUsd = cumulativeFunding;
          }
        }

        if (t % TICKS_PER_WEEK === 0) {
          localDistributed += localFeePool;
          localFeePool = 0;
        }
      }

      const active = localPositions.filter((position) => position.active).length;
      const score = mode === "fees"
        ? localUncovered * 5 + liquidationCount * 40 - localDistributed * 0.05
        : localUncovered * 7 + liquidationCount * 35 - localInsurance * 0.01;

      return {
        mode,
        makerFeeBps: scenario.makerFeeBps,
        takerFeeBps: scenario.takerFeeBps,
        liquidationPenaltyBps: scenario.liquidationPenaltyBps,
        maintenanceMarginBps: scenario.maintenanceMarginBps,
        insuranceBps: scenario.insuranceBps,
        liquidationCount,
        uncoveredBadDebtUsd: localUncovered,
        distributedFeesUsd: localDistributed,
        insuranceEndingUsd: localInsurance,
        activePositions: active,
        score,
      };
    };

    const scenarios: SettlementParams[] = [];

    if (mode === "fees") {
      for (const makerFeeBps of makerGrid) {
        for (const takerFeeBps of takerGrid) {
          for (const liquidationPenaltyBps of penaltyGrid) {
            scenarios.push({
              ...params,
              makerFeeBps,
              takerFeeBps,
              liquidationPenaltyBps,
            });
          }
        }
      }
    } else {
      for (const maintenanceMarginBps of maintenanceGrid) {
        for (const insuranceBps of insuranceGrid) {
          scenarios.push({
            ...params,
            maintenanceMarginBps,
            insuranceBps,
          });
        }
      }
    }

    const results = scenarios.map(simulateScenario).sort((a, b) => a.score - b.score);
    setSweepResults(results);
    setSweepRunning(false);
    setSimNote(`${mode === "fees" ? "Fee/liq" : "Safety"} sweep complete: ${results.length} scenarios ranked. Best score ${results[0]?.score.toFixed(2) ?? "n/a"}.`);
  };

  const applyBestSafePreset = () => {
    const bestSafe = sweepResults.find((result) => result.mode === "safety");
    if (!bestSafe) {
      setSimNote("Run Safety Sweep first, then apply best preset.");
      return;
    }

    setParams((prev) => ({
      ...prev,
      maintenanceMarginBps: bestSafe.maintenanceMarginBps,
      insuranceBps: bestSafe.insuranceBps,
      makerFeeBps: bestSafe.makerFeeBps,
      takerFeeBps: bestSafe.takerFeeBps,
      liquidationPenaltyBps: bestSafe.liquidationPenaltyBps,
    }));

    setSimNote(
      `Applied best safety preset: maintenance ${bestSafe.maintenanceMarginBps} bps, insurance ${bestSafe.insuranceBps} bps, score ${bestSafe.score.toFixed(2)}.`
    );
  };

  const activePositions = positions.filter((position) => position.active);
  const replayMetrics = useMemo(() => replayData?.metrics ?? [], [replayData?.metrics]);
  const replayStepCount = replayMetrics.length;
  const replayStep = replayStepCount === 0 ? 0 : clamp(deferredReplayStep, 0, replayStepCount - 1);
  const selectedReplayMetric = replayMetrics[replayStep];
  const selectedReplaySnapshot = replayData?.snapshots?.[String(replayStep)];
  const selectedReplayPositions = replayData?.positions?.[String(replayStep)] ?? [];
  const replayLiquidations = replayData?.liquidations ?? [];
  const replayAssertions = selectedReplaySnapshot?.assertions ?? [];
  const failedReplayAssertions = replayAssertions.filter((assertion) => !assertion.ok);
  const replayLiquidationsForStep = useMemo(
    () => replayLiquidations.filter((liquidation) => liquidation.step === replayStep),
    [replayLiquidations, replayStep]
  );
  const replayRecentLiquidations = useMemo(
    () => [...replayLiquidations].sort((left, right) => right.timestamp - left.timestamp).slice(0, 25),
    [replayLiquidations]
  );
  const replayTimelinePath = useMemo(() => {
    if (replayMetrics.length < 2) return "";
    const width = 780;
    const height = 180;
    const prices = replayMetrics.map((metric) => metric.price);
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const range = max - min || 1;

    return prices
      .map((price, index) => {
        const x = (index / (prices.length - 1)) * width;
        const y = height - ((price - min) / range) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [replayMetrics]);
  const marginVaultSeries = useMemo(
    () => replayMetrics.map((metric) => parseScaledNumber(metric.marginVaultBalance)).filter((value) => Number.isFinite(value)),
    [replayMetrics]
  );
  const marginVaultChartPath = useMemo(() => {
    if (marginVaultSeries.length < 2) return "";

    const width = 780;
    const height = 180;
    const max = Math.max(...marginVaultSeries);
    const min = Math.min(...marginVaultSeries);
    const range = max - min || 1;

    return marginVaultSeries
      .map((value, index) => {
        const x = (index / (marginVaultSeries.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [marginVaultSeries]);
  const marginVaultStability = useMemo(() => {
    if (marginVaultSeries.length < 4) {
      return { label: "Insufficient history", className: "text-gray-400" };
    }

    const differences = marginVaultSeries.slice(1).map((value, index) => Math.abs(value - marginVaultSeries[index]));
    const headWindow = differences.slice(0, Math.max(1, Math.floor(differences.length / 2)));
    const tailWindow = differences.slice(Math.max(0, differences.length - Math.max(2, Math.floor(differences.length / 3))));
    const headAvg = headWindow.reduce((sum, value) => sum + value, 0) / headWindow.length;
    const tailAvg = tailWindow.reduce((sum, value) => sum + value, 0) / tailWindow.length;

    if (tailAvg <= headAvg * 0.65) {
      return { label: "Stabilizing", className: "text-emerald-300" };
    }
    if (tailAvg <= headAvg * 1.1) {
      return { label: "Mostly steady", className: "text-yellow-200" };
    }
    return { label: "Still volatile", className: "text-red-300" };
  }, [marginVaultSeries]);
  const comparisonMetrics = useMemo(() => comparisonReplayData?.metrics ?? [], [comparisonReplayData?.metrics]);
  const primaryFirstMetric = replayMetrics.length > 0 ? replayMetrics[0] : undefined;
  const primaryLastMetric = replayMetrics.length > 0 ? replayMetrics[replayMetrics.length - 1] : undefined;
  const comparisonFirstMetric = comparisonMetrics.length > 0 ? comparisonMetrics[0] : undefined;
  const comparisonLastMetric = comparisonMetrics.length > 0 ? comparisonMetrics[comparisonMetrics.length - 1] : undefined;

  const comparisonRows = [
    {
      label: "Margin vault",
      primaryEnd: formatScaledUsd(primaryLastMetric?.marginVaultBalance),
      primaryChange: formatSignedScaledUsd(parseScaledNumber(primaryLastMetric?.marginVaultBalance) - parseScaledNumber(primaryFirstMetric?.marginVaultBalance)),
      compareEnd: formatScaledUsd(comparisonLastMetric?.marginVaultBalance),
      compareChange: formatSignedScaledUsd(parseScaledNumber(comparisonLastMetric?.marginVaultBalance) - parseScaledNumber(comparisonFirstMetric?.marginVaultBalance)),
    },
    {
      label: "Protocol treasury",
      primaryEnd: formatScaledUsd(primaryLastMetric?.protocolTreasuryBalance),
      primaryChange: formatSignedScaledUsd(parseScaledNumber(primaryLastMetric?.protocolTreasuryBalance) - parseScaledNumber(primaryFirstMetric?.protocolTreasuryBalance)),
      compareEnd: formatScaledUsd(comparisonLastMetric?.protocolTreasuryBalance),
      compareChange: formatSignedScaledUsd(parseScaledNumber(comparisonLastMetric?.protocolTreasuryBalance) - parseScaledNumber(comparisonFirstMetric?.protocolTreasuryBalance)),
    },
    {
      label: "Insurance fund",
      primaryEnd: formatScaledUsd(primaryLastMetric?.insuranceBalance),
      primaryChange: formatSignedScaledUsd(parseScaledNumber(primaryLastMetric?.insuranceBalance) - parseScaledNumber(primaryFirstMetric?.insuranceBalance)),
      compareEnd: formatScaledUsd(comparisonLastMetric?.insuranceBalance),
      compareChange: formatSignedScaledUsd(parseScaledNumber(comparisonLastMetric?.insuranceBalance) - parseScaledNumber(comparisonFirstMetric?.insuranceBalance)),
    },
    {
      label: "Bad debt",
      primaryEnd: formatScaledUsd(primaryLastMetric?.badDebt),
      primaryChange: formatSignedScaledUsd(parseScaledNumber(primaryLastMetric?.badDebt) - parseScaledNumber(primaryFirstMetric?.badDebt)),
      compareEnd: formatScaledUsd(comparisonLastMetric?.badDebt),
      compareChange: formatSignedScaledUsd(parseScaledNumber(comparisonLastMetric?.badDebt) - parseScaledNumber(comparisonFirstMetric?.badDebt)),
    },
    {
      label: "Solvency buffer",
      primaryEnd: formatScaledUsd(primaryLastMetric?.solvencyBuffer),
      primaryChange: formatSignedScaledUsd(parseScaledNumber(primaryLastMetric?.solvencyBuffer) - parseScaledNumber(primaryFirstMetric?.solvencyBuffer)),
      compareEnd: formatScaledUsd(comparisonLastMetric?.solvencyBuffer),
      compareChange: formatSignedScaledUsd(parseScaledNumber(comparisonLastMetric?.solvencyBuffer) - parseScaledNumber(comparisonFirstMetric?.solvencyBuffer)),
    },
  ];

  const stats: SimStats = useMemo(() => {
    const totalOrders = positions.length;
    const active = activePositions.length;
    const liquidated = positions.filter((p) => !p.active).length;
    const totalNotional = activePositions.reduce((sum, p) => sum + p.exposureUsd, 0);
    const openValue = activePositions.reduce((sum, p) => sum + computePnl(p, markPrice) + p.marginUsd, 0);
    const avgLev = active > 0 ? activePositions.reduce((sum, p) => sum + p.leverage, 0) / active : 0;

    return {
      totalOrders,
      activePositions: active,
      liquidatedPositions: liquidated,
      fundingFeesGeneratedUsd,
      feePoolUsd,
      distributedFeesUsd,
      insuranceFundUsd,
      insurancePaidUsd,
      uncoveredBadDebtUsd,
      liquidationPenaltyCollectedUsd,
      liquidationRewardPaidUsd,
      totalNotionalUsd: totalNotional,
      openPositionValueUsd: openValue,
      avgLeverage: avgLev,
      estWeeklyDistributionUsd: feePoolUsd,
    };
  }, [
    positions,
    activePositions,
    markPrice,
    fundingFeesGeneratedUsd,
    feePoolUsd,
    distributedFeesUsd,
    insuranceFundUsd,
    insurancePaidUsd,
    uncoveredBadDebtUsd,
    liquidationPenaltyCollectedUsd,
    liquidationRewardPaidUsd,
  ]);

  const chartPath = useMemo(() => {
    if (priceHistory.length < 2) return "";
    const width = 780;
    const height = 180;
    const max = Math.max(...priceHistory);
    const min = Math.min(...priceHistory);
    const range = max - min || 1;

    return priceHistory
      .map((price, index) => {
        const x = (index / (priceHistory.length - 1)) * width;
        const y = height - ((price - min) / range) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [priceHistory]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Activity className="w-7 h-7 text-blue-400" /> ETH Perp Replay Lab
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Replay saved contract-sim runs from backend artifacts, inspect treasury and insurance flows, then compare them against the local sandbox below.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadReplayDashboard}
              disabled={replayLoading}
              className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> {replayLoading ? "Loading Replay..." : "Refresh Replay"}
            </button>
            <button
              onClick={fetchEthPrice}
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Refresh ETH
            </button>
            <button
              onClick={loadParams}
              disabled={paramsLoading}
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm disabled:opacity-50"
            >
              {paramsLoading ? "Loading params..." : "Reload Params"}
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-blue-900/40 bg-gradient-to-br from-blue-950/40 via-gray-950 to-emerald-950/20 p-4 md:p-5 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.24em] text-blue-300">Replay Control Room</div>
              <h2 className="text-xl font-semibold">Contract-sim artifact viewer</h2>
              <p className="text-sm text-gray-400 max-w-3xl">
                This section reads saved backend artifacts from /api/contract-sim so the balances, deltas, exposures, and invariant checks come from simulator replay output rather than the synthetic UI model.
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3 text-sm text-gray-300 min-w-[280px]">
              <div className="text-gray-500">Replay status</div>
              <div className="mt-1 font-medium text-gray-100">{replayStatus}</div>
              <div className="mt-2 text-xs text-gray-500">
                {replayData?.config?.startTime ? `Started ${new Date(replayData.config.startTime).toLocaleString()}` : "No replay loaded yet"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="flex-1 text-sm">
                  <span className="block text-gray-400 mb-1">Saved run</span>
                  <select
                    value={selectedRunId}
                    onChange={(e) => {
                      const runId = e.target.value;
                      if (!runId) {
                        loadReplayDashboard();
                        return;
                      }
                      loadReplayRun(runId);
                    }}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-sm"
                  >
                    <option value="">Latest artifact</option>
                    {replayRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id} • {run.scenario ?? "unknown"} • {run.metricCount ?? 0} steps
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-3 md:min-w-[340px]">
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                    <div className="text-xs text-gray-500">Scenario</div>
                    <div className="mt-1 font-medium">{replayData?.config?.scenario ?? "--"}</div>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                    <div className="text-xs text-gray-500">Seed</div>
                    <div className="mt-1 font-medium">{replayData?.config?.seed ?? "--"}</div>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                    <div className="text-xs text-gray-500">Steps</div>
                    <div className="mt-1 font-medium">{formatCount(replayStepCount)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div className="text-gray-300">{formatStepLabel(replayStep, selectedReplayMetric?.timestamp)}</div>
                  <div className="text-gray-500">
                    Block {selectedReplayMetric?.blockNumber ?? "--"} • {selectedReplayPositions.length} open positions
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(replayStepCount - 1, 0)}
                  value={replayStep}
                  disabled={replayStepCount === 0}
                  onChange={(e) => setSelectedReplayStep(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div className="w-full overflow-x-auto">
                <svg width="780" height="200" viewBox="0 0 780 200" className="rounded-lg bg-gray-950 border border-gray-800">
                  <path d={replayTimelinePath} fill="none" stroke="#34d399" strokeWidth="2.25" />
                </svg>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-100">Run summary</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Price change</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.priceChange ?? "--"}</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Duration</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.duration ?? 0} steps</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Open interest</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.openInterest?.end ?? "--"}</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Liquidations</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.liquidations?.total ?? 0}</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Insurance end</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.insuranceFund?.end ?? "--"}</div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="text-xs text-gray-500">Max drawdown</div>
                  <div className="mt-1 font-medium">{replayData?.summary?.insuranceFund?.maxDrawdownPercent ?? "--"}</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
                Provenance: {replayData?.provenance?.onChain?.length ?? 0} on-chain metrics, {replayData?.provenance?.derived?.length ?? 0} derived metrics, {replayData?.provenance?.assertions?.length ?? 0} assertion families.
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Replay Margin Vault</div>
            <div className="text-xl font-semibold">{formatScaledUsd(selectedReplayMetric?.marginVaultBalance)}</div>
            <div className={`text-xs mt-1 ${parseScaledNumber(selectedReplayMetric?.marginVaultDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              delta {formatSignedScaledUsd(selectedReplayMetric?.marginVaultDelta)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Replay Protocol Treasury</div>
            <div className="text-xl font-semibold">{formatScaledUsd(selectedReplayMetric?.protocolTreasuryBalance)}</div>
            <div className={`text-xs mt-1 ${parseScaledNumber(selectedReplayMetric?.protocolTreasuryDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              delta {formatSignedScaledUsd(selectedReplayMetric?.protocolTreasuryDelta)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Replay Insurance Fund</div>
            <div className="text-xl font-semibold">{formatScaledUsd(selectedReplayMetric?.insuranceBalance)}</div>
            <div className={`text-xs mt-1 ${parseScaledNumber(selectedReplayMetric?.insuranceBalanceDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              delta {formatSignedScaledUsd(selectedReplayMetric?.insuranceBalanceDelta)}
            </div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Replay Solvency Buffer</div>
            <div className="text-xl font-semibold">{formatScaledUsd(selectedReplayMetric?.solvencyBuffer)}</div>
            <div className={`text-xs mt-1 ${selectedReplayMetric?.isInsolvent ? "text-red-300" : "text-emerald-300"}`}>
              {selectedReplayMetric?.isInsolvent ? "insolvent" : "solvent"}
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-[1fr_1fr] gap-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Margin Vault Trend (Replay)</h2>
              <div className={`text-xs ${marginVaultStability.className}`}>{marginVaultStability.label}</div>
            </div>
            <div className="text-xs text-gray-400 mb-3">
              One chart only: this is the quickest way to see if the vault is converging toward steadier per-step changes.
            </div>
            <div className="w-full overflow-x-auto">
              <svg width="780" height="200" viewBox="0 0 780 200" className="rounded-lg bg-gray-950 border border-gray-800">
                <path d={marginVaultChartPath} fill="none" stroke="#38bdf8" strokeWidth="2.1" />
              </svg>
            </div>
          </div>

          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Run-to-run comparison</h2>
              <div className="text-xs text-gray-500">end state + net change</div>
            </div>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Baseline run</span>
              <select
                value={comparisonRunId}
                onChange={(e) => loadComparisonRun(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-sm"
              >
                <option value="">No baseline selected</option>
                {replayRuns
                  .filter((run) => run.id !== selectedRunId)
                  .map((run) => (
                    <option key={`baseline-${run.id}`} value={run.id}>
                      {run.id} • {run.scenario ?? "unknown"} • {run.metricCount ?? 0} steps
                    </option>
                  ))}
              </select>
            </label>

            {!comparisonRunId ? (
              <div className="text-sm text-gray-500">Pick a baseline run to compare treasury, insurance, bad debt, solvency, and margin vault outcomes.</div>
            ) : comparisonLoading ? (
              <div className="text-sm text-gray-400">Loading baseline run...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-800">
                      <th className="py-2 pr-3">Metric</th>
                      <th className="py-2 pr-3">Current end</th>
                      <th className="py-2 pr-3">Current Δ</th>
                      <th className="py-2 pr-3">Baseline end</th>
                      <th className="py-2 pr-3">Baseline Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label} className="border-b border-gray-900">
                        <td className="py-2 pr-3 text-gray-200">{row.label}</td>
                        <td className="py-2 pr-3 text-gray-100">{row.primaryEnd}</td>
                        <td className="py-2 pr-3 text-gray-300">{row.primaryChange}</td>
                        <td className="py-2 pr-3 text-gray-100">{row.compareEnd}</td>
                        <td className="py-2 pr-3 text-gray-300">{row.compareChange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> On-chain replay accounting
              </h2>
              <div className="text-xs text-gray-500">step {replayStep}</div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Open interest</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.openInterest)}</div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Long / Short</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.longOpenInterest)} / {formatScaledUsd(selectedReplayMetric?.shortOpenInterest)}</div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Contract balance</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.totalContractBalance)}</div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Total booked</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.totalBooked)}</div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Reserved margin</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.sumReservedMargin)}</div>
                <div className={`mt-1 text-xs ${parseScaledNumber(selectedReplayMetric?.reservedMarginDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatSignedScaledUsd(selectedReplayMetric?.reservedMarginDelta)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Available collateral</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.sumAvailableCollateral)}</div>
                <div className={`mt-1 text-xs ${parseScaledNumber(selectedReplayMetric?.availableCollateralDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatSignedScaledUsd(selectedReplayMetric?.availableCollateralDelta)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Trader funding owed</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.sumTraderFundingOwed)}</div>
                <div className={`mt-1 text-xs ${parseScaledNumber(selectedReplayMetric?.traderFundingOwedDelta) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatSignedScaledUsd(selectedReplayMetric?.traderFundingOwedDelta)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Bad debt</div>
                <div className="mt-1 font-medium">{formatScaledUsd(selectedReplayMetric?.badDebt)}</div>
                <div className={`mt-1 text-xs ${parseScaledNumber(selectedReplayMetric?.badDebtDelta) <= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {formatSignedScaledUsd(selectedReplayMetric?.badDebtDelta)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
                <div className="text-gray-500">Price impact / slippage</div>
                <div className="mt-1 font-medium">{formatPercent(selectedReplayMetric?.priceImpactBps / 100)} / {formatPercent(selectedReplayMetric?.slippageBps / 100)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Assertion status
            </h2>
            <div className={`rounded-lg border px-3 py-2 text-sm ${failedReplayAssertions.length === 0 ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-200" : "border-red-900/60 bg-red-950/30 text-red-200"}`}>
              {failedReplayAssertions.length === 0
                ? `All ${replayAssertions.length} assertions passed for this step.`
                : `${failedReplayAssertions.length} assertions failed for this step.`}
            </div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {replayAssertions.length === 0 && <div className="text-sm text-gray-500">No snapshot assertions for this step.</div>}
              {replayAssertions.map((assertion) => (
                <div key={assertion.name} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-gray-100 break-all">{assertion.name}</div>
                    <div className={assertion.ok ? "text-emerald-300" : "text-red-300"}>{assertion.ok ? "PASS" : "FAIL"}</div>
                  </div>
                  {!assertion.ok && (
                    <div className="mt-2 text-xs text-gray-400">
                      expected {assertion.expected} • actual {assertion.actual}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-[1fr_1fr] gap-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Liquidation timeline</h2>
              <div className="text-xs text-gray-500">{replayLiquidations.length} total events</div>
            </div>
            {replayRecentLiquidations.length === 0 ? (
              <div className="text-sm text-gray-500">No liquidation events found in this replay.</div>
            ) : (
              <div className="max-h-72 overflow-auto space-y-2 pr-1">
                {replayRecentLiquidations.map((event, index) => (
                  <div key={`${event.trader}-${event.timestamp}-${index}`} className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-300">{formatAddress(event.trader)}</div>
                      <div className="text-xs text-gray-500">step {event.step}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="text-gray-400">Size</div>
                      <div className="text-right text-gray-100">{formatScaledUsd(event.size)}</div>
                      <div className="text-gray-400">Insurance used</div>
                      <div className="text-right text-blue-300">{formatScaledUsd(event.insuranceUsed)}</div>
                      <div className="text-gray-400">Time</div>
                      <div className="text-right text-gray-300">{new Date(event.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Selected step liquidations</h2>
              <div className="text-xs text-gray-500">step {replayStep}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Events</div>
                <div className="mt-1 font-medium">{formatCount(replayLiquidationsForStep.length)}</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Metric count</div>
                <div className="mt-1 font-medium">{selectedReplayMetric?.liquidationCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Penalty collected</div>
                <div className="mt-1 font-medium text-orange-300">{formatScaledUsd(selectedReplayMetric?.liquidationPenaltyCollected)}</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Liquidator rewards</div>
                <div className="mt-1 font-medium text-yellow-200">{formatScaledUsd(selectedReplayMetric?.liquidatorRewardsPaid)}</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Insurance inflow</div>
                <div className="mt-1 font-medium text-emerald-300">{formatScaledUsd(selectedReplayMetric?.liquidationInsuranceInflow)}</div>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="text-xs text-gray-500">Insurance outflow</div>
                <div className="mt-1 font-medium text-red-300">{formatScaledUsd(selectedReplayMetric?.insuranceFundOutflow)}</div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-xs text-gray-400">
              Event stream and per-step metrics can differ when multiple liquidations occur in the same block; both are shown for cross-checking.
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Replay positions at selected step</h2>
            <div className="text-xs text-gray-500">
              {selectedReplaySnapshot ? `${selectedReplaySnapshot.onChain.activePositionCount} active positions on-chain` : "No snapshot selected"}
            </div>
          </div>

          {selectedReplayPositions.length === 0 ? (
            <div className="text-sm text-gray-500">No replay positions available for this step.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-3">Trader</th>
                    <th className="py-2 pr-3">Pos ID</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Collateral</th>
                    <th className="py-2 pr-3">Lev</th>
                    <th className="py-2 pr-3">Entry</th>
                    <th className="py-2 pr-3">Mark</th>
                    <th className="py-2 pr-3">PnL</th>
                    <th className="py-2 pr-3">Health</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReplayPositions.map((position) => (
                    <tr key={`${position.trader}-${position.positionId}`} className="border-b border-gray-900">
                      <td className="py-2 pr-3 text-gray-300">{formatAddress(position.trader)}</td>
                      <td className="py-2 pr-3">{position.positionId}</td>
                      <td className="py-2 pr-3">{formatScaledUsd(position.size)}</td>
                      <td className="py-2 pr-3">{formatScaledUsd(position.collateral)}</td>
                      <td className="py-2 pr-3">{formatRatio(position.leverage, 1)}</td>
                      <td className="py-2 pr-3">{formatUsd(position.entryPrice)}</td>
                      <td className="py-2 pr-3">{formatUsd(position.markPrice)}</td>
                      <td className={`py-2 pr-3 ${parseScaledNumber(position.pnl) >= 0 ? "text-emerald-300" : "text-red-300"}`}>{formatSignedScaledUsd(position.pnl)}</td>
                      <td className="py-2 pr-3">{formatRatio(position.health, 2)}</td>
                      <td className={`py-2 pr-3 ${position.isLiquidatable ? "text-red-300" : "text-emerald-300"}`}>{position.isLiquidatable ? "At risk" : "Healthy"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">ETH Oracle Price</div>
            <div className="text-xl font-semibold">{liveEthPrice ? formatUsd(liveEthPrice) : "--"}</div>
            <div className="text-xs mt-1 text-gray-500">status: {livePriceStatus}</div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Simulation Mark</div>
            <div className="text-xl font-semibold">{formatUsd(markPrice)}</div>
            <div className="text-xs mt-1 text-gray-500">tick #{tick}</div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Active / Liquidated</div>
            <div className="text-xl font-semibold">{stats.activePositions} / {stats.liquidatedPositions}</div>
            <div className="text-xs mt-1 text-gray-500">total orders: {stats.totalOrders}</div>
          </div>
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="text-xs text-gray-400 mb-1">Insurance Fund</div>
            <div className="text-xl font-semibold">{formatUsd(stats.insuranceFundUsd)}</div>
            <div className="text-xs mt-1 text-red-300">uncovered debt: {formatUsd(stats.uncoveredBadDebtUsd)}</div>
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-400" /> ETH Mark Chart (simulation)
            </h2>
            <div className="text-xs text-gray-400">last {priceHistory.length} points</div>
          </div>
          <div className="w-full overflow-x-auto">
            <svg width="780" height="200" viewBox="0 0 780 200" className="rounded-lg bg-gray-950 border border-gray-800">
              <path d={chartPath} fill="none" stroke="#60a5fa" strokeWidth="2" />
            </svg>
          </div>
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-400" /> Scenario Controls
            </h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Order Count</span>
                <input type="number" value={orderCount} onChange={(e) => setOrderCount(clamp(Number(e.target.value), 10, 2000))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Min Leverage</span>
                <input type="number" value={minLeverage} onChange={(e) => setMinLeverage(clamp(Number(e.target.value), 1, 100))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Max Leverage</span>
                <input type="number" value={maxLeverage} onChange={(e) => setMaxLeverage(clamp(Number(e.target.value), 1, 100))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Funding bps/tick</span>
                <input type="number" value={fundingBpsPerTick} onChange={(e) => setFundingBpsPerTick(clamp(Number(e.target.value), -100, 100))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>

              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Min Exposure USD</span>
                <input type="number" value={minExposure} onChange={(e) => setMinExposure(clamp(Number(e.target.value), 100, 1_000_000))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Max Exposure USD</span>
                <input type="number" value={maxExposure} onChange={(e) => setMaxExposure(clamp(Number(e.target.value), 100, 1_000_000))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Drift % per tick</span>
                <input type="number" value={driftPctPerTick} onChange={(e) => setDriftPctPerTick(clamp(Number(e.target.value), -20, 20))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Volatility % per tick</span>
                <input type="number" value={volatilityPctPerTick} onChange={(e) => setVolatilityPctPerTick(clamp(Number(e.target.value), 0, 50))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Crash Drop %</span>
                <input type="number" value={crashDropPct} onChange={(e) => setCrashDropPct(clamp(Number(e.target.value), 1, 95))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Crash Ticks</span>
                <input type="number" value={crashTicks} onChange={(e) => setCrashTicks(clamp(Number(e.target.value), 1, 100))} className="w-full rounded bg-gray-800 border border-gray-700 p-2" />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={useLiveAsMark} onChange={(e) => setUseLiveAsMark(e.target.checked)} />
                Use live ETH as mark
              </label>
              {!useLiveAsMark && (
                <label className="text-sm">
                  <span className="text-gray-400 mr-2">Manual Mark</span>
                  <input
                    type="number"
                    value={manualMarkPrice}
                    onChange={(e) => setManualMarkPrice(clamp(Number(e.target.value), 100, 20_000))}
                    className="w-32 rounded bg-gray-800 border border-gray-700 p-2"
                  />
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={generateOrders} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold">Generate Orders</button>
              <button onClick={runCrashScenario} className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-500 text-sm font-semibold">Run Crash Scenario</button>
              <button onClick={() => runSingleTick()} className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm">Step Tick</button>
              {!isRunning ? (
                <button onClick={() => setIsRunning(true)} className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-sm flex items-center gap-2"><Play className="w-4 h-4" />Run</button>
              ) : (
                <button onClick={() => setIsRunning(false)} className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-500 text-sm flex items-center gap-2"><Pause className="w-4 h-4" />Pause</button>
              )}
              <button onClick={resetSimulation} className="px-4 py-2 rounded bg-red-700 hover:bg-red-600 text-sm">Reset</button>
            </div>

            {simNote && <p className="text-sm text-blue-300">{simNote}</p>}
          </div>

          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Fee & Insurance Stats</h2>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Funding generated (gross)</span><span>{formatUsd(stats.fundingFeesGeneratedUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Fee pool</span><span>{formatUsd(stats.feePoolUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Distributed</span><span>{formatUsd(stats.distributedFeesUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Open position value</span><span>{formatUsd(stats.openPositionValueUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Liquidation penalties</span><span>{formatUsd(stats.liquidationPenaltyCollectedUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Liquidation rewards</span><span>{formatUsd(stats.liquidationRewardPaidUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Insurance paid</span><span>{formatUsd(stats.insurancePaidUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Total notional</span><span>{formatUsd(stats.totalNotionalUsd)}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Liquidation count</span><span>{stats.liquidatedPositions}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Open positions</span><span>{stats.activePositions}</span></div>
            <div className="text-sm flex justify-between"><span className="text-gray-400">Average leverage</span><span>{stats.avgLeverage.toFixed(2)}x</span></div>
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">weekly fee distribution tick every {TICKS_PER_WEEK} steps</div>
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-blue-400" /> Recent Liquidations</h2>
          <div className="max-h-64 overflow-auto space-y-2">
            {liquidations.length === 0 && <div className="text-sm text-gray-500">No liquidations yet.</div>}
            {liquidations.map((liq) => (
              <div key={`${liq.positionId}-${liq.tick}`} className="rounded bg-gray-950 border border-gray-800 p-3 text-sm grid md:grid-cols-9 gap-2">
                <span className="text-gray-300">#{liq.positionId}</span>
                <span className={liq.side === "LONG" ? "text-green-400" : "text-red-400"}>{liq.side}</span>
                <span>tick {liq.tick}</span>
                <span>{formatUsd(liq.markPrice)}</span>
                <span>eq {formatUsd(liq.equityUsd)}</span>
                <span className="text-red-300">bad debt {formatUsd(liq.badDebtUsd)}</span>
                <span className="text-blue-300">leftover {formatUsd(liq.leftoverEquityUsd)}</span>
                <span className="text-yellow-200">reward {liq.rewardPctOfLeftover.toFixed(1)}%</span>
                <span className="text-orange-300">penalty {liq.penaltyPctOfLeftover.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
          <h2 className="font-semibold mb-3">Current Parameter Set (from contract API)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            <div className="rounded bg-gray-950 border border-gray-800 p-2">makerFeeBps: {params.makerFeeBps}</div>
            <div className="rounded bg-gray-950 border border-gray-800 p-2">takerFeeBps: {params.takerFeeBps}</div>
            <div className="rounded bg-gray-950 border border-gray-800 p-2">insuranceBps: {params.insuranceBps}</div>
            <div className="rounded bg-gray-950 border border-gray-800 p-2">maintenanceMarginBps: {params.maintenanceMarginBps}</div>
            <div className="rounded bg-gray-950 border border-gray-800 p-2">liqRewardBps: {params.liquidationRewardBps}</div>
            <div className="rounded bg-gray-950 border border-gray-800 p-2">liqPenaltyBps: {params.liquidationPenaltyBps}</div>
          </div>
          {paramsStatus && <p className="text-xs text-gray-400 mt-3">{paramsStatus}</p>}
        </section>

        <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="font-semibold">Parameter Sweep</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => runParameterSweep("fees")}
                disabled={sweepRunning}
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm"
              >
                {sweepRunning && sweepMode === "fees" ? "Running..." : "Run Fee/Liq Sweep"}
              </button>
              <button
                onClick={() => runParameterSweep("safety")}
                disabled={sweepRunning}
                className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm"
              >
                {sweepRunning && sweepMode === "safety" ? "Running..." : "Run Safety Sweep"}
              </button>
              <button
                onClick={applyBestSafePreset}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm"
              >
                Use Best Safe Preset
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-3">
            Fee/Liq mode sweeps maker-taker-penalty. Safety mode sweeps maintenance margin + insurance bps. Both use identical seeded paths per scenario.
          </div>

          {sweepResults.length === 0 ? (
            <div className="text-sm text-gray-500">No sweep results yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 pr-3">Maker</th>
                    <th className="py-2 pr-3">Taker</th>
                    <th className="py-2 pr-3">Maint</th>
                    <th className="py-2 pr-3">Insurance</th>
                    <th className="py-2 pr-3">Liq Penalty</th>
                    <th className="py-2 pr-3">Liquidations</th>
                    <th className="py-2 pr-3">Uncovered Debt</th>
                    <th className="py-2 pr-3">Distributed Fees</th>
                    <th className="py-2 pr-3">Insurance End</th>
                    <th className="py-2 pr-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sweepResults.slice(0, 12).map((row, index) => (
                    <tr key={`${row.makerFeeBps}-${row.takerFeeBps}-${row.liquidationPenaltyBps}-${index}`} className="border-b border-gray-900">
                      <td className="py-2 pr-3">#{index + 1}</td>
                      <td className="py-2 pr-3">{row.mode}</td>
                      <td className="py-2 pr-3">{row.makerFeeBps}</td>
                      <td className="py-2 pr-3">{row.takerFeeBps}</td>
                      <td className="py-2 pr-3">{row.maintenanceMarginBps}</td>
                      <td className="py-2 pr-3">{row.insuranceBps}</td>
                      <td className="py-2 pr-3">{row.liquidationPenaltyBps}</td>
                      <td className="py-2 pr-3">{row.liquidationCount}</td>
                      <td className="py-2 pr-3 text-red-300">{formatUsd(row.uncoveredBadDebtUsd)}</td>
                      <td className="py-2 pr-3 text-blue-300">{formatUsd(row.distributedFeesUsd)}</td>
                      <td className="py-2 pr-3 text-green-300">{formatUsd(row.insuranceEndingUsd)}</td>
                      <td className="py-2 pr-3">{row.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
