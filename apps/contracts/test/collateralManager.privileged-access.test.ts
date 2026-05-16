import { expect } from "chai";
import { network } from "hardhat";

describe("CollateralManager privileged access controls", function () {
  this.timeout(120000);

  let ethers: any;
  let owner: any;
  let privilegedModule: any;
  let regularModule: any;
  let recipient: any;

  let mockToken: any;
  let perpStorage: any;
  let collateralManager: any;
  let insuranceTreasury: any;
  let protocolTreasury: any;

  const wad = (x: bigint) => x * 10n ** 18n;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, privilegedModule, regularModule, recipient] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(await mockToken.getAddress(), owner.address);
    await insuranceTreasury.waitForDeployment();

    const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    protocolTreasury = await ProtocolTreasury.deploy(await mockToken.getAddress(), owner.address);
    await protocolTreasury.waitForDeployment();

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
    await perpStorage.setMarkOracle(owner.address);

    const marketId = ethers.encodeBytes32String("ETH/USD");
    await perpStorage.setMarketFeedId(marketId);
    await perpStorage.addMarket(marketId, marketId, 5, 10, 75, 80, 150);

    await perpStorage.setAuthorizedModule(privilegedModule.address, true);
    await perpStorage.setAuthorizedModule(regularModule.address, true);
    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);

    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);

    await mockToken.transfer(await collateralManager.getAddress(), wad(1000n));

    await collateralManager.setPrivilegedModule(privilegedModule.address, true);
    await collateralManager.setPrivilegedAccessControlEnabled(true);
  });

  it("blocks regular modules from routing fee pool in strict mode", async function () {
    await perpStorage.setFeePool(wad(100n));

    await expect(
      collateralManager.connect(regularModule).routeTradingFeesToTreasury(wad(10n)),
    ).to.be.revertedWith("Only privileged modules can call");
  });

  it("allows privileged modules to route fee pool in strict mode", async function () {
    await perpStorage.setFeePool(wad(100n));

    await expect(
      collateralManager.connect(privilegedModule).routeTradingFeesToTreasury(wad(10n)),
    ).to.not.revert(ethers);
  });

  it("blocks regular modules from transferOut in strict mode", async function () {
    await expect(
      collateralManager.connect(regularModule).transferOut(recipient.address, wad(1n)),
    ).to.be.revertedWith("Only privileged modules can call");
  });

  it("allows owner transferOut even in strict mode", async function () {
    const balanceBefore = await mockToken.balanceOf(recipient.address);
    await collateralManager.transferOut(recipient.address, wad(2n));
    const balanceAfter = await mockToken.balanceOf(recipient.address);

    expect(balanceAfter - balanceBefore).to.equal(wad(2n));
  });

  it("allows privileged modules to move insurance funds in strict mode", async function () {
    await expect(
      collateralManager.connect(privilegedModule).transferToInsurance(wad(5n)),
    ).to.not.revert(ethers);

    expect(await insuranceTreasury.balance()).to.equal(wad(5n));
  });

  it("legacy behavior remains when strict mode is disabled", async function () {
    await collateralManager.setPrivilegedAccessControlEnabled(false);
    await perpStorage.setFeePool(wad(100n));

    await expect(
      collateralManager.connect(regularModule).routeTradingFeesToTreasury(wad(10n)),
    ).to.not.revert(ethers);
  });
});
