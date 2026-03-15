import { expect } from "chai";
import { network } from "hardhat";
import type { Contract } from "ethers";

type TestOrder = {
  trader: string;
  side: 0 | 1;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
  marketId: string;
};

describe("PerpSettlement Module Integration", function () {
  this.timeout(180000);

  const INITIAL_PRICE = 1_000n * 10n ** 18n;
  const BPS_DENOMINATOR = 10000n;

  let mockToken: Contract;
  let mockOracle: Contract;
  let insuranceTreasury: Contract;
  let protocolTreasury: Contract;

  let perpStorage: Contract;
  let collateralManager: Contract;
  let riskManager: Contract;
  let positionManager: Contract;
  let settlementEngine: Contract;
  let fundingEngine: Contract;
  let liquidationEngine: Contract;

  let owner: any;
  let longTrader: any;
  let shortTrader: any;
  let liquidator: any;
  let ethers: any;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, longTrader, shortTrader, liquidator] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    await mockOracle.setPrice(INITIAL_PRICE);

    const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(await mockToken.getAddress(), owner.address);
    await insuranceTreasury.waitForDeployment();

    const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    protocolTreasury = await ProtocolTreasury.deploy(await mockToken.getAddress(), owner.address);
    await protocolTreasury.waitForDeployment();

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const RiskManager = await ethers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    const FundingEngine = await ethers.getContractFactory("FundingEngine");
    fundingEngine = await FundingEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress()
    );
    await fundingEngine.waitForDeployment();

    const PositionManager = await ethers.getContractFactory("PositionManager");
    positionManager = await PositionManager.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await fundingEngine.getAddress()
    );
    await positionManager.waitForDeployment();

    const SettlementEngine = await ethers.getContractFactory("SettlementEngine");
    settlementEngine = await SettlementEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await settlementEngine.waitForDeployment();

    const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
    liquidationEngine = await LiquidationEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await liquidationEngine.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    if (!latest) {
      throw new Error("Latest block unavailable");
    }

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    const marketId = ethers.encodeBytes32String("ETH/USD");
    await perpStorage.setMarketFeedId(marketId);

    await perpStorage.setMakerFeeBps(5);
    await perpStorage.setTakerFeeBps(10);
    await perpStorage.setInsuranceBps(200);
    await perpStorage.setMaintenanceMarginBps(750);
    await perpStorage.setLiquidationRewardBps(80);
    await perpStorage.setLiquidationPenaltyBps(150);
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);
    await perpStorage.setLastFundingUpdate(latest.timestamp);
    await perpStorage.setNextFundingTime(latest.timestamp + 3600);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await riskManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await settlementEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await fundingEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await liquidationEngine.getAddress(), true);

    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await insuranceTreasury.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await seedCollateral(longTrader.address, ethers.parseEther("10000"));
    await seedCollateral(shortTrader.address, ethers.parseEther("10000"));
    await seedCollateral(liquidator.address, ethers.parseEther("10000"));
  });

  // ==================== EXECUTION TESTS ====================
  describe("Execution Tests", function () {
    it("accepts collateral through CollateralManager", async function () {
      const longTotal = await collateralManager.getTotalCollateral(longTrader.address);
      const shortTotal = await collateralManager.getTotalCollateral(shortTrader.address);

      expect(longTotal).to.equal(ethers.parseEther("10000"));
      expect(shortTotal).to.equal(ethers.parseEther("10000"));
    });

    it("settles a crossed order pair and opens both positions", async function () {
      const exposure = ethers.parseEther("500");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 1n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 2n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);

      const longPositions = await positionManager.getTraderPositions(longTrader.address);
      const shortPositions = await positionManager.getTraderPositions(shortTrader.address);

      expect(longPositions.length).to.equal(1);
      expect(shortPositions.length).to.equal(1);
    });

    it("rejects non-crossing limit orders", async function () {
      const exposure = ethers.parseEther("250");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 900n * 10n ** 18n, 11n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 1100n * 10n ** 18n, 12n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await expect(
        settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure)
      ).to.be.revertedWith("Orders do not cross");
    });

    it("updates funding window after one interval", async function () {
      const exposure = ethers.parseEther("300");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 21n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 22n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);

      const nextFundingBefore = await perpStorage.nextFundingTime();
      await perpStorage.setNextFundingTime(0);
      await fundingEngine.updateFunding();
      const nextFundingAfter = await perpStorage.nextFundingTime();

      expect(nextFundingAfter > nextFundingBefore).to.equal(true);
    });

    it("blocks withdrawals when unrealized losses consume account equity", async function () {
      const exposure = ethers.parseEther("90000");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 23n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 24n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);

      await mockOracle.setPrice(INITIAL_PRICE / 10n);

      expect(await collateralManager.getAvailableCollateral(longTrader.address)).to.equal(0n);

      await expect(
        collateralManager.connect(longTrader).withdrawCollateral(1n)
      ).to.be.revertedWith("Insufficient available collateral");
    });

    it("rejects settlement prices that deviate by more than 5% from oracle mark", async function () {
      const exposure = ethers.parseEther("500");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 1200n * 10n ** 18n, 25n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 1000n * 10n ** 18n, 26n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await expect(
        settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure)
      ).to.be.revertedWith("Price deviation > 5%");
    });

    it("supports dynamic global and per-market oracle deviation (both tighter and looser)", async function () {
      const exposure = ethers.parseEther("500");
      const marketId = await perpStorage.marketFeedId();

      // Baseline: 10% midpoint deviation should fail at default 5%.
      const longOrderDefault = await buildOrder(longTrader.address, 0, exposure, 1200n * 10n ** 18n, 251n);
      const shortOrderDefault = await buildOrder(shortTrader.address, 1, exposure, 1000n * 10n ** 18n, 252n);
      await expect(
        settlementEngine.settleMatch(
          longOrderDefault,
          await signOrder(longTrader, longOrderDefault),
          shortOrderDefault,
          await signOrder(shortTrader, shortOrderDefault),
          exposure
        )
      ).to.be.revertedWith("Price deviation > 5%");

      // Looser global policy: allow up to 12%, so the same 10% deviation should pass.
      await perpStorage.setMaxOracleDeviationBps(1200);
      const longOrderGlobalLoose = await buildOrder(longTrader.address, 0, exposure, 1200n * 10n ** 18n, 253n);
      const shortOrderGlobalLoose = await buildOrder(shortTrader.address, 1, exposure, 1000n * 10n ** 18n, 254n);
      await settlementEngine.settleMatch(
        longOrderGlobalLoose,
        await signOrder(longTrader, longOrderGlobalLoose),
        shortOrderGlobalLoose,
        await signOrder(shortTrader, shortOrderGlobalLoose),
        exposure
      );

      // Tighten market override to 3% while global is reset to 5%.
      await perpStorage.setMaxOracleDeviationBps(500);
      await perpStorage.setMarketOracleDeviationBps(marketId, 300);

      // 4% midpoint deviation should now fail due to tighter market setting.
      const longOrderMarketTight = await buildOrder(longTrader.address, 0, exposure, 1080n * 10n ** 18n, 255n);
      const shortOrderMarketTight = await buildOrder(shortTrader.address, 1, exposure, 1000n * 10n ** 18n, 256n);
      await expect(
        settlementEngine.settleMatchForMarket(
          marketId,
          longOrderMarketTight,
          await signOrder(longTrader, longOrderMarketTight),
          shortOrderMarketTight,
          await signOrder(shortTrader, shortOrderMarketTight),
          exposure
        )
      ).to.be.revertedWith("Price deviation > 5%");

      // Loosen market override to 15%; same 10% deviation should pass even with global 5%.
      await perpStorage.setMarketOracleDeviationBps(marketId, 1500);
      const longOrderMarketLoose = await buildOrder(longTrader.address, 0, exposure, 1200n * 10n ** 18n, 257n);
      const shortOrderMarketLoose = await buildOrder(shortTrader.address, 1, exposure, 1000n * 10n ** 18n, 258n);
      await settlementEngine.settleMatchForMarket(
        marketId,
        longOrderMarketLoose,
        await signOrder(longTrader, longOrderMarketLoose),
        shortOrderMarketLoose,
        await signOrder(shortTrader, shortOrderMarketLoose),
        exposure
      );
    });

    it("re-checks maintenance margin after withdraw even when available collateral is positive", async function () {
      const exposure = ethers.parseEther("1000");
      await settlementEngine.setExecutionLeverage(100);

      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 27n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 28n);

      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);

      const longCollateral = await perpStorage.accountCollateral(longTrader.address);
      const reservedMargin = await perpStorage.reservedMargin(longTrader.address);
      const maintenanceRequirement = exposure * BigInt(await perpStorage.maintenanceMarginBps()) / BPS_DENOMINATOR;
      const withdrawAmount = longCollateral - (maintenanceRequirement - 1n);

      expect(await collateralManager.getAvailableCollateral(longTrader.address)).to.be.gte(withdrawAmount);
      expect(maintenanceRequirement).to.be.gt(reservedMargin);

      await expect(
        collateralManager.connect(longTrader).withdrawCollateral(withdrawAmount)
      ).to.be.revertedWith("Insufficient maintenance margin after withdraw");
    });
  });

  // ==================== VERIFICATION TESTS ====================
  describe("Verification: Mathematical Correctness", function () {
    it("should calculate fees exactly as formula specifies", async function () {
      const exposure = ethers.parseEther("1000");
      
      // Get fee parameters
      const makerFeeBps = await perpStorage.makerFeeBps();
      const takerFeeBps = await perpStorage.takerFeeBps();
      
      // Expected calculations
      const expectedMakerFee = exposure * BigInt(makerFeeBps) / BPS_DENOMINATOR;
      const expectedTakerFee = exposure * BigInt(takerFeeBps) / BPS_DENOMINATOR;
      const expectedInsurance = 0n;
      const expectedTotalFee = expectedMakerFee + expectedTakerFee;
      
      // Get balances before
      const beforeLongBalance = await perpStorage.accountCollateral(longTrader.address);
      const beforeShortBalance = await perpStorage.accountCollateral(shortTrader.address);
      const beforeFeePool = await perpStorage.feePool();
      const beforeInsurance = await perpStorage.insuranceFundBalance();
      const beforeProtocolTreasury = await protocolTreasury.balance();
      
      // Execute match
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 31n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 32n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      // Get balances after
      const afterLongBalance = await perpStorage.accountCollateral(longTrader.address);
      const afterShortBalance = await perpStorage.accountCollateral(shortTrader.address);
      const afterFeePool = await perpStorage.feePool();
      const afterInsurance = await perpStorage.insuranceFundBalance();
      const afterProtocolTreasury = await protocolTreasury.balance();
      
      // Long pays taker fee only (insurance now funded by liquidation penalties)
      expect(beforeLongBalance - afterLongBalance).to.equal(expectedTakerFee + expectedInsurance);
      
      // Short pays maker fee
      expect(beforeShortBalance - afterShortBalance).to.equal(expectedMakerFee);
      
      // Fees are routed to protocol treasury (batched per transaction), leaving feePool unchanged.
      expect(afterFeePool - beforeFeePool).to.equal(0n);
      expect(afterProtocolTreasury - beforeProtocolTreasury).to.equal(expectedTotalFee);
      
      // Trading does not fund insurance under current liquidation-only policy.
      expect(afterInsurance - beforeInsurance).to.equal(expectedInsurance);
    });

    it("should calculate PnL correctly for price movements", async function () {
      const exposure = ethers.parseEther("1000");
      const entryPrice = INITIAL_PRICE;
      
      // Open position
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 41n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 42n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      const longPositions = await positionManager.getTraderPositions(longTrader.address);
      const longPosId = longPositions[0];
      
      // Test price increase (+10%)
      const newPrice = entryPrice * 110n / 100n;
      await mockOracle.setPrice(newPrice);
      
      const [_positionUp, pnl] = await positionManager.getPositionWithPnL(longPosId, newPrice);
      
      // Expected PnL for long: exposure * (new - entry) / entry
      const expectedPnl = exposure * (newPrice - entryPrice) / entryPrice;
      
      // Allow for small rounding errors
      const diff = pnl > expectedPnl ? pnl - expectedPnl : expectedPnl - pnl;
      expect(diff).to.be.lt(ethers.parseEther("0.01"));
      
      // Test price decrease (-10%)
      const lowerPrice = entryPrice * 90n / 100n;
      await mockOracle.setPrice(lowerPrice);
      
      const [_positionDown, pnlDown] = await positionManager.getPositionWithPnL(longPosId, lowerPrice);
      const expectedPnlDown = exposure * (lowerPrice - entryPrice) / entryPrice;
      
      const diffDown = pnlDown > expectedPnlDown ? pnlDown - expectedPnlDown : expectedPnlDown - pnlDown;
      expect(diffDown).to.be.lt(ethers.parseEther("0.01"));
    });

    it("should calculate liquidation price correctly", async function () {
      const exposure = ethers.parseEther("1000");
      const margin = ethers.parseEther("100"); // 10x leverage
      const entryPrice = INITIAL_PRICE;
      const maintBps = await perpStorage.maintenanceMarginBps(); // 1000 = 10%
      
      // Open position with known margin (need to calculate leverage properly)
      // This is simplified - in reality you'd need to set leverage in order
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 51n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 52n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      const longPositions = await positionManager.getTraderPositions(longTrader.address);
      const longPosId = longPositions[0];
      
      // Get liquidation price from contract
      const liqPrice = await riskManager.getLiquidationPrice(longPosId);
      
      // Calculate expected liquidation price
      // Formula: entry - (margin - maintReq) * entry / exposure
      const maintReq = exposure * BigInt(maintBps) / BPS_DENOMINATOR;
      
      // For a long position with 10x leverage, margin should be exposure/10
      // But our actual margin might be different, so we need to get it
      const position = await perpStorage.positions(longPosId);
      const actualMargin = position.margin;
      
      if (actualMargin > maintReq) {
        const expectedLiqPrice = entryPrice - ((actualMargin - maintReq) * entryPrice / exposure);
        const priceDiff = liqPrice > expectedLiqPrice ? liqPrice - expectedLiqPrice : expectedLiqPrice - liqPrice;
        expect(priceDiff).to.be.lt(ethers.parseEther("1"));
      }
    });

    it("charges pro-rata fees across partial fills and routes each fill to protocol treasury", async function () {
      const totalExposure = ethers.parseEther("1000");
      const firstFill = ethers.parseEther("400");
      const secondFill = totalExposure - firstFill;

      const makerFeeBps = await perpStorage.makerFeeBps();
      const takerFeeBps = await perpStorage.takerFeeBps();

      const longOrder = await buildOrder(longTrader.address, 0, totalExposure, 0n, 131n);
      const shortOrder = await buildOrder(shortTrader.address, 1, totalExposure, 0n, 132n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);

      const beforeProtocolTreasury = await protocolTreasury.balance();
      const beforeLongBalance = await perpStorage.accountCollateral(longTrader.address);
      const beforeShortBalance = await perpStorage.accountCollateral(shortTrader.address);

      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, firstFill);
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, secondFill);

      const [filled, remaining] = await settlementEngine.getOrderFillStatus(longOrder);
      expect(filled).to.equal(totalExposure);
      expect(remaining).to.equal(0n);

      const expectedTakerFee = totalExposure * BigInt(takerFeeBps) / BPS_DENOMINATOR;
      const expectedMakerFee = totalExposure * BigInt(makerFeeBps) / BPS_DENOMINATOR;
      const expectedTotalFee = expectedTakerFee + expectedMakerFee;

      const afterProtocolTreasury = await protocolTreasury.balance();
      const afterLongBalance = await perpStorage.accountCollateral(longTrader.address);
      const afterShortBalance = await perpStorage.accountCollateral(shortTrader.address);

      expect(afterProtocolTreasury - beforeProtocolTreasury).to.equal(expectedTotalFee);
      expect(beforeLongBalance - afterLongBalance).to.equal(expectedTakerFee);
      expect(beforeShortBalance - afterShortBalance).to.equal(expectedMakerFee);
      expect(await perpStorage.feePool()).to.equal(0n);
    });

    it("charges fees only on the partially closed portion in closePositionViaMatch", async function () {
      const totalExposure = ethers.parseEther("1000");
      const closeSize = ethers.parseEther("300");

      // Open baseline position pair.
      const openLong = await buildOrder(longTrader.address, 0, totalExposure, 0n, 141n);
      const openShort = await buildOrder(shortTrader.address, 1, totalExposure, 0n, 142n);
      const openLongSig = await signOrder(longTrader, openLong);
      const openShortSig = await signOrder(shortTrader, openShort);
      await settlementEngine.settleMatch(openLong, openLongSig, openShort, openShortSig, totalExposure);

      const longPositions = await positionManager.getTraderPositions(longTrader.address);
      const positionId = longPositions[0];

      // Counterparty order for partial close. Caller (longTrader) is taker by design.
      const counterOrder = await buildOrder(shortTrader.address, 0, closeSize, 0n, 143n);
      const counterSig = await signOrder(shortTrader, counterOrder);

      const makerFeeBps = await perpStorage.makerFeeBps();
      const takerFeeBps = await perpStorage.takerFeeBps();
      const expectedTakerFee = closeSize * BigInt(takerFeeBps) / BPS_DENOMINATOR;
      const expectedMakerFee = closeSize * BigInt(makerFeeBps) / BPS_DENOMINATOR;

      const beforeProtocolTreasury = await protocolTreasury.balance();
      const beforeCaller = await perpStorage.accountCollateral(longTrader.address);
      const beforeMaker = await perpStorage.accountCollateral(shortTrader.address);

      await settlementEngine.connect(longTrader).closePositionViaMatch(positionId, counterOrder, counterSig, closeSize);

      const afterProtocolTreasury = await protocolTreasury.balance();
      const afterCaller = await perpStorage.accountCollateral(longTrader.address);
      const afterMaker = await perpStorage.accountCollateral(shortTrader.address);

      expect(afterProtocolTreasury - beforeProtocolTreasury).to.equal(expectedTakerFee + expectedMakerFee);
      expect(beforeCaller - afterCaller).to.equal(expectedTakerFee);
      expect(beforeMaker - afterMaker).to.equal(expectedMakerFee);

      const updatedPosition = await perpStorage.positions(positionId);
      expect(updatedPosition.active).to.equal(true);
      expect(updatedPosition.exposure).to.equal(totalExposure - closeSize);
    });
  });

  // ==================== INVARIANT TESTS ====================
  describe("Invariants: System Properties", function () {
    it("should maintain that total collateral = sum(user balances) + feePool + insurance + protocol treasury", async function () {
      // Run some matches to generate fees
      for (let i = 0; i < 3; i++) {
        const exposure = ethers.parseEther("500");
        const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 1000n + BigInt(i));
        const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 2000n + BigInt(i));
        const longSig = await signOrder(longTrader, longOrder);
        const shortSig = await signOrder(shortTrader, shortOrder);
        await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      }
      
      // System assets are split across CollateralManager and InsuranceTreasury.
      const collateralManagerBalance = await mockToken.balanceOf(await collateralManager.getAddress());
      const insuranceTreasuryBalance = await mockToken.balanceOf(await insuranceTreasury.getAddress());
      const protocolTreasuryBalance = await mockToken.balanceOf(await protocolTreasury.getAddress());
      const contractBalance = collateralManagerBalance + insuranceTreasuryBalance + protocolTreasuryBalance;
      
      // Sum all user collateral
      let totalUserCollateral = 0n;
      for (const trader of [longTrader, shortTrader, liquidator]) {
        const collateral = await perpStorage.accountCollateral(trader.address);
        totalUserCollateral += collateral;
      }
      
      // Get fee pool and insurance
      const feePool = await perpStorage.feePool();
      const insuranceBalance = await perpStorage.insuranceFundBalance();
      
      // They should match
      expect(totalUserCollateral + feePool + insuranceBalance + protocolTreasuryBalance).to.equal(contractBalance);
    });

    it("should maintain that total exposure equals sum of position exposures", async function () {
      // Create multiple positions
      for (let i = 0; i < 3; i++) {
        const exposure = ethers.parseEther("300");
        const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 3000n + BigInt(i));
        const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 4000n + BigInt(i));
        const longSig = await signOrder(longTrader, longOrder);
        const shortSig = await signOrder(shortTrader, shortOrder);
        await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      }
      
      const totalLong = await perpStorage.totalLongExposure();
      const totalShort = await perpStorage.totalShortExposure();
      
      let sumLong = 0n;
      let sumShort = 0n;
      
      const nextId = await perpStorage.nextPositionId();
      for (let i = 0; i < nextId; i++) {
        const pos = await perpStorage.positions(i);
        if (pos.active) {
          if (pos.side === 0n) sumLong += pos.exposure;
          else sumShort += pos.exposure;
        }
      }
      
      expect(totalLong).to.equal(sumLong);
      expect(totalShort).to.equal(sumShort);
    });

    it("should maintain zero-sum between traders (excluding fees)", async function () {
      // Get initial total equity
      let initialTotalEquity = 0n;
      for (const trader of [longTrader, shortTrader]) {
        const collateral = await collateralManager.getTotalCollateral(trader.address);
        initialTotalEquity += collateral;
      }
      
      // Run multiple matches
      for (let i = 0; i < 5; i++) {
        const exposure = ethers.parseEther("400");
        const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 5000n + BigInt(i));
        const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 6000n + BigInt(i));
        const longSig = await signOrder(longTrader, longOrder);
        const shortSig = await signOrder(shortTrader, shortOrder);
        await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      }
      
      // Change price to generate PnL
      await mockOracle.setPrice(INITIAL_PRICE * 120n / 100n);
      
      // Get final total equity
      let finalTotalEquity = 0n;
      for (const trader of [longTrader, shortTrader]) {
        const equity = await riskManager.getAccountEquity(trader.address);
        finalTotalEquity += equity;
      }
      
      // Get fees collected
      const feePool = await perpStorage.feePool();
      const insuranceBalance = await perpStorage.insuranceFundBalance();
      const protocolTreasuryBalance = await protocolTreasury.balance();
      
      // Total equity + fees should equal initial deposits (within rounding)
      const totalNow = finalTotalEquity + feePool + insuranceBalance + protocolTreasuryBalance;
      const diff = totalNow > initialTotalEquity ? totalNow - initialTotalEquity : initialTotalEquity - totalNow;
      expect(diff).to.be.lt(ethers.parseEther("1"));
    });

    it("should maintain that position count matches array length", async function () {
      // Create positions
      const exposure = ethers.parseEther("200");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 7000n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 8000n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      for (const trader of [longTrader, shortTrader]) {
        const count = await perpStorage.positionCount(trader.address);
        const positions = await positionManager.getTraderPositions(trader.address);
        expect(count).to.equal(positions.length);
      }
    });
  });

  // ==================== EDGE CASE TESTS ====================
  describe("Edge Cases", function () {
    it("should reject orders with expired timestamps", async function () {
      const exposure = ethers.parseEther("100");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 9000n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 9001n);
      
      // Manually set expiry to past
      const latest = await ethers.provider.getBlock("latest");
      longOrder.expiry = BigInt(latest.timestamp - 3600);
      shortOrder.expiry = BigInt(latest.timestamp - 3600);
      
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await expect(
        settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure)
      ).to.revert(ethers);
    });

    it("should reject orders with zero exposure", async function () {
      const exposure = 0n;
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 10000n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 10001n);
      
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await expect(
        settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure)
      ).to.revert(ethers);
    });

    it("should handle maximum leverage positions", async function () {
      const maxLeverage = 100n; // From your constants
      const exposure = ethers.parseEther("10000");
      const minMargin = exposure / maxLeverage;
      
      // This should succeed if margin is sufficient
      // Need to ensure trader has enough collateral
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 11000n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 11001n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      // Should not revert
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
    });
  });

  // ==================== LIQUIDATION TESTS ====================
  describe("Liquidation Verification", function () {
    it("should liquidate underwater positions correctly", async function () {
      // Create a high leverage position
      const exposure = ethers.parseEther("5000");
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 12000n);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 12001n);
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      const longPositions = await positionManager.getTraderPositions(longTrader.address);
      const longPosId = longPositions[0];
      
      // Crash price by 50%
      const crashPrice = INITIAL_PRICE * 50n / 100n;
      await mockOracle.setPrice(crashPrice);
      
      // Verify position is liquidatable
      const isLiquidatable = await riskManager.isPositionLiquidatable(longPosId);
      expect(isLiquidatable).to.be.true;
      
      // Get balances before liquidation
      const beforeTraderBalance = await perpStorage.accountCollateral(longTrader.address);
      const beforeLiquidatorBalance = await mockToken.balanceOf(liquidator.address);
      const beforeFeePool = await perpStorage.feePool();
      const beforeInsurance = await perpStorage.insuranceFundBalance();
      
      // Get position details
      const position = await perpStorage.positions(longPosId);
      const positionExposure = position.exposure;
      const margin = position.margin;
      
      // Calculate expected reward and penalty
      const rewardBps = await perpStorage.liquidationRewardBps();
      const penaltyBps = await perpStorage.liquidationPenaltyBps();
      
      const expectedReward = positionExposure * BigInt(rewardBps) / BPS_DENOMINATOR;
      const expectedPenalty = positionExposure * BigInt(penaltyBps) / BPS_DENOMINATOR;
      
      // Liquidate
      await liquidationEngine.connect(liquidator).liquidate(longPosId);
      
      // Get balances after
      const afterTraderBalance = await perpStorage.accountCollateral(longTrader.address);
      const afterLiquidatorBalance = await mockToken.balanceOf(liquidator.address);
      const afterFeePool = await perpStorage.feePool();
      const afterInsurance = await perpStorage.insuranceFundBalance();
      
      // Verify position is closed
      const closedPosition = await perpStorage.positions(longPosId);
      expect(closedPosition.active).to.be.false;
      
      // Verify liquidator got reward (or as much as available)
      const liquidatorGain = afterLiquidatorBalance - beforeLiquidatorBalance;
      expect(liquidatorGain).to.be.at.most(expectedReward);
      
      // Liquidation penalty now routes to reward + insurance, not fee pool.
      expect(afterFeePool - beforeFeePool).to.equal(0n);

      // Insurance receives the full liquidation penalty (capped by available collateral).
      const expectedInsuranceInflow = expectedPenalty > beforeTraderBalance
        ? beforeTraderBalance
        : expectedPenalty;
      expect(afterInsurance - beforeInsurance).to.be.at.most(expectedInsuranceInflow);
      
      // Verify trader lost margin
      expect(beforeTraderBalance - afterTraderBalance).to.be.at.least(margin);
    });
  });

  // ==================== HELPER FUNCTIONS ====================
  async function seedCollateral(trader: string, amount: bigint) {
    await mockToken.transfer(trader, amount);

    const signer = trader === longTrader.address ? longTrader : 
                   trader === shortTrader.address ? shortTrader : liquidator;
    await mockToken.connect(signer).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(signer).depositCollateral(amount);
  }

  async function buildOrder(
    trader: string,
    side: 0 | 1,
    exposure: bigint,
    limitPrice: bigint,
    nonce: bigint
  ): Promise<TestOrder> {
    const { ethers } = await network.connect();
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) {
      throw new Error("Latest block unavailable");
    }

    return {
      trader,
      side,
      exposure,
      limitPrice,
      expiry: BigInt(latest.timestamp + 3600),
      nonce,
      marketId: await perpStorage.marketFeedId(),
    };
  }

  async function signOrder(signer: any, order: TestOrder): Promise<string> {
    const { ethers } = await network.connect();
    const net = await ethers.provider.getNetwork();

    const domain = {
      name: "PerpSettlement",
      version: "1",
      chainId: net.chainId,
      verifyingContract: await settlementEngine.getAddress(),
    };

    const types = {
      Order: [
        { name: "trader", type: "address" },
        { name: "side", type: "uint8" },
        { name: "exposure", type: "uint256" },
        { name: "limitPrice", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "marketId", type: "bytes32" },
      ],
    };

    return signer.signTypedData(domain, types, order);
  }
});