// types/simulation.ts
export interface SimulationMetrics {
  step: number;
  price: number;
  openInterest: number;
  tvl: number;
  marginVaultDelta: number;
  insuranceBalance: number;
  insuranceBalanceDelta: number;
  protocolTreasuryBalance: number;
  protocolTreasuryDelta: number;
  badDebt: number;
  badDebtDelta: number;
  protocolRevenue: number;
  protocolRevenueDelta: number;
  sumAccountCollateral: number;
  accountCollateralDelta: number;
  sumReservedMargin: number;
  reservedMarginDelta: number;
  sumAvailableCollateral: number;
  availableCollateralDelta: number;
  sumTraderFundingOwed: number;
  traderFundingOwedDelta: number;
  solvencyBuffer: number;
  makerFeesCollected: number;
  takerFeesCollected: number;
  fundingFeesTransferred: number;
  insuranceFundInflow: number;
  insuranceFundOutflow: number;
  liquidationInsuranceInflow: number;
  liquidations: number;
  liquidatorOrders: number;
  liquidatorRewardsPaid: number;
  liquidationPenaltyCollected: number;
  marginReturnedFromLiquidation: number;
  adlRequestedNotional: number;
  adlCoveredNotional: number;
  adlRemainingDeficit: number;
  adlEvents: number;
  proactiveAdlEvents: number;
  proactiveAdlSoftEvents: number;
  proactiveAdlHardEvents: number;
  stepAdlEvents: number;
  stepProactiveAdlEvents: number;
  positionsAtRisk: number;
  trades: number;
  uniqueTraders: number;
  openOrders: number;
  newOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  liquidationsPer100Orders: number;
  avgLeverage: number;
  longShortRatio: number;
  spreadBps: number;
  slippageBps: number;
  priceImpactBps: number;
  isInsolvent: boolean;
}

export interface Position {
  trader: string;
  size: number;
  collateral: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: string;
  health: number;
  isLiquidatable: boolean;
}

export interface SyntheticPositionInput {
  direction: 'buy' | 'sell';
  size: number;
  leverage: number;
  entryPrice: number;
}

export interface SyntheticPositionSnapshot {
  step: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
  liqPrice: number;
  liquidated: boolean;
}

export interface LiquidationActivity {
  step: number;
  liquidatorOrders: number;
  liquidations: number;
  liquidatorRewardsPaid: number;
  liquidationPenaltyCollected: number;
  marginReturnedFromLiquidation: number;
  insuranceFundOutflow: number;
}

export interface SimulationRun {
  id: string;
  createdAt: string;
  scenario?: string;
  seed?: number;
  metricCount?: number;
  hasCompleteJson: boolean;
  hasSummary: boolean;
}

export interface SimulationData {
  config: {
    scenario: string;
    seed: number;
    steps: number;
  };
  metrics: SimulationMetrics[];
  liquidations: LiquidationActivity[];
  positions?: Position[];
  positionsByStep?: Record<number, Position[]>;
}

export interface ExecutionLedgerEvent {
  step: number;
  eventType: 'intent' | 'filled' | 'failed' | 'cancelled' | 'liquidation' | string;
  trader: string;
  counterparty?: string;
  agentType: string;
  side: 'long' | 'short' | string;
  exposure: number;
  leverage: number;
  reason: string;
}

export interface AgentActivitySummary {
  agentType: string;
  intents: number;
  filled: number;
  failed: number;
  cancelled: number;
  liquidations: number;
  fillRatePercent: number;
  intentNotional: number;
  filledNotional: number;
}

export interface SimulationDiagnostics {
  runId: string;
  executionLedger: ExecutionLedgerEvent[];
  agentActivity: AgentActivitySummary[];
  meta: {
    totalEvents: number;
    returnedEvents: number;
    step: number | null;
    limit: number;
    hasExecutionLedger: boolean;
    hasAgentActivity: boolean;
  };
}