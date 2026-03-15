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
  isInsolvent: number;
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
}