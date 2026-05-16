import { expect } from "chai";
import { network } from "hardhat";

describe("SubAccountManager", function () {
  this.timeout(120000);

  let trader: any;
  let otherTrader: any;
  let hardhatEthers: any;
  let mockToken: any;
  let altToken: any;
  let perpStorage: any;
  let subAccountManager: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [, trader, otherTrader] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    altToken = await MockERC20.deploy("Tether USD", "USDT", 18);
    await altToken.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const SubAccountManager = await hardhatEthers.getContractFactory("SubAccountManager");
    subAccountManager = await SubAccountManager.deploy(await perpStorage.getAddress());
    await subAccountManager.waitForDeployment();

    await perpStorage.setAuthorizedModule(await subAccountManager.getAddress(), true);
  });

  it("creates a default sub-account for a trader", async function () {
    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), true);

    const subAccounts = await subAccountManager.getSubAccounts(trader.address);
    expect(subAccounts.length).to.equal(1);
    expect(subAccounts[0].subAccountId).to.equal(BigInt(0));
    expect(subAccounts[0].collateralToken).to.equal(await mockToken.getAddress());
    expect(subAccounts[0].marginMode).to.equal(BigInt(1));
    expect(subAccounts[0].isDefault).to.equal(true);
    expect(await perpStorage.defaultSubAccountId(trader.address)).to.equal(BigInt(0));
    expect(await perpStorage.hasDefaultSubAccount(trader.address)).to.equal(true);
  });

  it("allows multiple sub-accounts while preserving the original default", async function () {
    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), false);
    await subAccountManager.connect(trader).createSubAccount(await altToken.getAddress(), true);

    const subAccounts = await subAccountManager.getSubAccounts(trader.address);
    expect(subAccounts.length).to.equal(2);
    expect(subAccounts[0].isDefault).to.equal(true);
    expect(subAccounts[1].isDefault).to.equal(false);
    expect(subAccounts[1].subAccountId).to.equal(BigInt(1));
    expect(subAccounts[1].marginMode).to.equal(BigInt(1));
  });

  it("updates the default sub-account and margin mode independently", async function () {
    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), false);
    await subAccountManager.connect(trader).createSubAccount(await altToken.getAddress(), false);

    await subAccountManager.connect(trader).setDefaultSubAccount(BigInt(1));
    await subAccountManager.connect(trader).setSubAccountCrossMarginMode(BigInt(1), true);

    const firstAccount = await subAccountManager.getSubAccount(trader.address, BigInt(0));
    const secondAccount = await subAccountManager.getSubAccount(trader.address, BigInt(1));

    expect(firstAccount.isDefault).to.equal(false);
    expect(secondAccount.isDefault).to.equal(true);
    expect(secondAccount.marginMode).to.equal(BigInt(1));
    expect(await perpStorage.defaultSubAccountId(trader.address)).to.equal(BigInt(1));
  });

  it("keeps sub-account state isolated per trader", async function () {
    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), false);
    await subAccountManager.connect(otherTrader).createSubAccount(await altToken.getAddress(), true);

    const traderAccounts = await subAccountManager.getSubAccounts(trader.address);
    const otherTraderAccounts = await subAccountManager.getSubAccounts(otherTrader.address);

    expect(traderAccounts.length).to.equal(1);
    expect(otherTraderAccounts.length).to.equal(1);
    expect(traderAccounts[0].collateralToken).to.equal(await mockToken.getAddress());
    expect(otherTraderAccounts[0].collateralToken).to.equal(await altToken.getAddress());
  });
});

