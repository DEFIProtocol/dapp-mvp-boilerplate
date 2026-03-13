import type { DiagnosticsFixture } from "../fixtures/diagnostic-fixtures";
import { takeMarginFlowSnapshot, type MarginFlowSnapshot } from "../monitors/margin-flow-monitor";

type ScenarioResult = {
  name: string;
  snapshots: MarginFlowSnapshot[];
};

function addressesFromFixture(fixture: DiagnosticsFixture): string[] {
  return fixture.traders.slice(0, 3).map((signer) => signer.address);
}

export async function runNormalFlowScenario(fixture: DiagnosticsFixture): Promise<ScenarioResult> {
  const { contracts, traders, ethers } = fixture;
  const snapshots: MarginFlowSnapshot[] = [];
  const traderAddresses = addressesFromFixture(fixture);

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "normal:start",
      ...contracts,
      traders: traderAddresses,
    })
  );

  await fixture.settleMatch(traders[0], traders[1], ethers.parseEther("1000"));

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "normal:post-trade",
      ...contracts,
      traders: traderAddresses,
    })
  );

  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Latest block unavailable in normal scenario");
  await ethers.provider.send("evm_setNextBlockTimestamp", [latest.timestamp + 3601]);
  await ethers.provider.send("evm_mine", []);
  await contracts.fundingEngine.updateFunding();

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "normal:post-funding",
      ...contracts,
      traders: traderAddresses,
    })
  );

  return {
    name: "normal-flow",
    snapshots,
  };
}

export async function runLiquidationShockScenario(fixture: DiagnosticsFixture): Promise<ScenarioResult> {
  const { contracts, traders, liquidator, ethers } = fixture;
  const snapshots: MarginFlowSnapshot[] = [];
  const traderAddresses = addressesFromFixture(fixture);

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "liq:start",
      ...contracts,
      traders: traderAddresses,
    })
  );

  await fixture.settleMatch(traders[0], traders[1], ethers.parseEther("50000"));
  const positionIds = await contracts.positionManager.getTraderPositions(traders[0].address);
  const targetPositionId = positionIds[0];

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "liq:post-open",
      ...contracts,
      traders: traderAddresses,
    })
  );

  await contracts.mockOracle.setPrice(100n * 10n ** 18n);
  const liquidatable = await contracts.riskManager.isPositionLiquidatable(targetPositionId);
  if (liquidatable) {
    await contracts.liquidationEngine.connect(liquidator).liquidate(targetPositionId);
  }

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "liq:post-crash-liquidation",
      ...contracts,
      traders: traderAddresses,
    })
  );

  return {
    name: "liquidation-shock",
    snapshots,
  };
}

export async function runWithdrawalAttemptScenario(fixture: DiagnosticsFixture): Promise<ScenarioResult> {
  const { contracts, traders, ethers } = fixture;
  const snapshots: MarginFlowSnapshot[] = [];
  const traderAddresses = addressesFromFixture(fixture);

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "withdraw:start",
      ...contracts,
      traders: traderAddresses,
    })
  );

  await fixture.settleMatch(traders[0], traders[1], ethers.parseEther("20000"));
  await contracts.mockOracle.setPrice(200n * 10n ** 18n);

  try {
    await contracts.collateralManager.connect(traders[0]).withdrawCollateral(ethers.parseEther("1"));
  } catch {
    // Expected in unhealthy conditions; snapshot flow still useful.
  }

  snapshots.push(
    await takeMarginFlowSnapshot({
      label: "withdraw:after-attempt",
      ...contracts,
      traders: traderAddresses,
    })
  );

  return {
    name: "withdrawal-attempt",
    snapshots,
  };
}
