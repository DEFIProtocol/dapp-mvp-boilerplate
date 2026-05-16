import { expect } from "chai";
import { network } from "hardhat";

type Contract = any;

describe("Unified Margin Risk Views", function () {
  this.timeout(180000);

  const INITIAL_PRICE = 1_000n * 10n ** 18n;
  const WAD = 10n ** 18n;

  let mockToken: Contract;
  let mockOracle: Contract;

  let perpStorage: Contract;
  let collateralManager: Contract;
  let optionsPricer: Contract;
  let optionsEngine: Contract;
  let riskManager: Contract;
  let fundingEngine: Contract;
  let positionManager: Contract;

  let owner: any;
  let longTrader: any;
  let shortTrader: any;
  let ethers: any;
  let marketId: string;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, longTrader, shortTrader] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    await mockOracle.setPrice(INITIAL_PRICE);

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const OptionsPricer = await ethers.getContractFactory("OptionsPricerCore");
    optionsPricer = await OptionsPricer.deploy();
    await optionsPricer.waitForDeployment();

    const OptionsEngine = await ethers.getContractFactory("OptionsEngineModule");
    optionsEngine = await OptionsEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await optionsPricer.getAddress()
    );
    await optionsEngine.waitForDeployment();

    const RiskManager = await ethers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    const FundingEngine = await ethers.getContractFactory("FundingEngine");
    fundingEngine = await FundingEngine.deploy(await perpStorage.getAddress(), await collateralManager.getAddress());
    await fundingEngine.waitForDeployment();

    const PositionManager = await ethers.getContractFactory("PositionManager");
    positionManager = await PositionManager.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await fundingEngine.getAddress()
    );
    await positionManager.waitForDeployment();

    marketId = ethers.encodeBytes32String("ETH/USD");

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    await perpStorage.setMarketFeedId(marketId);
    await perpStorage.setOptionsPricer(await optionsPricer.getAddress());
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await optionsEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await fundingEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await seedCollateral(longTrader, ethers.parseEther("20000"));
    await seedCollateral(shortTrader, ethers.parseEther("20000"));
  });

  it("adds haircutted long-option value into account equity", async function () {
    const expiry = await thirtyDaysFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const position = await perpStorage.getOptionPosition(0n);
    const optionContribution = await riskManager.getAccountOptionEquityContribution(longTrader.address);
    const accountEquity = await riskManager.getAccountEquity(longTrader.address);
    const accountCollateral = await perpStorage.accountCollateral(longTrader.address);

    expect(position.premium).to.be.gt(0n);
    expect(optionContribution).to.be.gt(0n);
    expect(optionContribution).to.be.lt(position.premium);
    expect(accountEquity).to.equal(accountCollateral + optionContribution);
  });

  it("subtracts short-option liability from equity and adds maintenance requirement", async function () {
    const expiry = await thirtyDaysFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    const shortPosition = await perpStorage.getOptionPosition(0n);
    const optionContribution = await riskManager.getAccountOptionEquityContribution(shortTrader.address);
    const optionMaintenance = await riskManager.getAccountOptionMaintenanceRequirement(shortTrader.address);
    const accountEquity = await riskManager.getAccountEquity(shortTrader.address);
    const accountMaintenance = await riskManager.getAccountMaintenanceRequirement(shortTrader.address);
    const accountCollateral = await perpStorage.accountCollateral(shortTrader.address);

    expect(shortPosition.marginLocked).to.be.gt(0n);
    expect(optionContribution).to.be.lt(0n);
    expect(optionMaintenance).to.be.gt(shortPosition.marginLocked);
    expect(accountMaintenance).to.equal(optionMaintenance);
    expect(accountEquity).to.equal(accountCollateral + optionContribution);
  });

  it("respects option risk parameter updates for long-option equity contribution", async function () {
    const expiry = await oneHourFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const baselineContribution = await riskManager.getAccountOptionEquityContribution(longTrader.address);

    await perpStorage.setOptionHaircuts(9500, 8500, 5000, 1000);
    await perpStorage.setOptionAdversePriceShockBps(100);

    const updatedContribution = await riskManager.getAccountOptionEquityContribution(longTrader.address);

    expect(updatedContribution).to.be.gt(baselineContribution);
  });

  it("adds haircut-adjusted spot inventory into shared account equity and available collateral", async function () {
    const spotHaircutBps = 8500n;
    const spotQuantity = 2n * WAD;
    const spotEntryPrice = INITIAL_PRICE;
    const purchaseCost = (spotQuantity * spotEntryPrice) / WAD;

    await perpStorage.setMarketSpotRiskParams(marketId, spotHaircutBps, 0);

    const collateralBefore = await perpStorage.accountCollateral(longTrader.address);
    await perpStorage.setAccountCollateral(longTrader.address, collateralBefore - purchaseCost);
    await perpStorage.setSpotBalance(
      longTrader.address,
      await perpStorage.LEGACY_SUBACCOUNT_ID(),
      marketId,
      spotQuantity,
      spotEntryPrice,
      0,
      0,
      0
    );

    const expectedContribution = (purchaseCost * spotHaircutBps) / 10000n;
    const spotContribution = await riskManager.getAccountSpotEquityContribution(longTrader.address);
    const accountEquity = await riskManager.getAccountEquity(longTrader.address);
    const availableCollateral = await collateralManager.getAvailableCollateral(longTrader.address);

    expect(spotContribution).to.equal(expectedContribution);
    expect(accountEquity).to.equal((collateralBefore - purchaseCost) + expectedContribution);
    expect(availableCollateral).to.equal(accountEquity);
  });

  it("adds haircut-adjusted spot inventory into sub-account cross-margin equity", async function () {
    const subAccountId = 0n;
    const initialSubCollateral = ethers.parseEther("5000");
    const spotHaircutBps = 9000n;
    const spotQuantity = 1n * WAD;
    const spotEntryPrice = INITIAL_PRICE;
    const purchaseCost = (spotQuantity * spotEntryPrice) / WAD;

    await perpStorage.createSubAccount(longTrader.address, await mockToken.getAddress(), 1);
    await perpStorage.setSubAccountCollateralBalance(longTrader.address, subAccountId, initialSubCollateral - purchaseCost);
    await perpStorage.setMarketSpotRiskParams(marketId, spotHaircutBps, 0);
    await perpStorage.setSpotBalance(
      longTrader.address,
      subAccountId,
      marketId,
      spotQuantity,
      spotEntryPrice,
      0,
      0,
      0
    );

    const expectedContribution = (purchaseCost * spotHaircutBps) / 10000n;
    const subAccountEquity = await riskManager.getSubAccountEquity(longTrader.address, subAccountId);
    const subAccountSpotContribution = await riskManager.getSubAccountSpotEquityContribution(longTrader.address, subAccountId);
    const availableCollateral = await collateralManager.getAvailableCollateralForSubAccount(longTrader.address, subAccountId);

    expect(subAccountSpotContribution).to.equal(expectedContribution);
    expect(subAccountEquity).to.equal((initialSubCollateral - purchaseCost) + expectedContribution);
    expect(availableCollateral).to.equal(subAccountEquity);
  });

  it("flags short option liquidation when perp drawdown pushes mixed account below maintenance", async function () {
    const expiry = await oneHourFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    await openPerpPosition(shortTrader.address, 0, ethers.parseEther("50000"), 10n, INITIAL_PRICE);

    const healthBefore = await riskManager.getAccountHealthRatio(shortTrader.address);
    expect(healthBefore).to.be.gt(10n ** 18n);

    await mockOracle.setPrice(ethers.parseEther("500"));

    const healthAfter = await riskManager.getAccountHealthRatio(shortTrader.address);
    expect(healthAfter).to.equal(0n);
    expect(await riskManager.isOptionPositionLiquidatable(0n)).to.equal(true);
  });

  it("reduces maintenance requirement after partial perp force-reduction", async function () {
    await openPerpPosition(longTrader.address, 0, ethers.parseEther("10000"), 10n, INITIAL_PRICE);

    const maintenanceBefore = await riskManager.getAccountMaintenanceRequirement(longTrader.address);
    const positionBefore = await perpStorage.getPosition(0n);
    expect(positionBefore.active).to.equal(true);

    await positionManager.connect(owner).forceReducePosition(0n, ethers.parseEther("4000"), INITIAL_PRICE);

    const maintenanceAfter = await riskManager.getAccountMaintenanceRequirement(longTrader.address);
    const positionAfter = await perpStorage.getPosition(0n);

    expect(positionAfter.active).to.equal(true);
    expect(positionAfter.exposure).to.equal(ethers.parseEther("6000"));
    expect(maintenanceAfter).to.be.lt(maintenanceBefore);
  });

  it("allows short option transfer even after adverse perp move and moves reserved margin", async function () {
    const expiry = await oneHourFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      7000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openShortOption(seriesId, WAD);

    const shortPosition = await perpStorage.getOptionPosition(0n);

    await openPerpPosition(longTrader.address, 0, ethers.parseEther("20000"), 10n, INITIAL_PRICE);
    await mockOracle.setPrice(ethers.parseEther("700"));

    const sellerReservedBefore = await perpStorage.reservedMargin(longTrader.address);
    const buyerReservedBefore = await perpStorage.reservedMargin(shortTrader.address);

    await optionsEngine.connect(longTrader).transferOptionPosition(0n, shortTrader.address, 0n);

    const sellerReservedAfter = await perpStorage.reservedMargin(longTrader.address);
    const buyerReservedAfter = await perpStorage.reservedMargin(shortTrader.address);
    const transferred = await perpStorage.getOptionPosition(0n);

    expect(transferred.trader).to.equal(shortTrader.address);
    expect(sellerReservedBefore - sellerReservedAfter).to.equal(shortPosition.marginLocked);
    expect(buyerReservedAfter - buyerReservedBefore).to.equal(shortPosition.marginLocked);
  });

  it("allows opposite-side offset to reduce maintenance exposure", async function () {
    await openPerpPosition(longTrader.address, 0, ethers.parseEther("200000"), 10n, INITIAL_PRICE);
    await mockOracle.setPrice(ethers.parseEther("700"));

    const maintenanceBefore = await riskManager.getAccountMaintenanceRequirement(longTrader.address);
    const healthBefore = await riskManager.getAccountHealthRatio(longTrader.address);

    await openPerpPosition(longTrader.address, 1, ethers.parseEther("100000"), 10n, ethers.parseEther("700"));

    const maintenanceAfter = await riskManager.getAccountMaintenanceRequirement(longTrader.address);
    const healthAfter = await riskManager.getAccountHealthRatio(longTrader.address);
    const netPosition = await perpStorage.getPosition(0n);

    expect(netPosition.side).to.equal(0n);
    expect(netPosition.exposure).to.equal(ethers.parseEther("100000"));
    expect(maintenanceAfter).to.be.lt(maintenanceBefore);
    expect(healthAfter).to.be.gte(healthBefore);
  });

  it("opens residual flipped position when opposite-side offset exceeds active exposure", async function () {
    await openPerpPosition(shortTrader.address, 0, ethers.parseEther("5000"), 10n, INITIAL_PRICE);

    await openPerpPosition(shortTrader.address, 1, ethers.parseEther("8000"), 10n, INITIAL_PRICE);

    const activeIds = await positionManager.getTraderPositions(shortTrader.address);
    expect(activeIds.length).to.equal(1);

    const flipped = await perpStorage.getPosition(activeIds[0]);
    expect(flipped.active).to.equal(true);
    expect(flipped.side).to.equal(1n);
    expect(flipped.exposure).to.equal(ethers.parseEther("3000"));

    const original = await perpStorage.getPosition(0n);
    expect(original.active).to.equal(false);
  });

  it("keeps long option equity contribution unchanged across perp funding index updates", async function () {
    const expiry = await oneHourFromNow();
    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6500,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const optionContributionBefore = await riskManager.getAccountOptionEquityContribution(longTrader.address);
    const accountEquityBefore = await riskManager.getAccountEquity(longTrader.address);

    // Create perp exposure imbalance on a different account so funding indices move.
    await openPerpPosition(shortTrader.address, 0, ethers.parseEther("30000"), 10n, INITIAL_PRICE);
    await perpStorage.setNextFundingTime(0);
    await fundingEngine.updateFundingForMarket(marketId);

    const optionContributionAfter = await riskManager.getAccountOptionEquityContribution(longTrader.address);
    const accountEquityAfter = await riskManager.getAccountEquity(longTrader.address);

    const contributionDrift =
      optionContributionAfter > optionContributionBefore
        ? optionContributionAfter - optionContributionBefore
        : optionContributionBefore - optionContributionAfter;
    const equityDrift =
      accountEquityAfter > accountEquityBefore
        ? accountEquityAfter - accountEquityBefore
        : accountEquityBefore - accountEquityAfter;

    // Funding updates mine a block; allow tiny theta decay while preventing meaningful drift.
    expect(contributionDrift).to.be.lte(5_000n);
    expect(equityDrift).to.be.lte(5_000n);
  });

  it("keeps short option maintenance requirement unchanged across perp funding index updates", async function () {
    const expiry = await oneHourFromNow();
    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      6500,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openShortOption(seriesId, WAD);

    const optionMaintenanceBefore = BigInt(await riskManager.getAccountOptionMaintenanceRequirement(longTrader.address));

    await openPerpPosition(shortTrader.address, 0, ethers.parseEther("40000"), 10n, INITIAL_PRICE);
    await perpStorage.setNextFundingTime(0);
    await fundingEngine.updateFundingForMarket(marketId);

    const optionMaintenanceAfter = BigInt(await riskManager.getAccountOptionMaintenanceRequirement(longTrader.address));
    const maintenanceDrift =
      optionMaintenanceAfter > optionMaintenanceBefore
        ? optionMaintenanceAfter - optionMaintenanceBefore
        : optionMaintenanceBefore - optionMaintenanceAfter;

    // Maintenance should be effectively unchanged by perp funding updates.
    const maintenanceDriftPpb = (maintenanceDrift * 1_000_000_000n) / optionMaintenanceBefore;
    expect(maintenanceDriftPpb).to.be.lte(10n);
  });

  async function seedCollateral(traderSigner: any, amount: bigint) {
    await mockToken.transfer(traderSigner.address, amount);
    await mockToken.connect(traderSigner).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(traderSigner).depositCollateral(amount);
  }

  async function oneHourFromNow(): Promise<bigint> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");
    return BigInt(latest.timestamp + 3600);
  }

  async function thirtyDaysFromNow(): Promise<bigint> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");
    return BigInt(latest.timestamp + 30 * 24 * 3600);
  }

  async function openPerpPosition(
    trader: string,
    side: 0 | 1,
    exposure: bigint,
    leverage: bigint,
    entryPrice: bigint
  ) {
    await positionManager.connect(owner).openPositionWithMarketAndSubAccount(
      trader,
      side,
      exposure,
      leverage,
      entryPrice,
      marketId,
      (await perpStorage.LEGACY_SUBACCOUNT_ID())
    );
  }
});
