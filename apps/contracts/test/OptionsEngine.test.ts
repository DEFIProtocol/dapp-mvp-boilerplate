import { expect } from "chai";
import { network } from "hardhat";

type Contract = any;

describe("OptionsEngine Module Integration", function () {
  this.timeout(180000);

  const INITIAL_PRICE = 1_000n * 10n ** 18n;
  const WAD = 10n ** 18n;

  let mockToken: Contract;
  let mockOracle: Contract;

  let perpStorage: Contract;
  let collateralManager: Contract;
  let optionsPricer: Contract;
  let optionsEngine: Contract;

  let owner: any;
  let longTrader: any;
  let shortTrader: any;
  let thirdTrader: any;
  let ethers: any;
  let marketId: string;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, longTrader, shortTrader, thirdTrader] = await ethers.getSigners();

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

    marketId = ethers.encodeBytes32String("ETH/USD");

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    await perpStorage.setMarketFeedId(marketId);
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await optionsEngine.getAddress(), true);

    await seedCollateral(longTrader, ethers.parseEther("20000"));
    await seedCollateral(shortTrader, ethers.parseEther("20000"));
    await seedCollateral(thirdTrader, ethers.parseEther("20000"));
  });

  it("opens long and short options and persists position state", async function () {
    const expiry = await oneHourFromNow();

    const registerTx = await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      expiry,
      8000,
      100,
      await mockToken.getAddress()
    );
    await registerTx.wait();

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    const longTx = await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);
    await longTx.wait();

    const shortTx = await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);
    await shortTx.wait();

    const longPositionId = 0n;
    const shortPositionId = 1n;

    const longPosition = await perpStorage.getOptionPosition(longPositionId);
    const shortPosition = await perpStorage.getOptionPosition(shortPositionId);

    expect(longPosition.trader).to.equal(longTrader.address);
    expect(longPosition.isLong).to.equal(true);
    expect(longPosition.active).to.equal(true);

    expect(shortPosition.trader).to.equal(shortTrader.address);
    expect(shortPosition.isLong).to.equal(false);
    expect(shortPosition.active).to.equal(true);

    expect(await perpStorage.seriesOpenInterestLong(seriesId)).to.equal(WAD);
    expect(await perpStorage.seriesOpenInterestShort(seriesId)).to.equal(WAD);
  });

  it("settles ITM call long with positive payout", async function () {
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

    const beforeOpenBalance = await perpStorage.accountCollateral(longTrader.address);
    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const beforeSettleBalance = await perpStorage.accountCollateral(longTrader.address);
    expect(beforeSettleBalance).to.be.lt(beforeOpenBalance);

    await mockOracle.setPrice(ethers.parseEther("1200"));
    await increaseTime(2 * 3600);

    await optionsEngine.connect(longTrader).settleOption(0n);

    const afterSettleBalance = await perpStorage.accountCollateral(longTrader.address);
    expect(afterSettleBalance).to.be.gt(beforeSettleBalance);

    const position = await perpStorage.getOptionPosition(0n);
    expect(position.active).to.equal(false);
    expect(position.settled).to.equal(true);
  });

  it("settles OTM put long with zero payout", async function () {
    const expiry = await oneHourFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      false,
      ethers.parseEther("900"),
      expiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const beforeSettleBalance = await perpStorage.accountCollateral(longTrader.address);

    await mockOracle.setPrice(ethers.parseEther("1000"));
    await increaseTime(2 * 3600);

    await optionsEngine.connect(longTrader).settleOption(0n);

    const afterSettleBalance = await perpStorage.accountCollateral(longTrader.address);
    expect(afterSettleBalance).to.equal(beforeSettleBalance);

    const position = await perpStorage.getOptionPosition(0n);
    expect(position.settled).to.equal(true);
  });

  it("locks and releases writer reserved margin after settlement", async function () {
    const expiry = await oneHourFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1200"),
      expiry,
      5000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    const reservedBefore = await perpStorage.reservedMargin(shortTrader.address);

    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    const position = await perpStorage.getOptionPosition(0n);
    const reservedAfterOpen = await perpStorage.reservedMargin(shortTrader.address);
    expect(reservedAfterOpen - reservedBefore).to.equal(position.marginLocked);

    await mockOracle.setPrice(ethers.parseEther("1000"));
    await increaseTime(2 * 3600);

    await optionsEngine.connect(shortTrader).settleOption(0n);

    const reservedAfterSettle = await perpStorage.reservedMargin(shortTrader.address);
    expect(reservedAfterSettle).to.equal(reservedBefore);
  });

  it("collects 0.05% creation fee for both long and short opens", async function () {
    const expiry = await oneHourFromNow();

    const strike = ethers.parseEther("1000");
    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      strike,
      expiry,
      7000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    const beforeFeePool = await perpStorage.feePool();

    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    const notional = (strike * WAD) / WAD;
    const perSideCreationFee = (notional * 5n) / 10000n;
    const afterFeePool = await perpStorage.feePool();

    expect(afterFeePool - beforeFeePool).to.be.gte(perSideCreationFee * 2n);
  });

  it("charges exercise fee only for exercised payout and no extra fee on worthless expiry", async function () {
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
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    const feePoolAfterOpen = await perpStorage.feePool();

    await mockOracle.setPrice(ethers.parseEther("1200"));
    await increaseTime(2 * 3600);

    await optionsEngine.connect(longTrader).settleOption(0n);
    await optionsEngine.connect(shortTrader).settleOption(1n);

    const feePoolAfterExercise = await perpStorage.feePool();
    expect(feePoolAfterExercise).to.be.gt(feePoolAfterOpen);

    await optionsEngine.registerOptionSeries(
      marketId,
      false,
      ethers.parseEther("900"),
      await oneHourFromNow(),
      6000,
      100,
      await mockToken.getAddress()
    );

    const otmSeriesId = (await perpStorage.nextOptionSeriesId()) - 1n;
    await optionsEngine.connect(longTrader).openLongOption(otmSeriesId, WAD);
    const longPositionId = (await perpStorage.nextOptionPositionId()) - 1n;

    const feePoolBeforeWorthlessSettle = await perpStorage.feePool();
    await mockOracle.setPrice(ethers.parseEther("1000"));
    await increaseTime(2 * 3600);
    await optionsEngine.connect(longTrader).settleOption(longPositionId);
    const feePoolAfterWorthlessSettle = await perpStorage.feePool();

    expect(feePoolAfterWorthlessSettle).to.equal(feePoolBeforeWorthlessSettle);
  });

  it("rejects open on expired and inactive series", async function () {
    const nearExpiry = await twoMinutesFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      nearExpiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesIdA = (await perpStorage.nextOptionSeriesId()) - 1n;

    await increaseTime(5 * 60);
    await expect(
      optionsEngine.connect(longTrader).openLongOption(seriesIdA, WAD)
    ).to.be.revertedWith("Series expired");

    const expiryB = await oneHourFromNow();
    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("950"),
      expiryB,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesIdB = (await perpStorage.nextOptionSeriesId()) - 1n;

    await increaseTime(2 * 3600);
    await optionsEngine.expireSeries(seriesIdB);

    await expect(
      optionsEngine.connect(longTrader).openLongOption(seriesIdB, WAD)
    ).to.be.revertedWith("Series not active");
  });

  it("transfers long option ownership and charges bilateral secondary transfer fees", async function () {
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
    await optionsEngine.connect(longTrader).openLongOption(seriesId, WAD);

    const salePrice = ethers.parseEther("100");
    const expectedFee = (salePrice * 5n) / 10000n;
    const feePoolBefore = await perpStorage.feePool();
    const sellerBefore = await perpStorage.accountCollateral(longTrader.address);
    const buyerBefore = await perpStorage.accountCollateral(thirdTrader.address);

    await optionsEngine.connect(longTrader).transferOptionPosition(0n, thirdTrader.address, salePrice);

    const position = await perpStorage.getOptionPosition(0n);
    expect(position.trader).to.equal(thirdTrader.address);

    const feePoolAfter = await perpStorage.feePool();
    expect(feePoolAfter - feePoolBefore).to.equal(expectedFee * 2n);

    const sellerAfter = await perpStorage.accountCollateral(longTrader.address);
    const buyerAfter = await perpStorage.accountCollateral(thirdTrader.address);
    expect(sellerAfter - sellerBefore).to.equal(salePrice - expectedFee);
    expect(buyerBefore - buyerAfter).to.equal(salePrice + expectedFee);
  });

  it("transfers short option and moves reserved margin to new owner", async function () {
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
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    const shortPos = await perpStorage.getOptionPosition(0n);
    const sellerReservedBefore = await perpStorage.reservedMargin(shortTrader.address);
    const buyerReservedBefore = await perpStorage.reservedMargin(thirdTrader.address);

    await optionsEngine.connect(shortTrader).transferOptionPosition(0n, thirdTrader.address, ethers.parseEther("50"));

    const sellerReservedAfter = await perpStorage.reservedMargin(shortTrader.address);
    const buyerReservedAfter = await perpStorage.reservedMargin(thirdTrader.address);

    expect(sellerReservedBefore - sellerReservedAfter).to.equal(shortPos.marginLocked);
    expect(buyerReservedAfter - buyerReservedBefore).to.equal(shortPos.marginLocked);

    const positionAfter = await perpStorage.getOptionPosition(0n);
    expect(positionAfter.trader).to.equal(thirdTrader.address);
    expect(positionAfter.isLong).to.equal(false);
  });

  it("supports permissionless keeper expiry and rejects duplicate expire attempts", async function () {
    const nearExpiry = await twoMinutesFromNow();

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      nearExpiry,
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    await increaseTime(5 * 60);

    // Any keeper address can trigger expiry after timestamp.
    await optionsEngine.connect(thirdTrader).expireSeries(seriesId);

    const series = await perpStorage.getOptionSeries(seriesId);
    expect(series.status).to.equal(2n); // Expired

    await expect(optionsEngine.connect(owner).expireSeries(seriesId)).to.be.revertedWith("Series not active");
  });

  it("supports delayed permissionless settlement and lifecycle progression to settled", async function () {
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
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, WAD);

    await mockOracle.setPrice(ethers.parseEther("1200"));
    await increaseTime(3 * 3600); // simulate delayed keeper execution window

    // Keeper settles long first; series should auto-transition Active -> Expired.
    await optionsEngine.connect(thirdTrader).settleOption(0n);
    let series = await perpStorage.getOptionSeries(seriesId);
    expect(series.status).to.equal(2n); // Expired

    // Settle remaining open interest; series should become Settled.
    await optionsEngine.connect(thirdTrader).settleOption(1n);
    series = await perpStorage.getOptionSeries(seriesId);
    expect(series.status).to.equal(3n); // Settled

    // Retry path is deterministic and cleanly rejected.
    await expect(optionsEngine.connect(thirdTrader).settleOption(1n)).to.be.revertedWith("Position not active");
  });

  it("rejects opening an option from a sub-account with mismatched collateral token", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const altToken = await MockERC20.deploy("Alt USD", "AUSD", 18);
    await altToken.waitForDeployment();

    await perpStorage.createSubAccount(longTrader.address, await altToken.getAddress(), 1);
    await perpStorage.setAuthorizedModule(owner.address, true);
    await perpStorage.setSubAccountCollateralBalance(longTrader.address, 0n, ethers.parseEther("5000"));

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      await oneHourFromNow(),
      6000,
      100,
      await mockToken.getAddress()
    );

    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    await expect(
      optionsEngine.connect(longTrader).openLongOptionForSubAccount(seriesId, WAD, 0n)
    ).to.be.revertedWith("Settlement token mismatch");
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

  async function twoMinutesFromNow(): Promise<bigint> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");
    return BigInt(latest.timestamp + 120);
  }

  async function increaseTime(seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }
});