describe("PerpStorage governance hardening", function () {
  this.timeout(120000);

  let owner: any;
  let moduleSigner: any;
  let trader: any;
  let hardhatEthers: any;
  let mockToken: any;
  let perpStorage: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [owner, moduleSigner, trader] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    await perpStorage.setAuthorizedModule(moduleSigner.address, true);
  });

  it("allows modules to pause/freeze defensively but only owner to reverse those actions", async function () {
    await perpStorage.connect(moduleSigner).setEmergencyPause(true);
    expect(await perpStorage.emergencyPause()).to.equal(true);

    await expect(perpStorage.connect(moduleSigner).setEmergencyPause(false)).to.be.revertedWith("Only owner can unpause");

    await perpStorage.connect(moduleSigner).setFrozenAccount(trader.address, true);
    expect(await perpStorage.frozenAccounts(trader.address)).to.equal(true);

    await expect(perpStorage.connect(moduleSigner).setFrozenAccount(trader.address, false)).to.be.revertedWith("Only owner can unfreeze");

    await perpStorage.connect(owner).setEmergencyPause(false);
    await perpStorage.connect(owner).setFrozenAccount(trader.address, false);

    expect(await perpStorage.emergencyPause()).to.equal(false);
    expect(await perpStorage.frozenAccounts(trader.address)).to.equal(false);
  });

  it("rejects zero addresses in critical admin setter paths", async function () {
    await expect(perpStorage.setAuthorizedModule(hardhatEthers.ZeroAddress, true)).to.be.revertedWith("Invalid module");
    await expect(perpStorage.setCollateral(hardhatEthers.ZeroAddress)).to.be.revertedWith("Invalid collateral");
    await expect(perpStorage.setInsuranceFund(hardhatEthers.ZeroAddress)).to.be.revertedWith("Invalid insurance fund");
    await expect(perpStorage.setOptionsPricer(hardhatEthers.ZeroAddress)).to.be.revertedWith("Invalid pricer");
  });
});

describe("SubAccount collateral flows", function () {
  this.timeout(120000);

  let owner: any;
  let trader: any;
  let hardhatEthers: any;
  let mockToken: any;
  let altToken: any;
  let perpStorage: any;
  let collateralManager: any;
  let subAccountManager: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [owner, trader] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    altToken = await MockERC20.deploy("Ether Wrapper", "WETH", 18);
    await altToken.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await hardhatEthers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const SubAccountManager = await hardhatEthers.getContractFactory("SubAccountManager");
    subAccountManager = await SubAccountManager.deploy(await perpStorage.getAddress());
    await subAccountManager.waitForDeployment();

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await subAccountManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await mockToken.transfer(trader.address, hardhatEthers.parseEther("1000"));
    await altToken.transfer(trader.address, hardhatEthers.parseEther("1000"));
  });

  it("deposits and withdraws collateral using the sub-account token", async function () {
    const depositAmount = hardhatEthers.parseEther("25");
    const withdrawAmount = hardhatEthers.parseEther("10");

    await subAccountManager.connect(trader).createSubAccount(await altToken.getAddress(), true);
    await altToken.connect(trader).approve(await collateralManager.getAddress(), depositAmount);
    await collateralManager.connect(trader).depositCollateralToSubAccount(0, depositAmount);

    expect(await collateralManager.getTotalCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount);
    expect(await collateralManager.getAvailableCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount);
    expect(await altToken.balanceOf(await collateralManager.getAddress())).to.equal(depositAmount);

    await collateralManager.connect(trader).withdrawCollateralFromSubAccount(0, withdrawAmount);

    expect(await collateralManager.getTotalCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount - withdrawAmount);
    expect(await collateralManager.getAvailableCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount - withdrawAmount);
    expect(await altToken.balanceOf(trader.address)).to.equal(hardhatEthers.parseEther("985"));
  });

  it("blocks sub-account withdrawals that exceed free collateral after reservation", async function () {
    const depositAmount = hardhatEthers.parseEther("20");
    const reservedAmount = hardhatEthers.parseEther("15");
    const blockedWithdrawAmount = hardhatEthers.parseEther("6");

    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), false);
    await mockToken.connect(trader).approve(await collateralManager.getAddress(), depositAmount);
    await collateralManager.connect(trader).depositCollateralToSubAccount(0, depositAmount);

    await collateralManager.addReservedMarginForSubAccount(trader.address, 0, reservedAmount);

    expect(await collateralManager.getAvailableCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount - reservedAmount);

    let revertMessage = "";
    try {
      await collateralManager.connect(trader).withdrawCollateralFromSubAccount(0, blockedWithdrawAmount);
    } catch (error: any) {
      revertMessage = String(error?.message ?? "");
    }

    expect(revertMessage).to.contain("Insufficient available collateral");
  });
});

