// services/simulationApi.ts
import type {
  AgentActivitySummary,
  ExecutionLedgerEvent,
  SimulationDiagnostics,
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

type RawDiagnosticsResponse = {
  runId?: string;
  executionLedger?: Array<Record<string, unknown>>;
  agentActivity?: Array<Record<string, unknown>>;
  meta?: {
    totalEvents?: number;
    returnedEvents?: number;
    step?: number | null;
    limit?: number;
    hasExecutionLedger?: boolean;
    hasAgentActivity?: boolean;
  };
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

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
    price: finiteOrZero(toNumber(rawMetric.price)),
    openInterest: finiteOrZero(toUsd(rawMetric.openInterest)),
    tvl: finiteOrZero(toUsd(rawMetric.tvl)),
    marginVaultDelta: finiteOrZero(toUsd(rawMetric.marginVaultDelta)),
    insuranceBalance: finiteOrZero(toUsd(rawMetric.insuranceBalance)),
    insuranceBalanceDelta: finiteOrZero(toUsd(rawMetric.insuranceBalanceDelta)),
    protocolTreasuryBalance: finiteOrZero(toUsd(rawMetric.protocolTreasuryBalance)),
    protocolTreasuryDelta: finiteOrZero(toUsd(rawMetric.protocolTreasuryDelta)),
    badDebt: finiteOrZero(toUsd(rawMetric.badDebt)),
    badDebtDelta: finiteOrZero(toUsd(rawMetric.badDebtDelta)),
    protocolRevenue: finiteOrZero(toUsd(rawMetric.protocolRevenue)),
    protocolRevenueDelta: finiteOrZero(toUsd(rawMetric.protocolRevenueDelta)),
    sumAccountCollateral: finiteOrZero(toUsd(rawMetric.sumAccountCollateral)),
    accountCollateralDelta: finiteOrZero(toUsd(rawMetric.accountCollateralDelta)),
    sumReservedMargin: finiteOrZero(toUsd(rawMetric.sumReservedMargin)),
    reservedMarginDelta: finiteOrZero(toUsd(rawMetric.reservedMarginDelta)),
    sumAvailableCollateral: finiteOrZero(toUsd(rawMetric.sumAvailableCollateral)),
    availableCollateralDelta: finiteOrZero(toUsd(rawMetric.availableCollateralDelta)),
    sumTraderFundingOwed: finiteOrZero(toUsd(rawMetric.sumTraderFundingOwed)),
    traderFundingOwedDelta: finiteOrZero(toUsd(rawMetric.traderFundingOwedDelta)),
    solvencyBuffer: finiteOrZero(toUsd(rawMetric.solvencyBuffer)),
    makerFeesCollected: finiteOrZero(toUsd(rawMetric.makerFeesCollected)),
    takerFeesCollected: finiteOrZero(toUsd(rawMetric.takerFeesCollected)),
    fundingFeesTransferred: finiteOrZero(toUsd(rawMetric.fundingFeesTransferred)),
    insuranceFundInflow: finiteOrZero(toUsd(rawMetric.insuranceFundInflow)),
    insuranceFundOutflow: finiteOrZero(toUsd(rawMetric.insuranceFundOutflow)),
    liquidationInsuranceInflow: finiteOrZero(toUsd(rawMetric.liquidationInsuranceInflow)),
    liquidations: finiteOrZero(toNumber(rawMetric.liquidationCount)),
    liquidatorOrders: finiteOrZero(toNumber(rawMetric.liquidatorOrders)),
    liquidatorRewardsPaid: finiteOrZero(toUsd(rawMetric.liquidatorRewardsPaid)),
    liquidationPenaltyCollected: finiteOrZero(toUsd(rawMetric.liquidationPenaltyCollected)),
    marginReturnedFromLiquidation: finiteOrZero(toUsd(rawMetric.marginReturnedFromLiquidation)),
    adlRequestedNotional: finiteOrZero(toUsd(rawMetric.adlRequestedNotional)),
    adlCoveredNotional: finiteOrZero(toUsd(rawMetric.adlCoveredNotional)),
    adlRemainingDeficit: finiteOrZero(toUsd(rawMetric.adlRemainingDeficit)),
    adlEvents: finiteOrZero(toNumber(rawMetric.adlEvents)),
    proactiveAdlEvents: finiteOrZero(toNumber(rawMetric.proactiveAdlEvents)),
    proactiveAdlSoftEvents: finiteOrZero(toNumber(rawMetric.proactiveAdlSoftEvents)),
    proactiveAdlHardEvents: finiteOrZero(toNumber(rawMetric.proactiveAdlHardEvents)),
    stepAdlEvents: finiteOrZero(toNumber(rawMetric.stepAdlEvents)),
    stepProactiveAdlEvents: finiteOrZero(toNumber(rawMetric.stepProactiveAdlEvents)),
    positionsAtRisk: finiteOrZero(toNumber(rawMetric.positionsAtRisk)),
    trades: finiteOrZero(toNumber(rawMetric.tradeCount)),
    uniqueTraders: finiteOrZero(toNumber(rawMetric.uniqueTraders)),
    openOrders: finiteOrZero(toNumber(rawMetric.openOrders)),
    newOrders: finiteOrZero(toNumber(rawMetric.newOrders)),
    filledOrders: finiteOrZero(toNumber(rawMetric.filledOrders)),
    cancelledOrders: finiteOrZero(toNumber(rawMetric.cancelledOrders)),
    liquidationsPer100Orders: finiteOrZero(toNumber(rawMetric.liquidationsPer100Orders)),
    avgLeverage: finiteOrZero(toNumber(rawMetric.averageLeverage)),
    longShortRatio: finiteOrZero(toNumber(rawMetric.longShortRatio)),
    spreadBps: finiteOrZero(toNumber(rawMetric.spreadBps)),
    slippageBps: finiteOrZero(toNumber(rawMetric.slippageBps)),
    priceImpactBps: finiteOrZero(toNumber(rawMetric.priceImpactBps)),
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

const normalizeDiagnostics = (raw: RawDiagnosticsResponse): SimulationDiagnostics => {
  const executionLedger: ExecutionLedgerEvent[] = Array.isArray(raw.executionLedger)
    ? raw.executionLedger.map((row) => ({
        step: toNumber(row.step),
        eventType: typeof row.eventType === 'string' ? row.eventType : 'intent',
        trader: typeof row.trader === 'string' ? row.trader : 'unknown',
        counterparty: typeof row.counterparty === 'string' ? row.counterparty : undefined,
        agentType: typeof row.agentType === 'string' ? row.agentType : 'unknown',
        side: typeof row.side === 'string' ? row.side : 'long',
        exposure: toNumber(row.exposure),
        leverage: toNumber(row.leverage),
        reason: typeof row.reason === 'string' ? row.reason : '',
      }))
    : [];

  const agentActivity: AgentActivitySummary[] = Array.isArray(raw.agentActivity)
    ? raw.agentActivity.map((row) => ({
        agentType: typeof row.agentType === 'string' ? row.agentType : 'unknown',
        intents: toNumber(row.intents),
        filled: toNumber(row.filled),
        failed: toNumber(row.failed),
        cancelled: toNumber(row.cancelled),
        liquidations: toNumber(row.liquidations),
        fillRatePercent: toNumber(row.fillRatePercent),
        intentNotional: toNumber(row.intentNotional),
        filledNotional: toNumber(row.filledNotional),
      }))
    : [];

  return {
    runId: typeof raw.runId === 'string' ? raw.runId : 'unknown',
    executionLedger,
    agentActivity,
    meta: {
      totalEvents: toNumber(raw.meta?.totalEvents),
      returnedEvents: toNumber(raw.meta?.returnedEvents),
      step: typeof raw.meta?.step === 'number' ? raw.meta.step : null,
      limit: toNumber(raw.meta?.limit),
      hasExecutionLedger: toBoolean(raw.meta?.hasExecutionLedger),
      hasAgentActivity: toBoolean(raw.meta?.hasAgentActivity),
    },
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

  static async getSimulationDiagnostics(
    id: string,
    options?: { step?: number; limit?: number },
  ): Promise<SimulationDiagnostics> {
    const params = new URLSearchParams();
    if (typeof options?.step === 'number') params.set('step', String(options.step));
    if (typeof options?.limit === 'number') params.set('limit', String(options.limit));

    const query = params.toString();
    const response = await fetch(`${API_BASE}/runs/${id}/diagnostics${query ? `?${query}` : ''}`);
    if (!response.ok) throw new Error(`Failed to fetch simulation diagnostics: ${id}`);
    return normalizeDiagnostics((await response.json()) as RawDiagnosticsResponse);
  }

  static async getLatestSimulationDiagnostics(
    options?: { step?: number; limit?: number },
  ): Promise<SimulationDiagnostics> {
    const params = new URLSearchParams();
    if (typeof options?.step === 'number') params.set('step', String(options.step));
    if (typeof options?.limit === 'number') params.set('limit', String(options.limit));

    const query = params.toString();
    const response = await fetch(`${API_BASE}/latest/diagnostics${query ? `?${query}` : ''}`);
    if (!response.ok) throw new Error('Failed to fetch latest simulation diagnostics');
    return normalizeDiagnostics((await response.json()) as RawDiagnosticsResponse);
  }
}