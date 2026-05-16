import { expect } from "chai";
import { network } from "hardhat";

type Contract = any;

type TestOrder = {
  trader: string;
  side: 0 | 1;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
  marketId: string;
};

describe("JIT Margin Integration", function () {
  this.timeout(180000);

  const INITIAL_PRICE = 1_000n * 10n ** 18n;

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
  let optionsPricer: Contract;
  let optionsEngine: Contract;

  let owner: any;
  let longTrader: any;
  let shortTrader: any;
  let liquidator: any;
  let thirdTrader: any;
  let ethers: any;
  let marketId: string;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, longTrader, shortTrader, liquidator, thirdTrader] = await ethers.getSigners();

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
    fundingEngine = await FundingEngine.deploy(await perpStorage.getAddress(), await collateralManager.getAddress());
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
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    await perpStorage.setMarketFeedId(marketId);

    await perpStorage.addMarket(marketId, marketId, 0, 0, 750, 80, 150);
    await perpStorage.setJitModeEnabled(true);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await riskManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await settlementEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await fundingEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await optionsEngine.getAddress(), true);

    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await insuranceTreasury.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);

    await seedWalletCollateral(longTrader, ethers.parseEther("10000"));
    await seedWalletCollateral(shortTrader, ethers.parseEther("10000"));
    await seedWalletCollateral(liquidator, ethers.parseEther("10000"));
    await seedWalletCollateral(thirdTrader, ethers.parseEther("10000"));
  });

  it("pulls required margin from wallet when opening in JIT mode", async function () {
    const exposure = ethers.parseEther("500");
    const longWalletBefore = await mockToken.balanceOf(longTrader.address);
    const shortWalletBefore = await mockToken.balanceOf(shortTrader.address);

    await settleSimpleMatch(exposure, 1n, 2n);

    const longWalletAfter = await mockToken.balanceOf(longTrader.address);
    const shortWalletAfter = await mockToken.balanceOf(shortTrader.address);

    expect(longWalletAfter).to.be.lt(longWalletBefore);
    expect(shortWalletAfter).to.be.lt(shortWalletBefore);
    expect(await perpStorage.accountCollateral(longTrader.address)).to.be.gt(0n);
    expect(await perpStorage.accountCollateral(shortTrader.address)).to.be.gt(0n);
  });

  it("returns margin and pnl to wallet on close when no active positions remain", async function () {
    const exposure = ethers.parseEther("1000");
    const longWalletInitial = await mockToken.balanceOf(longTrader.address);

    await settleSimpleMatch(exposure, 3n, 4n);
    const longWalletAfterOpen = await mockToken.balanceOf(longTrader.address);
    expect(longWalletAfterOpen).to.be.lt(longWalletInitial);

    const longPositions = await positionManager.getTraderPositions(longTrader.address);
    const longPositionId = longPositions[0];

    // Ensure counterparty has free collateral for the maker leg required by closePositionViaMatch.
    await collateralManager.connect(shortTrader).depositCollateral(ethers.parseEther("300"));

    await mockOracle.setPrice(ethers.parseEther("1200"));
    const counterOrder = await buildOrder(shortTrader.address, 0, exposure, 0n, 40n);
    await settlementEngine.connect(longTrader).closePositionViaMatch(
      longPositionId,
      counterOrder,
      await signOrder(shortTrader, counterOrder),
      exposure
    );

    const longWalletAfterClose = await mockToken.balanceOf(longTrader.address);
    expect(longWalletAfterClose).to.be.gt(longWalletAfterOpen);
    expect(longWalletAfterClose).to.be.gt(longWalletInitial);
    expect(await perpStorage.accountCollateral(longTrader.address)).to.equal(0n);
  });

  it("reverts open when wallet allowance is insufficient in JIT mode", async function () {
    await mockToken.connect(longTrader).approve(await collateralManager.getAddress(), 0n);

    const exposure = ethers.parseEther("300");
    const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, 5n);
    const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, 6n);

    await expect(
      settlementEngine.settleMatch(
        longOrder,
        await signOrder(longTrader, longOrder),
        shortOrder,
        await signOrder(shortTrader, shortOrder),
        exposure
      )
    ).to.be.revertedWithPanic(0x11);
  });

  it("liquidation payout distribution works in JIT mode", async function () {
    const exposure = ethers.parseEther("5000");
    await settleSimpleMatch(exposure, 7n, 8n);

    const longPositions = await positionManager.getTraderPositions(longTrader.address);
    const longPositionId = longPositions[0];

    await mockOracle.setPrice((INITIAL_PRICE * 50n) / 100n);
    expect(await riskManager.isPositionLiquidatable(longPositionId)).to.equal(true);

    const liquidatorWalletBefore = await mockToken.balanceOf(liquidator.address);
    await liquidationEngine.connect(liquidator).liquidate(longPositionId);
    const liquidatorWalletAfter = await mockToken.balanceOf(liquidator.address);

    const position = await perpStorage.getPosition(longPositionId);
    expect(position.active).to.equal(false);
    expect(await perpStorage.accountCollateral(longTrader.address)).to.equal(0n);
    expect(liquidatorWalletAfter).to.be.gte(liquidatorWalletBefore);
  });

  it("supports mixed perps and options activity under JIT collateral pulls", async function () {
    const exposure = ethers.parseEther("700");
    await settleSimpleMatch(exposure, 9n, 10n);

    const walletBeforeOptionOpen = await mockToken.balanceOf(longTrader.address);

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      ethers.parseEther("1000"),
      await oneHourFromNow(),
      7000,
      100,
      await mockToken.getAddress()
    );
    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    await optionsEngine.connect(longTrader).openLongOption(seriesId, 10n ** 18n);

    const walletAfterOptionOpen = await mockToken.balanceOf(longTrader.address);
    expect(walletAfterOptionOpen).to.be.lt(walletBeforeOptionOpen);

    const perpPositions = await positionManager.getTraderPositions(longTrader.address);
    expect(perpPositions.length).to.be.gte(1);

    const optionPosition = await perpStorage.getOptionPosition(0n);
    expect(optionPosition.trader).to.equal(longTrader.address);
    expect(optionPosition.active).to.equal(true);
    expect(optionPosition.isLong).to.equal(true);
  });

  it("reconciles protocol treasury and feePool across perp and options fee sources", async function () {
    await perpStorage.setMarketFeeParams(marketId, 10, 20);

    const exposure = ethers.parseEther("1000");
    const strike = ethers.parseEther("1000");
    const salePrice = ethers.parseEther("100");

    const treasuryBefore = await mockToken.balanceOf(await protocolTreasury.getAddress());
    const feePoolBefore = await perpStorage.feePool();

    await settleSimpleMatch(exposure, 11n, 12n);

    await optionsEngine.registerOptionSeries(
      marketId,
      true,
      strike,
      await oneHourFromNow(),
      7000,
      100,
      await mockToken.getAddress()
    );
    const seriesId = (await perpStorage.nextOptionSeriesId()) - 1n;

    await optionsEngine.connect(longTrader).openLongOption(seriesId, 10n ** 18n);
    await optionsEngine.connect(shortTrader).openShortOption(seriesId, 10n ** 18n);

    await optionsEngine.connect(longTrader).transferOptionPosition(0n, thirdTrader.address, salePrice);

    await mockOracle.setPrice(ethers.parseEther("1200"));
    await increaseTime(2 * 3600);

    await optionsEngine.connect(thirdTrader).settleOption(0n);
    await optionsEngine.connect(shortTrader).settleOption(1n);

    const treasuryAfter = await mockToken.balanceOf(await protocolTreasury.getAddress());
    const feePoolAfter = await perpStorage.feePool();

    const expectedTradingFees = (exposure * (20n + 10n)) / 10000n;
    const expectedCreationFees = ((strike * 5n) / 10000n) * 2n;
    const expectedSecondaryFees = ((salePrice * 5n) / 10000n) * 2n;
    const payout = ethers.parseEther("200");
    const expectedExerciseFees = ((payout * 5n) / 10000n) * 2n;
    const expectedFeePoolDelta = expectedCreationFees + expectedSecondaryFees + expectedExerciseFees;

    expect(treasuryAfter - treasuryBefore).to.equal(expectedTradingFees);
    expect(feePoolAfter - feePoolBefore).to.equal(expectedFeePoolDelta);
  });

  async function settleSimpleMatch(exposure: bigint, longNonce: bigint, shortNonce: bigint) {
    const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, longNonce);
    const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, shortNonce);

    await settlementEngine.settleMatch(
      longOrder,
      await signOrder(longTrader, longOrder),
      shortOrder,
      await signOrder(shortTrader, shortOrder),
      exposure
    );
  }

  async function seedWalletCollateral(traderSigner: any, amount: bigint) {
    await mockToken.transfer(traderSigner.address, amount);
    await mockToken.connect(traderSigner).approve(await collateralManager.getAddress(), amount);
  }

  async function buildOrder(
    trader: string,
    side: 0 | 1,
    exposure: bigint,
    limitPrice: bigint,
    nonce: bigint
  ): Promise<TestOrder> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");

    return {
      trader,
      side,
      exposure,
      limitPrice,
      expiry: BigInt(latest.timestamp + 3600),
      nonce,
      marketId,
    };
  }

  async function signOrder(signer: any, order: TestOrder): Promise<string> {
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

  async function oneHourFromNow(): Promise<bigint> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");
    return BigInt(latest.timestamp + 3600);
  }

  async function increaseTime(seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }
});
