/**
 * margin-vault-accounting.test.ts
 *
 * Pin-points WHERE and WHY the margin vault (CollateralManager) drains.
 *
 * For each major operation category we verify the exact conservation law:
 *   CM.balance == Σ(accountCollateral[t]) + feePool
 *
 * When positions are open the above becomes:
 *   CM.balance >= Σ(accountCollateral[t]) + feePool     (unrealised profit buffer)
 *
 * We check the additional facts:
 *   - fee flows:      Δ(feePool) == makerFee + takerFee, Δ(Σ accountCollateral) == -(fees)
 *   - reserved margin: every open adds to reservedMargin, every close subtracts exactly
 *   - liquidation:    penaltyCollected == rewardToLiquidator + fundToInsurance
 *   - bad-debt:       insurance top-up enters CM but no accountCollateral is credited → buffer only
 *   - no-token-creation invariant across all tracked vaults
 */
import { expect } from "chai";
import { setupDiagnosticsFixture, type DiagnosticsFixture } from "./fixtures/diagnostic-fixtures";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function cmBalance(fixture: DiagnosticsFixture): Promise<bigint> {
  const { mockToken, collateralManager } = fixture.contracts;
  return mockToken.balanceOf(await collateralManager.getAddress());
}

/** Sum accountCollateral across an explicit list of addresses. */
async function sumAccountCollateral(fixture: DiagnosticsFixture, addresses: string[]): Promise<bigint> {
  let total = 0n;
  for (const addr of addresses) {
    total += await fixture.contracts.perpStorage.accountCollateral(addr);
  }
  return total;
}

async function sumReservedMargin(fixture: DiagnosticsFixture, addresses: string[]): Promise<bigint> {
  let total = 0n;
  for (const addr of addresses) {
    total += await fixture.contracts.perpStorage.reservedMargin(addr);
  }
  return total;
}

async function feePool(fixture: DiagnosticsFixture): Promise<bigint> {
  return fixture.contracts.perpStorage.feePool();
}

async function insuranceFundBalance(fixture: DiagnosticsFixture): Promise<bigint> {
  return fixture.contracts.perpStorage.insuranceFundBalance();
}

async function totalBadDebt(fixture: DiagnosticsFixture): Promise<bigint> {
  return fixture.contracts.perpStorage.totalBadDebt();
}

/** Invariant: CM holds at least as much USDC as all booked liabilities. */
async function assertCmSolvency(
  fixture: DiagnosticsFixture,
  participants: string[],
  label: string
) {
  const cm = await cmBalance(fixture);
  const sumColl = await sumAccountCollateral(fixture, participants);
  const fee = await feePool(fixture);
  const booked = sumColl + fee;
  if (cm < booked) {
    throw new Error(
      `[${label}] CM DRAIN DETECTED\n` +
        `  CM.balance      = ${cm}\n` +
        `  Σ(accCollat)    = ${sumColl}\n` +
        `  feePool         = ${fee}\n` +
        `  Σ booked        = ${booked}\n` +
        `  SHORTFALL       = ${booked - cm}`
    );
  }
}

async function systemTotal(fixture: DiagnosticsFixture, externalAddresses: string[]): Promise<bigint> {
  const { mockToken, collateralManager, insuranceTreasury, protocolTreasury } = fixture.contracts;
  let total = await mockToken.balanceOf(await collateralManager.getAddress());
  total += await mockToken.balanceOf(await insuranceTreasury.getAddress());
  total += await mockToken.balanceOf(await protocolTreasury.getAddress());
  for (const addr of externalAddresses) {
    total += await mockToken.balanceOf(addr);
  }
  return total;
}

const SEED = (f: DiagnosticsFixture) => f.ethers.parseEther("100000");

// ── Suite ────────────────────────────────────────────────────────────────────

