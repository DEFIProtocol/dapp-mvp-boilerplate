import type { Contract } from "ethers";

export type TraderSnapshot = {
  trader: string;
  accountCollateral: bigint;
  reservedMargin: bigint;
  realizedPnl: bigint;
  positionIds: bigint[];
  activePositionCount: number;
};

export type SystemSnapshot = {
  collateralManagerBalance: bigint;
  insuranceTreasuryBalance: bigint;
  protocolTreasuryBalance: bigint;
  feePool: bigint;
  insuranceFundBalance: bigint;
  totalBadDebt: bigint;
};

export type MarginFlowSnapshot = {
  label: string;
  blockNumber: bigint;
  timestamp: number;
  markPrice: bigint;
  traders: TraderSnapshot[];
  system: SystemSnapshot;
  totalAccountCollateral: bigint;
  totalReservedMargin: bigint;
  totalRealizedPnl: bigint;
};

export type TraderDelta = {
  trader: string;
  accountCollateralDelta: bigint;
  reservedMarginDelta: bigint;
  realizedPnlDelta: bigint;
  activePositionCountDelta: number;
};

export type SnapshotDelta = {
  fromLabel: string;
  toLabel: string;
  markPriceDelta: bigint;
  totalAccountCollateralDelta: bigint;
  totalReservedMarginDelta: bigint;
  totalRealizedPnlDelta: bigint;
  system: {
    collateralManagerBalanceDelta: bigint;
    insuranceTreasuryBalanceDelta: bigint;
    protocolTreasuryBalanceDelta: bigint;
    feePoolDelta: bigint;
    insuranceFundBalanceDelta: bigint;
    totalBadDebtDelta: bigint;
  };
  traderDeltas: TraderDelta[];
};

type SnapshotInput = {
  label: string;
  perpStorage: Contract;
  positionManager: Contract;
  riskManager: Contract;
  collateralManager: Contract;
  mockToken: Contract;
  insuranceTreasury: Contract;
  protocolTreasury: Contract;
  traders: string[];
};

export async function takeMarginFlowSnapshot(input: SnapshotInput): Promise<MarginFlowSnapshot> {
  const {
    label,
    perpStorage,
    positionManager,
    riskManager,
    collateralManager,
    mockToken,
    insuranceTreasury,
    protocolTreasury,
    traders,
  } = input;

  const traderSnapshots: TraderSnapshot[] = [];
  let totalAccountCollateral = 0n;
  let totalReservedMargin = 0n;
  let totalRealizedPnl = 0n;

  for (const trader of traders) {
    const accountCollateral = await perpStorage.accountCollateral(trader);
    const reservedMargin = await perpStorage.reservedMargin(trader);
    const realizedPnl = await perpStorage.realizedPnl(trader);
    const rawPositionIds = await positionManager.getTraderPositions(trader);
    const positionIds = rawPositionIds.map((id: any) => BigInt(id));

    let activePositionCount = 0;
    for (const posId of positionIds) {
      const position = await perpStorage.positions(posId);
      if (position.active) activePositionCount += 1;
    }

    traderSnapshots.push({
      trader,
      accountCollateral,
      reservedMargin,
      realizedPnl,
      positionIds,
      activePositionCount,
    });

    totalAccountCollateral += accountCollateral;
    totalReservedMargin += reservedMargin;
    totalRealizedPnl += realizedPnl;
  }

  const latestBlock = await riskManager.runner?.provider?.getBlock("latest");
  if (!latestBlock) throw new Error("Latest block unavailable while taking snapshot");

  const markPrice = await riskManager.getMarkPrice();
  const system: SystemSnapshot = {
    collateralManagerBalance: await mockToken.balanceOf(await collateralManager.getAddress()),
    insuranceTreasuryBalance: await mockToken.balanceOf(await insuranceTreasury.getAddress()),
    protocolTreasuryBalance: await mockToken.balanceOf(await protocolTreasury.getAddress()),
    feePool: await perpStorage.feePool(),
    insuranceFundBalance: await perpStorage.insuranceFundBalance(),
    totalBadDebt: await perpStorage.totalBadDebt(),
  };

  return {
    label,
    blockNumber: latestBlock.number,
    timestamp: latestBlock.timestamp,
    markPrice,
    traders: traderSnapshots,
    system,
    totalAccountCollateral,
    totalReservedMargin,
    totalRealizedPnl,
  };
}

export function computeSnapshotDelta(before: MarginFlowSnapshot, after: MarginFlowSnapshot): SnapshotDelta {
  const traderDeltas: TraderDelta[] = before.traders.map((beforeTrader) => {
    const afterTrader = after.traders.find((candidate) => candidate.trader === beforeTrader.trader);
    if (!afterTrader) {
      throw new Error(`Trader ${beforeTrader.trader} missing in after snapshot`);
    }

    return {
      trader: beforeTrader.trader,
      accountCollateralDelta: afterTrader.accountCollateral - beforeTrader.accountCollateral,
      reservedMarginDelta: afterTrader.reservedMargin - beforeTrader.reservedMargin,
      realizedPnlDelta: afterTrader.realizedPnl - beforeTrader.realizedPnl,
      activePositionCountDelta: afterTrader.activePositionCount - beforeTrader.activePositionCount,
    };
  });

  return {
    fromLabel: before.label,
    toLabel: after.label,
    markPriceDelta: after.markPrice - before.markPrice,
    totalAccountCollateralDelta: after.totalAccountCollateral - before.totalAccountCollateral,
    totalReservedMarginDelta: after.totalReservedMargin - before.totalReservedMargin,
    totalRealizedPnlDelta: after.totalRealizedPnl - before.totalRealizedPnl,
    system: {
      collateralManagerBalanceDelta: after.system.collateralManagerBalance - before.system.collateralManagerBalance,
      insuranceTreasuryBalanceDelta: after.system.insuranceTreasuryBalance - before.system.insuranceTreasuryBalance,
      protocolTreasuryBalanceDelta: after.system.protocolTreasuryBalance - before.system.protocolTreasuryBalance,
      feePoolDelta: after.system.feePool - before.system.feePool,
      insuranceFundBalanceDelta: after.system.insuranceFundBalance - before.system.insuranceFundBalance,
      totalBadDebtDelta: after.system.totalBadDebt - before.system.totalBadDebt,
    },
    traderDeltas,
  };
}
