import { expect } from "chai";
import { setupDiagnosticsFixture } from "./fixtures/diagnostic-fixtures";
import { analyzeDrainDelta, summarizeFindings } from "./monitors/drain-analyzer";
import { computeSnapshotDelta } from "./monitors/margin-flow-monitor";
import {
  runLiquidationShockScenario,
  runNormalFlowScenario,
  runWithdrawalAttemptScenario,
} from "./scenarios/margin-drain-scenarios";

describe("Margin Drain Diagnostics", function () {
  this.timeout(180000);

  it("does not produce unexplained drain in normal flow", async function () {
    const fixture = await setupDiagnosticsFixture();
    const seedAmount = fixture.ethers.parseEther("100000");

    for (const trader of fixture.traders.slice(0, 3)) {
      await fixture.seedCollateral(trader.address, seedAmount);
    }
    await fixture.seedCollateral(fixture.liquidator.address, seedAmount);

    const scenario = await runNormalFlowScenario(fixture);
    const deltas = scenario.snapshots.slice(1).map((snapshot, idx) => computeSnapshotDelta(scenario.snapshots[idx], snapshot));
    const analyses = scenario.snapshots
      .slice(1)
      .map((snapshot, idx) => analyzeDrainDelta(scenario.snapshots[idx], snapshot, fixture.ethers.parseEther("0.01")));

    const unexplained = analyses.flatMap((analysis) => analysis.findings.filter((finding) => finding.channel === "unexplained"));

    if (unexplained.length > 0) {
      console.table(summarizeFindings(deltas, analyses));
    }

    expect(unexplained.length).to.equal(0);
  });

  it("attributes loss channels during liquidation and withdrawal shocks", async function () {
    const fixture = await setupDiagnosticsFixture();
    const seedAmount = fixture.ethers.parseEther("120000");

    for (const trader of fixture.traders.slice(0, 3)) {
      await fixture.seedCollateral(trader.address, seedAmount);
    }
    await fixture.seedCollateral(fixture.liquidator.address, seedAmount);

    const liquidationScenario = await runLiquidationShockScenario(fixture);
    const withdrawalScenario = await runWithdrawalAttemptScenario(fixture);

    const allSnapshots = [...liquidationScenario.snapshots, ...withdrawalScenario.snapshots];
    const deltas = allSnapshots.slice(1).map((snapshot, idx) => computeSnapshotDelta(allSnapshots[idx], snapshot));
    const analyses = allSnapshots
      .slice(1)
      .map((snapshot, idx) => analyzeDrainDelta(allSnapshots[idx], snapshot, fixture.ethers.parseEther("0.01")));

    const findings = analyses.flatMap((analysis) => analysis.findings);
    const attributed = findings.filter((finding) => finding.channel !== "unexplained");

    if (findings.length > 0) {
      console.table(summarizeFindings(deltas, analyses));
    }

    expect(attributed.length).to.be.greaterThan(0);
  });
});