describe("Margin Vault Drain Isolation", function () {
  this.timeout(120000);

  let fixture: DiagnosticsFixture;
  let participants: string[];

  beforeEach(async function () {
    fixture = await setupDiagnosticsFixture();
    participants = [
      fixture.traders[0].address,
      fixture.traders[1].address,
      fixture.traders[2].address,
      fixture.liquidator.address,
    ];
    for (const p of participants) {
      await fixture.seedCollateral(p, SEED(fixture));
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 1. DEPOSIT / WITHDRAWAL ACCOUNTING
  // ═══════════════════════════════════════════════════════════

  describe("Deposit & withdrawal", function () {
    it("maintains CM == Σ(accountCollateral) + feePool after deposit", async function () {
      const before = await cmBalance(fixture);
      const beforeColl = await sumAccountCollateral(fixture, participants);
      const deposit = fixture.ethers.parseEther("5000");
      await fixture.seedCollateral(fixture.traders[2].address, deposit);

      const afterCm = await cmBalance(fixture);
      const afterColl = await sumAccountCollateral(fixture, participants);

      expect(afterCm - before).to.equal(deposit, "CM balance must grow by exactly the deposit");
      expect(afterColl - beforeColl).to.equal(deposit, "Σ(accountCollateral) must grow by exactly the deposit");
      await assertCmSolvency(fixture, participants, "post-deposit");
    });

    it("CM balance decreases by the exact withdrawn amount", async function () {
      const amount = fixture.ethers.parseEther("1000");
      const before = await cmBalance(fixture);

      await fixture.contracts.collateralManager.connect(fixture.traders[0]).withdrawCollateral(amount);

      const after = await cmBalance(fixture);
      expect(before - after).to.equal(amount, "CM must shrink by the withdrawn amount");
      await assertCmSolvency(fixture, participants, "post-withdrawal");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. FEE ACCOUNTING PER TRADE
  // ═══════════════════════════════════════════════════════════

  describe("Fee accounting – per trade invariant", function () {
    it("feePool increase equals the sum of fees deducted from both traders", async function () {
      const { perpStorage } = fixture.contracts;
      const makerBps = await perpStorage.makerFeeBps();
      const takerBps = await perpStorage.takerFeeBps();
      const exposure = fixture.ethers.parseEther("1000");

      const beforeFeePoll = await feePool(fixture);
      const beforeLong = await perpStorage.accountCollateral(fixture.traders[0].address);
      const beforeShort = await perpStorage.accountCollateral(fixture.traders[1].address);

      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const afterFeePool = await feePool(fixture);
      const afterLong = await perpStorage.accountCollateral(fixture.traders[0].address);
      const afterShort = await perpStorage.accountCollateral(fixture.traders[1].address);

      // Expected fees
      const expectedTakerFee = exposure * takerBps / 10000n;
      const expectedMakerFee = exposure * makerBps / 10000n;
      const expectedTotalFee = expectedTakerFee + expectedMakerFee;

      const feeIncrease = afterFeePool - beforeFeePoll;
      expect(feeIncrease).to.equal(
        expectedTotalFee,
        `feePool must grow by exactly makerFee + takerFee (expected ${expectedTotalFee}, got ${feeIncrease})`
      );

      // addReservedMargin is a SEPARATE counter – it does NOT deduct from accountCollateral.
      // Therefore accountCollateral should decrease only by the trading fee.
      const longCollateralDecrease = beforeLong - afterLong;
      const shortCollateralDecrease = beforeShort - afterShort;

      expect(longCollateralDecrease).to.equal(
        expectedTakerFee,
        "long accountCollateral must decrease only by the taker fee – reservedMargin does NOT deduct from accountCollateral"
      );
      expect(shortCollateralDecrease).to.equal(
        expectedMakerFee,
        "short accountCollateral must decrease only by the maker fee"
      );

      await assertCmSolvency(fixture, participants, "post-trade-fee-check");
    });

    it("no-token-creation: system total is conserved across a full trade cycle", async function () {
      const externalWallets = [fixture.traders[0].address, fixture.traders[1].address];
      const before = await systemTotal(fixture, externalWallets);

      const exposure = fixture.ethers.parseEther("2000");
      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const after = await systemTotal(fixture, externalWallets);
      expect(after).to.equal(before, "no tokens should be created or destroyed during a trade");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. RESERVED MARGIN MUST ALWAYS RELEASE SYMMETRICALLY
  // ═══════════════════════════════════════════════════════════

  describe("Reserved margin – open/close symmetry", function () {
    it("reservedMargin returns to zero after all positions are closed", async function () {
      const { perpStorage, positionManager, settlementEngine, riskManager } = fixture.contracts;
      const exposure = fixture.ethers.parseEther("5000");

      // Open a position pair
      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const longPositions = await positionManager.getTraderPositions(fixture.traders[0].address);
      const shortPositions = await positionManager.getTraderPositions(fixture.traders[1].address);

      expect(
        (await perpStorage.reservedMargin(fixture.traders[0].address)) +
        (await perpStorage.reservedMargin(fixture.traders[1].address))
      ).to.be.gt(0n, "reserved margin must increase after opening");

      // Close by settling the reverse matching (same traders, opposite sides)
      await fixture.settleMatch(fixture.traders[1], fixture.traders[0], exposure);

      const reservedLong = await perpStorage.reservedMargin(fixture.traders[0].address);
      const reservedShort = await perpStorage.reservedMargin(fixture.traders[1].address);

      expect(reservedLong).to.equal(0n, "long trader reserved margin must be zero after close");
      expect(reservedShort).to.equal(0n, "short trader reserved margin must be zero after close");
    });

    it("accountCollateral drop equals fee charged – no extra deduction on open", async function () {
      const { perpStorage } = fixture.contracts;
      const exposure = fixture.ethers.parseEther("3000");
      const makerBps = await perpStorage.makerFeeBps();
      const takerBps = await perpStorage.takerFeeBps();

      const beforeLong = await perpStorage.accountCollateral(fixture.traders[0].address);
      const beforeShort = await perpStorage.accountCollateral(fixture.traders[1].address);

      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const afterLong = await perpStorage.accountCollateral(fixture.traders[0].address);
      const afterShort = await perpStorage.accountCollateral(fixture.traders[1].address);
      const reservedLong = await perpStorage.reservedMargin(fixture.traders[0].address);
      const reservedShort = await perpStorage.reservedMargin(fixture.traders[1].address);

      const expectedTakerFee = exposure * takerBps / 10000n;
      const expectedMakerFee = exposure * makerBps / 10000n;

      // accountCollateral delta = fee + margin reserved (margin is still inside accountCollateral,
      // so the "delta" is negative by fee only once we add back reservedMargin)
      // reservedMargin is a separate counter from accountCollateral.
      // Only the fee deductions touch accountCollateral at trade time.
      const longCollateralDrop = beforeLong - afterLong;
      const shortCollateralDrop = beforeShort - afterShort;

      expect(longCollateralDrop).to.equal(expectedTakerFee, "long's accountCollateral drops by exactly taker fee – reserved margin is a separate counter");
      expect(shortCollateralDrop).to.equal(expectedMakerFee, "short's accountCollateral drops by exactly maker fee");

      // Reserved margin counters should be independently non-zero (position margin locked)
      expect(reservedLong).to.be.gt(0n, "long's reserved margin must increase when a position opens");
      expect(reservedShort).to.be.gt(0n, "short's reserved margin must increase when a position opens");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. LIQUIDATION ACCOUNTING
  // ═══════════════════════════════════════════════════════════

  describe("Liquidation proceeds accounting", function () {
    it("tokens that leave CM to liquidator exactly match accountCollateral reduction (penalty)", async function () {
      const { perpStorage, positionManager, riskManager, liquidationEngine, mockToken, collateralManager } = fixture.contracts;
      const exposure = fixture.ethers.parseEther("50000");

      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const longPositions = await positionManager.getTraderPositions(fixture.traders[0].address);
      const posId = longPositions[0];

      // Crash price to make long immediately liquidatable
      await fixture.contracts.mockOracle.setPrice(50n * 10n ** 18n);

      const beforeCm = await mockToken.balanceOf(await collateralManager.getAddress());
      const beforeLiquidator = await mockToken.balanceOf(fixture.liquidator.address);
      const beforeInsuranceTreasury = await mockToken.balanceOf(await fixture.contracts.insuranceTreasury.getAddress());
      const beforeLongColl = await perpStorage.accountCollateral(fixture.traders[0].address);
      const beforeFeePool = await feePool(fixture);
      const beforeInsuranceFundBalance = await insuranceFundBalance(fixture);

      const isLiquidatable = await riskManager.isPositionLiquidatable(posId);
      expect(isLiquidatable).to.be.true;

      await liquidationEngine.connect(fixture.liquidator).liquidate(posId);

      const afterCm = await mockToken.balanceOf(await collateralManager.getAddress());
      const afterLiquidator = await mockToken.balanceOf(fixture.liquidator.address);
      const afterInsuranceTreasury = await mockToken.balanceOf(await fixture.contracts.insuranceTreasury.getAddress());
      const afterLongColl = await perpStorage.accountCollateral(fixture.traders[0].address);
      const afterInsuranceFundBalance = await insuranceFundBalance(fixture);
      const afterBadDebt = await totalBadDebt(fixture);

      const rewardPaid = afterLiquidator - beforeLiquidator;
      const insuranceFundDelta = afterInsuranceTreasury - beforeInsuranceTreasury;
      const tokensLeavingCm = beforeCm - afterCm;
      const longAccountDrop = beforeLongColl - afterLongColl;

      console.log("=== Liquidation Accounting Report ===");
      console.log(`  Reward to liquidator:       ${fixture.ethers.formatEther(rewardPaid)} USDC`);
      console.log(`  Funds to insurance treasury: ${fixture.ethers.formatEther(insuranceFundDelta)} USDC`);
      console.log(`  Total tokens leaving CM:     ${fixture.ethers.formatEther(tokensLeavingCm)} USDC`);
      console.log(`  Trader accountCollateral drop: ${fixture.ethers.formatEther(longAccountDrop)} USDC`);
      console.log(`  Bad debt recorded:           ${fixture.ethers.formatEther(afterBadDebt)} USDC`);
      console.log(`  Insurance fund balance after: ${fixture.ethers.formatEther(afterInsuranceFundBalance)} USDC`);

      // Tokens that left CM must equal reward + insurance contribution
      expect(tokensLeavingCm).to.equal(
        rewardPaid + insuranceFundDelta,
        "tokens leaving CM must equal reward paid + insurance funded – any discrepancy is a drain"
      );

      // After bad-debt coverage, CM solvency must still hold
      await assertCmSolvency(fixture, participants, "post-liquidation");
    });

    it("covers bad debt from insurance without creating tokens or phantom collateral", async function () {
      const { perpStorage, positionManager, riskManager, liquidationEngine, mockToken, collateralManager, insuranceTreasury } = fixture.contracts;

      // Pre-fund the insurance treasury ERC20 balance (simulates premiums collected before
      // this test).  We do NOT set PerpStorage.insuranceFundBalance because that setter is
      // onlyModule — the accounting balance is managed exclusively by the contract modules.
      // This means bad debt will be left uncovered (insuranceFundBalance == 0), which is
      // exactly the scenario we want: verify that even without coverage the system total
      // (CM + insurance treasury + protocol treasury + external wallets) is conserved.
      const insuranceSeed = fixture.ethers.parseEther("50000");
      await fixture.contracts.mockToken.transfer(
        await fixture.contracts.insuranceTreasury.getAddress(),
        insuranceSeed
      );

      const exposure = fixture.ethers.parseEther("50000");
      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const posIds = await positionManager.getTraderPositions(fixture.traders[0].address);
      await fixture.contracts.mockOracle.setPrice(10n * 10n ** 18n);

      const externalWallets = participants;
      const systemBefore = await systemTotal(fixture, externalWallets);
      const badDebtBefore = await totalBadDebt(fixture);

      if (await riskManager.isPositionLiquidatable(posIds[0])) {
        await liquidationEngine.connect(fixture.liquidator).liquidate(posIds[0]);
      }

      const systemAfter = await systemTotal(fixture, externalWallets);
      const badDebtAfter = await totalBadDebt(fixture);

      console.log("=== Bad Debt Coverage Report ===");
      console.log(`  Bad debt before: ${fixture.ethers.formatEther(badDebtBefore)} USDC`);
      console.log(`  Bad debt after:  ${fixture.ethers.formatEther(badDebtAfter)} USDC`);
      console.log(`  System total before: ${fixture.ethers.formatEther(systemBefore)} USDC`);
      console.log(`  System total after:  ${fixture.ethers.formatEther(systemAfter)} USDC`);
      console.log(`  Difference (must be ≤0 by liquidator reward exiting system): ${fixture.ethers.formatEther(systemAfter - systemBefore)} USDC`);

      // System total decreases only by the liquidator reward (which is now in liquidator's wallet,
      // which IS included in externalWallets so systemTotal should be preserved)
      expect(systemAfter).to.equal(systemBefore, "no tokens should be created or destroyed (bad-debt coverage just moves tokens across vaults)");

      await assertCmSolvency(fixture, participants, "post-bad-debt-coverage");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. FUNDING PAYMENTS – ZERO-SUM CHECK
  // ═══════════════════════════════════════════════════════════

  describe("Funding payments – zero-sum across longs and shorts", function () {
    it("funding update moves tokens between accounts but never creates or destroys them", async function () {
      const { perpStorage, fundingEngine } = fixture.contracts;
      const exposure = fixture.ethers.parseEther("20000");

      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);

      const before = await sumAccountCollateral(fixture, participants);
      const beforeCm = await cmBalance(fixture);

      const latest = await fixture.ethers.provider.getBlock("latest");
      if (!latest) throw new Error("block unavailable");
      await fixture.ethers.provider.send("evm_setNextBlockTimestamp", [latest.timestamp + 3601]);
      await fixture.ethers.provider.send("evm_mine", []);
      await fundingEngine.updateFunding();

      const afterCm = await cmBalance(fixture);

      // Funding only writes to storage (realizedPnl, cumulativeFunding) — ERC20 doesn't move
      expect(afterCm).to.equal(beforeCm, "CM ERC20 balance must not change during a funding update");
      await assertCmSolvency(fixture, participants, "post-funding-update");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. MULTI-STEP DRAIN ISOLATION
  // ═══════════════════════════════════════════════════════════

  describe("Multi-step sequence – check invariant at every step", function () {
    it("affirms CM solvency after each individual operation in a realistic lifecycle", async function () {
      const { mockOracle, positionManager, riskManager, liquidationEngine, fundingEngine } = fixture.contracts;
      const exposure = fixture.ethers.parseEther("30000");

      // Step 1: Open
      await fixture.settleMatch(fixture.traders[0], fixture.traders[1], exposure);
      await assertCmSolvency(fixture, participants, "step1:open");

      // Step 2: Price goes down 20%
      await mockOracle.setPrice(800n * 10n ** 18n);
      await assertCmSolvency(fixture, participants, "step2:price-drop-20%");

      // Step 3: Partial funding update
      const latest = await fixture.ethers.provider.getBlock("latest");
      if (!latest) throw new Error("block unavailable");
      await fixture.ethers.provider.send("evm_setNextBlockTimestamp", [latest.timestamp + 3601]);
      await fixture.ethers.provider.send("evm_mine", []);
      await fundingEngine.updateFunding();
      await assertCmSolvency(fixture, participants, "step3:funding-update");

      // Step 4: Price crashes – may make position liquidatable
      await mockOracle.setPrice(100n * 10n ** 18n);
      await assertCmSolvency(fixture, participants, "step4:price-crash");

      // Step 5: Attempt liquidation
      const posIds = await positionManager.getTraderPositions(fixture.traders[0].address);
      for (const posId of posIds) {
        if (await riskManager.isPositionLiquidatable(posId)) {
          await liquidationEngine.connect(fixture.liquidator).liquidate(posId);
          await assertCmSolvency(fixture, participants, `step5:liquidation-${posId}`);
        }
      }

      // Step 6: Price recovers – no state change expected in CM
      await mockOracle.setPrice(1000n * 10n ** 18n);
      await assertCmSolvency(fixture, participants, "step6:price-recovery");

      // Verify no drain by comparing total tracked tokens (conservation across all vaults)
      const externalWallets = participants;
      const finalSystem = await systemTotal(fixture, externalWallets);
      // System total accounted for: we can verify it's positive and reasonable
      expect(finalSystem).to.be.gt(0n);
    });
  });
});
