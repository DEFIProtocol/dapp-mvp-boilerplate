import { expect } from "chai";
import { network } from "hardhat";

describe("CollateralManager fee-pool solvency invariants", function () {
  this.timeout(120000);

  let ethers: any;
  let owner: any;
  let moduleSigner: any;
  let recipient: any;

  let mockToken: any;
  let perpStorage: any;
  let collateralManager: any;
  let insuranceTreasury: any;
  let protocolTreasury: any;

  const wad = (x: bigint) => x * 10n ** 18n;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, moduleSigner, recipient] = await ethers.getSigners();

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

    // Minimal storage wiring
    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
    await perpStorage.setMarkOracle(owner.address);
    const marketId = ethers.encodeBytes32String("ETH/USD");
    await perpStorage.setMarketFeedId(marketId);
    await perpStorage.addMarket(marketId, marketId, 5, 10, 75, 80, 150);

    // Authorizations
    await perpStorage.setAuthorizedModule(moduleSigner.address, true);
    await perpStorage.setAuthorizedModule(await collateralManager.getAddress(), true);
    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);

    // Collateral manager starts with 1000 tokens
    await mockToken.transfer(await collateralManager.getAddress(), wad(1000n));

    // Simulate fee liability accrued on storage side
    await perpStorage.setFeePool(wad(400n));
  });

  it("reports fee-pool coverage correctly via view helper", async function () {
    const [vaultBalance, feePoolLiability, isCovered] = await collateralManager.getFeePoolCoverage();
    expect(vaultBalance).to.equal(wad(1000n));
    expect(feePoolLiability).to.equal(wad(400n));
    expect(isCovered).to.equal(true);
    await expect(collateralManager.assertFeePoolCovered()).to.not.revert(ethers);
  });

  it("blocks transferOut that would undercollateralize feePool", async function () {
    // Would leave 300 in vault while feePool liability is 400
    await expect(
      collateralManager.transferOut(recipient.address, wad(700n)),
    ).to.be.revert(ethers);
  });

  it("allows transferOut when feePool remains fully covered", async function () {
    await expect(
      collateralManager.transferOut(recipient.address, wad(500n)),
    ).to.not.revert(ethers);

    const [vaultBalance, feePoolLiability, isCovered] = await collateralManager.getFeePoolCoverage();
    expect(vaultBalance).to.equal(wad(500n));
    expect(feePoolLiability).to.equal(wad(400n));
    expect(isCovered).to.equal(true);
  });

  it("blocks transferToInsurance when it would undercollateralize feePool", async function () {
    await expect(
      collateralManager.connect(moduleSigner).transferToInsurance(wad(700n)),
    ).to.be.revert(ethers);
  });

  it("blocks transferToTreasury when it would undercollateralize feePool", async function () {
    await expect(
      collateralManager.connect(moduleSigner).transferToTreasury(wad(700n)),
    ).to.be.revert(ethers);
  });

  it("allows routing trading fees while preserving coverage", async function () {
    await expect(
      collateralManager.connect(moduleSigner).routeTradingFeesToTreasury(wad(100n)),
    ).to.not.revert(ethers);

    const [vaultBalance, feePoolLiability, isCovered] = await collateralManager.getFeePoolCoverage();
    expect(vaultBalance).to.equal(wad(900n));
    expect(feePoolLiability).to.equal(wad(300n));
    expect(isCovered).to.equal(true);
  });
});
