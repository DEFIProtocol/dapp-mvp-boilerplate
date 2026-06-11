import { expect } from "chai";
import { network } from "hardhat";

type Contract = any;

describe("SpotEngine Module Integration", function () {
  this.timeout(180000);

  const WAD = 10n ** 18n;
  const INITIAL_PRICE = 1_000n * WAD;

  let ethers: any;
  let owner: any;
  let buyer: any;
  let seller: any;
  let liquidator: any;

  let mockToken: Contract;
  let mockOracle: Contract;
  let insuranceTreasury: Contract;
  let perpStorage: Contract;
  let collateralManager: Contract;
  let fundingEngine: Contract;
  let positionManager: Contract;
  let riskManager: Contract;
  let liquidationEngine: Contract;
  let spotEngine: Contract;
  let marketId: string;
  let legacySubAccountId: bigint;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, buyer, seller, liquidator] = await ethers.getSigners();

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

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

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

    const RiskManager = await ethers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
    liquidationEngine = await LiquidationEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await liquidationEngine.waitForDeployment();

    const SpotEngine = await ethers.getContractFactory("SpotEngine");
    spotEngine = await SpotEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress()
    );
    await spotEngine.waitForDeployment();

    marketId = ethers.encodeBytes32String("ETH/USD");
    legacySubAccountId = await perpStorage.LEGACY_SUBACCOUNT_ID();

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    await perpStorage.setMarketFeedId(marketId);
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await fundingEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(await spotEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await insuranceTreasury.setAuthorizedModule(await liquidationEngine.getAddress(), true);

    await seedCollateral(buyer, ethers.parseEther("20000"));
    await seedCollateral(seller, ethers.parseEther("20000"));
    await seedCollateral(liquidator, ethers.parseEther("5000"));
  });

  it("settles a matched spot trade and updates shared cross-margin state", async function () {
    const quantity = WAD;
    const price = INITIAL_PRICE;
    const quoteAmount = (quantity * price) / WAD;
    const inventorySeed = 2n * quantity;
    const sellerInventoryCost = (inventorySeed * price) / WAD;

    await perpStorage.setMarketSpotRiskParams(marketId, 9000, 250);

    const buyerCollateralBefore = await perpStorage.accountCollateral(buyer.address);
    const sellerCollateralBefore = await perpStorage.accountCollateral(seller.address);

    await perpStorage.setAccountCollateral(seller.address, sellerCollateralBefore - sellerInventoryCost);
    await perpStorage.setSpotBalance(seller.address, legacySubAccountId, marketId, inventorySeed, price, 0, 0, 0);

    await spotEngine.settleSpotMatch(
      buyer.address,
      legacySubAccountId,
      seller.address,
      legacySubAccountId,
      marketId,
      quantity,
      price,
      true
    );

    const buyerFee = (quoteAmount * 10n) / 10000n;
    const sellerFee = (quoteAmount * 5n) / 10000n;

    const buyerSpot = await perpStorage.getSpotBalance(buyer.address, legacySubAccountId, marketId);
    const sellerSpot = await perpStorage.getSpotBalance(seller.address, legacySubAccountId, marketId);

    expect(buyerSpot.quantity).to.equal(quantity);
    expect(buyerSpot.avgEntryPrice).to.equal(price);
    expect(sellerSpot.quantity).to.equal(quantity);
    expect(await perpStorage.accountCollateral(buyer.address)).to.equal(buyerCollateralBefore - quoteAmount - buyerFee);
    expect(await perpStorage.accountCollateral(seller.address)).to.equal(
      sellerCollateralBefore - sellerInventoryCost + quoteAmount - sellerFee
    );

    const buyerSpotContribution = await riskManager.getAccountSpotEquityContribution(buyer.address);
    expect(buyerSpotContribution).to.equal((quoteAmount * 9000n) / 10000n);
  });

  it("settles matched spot trades against specific sub-accounts", async function () {
    const subAccountId = 0n;
    const quantity = WAD;
    const price = INITIAL_PRICE;
    const quoteAmount = (quantity * price) / WAD;

    await perpStorage.createSubAccount(buyer.address, await mockToken.getAddress(), 1);
    await perpStorage.createSubAccount(seller.address, await mockToken.getAddress(), 1);

    await perpStorage.setSubAccountCollateralBalance(buyer.address, subAccountId, ethers.parseEther("8000"));
    await perpStorage.setSubAccountCollateralBalance(seller.address, subAccountId, ethers.parseEther("4000"));
    await perpStorage.setSpotBalance(seller.address, subAccountId, marketId, 2n * quantity, price, 0, 0, 0);
    await perpStorage.setMarketSpotRiskParams(marketId, 8500, 0);

    await spotEngine.settleSpotMatch(
      buyer.address,
      subAccountId,
      seller.address,
      subAccountId,
      marketId,
      quantity,
      price,
      false
    );

    const buyerSpot = await perpStorage.getSpotBalance(buyer.address, subAccountId, marketId);
    const sellerSpot = await perpStorage.getSpotBalance(seller.address, subAccountId, marketId);
    const buyerSubAccount = await perpStorage.getSubAccount(buyer.address, subAccountId);
    const sellerSubAccount = await perpStorage.getSubAccount(seller.address, subAccountId);

    expect(buyerSpot.quantity).to.equal(quantity);
    expect(sellerSpot.quantity).to.equal(quantity);
    expect(buyerSubAccount.collateralBalance).to.be.lt(ethers.parseEther("8000"));
    expect(sellerSubAccount.collateralBalance).to.be.gt(ethers.parseEther("4000"));

    const availableCollateral = await collateralManager.getAvailableCollateralForSubAccount(buyer.address, subAccountId);
    expect(availableCollateral).to.be.gt(0n);
  });

  it("liquidates unhealthy spot inventory when shared maintenance exceeds equity", async function () {
    const quantity = WAD;
    const price = INITIAL_PRICE;
    const quoteAmount = (quantity * price) / WAD;

    await perpStorage.setMarketSpotRiskParams(marketId, 5000, 10000);

    await perpStorage.setAccountCollateral(buyer.address, 0);
    await perpStorage.setSpotBalance(buyer.address, legacySubAccountId, marketId, quantity, price, 0, 0, 0);

    expect(await riskManager.getAccountMaintenanceRequirement(buyer.address)).to.equal(quoteAmount);
    expect(await riskManager.getAccountEquity(buyer.address)).to.equal(quoteAmount / 2n);
    expect(await riskManager.isSpotBalanceLiquidatable(buyer.address, legacySubAccountId, marketId)).to.equal(true);

    const liquidatorBalanceBefore = await mockToken.balanceOf(liquidator.address);

    await liquidationEngine.connect(liquidator).liquidateSpotBalance(buyer.address, legacySubAccountId, marketId);

    const clearedSpot = await perpStorage.getSpotBalance(buyer.address, legacySubAccountId, marketId);
    expect(clearedSpot.quantity).to.equal(0n);
    expect(await riskManager.getAccountMaintenanceRequirement(buyer.address)).to.equal(0n);
    expect(await mockToken.balanceOf(liquidator.address)).to.be.gt(liquidatorBalanceBefore);
    expect(await insuranceTreasury.balance()).to.be.gt(0n);
  });

  it("rejects spot settlement across sub-accounts with different collateral tokens", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const altToken = await MockERC20.deploy("Alt USD", "AUSD", 18);
    await altToken.waitForDeployment();

    const quantity = WAD;
    const price = INITIAL_PRICE;

    await perpStorage.createSubAccount(buyer.address, await mockToken.getAddress(), 1);
    await perpStorage.createSubAccount(seller.address, await altToken.getAddress(), 1);

    await perpStorage.setSubAccountCollateralBalance(buyer.address, 0n, ethers.parseEther("8000"));
    await perpStorage.setSubAccountCollateralBalance(seller.address, 0n, ethers.parseEther("4000"));
    await perpStorage.setSpotBalance(seller.address, 0n, marketId, 2n * quantity, price, 0, 0, 0);

    await expect(
      spotEngine.settleSpotMatch(buyer.address, 0n, seller.address, 0n, marketId, quantity, price, false)
    ).to.be.revertedWith("Settlement token mismatch");
  });

  it("removes cleared markets from the trader spot index to avoid stale storage bloat", async function () {
    await perpStorage.setSpotBalance(seller.address, legacySubAccountId, marketId, WAD, INITIAL_PRICE, 0, 0, 0);
    expect(await perpStorage.getTraderSpotMarketIds(seller.address, legacySubAccountId)).to.deep.equal([marketId]);

    await perpStorage.setSpotBalance(seller.address, legacySubAccountId, marketId, 0, 0, 0, 0, 0);

    expect(await perpStorage.getTraderSpotMarketIds(seller.address, legacySubAccountId)).to.deep.equal([]);
  });

  async function seedCollateral(traderSigner: any, amount: bigint) {
    await mockToken.transfer(traderSigner.address, amount);
    await mockToken.connect(traderSigner).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(traderSigner).depositCollateral(amount);
  }
});
