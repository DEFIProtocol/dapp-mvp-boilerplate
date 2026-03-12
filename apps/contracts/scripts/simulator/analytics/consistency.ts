type Contract = any;
type Signer = any;

export interface TraderConsistencyState {
  trader: string;
  accountCollateral: bigint;
  reservedMargin: bigint;
  availableCollateral: bigint;
  fundingOwed: bigint;
  equity: bigint;
  maintenanceRequirement: bigint;
  healthRatio: bigint;
  activePositionCount: number;
}

export interface ConsistencyAssertion {
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

export interface ConsistencySnapshot {
  step: number;
  blockNumber: number;
  timestamp: number;
  scenarioPrice: number;
  onChain: {
    collateralManagerBalance: bigint;
    insuranceTreasuryBalance: bigint;
    protocolTreasuryBalance: bigint;
    feePool: bigint;
    insuranceFundBalance: bigint;
    totalBadDebt: bigint;
    totalLongExposure: bigint;
    totalShortExposure: bigint;
    cumulativeFundingLong: bigint;
    cumulativeFundingShort: bigint;
    sumAccountCollateral: bigint;
    sumReservedMargin: bigint;
    sumAvailableCollateral: bigint;
    sumTraderFundingOwed: bigint;
    activeLongExposure: bigint;
    activeShortExposure: bigint;
    activePositionCount: number;
    totalBooked: bigint;
    totalContractBalance: bigint;
  };
  traders: TraderConsistencyState[];
  assertions: ConsistencyAssertion[];
}

interface SnapshotContracts {
  provider: any;
  usdc: Contract;
  perpStorage: Contract;
  collateralManager: Contract;
  riskManager: Contract;
  fundingEngine: Contract;
  insuranceTreasury: Contract;
  protocolTreasury: Contract;
}

export async function collectConsistencySnapshot(
  step: number,
  scenarioPrice: number,
  traderSigners: Signer[],
  contracts: SnapshotContracts
): Promise<ConsistencySnapshot> {
  const {
    provider,
    usdc,
    perpStorage,
    collateralManager,
    riskManager,
    fundingEngine,
    insuranceTreasury,
    protocolTreasury,
  } = contracts;

  const [
    blockNumber,
    latestBlock,
    collateralManagerBalance,
    insuranceTreasuryBalance,
    protocolTreasuryBalance,
    feePool,
    insuranceFundBalance,
    totalBadDebt,
    totalLongExposure,
    totalShortExposure,
    cumulativeFundingLong,
    cumulativeFundingShort,
  ] = await Promise.all([
    provider.getBlockNumber(),
    provider.getBlock("latest"),
    usdc.balanceOf(await collateralManager.getAddress()),
    insuranceTreasury.balance(),
    protocolTreasury.balance(),
    perpStorage.feePool(),
    perpStorage.insuranceFundBalance(),
    perpStorage.totalBadDebt(),
    perpStorage.totalLongExposure(),
    perpStorage.totalShortExposure(),
    perpStorage.cumulativeFundingLong(),
    perpStorage.cumulativeFundingShort(),
  ]);

  let sumAccountCollateral = 0n;
  let sumReservedMargin = 0n;
  let sumAvailableCollateral = 0n;
  let sumTraderFundingOwed = 0n;
  let activeLongExposure = 0n;
  let activeShortExposure = 0n;
  let activePositionCount = 0;

  const traders: TraderConsistencyState[] = [];

  for (const trader of traderSigners) {
    const [
      accountCollateral,
      reservedMargin,
      availableCollateral,
      fundingOwed,
      equity,
      maintenanceRequirement,
      healthRatio,
      positionIds,
    ] = await Promise.all([
      perpStorage.accountCollateral(trader.address),
      collateralManager.getReservedMargin(trader.address),
      collateralManager.getAvailableCollateral(trader.address),
      fundingEngine.getTraderFundingOwed(trader.address),
      riskManager.getAccountEquity(trader.address),
      riskManager.getAccountMaintenanceRequirement(trader.address),
      riskManager.getAccountHealthRatio(trader.address),
      perpStorage.getTraderPositions(trader.address),
    ]);

    let traderActivePositions = 0;
    for (const positionId of positionIds) {
      const position = await perpStorage.getPosition(positionId);
      if (!position.active) continue;
      traderActivePositions++;
      if (position.side === 0n) activeLongExposure += position.exposure;
      else activeShortExposure += position.exposure;
    }

    sumAccountCollateral += BigInt(accountCollateral);
    sumReservedMargin += BigInt(reservedMargin);
    sumAvailableCollateral += BigInt(availableCollateral);
    sumTraderFundingOwed += BigInt(fundingOwed >= 0 ? fundingOwed : -fundingOwed);
    activePositionCount += traderActivePositions;

    traders.push({
      trader: trader.address,
      accountCollateral: BigInt(accountCollateral),
      reservedMargin: BigInt(reservedMargin),
      availableCollateral: BigInt(availableCollateral),
      fundingOwed: BigInt(fundingOwed),
      equity: BigInt(equity),
      maintenanceRequirement: BigInt(maintenanceRequirement),
      healthRatio: BigInt(healthRatio),
      activePositionCount: traderActivePositions,
    });
  }

  const totalContractBalance =
    BigInt(collateralManagerBalance) + BigInt(insuranceTreasuryBalance) + BigInt(protocolTreasuryBalance);
  const totalBooked = BigInt(sumAccountCollateral) + BigInt(insuranceFundBalance) + BigInt(feePool);

  const assertions: ConsistencyAssertion[] = [
    {
      name: "solvency-bound",
      ok: totalContractBalance >= totalBooked,
      expected: `>= ${totalBooked.toString()}`,
      actual: totalContractBalance.toString(),
    },
    {
      name: "insurance-balance-sync",
      ok: BigInt(insuranceTreasuryBalance) === BigInt(insuranceFundBalance),
      expected: BigInt(insuranceFundBalance).toString(),
      actual: BigInt(insuranceTreasuryBalance).toString(),
    },
    {
      name: "protocol-fee-sync",
      ok: BigInt(protocolTreasuryBalance) === BigInt(feePool),
      expected: BigInt(feePool).toString(),
      actual: BigInt(protocolTreasuryBalance).toString(),
    },
    {
      name: "long-exposure-sync",
      ok: activeLongExposure === BigInt(totalLongExposure),
      expected: BigInt(totalLongExposure).toString(),
      actual: activeLongExposure.toString(),
    },
    {
      name: "short-exposure-sync",
      ok: activeShortExposure === BigInt(totalShortExposure),
      expected: BigInt(totalShortExposure).toString(),
      actual: activeShortExposure.toString(),
    },
  ];

  for (const trader of traders) {
    const expectedAvailable = trader.accountCollateral > trader.reservedMargin
      ? trader.accountCollateral - trader.reservedMargin
      : 0n;
    assertions.push({
      name: `available-collateral-${trader.trader}`,
      ok: trader.availableCollateral === expectedAvailable,
      expected: expectedAvailable.toString(),
      actual: trader.availableCollateral.toString(),
    });
  }

  return {
    step,
    blockNumber,
    timestamp: latestBlock?.timestamp ?? 0,
    scenarioPrice,
    onChain: {
      collateralManagerBalance: BigInt(collateralManagerBalance),
      insuranceTreasuryBalance: BigInt(insuranceTreasuryBalance),
      protocolTreasuryBalance: BigInt(protocolTreasuryBalance),
      feePool: BigInt(feePool),
      insuranceFundBalance: BigInt(insuranceFundBalance),
      totalBadDebt: BigInt(totalBadDebt),
      totalLongExposure: BigInt(totalLongExposure),
      totalShortExposure: BigInt(totalShortExposure),
      cumulativeFundingLong: BigInt(cumulativeFundingLong),
      cumulativeFundingShort: BigInt(cumulativeFundingShort),
      sumAccountCollateral,
      sumReservedMargin,
      sumAvailableCollateral,
      sumTraderFundingOwed,
      activeLongExposure,
      activeShortExposure,
      activePositionCount,
      totalBooked,
      totalContractBalance,
    },
    traders,
    assertions,
  };
}