describe("SubAccount position binding", function () {
  this.timeout(120000);

  let owner: any;
  let trader: any;
  let hardhatEthers: any;
  let mockToken: any;
  let perpStorage: any;
  let collateralManager: any;
  let subAccountManager: any;
  let positionManager: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [owner, trader] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await hardhatEthers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const SubAccountManager = await hardhatEthers.getContractFactory("SubAccountManager");
    subAccountManager = await SubAccountManager.deploy(await perpStorage.getAddress());
    await subAccountManager.waitForDeployment();

    const PositionManager = await hardhatEthers.getContractFactory("PositionManager");
    positionManager = await PositionManager.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      owner.address
    );
    await positionManager.waitForDeployment();

    const marketId = hardhatEthers.encodeBytes32String("ETH/USD");
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);
    await perpStorage.setMarketFeedId(marketId);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await subAccountManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await mockToken.transfer(trader.address, hardhatEthers.parseEther("1000"));
  });

  it("opens and closes a position against a specific sub-account", async function () {
    const depositAmount = hardhatEthers.parseEther("100");
    const exposure = hardhatEthers.parseEther("50");
    const leverage = BigInt(5);
    const entryPrice = hardhatEthers.parseEther("2000");
    const expectedMargin = hardhatEthers.parseEther("10");

    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), true);
    await mockToken.connect(trader).approve(await collateralManager.getAddress(), depositAmount);
    await collateralManager.connect(trader).depositCollateralToSubAccount(0, depositAmount);

    await positionManager.openPositionWithMarketAndSubAccount(
      trader.address,
      0,
      exposure,
      leverage,
      entryPrice,
      await perpStorage.marketFeedId(),
      0
    );

    const position = await perpStorage.getPosition(0);
    expect(position.subAccountId).to.equal(BigInt(0));
    expect(position.margin).to.equal(expectedMargin);
    expect(position.collateralToken).to.equal(await mockToken.getAddress());
    expect(await collateralManager.getReservedMarginForSubAccount(trader.address, 0)).to.equal(expectedMargin);
    expect(await collateralManager.getAvailableCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount - expectedMargin);

    await positionManager.closePosition(0, entryPrice);

    const closedPosition = await perpStorage.getPosition(0);
    expect(closedPosition.active).to.equal(false);
    expect(await collateralManager.getReservedMarginForSubAccount(trader.address, 0)).to.equal(BigInt(0));
    expect(await collateralManager.getTotalCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount);
  });
});

describe("SubAccount risk views", function () {
  this.timeout(120000);

  let owner: any;
  let trader: any;
  let hardhatEthers: any;
  let mockToken: any;
  let perpStorage: any;
  let collateralManager: any;
  let subAccountManager: any;
  let riskManager: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [owner, trader] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await hardhatEthers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const SubAccountManager = await hardhatEthers.getContractFactory("SubAccountManager");
    subAccountManager = await SubAccountManager.deploy(await perpStorage.getAddress());
    await subAccountManager.waitForDeployment();

    const RiskManager = await hardhatEthers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await subAccountManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await mockToken.transfer(trader.address, hardhatEthers.parseEther("1000"));
  });

  it("computes equity and health ratio for a sub-account collateral bucket", async function () {
    const depositAmount = hardhatEthers.parseEther("30");
    const reservedAmount = hardhatEthers.parseEther("5");

    await subAccountManager.connect(trader).createSubAccount(await mockToken.getAddress(), true);
    await mockToken.connect(trader).approve(await collateralManager.getAddress(), depositAmount);
    await collateralManager.connect(trader).depositCollateralToSubAccount(0, depositAmount);
    await collateralManager.addReservedMarginForSubAccount(trader.address, 0, reservedAmount);

    const subAccountEquity = await riskManager.getSubAccountEquity(trader.address, 0);
    const maintenance = await riskManager.getSubAccountMaintenanceRequirement(trader.address, 0);
    const health = await riskManager.getSubAccountHealthRatio(trader.address, 0);

    expect(subAccountEquity).to.equal(depositAmount);
    expect(maintenance).to.equal(BigInt(0));
    expect(health).to.equal((BigInt(2) ** BigInt(256)) - BigInt(1));
    expect(await collateralManager.getAvailableCollateralForSubAccount(trader.address, 0)).to.equal(depositAmount - reservedAmount);
  });
});

