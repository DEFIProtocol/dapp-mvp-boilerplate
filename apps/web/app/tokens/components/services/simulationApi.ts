// services/simulationApi.ts
import type {
  LiquidationActivity,
  Position,
  SimulationData,
  SimulationMetrics,
  SimulationRun,
} from '../../types/simulation';

const API_BASE = '/api/contract-sim';

type RawSimulationMetric = Record<string, unknown>;
type RawPosition = Record<string, unknown>;
type RawSimulationResponse = {
  config?: {
    scenario?: string;
    seed?: number;
    steps?: number;
  };
  metrics?: RawSimulationMetric[];
  positions?: Position[] | Record<string, RawPosition[]>;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return false;
};

// On-chain USDC values use 6 decimals (e.g. 1_000_000 = $1.00)
const toUsd = (value: unknown): number => toNumber(value) / 1_000_000;

const normalizePosition = (rawPosition: RawPosition): Position => {
  return {
    trader: typeof rawPosition.trader === 'string' ? rawPosition.trader : 'unknown',
    size: toUsd(rawPosition.size),
    collateral: toUsd(rawPosition.collateral),
    leverage: toNumber(rawPosition.leverage),
    entryPrice: toNumber(rawPosition.entryPrice),
    markPrice: toNumber(rawPosition.markPrice),
    pnl: toUsd(rawPosition.pnl),
    pnlPercent: typeof rawPosition.pnlPercent === 'string'
      ? rawPosition.pnlPercent
      : `${toNumber(rawPosition.pnlPercent).toFixed(2)}%`,
    health: toNumber(rawPosition.health),
    isLiquidatable: toBoolean(rawPosition.isLiquidatable),
  };
};

const normalizePositionsByStep = (
  rawPositions: RawSimulationResponse['positions'],
): Record<number, Position[]> => {
  if (!rawPositions) return {};

  if (Array.isArray(rawPositions)) {
    return { 0: rawPositions.map((position) => normalizePosition(position as unknown as RawPosition)) };
  }

  const normalized: Record<number, Position[]> = {};

  for (const [stepKey, positionsAtStep] of Object.entries(rawPositions)) {
    const step = Number(stepKey);
    if (!Number.isFinite(step)) continue;
    if (!Array.isArray(positionsAtStep)) {
      normalized[step] = [];
      continue;
    }
    normalized[step] = positionsAtStep.map((position) => normalizePosition(position));
  }

  return normalized;
};

const normalizeMetric = (rawMetric: RawSimulationMetric, step: number): SimulationMetrics => {
  return {
    step,
    price: toNumber(rawMetric.price),
    openInterest: toUsd(rawMetric.openInterest),
    tvl: toUsd(rawMetric.tvl),
    marginVaultDelta: toUsd(rawMetric.marginVaultDelta),
    insuranceBalance: toUsd(rawMetric.insuranceBalance),
    insuranceBalanceDelta: toUsd(rawMetric.insuranceBalanceDelta),
    protocolTreasuryBalance: toUsd(rawMetric.protocolTreasuryBalance),
    protocolTreasuryDelta: toUsd(rawMetric.protocolTreasuryDelta),
    badDebt: toUsd(rawMetric.badDebt),
    badDebtDelta: toUsd(rawMetric.badDebtDelta),
    protocolRevenue: toUsd(rawMetric.protocolRevenue),
    protocolRevenueDelta: toUsd(rawMetric.protocolRevenueDelta),
    sumAccountCollateral: toUsd(rawMetric.sumAccountCollateral),
    accountCollateralDelta: toUsd(rawMetric.accountCollateralDelta),
    sumReservedMargin: toUsd(rawMetric.sumReservedMargin),
    reservedMarginDelta: toUsd(rawMetric.reservedMarginDelta),
    sumAvailableCollateral: toUsd(rawMetric.sumAvailableCollateral),
    availableCollateralDelta: toUsd(rawMetric.availableCollateralDelta),
    sumTraderFundingOwed: toUsd(rawMetric.sumTraderFundingOwed),
    traderFundingOwedDelta: toUsd(rawMetric.traderFundingOwedDelta),
    solvencyBuffer: toUsd(rawMetric.solvencyBuffer),
    makerFeesCollected: toUsd(rawMetric.makerFeesCollected),
    takerFeesCollected: toUsd(rawMetric.takerFeesCollected),
    fundingFeesTransferred: toUsd(rawMetric.fundingFeesTransferred),
    insuranceFundInflow: toUsd(rawMetric.insuranceFundInflow),
    insuranceFundOutflow: toUsd(rawMetric.insuranceFundOutflow),
    liquidationInsuranceInflow: toUsd(rawMetric.liquidationInsuranceInflow),
    liquidations: toNumber(rawMetric.liquidationCount),
    liquidatorOrders: toNumber(rawMetric.liquidatorOrders),
    liquidatorRewardsPaid: toUsd(rawMetric.liquidatorRewardsPaid),
    liquidationPenaltyCollected: toUsd(rawMetric.liquidationPenaltyCollected),
    marginReturnedFromLiquidation: toUsd(rawMetric.marginReturnedFromLiquidation),
    positionsAtRisk: toNumber(rawMetric.positionsAtRisk),
    trades: toNumber(rawMetric.tradeCount),
    uniqueTraders: toNumber(rawMetric.uniqueTraders),
    openOrders: toNumber(rawMetric.openOrders),
    newOrders: toNumber(rawMetric.newOrders),
    filledOrders: toNumber(rawMetric.filledOrders),
    cancelledOrders: toNumber(rawMetric.cancelledOrders),
    liquidationsPer100Orders: toNumber(rawMetric.liquidationsPer100Orders),
    avgLeverage: toNumber(rawMetric.averageLeverage),
    longShortRatio: toNumber(rawMetric.longShortRatio),
    spreadBps: toNumber(rawMetric.spreadBps),
    slippageBps: toNumber(rawMetric.slippageBps),
    priceImpactBps: toNumber(rawMetric.priceImpactBps),
    isInsolvent: toBoolean(rawMetric.isInsolvent),
  };
};

const normalizeSimulationData = (raw: RawSimulationResponse): SimulationData => {
  const rawMetrics = Array.isArray(raw.metrics) ? raw.metrics : [];
  const metrics = rawMetrics.map((metric, step) => normalizeMetric(metric, step));
  const positionsByStep = normalizePositionsByStep(raw.positions);
  const maxStep = metrics.length > 0 ? metrics.length - 1 : 0;
  const positions = positionsByStep[maxStep] || positionsByStep[0] || [];

  const liquidations: LiquidationActivity[] = metrics.map((metric) => ({
    step: metric.step,
    liquidatorOrders: metric.liquidatorOrders,
    liquidations: metric.liquidations,
    liquidatorRewardsPaid: metric.liquidatorRewardsPaid,
    liquidationPenaltyCollected: metric.liquidationPenaltyCollected,
    marginReturnedFromLiquidation: metric.marginReturnedFromLiquidation,
    insuranceFundOutflow: metric.insuranceFundOutflow,
  }));

  return {
    config: {
      scenario: raw.config?.scenario || 'normal',
      seed: typeof raw.config?.seed === 'number' ? raw.config.seed : 0,
      steps: typeof raw.config?.steps === 'number' ? raw.config.steps : metrics.length,
    },
    metrics,
    liquidations,
    positions,
    positionsByStep,
  };
};

export class SimulationApi {
  static async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  }

  static async getLatestSimulation(): Promise<SimulationData> {
    const response = await fetch(`${API_BASE}/latest`);
    if (!response.ok) throw new Error('Failed to fetch latest simulation');
    const raw = (await response.json()) as RawSimulationResponse;
    return normalizeSimulationData(raw);
  }

  static async getSimulationRuns(): Promise<{ runs: SimulationRun[] }> {
    const response = await fetch(`${API_BASE}/runs`);
    return response.json();
  }

  static async getSimulationRun(id: string): Promise<SimulationData> {
    const response = await fetch(`${API_BASE}/runs/${id}`);
    if (!response.ok) throw new Error(`Failed to fetch simulation run: ${id}`);
    const raw = (await response.json()) as RawSimulationResponse;
    return normalizeSimulationData(raw);
  }

  static async getSimulationSummary(id: string): Promise<string> {
    const response = await fetch(`${API_BASE}/runs/${id}/summary`);
    return response.text();
  }
}