describe("SubAccount liquidation accounting", function () {
  this.timeout(120000);

  let owner: any;
  let trader: any;
  let liquidator: any;
  let hardhatEthers: any;
  let usdc: any;
  let usdt: any;
  let mockOracle: any;
  let insuranceTreasury: any;
  let perpStorage: any;
  let collateralManager: any;
  let subAccountManager: any;
  let positionManager: any;
  let riskManager: any;
  let liquidationEngine: any;

  beforeEach(async function () {
    const connection = await network.connect();
    hardhatEthers = connection.ethers;
    [owner, trader, liquidator] = await hardhatEthers.getSigners();

    const MockERC20 = await hardhatEthers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 18);
    await usdc.waitForDeployment();

    usdt = await MockERC20.deploy("Tether USD", "USDT", 18);
    await usdt.waitForDeployment();

    const MockOracle = await hardhatEthers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();

    const InsuranceTreasury = await hardhatEthers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(await usdc.getAddress(), owner.address);
    await insuranceTreasury.waitForDeployment();

    const PerpStorage = await hardhatEthers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await hardhatEthers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const SubAccountManager = await hardhatEthers.getContractFactory("SubAccountManager");
    subAccountManager = await SubAccountManager.deploy(await perpStorage.getAddress());
    await subAccountManager.waitForDeployment();

    const PositionManager = await hardhatEthers.getContractFactory("PositionManager");
    positionManager = await PositionManager.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      owner.address
    );
    await positionManager.waitForDeployment();

    const RiskManager = await hardhatEthers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    const LiquidationEngine = await hardhatEthers.getContractFactory("LiquidationEngine");
    liquidationEngine = await LiquidationEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await liquidationEngine.waitForDeployment();

    await perpStorage.setCollateral(await usdc.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());

    const marketId = hardhatEthers.encodeBytes32String("ETH/USD");
    await perpStorage.addMarket(marketId, marketId, 5, 10, 750, 80, 150);
    await perpStorage.setMarketFeedId(marketId);

    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await subAccountManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await positionManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await riskManager.getAddress(), true);
    await perpStorage.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await perpStorage.setAuthorizedModule(owner.address, true);

    await usdt.transfer(trader.address, hardhatEthers.parseEther("1000"));
    await mockOracle.setPrice(hardhatEthers.parseEther("2000"));
  });

  it("liquidates sub-account positions using sub-account collateral token payouts", async function () {
    const depositAmount = hardhatEthers.parseEther("100");
    const exposure = hardhatEthers.parseEther("800");
    const leverage = BigInt(10);
    const entryPrice = hardhatEthers.parseEther("2000");

    await subAccountManager.connect(trader).createSubAccount(await usdt.getAddress(), true);
    await usdt.connect(trader).approve(await collateralManager.getAddress(), depositAmount);
    await collateralManager.connect(trader).depositCollateralToSubAccount(0, depositAmount);

    await positionManager.openPositionWithMarketAndSubAccount(
      trader.address,
      0,
      exposure,
      leverage,
      entryPrice,
      await perpStorage.marketFeedId(),
      0
    );

    const position = await perpStorage.getPosition(0);
    expect(position.subAccountId).to.equal(BigInt(0));

    await mockOracle.setPrice(hardhatEthers.parseEther("1890"));
    expect(await riskManager.isPositionLiquidatable(0)).to.equal(true);

    const liquidatorUsdtBefore = await usdt.balanceOf(liquidator.address);
    const legacyCollateralBefore = await perpStorage.accountCollateral(trader.address);

    await liquidationEngine.connect(liquidator).liquidate(0);

    const liquidatorUsdtAfter = await usdt.balanceOf(liquidator.address);
    const legacyCollateralAfter = await perpStorage.accountCollateral(trader.address);
    const reservedAfter = await collateralManager.getReservedMarginForSubAccount(trader.address, 0);
    const closedPosition = await perpStorage.getPosition(0);

    expect(closedPosition.active).to.equal(false);
    expect(liquidatorUsdtAfter).to.be.gt(liquidatorUsdtBefore);
    expect(legacyCollateralBefore).to.equal(BigInt(0));
    expect(legacyCollateralAfter).to.equal(BigInt(0));
    expect(reservedAfter).to.equal(BigInt(0));
  });
});