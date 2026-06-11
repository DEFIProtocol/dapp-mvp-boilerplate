import { expect } from "chai";
import { network } from "hardhat";

describe("PerpStorage initialization finalization guard", function () {
  this.timeout(60000);

  let ethers: any;
  let owner: any;
  let outsider: any;
  let mockToken: any;
  let storage: any;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, outsider] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    storage = await PerpStorage.deploy();
    await storage.waitForDeployment();
  });

  it("finalizeInitialization requires core wiring to be set first", async function () {
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);

    await storage.setCollateral(await mockToken.getAddress());
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);

    await storage.setInsuranceFund(owner.address);
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);

    await storage.setMarkOracle(owner.address);
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);

    const marketId = ethers.encodeBytes32String("ETH/USD");
    await storage.setMarketFeedId(marketId);
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);

    await storage.addMarket(marketId, marketId, 5, 10, 75, 80, 150);
    await expect(storage.finalizeInitialization())
      .to.emit(storage, "InitializationFinalized")
      .withArgs(owner.address);

    expect(await storage.initialized()).to.equal(true);
  });

  it("blocks core wiring setters once finalized", async function () {
    const marketId = ethers.encodeBytes32String("ETH/USD");

    await storage.setCollateral(await mockToken.getAddress());
    await storage.setInsuranceFund(owner.address);
    await storage.setProtocolTreasury(owner.address);
    await storage.setMarkOracle(owner.address);
    await storage.setOptionsPricer(owner.address);
    await storage.setMarketFeedId(marketId);
    await storage.addMarket(marketId, marketId, 5, 10, 75, 80, 150);
    await storage.finalizeInitialization();

    await expect(storage.setCollateral(await mockToken.getAddress())).to.be.revert(ethers);
    await expect(storage.setInsuranceFund(owner.address)).to.be.revert(ethers);
    await expect(storage.setProtocolTreasury(owner.address)).to.be.revert(ethers);
    await expect(storage.setMarkOracle(owner.address)).to.be.revert(ethers);
    await expect(storage.setOptionsPricer(owner.address)).to.be.revert(ethers);
    await expect(storage.setMarketFeedId(marketId)).to.be.revert(ethers);
    await expect(storage.addMarket(marketId, marketId, 5, 10, 75, 80, 150)).to.be.revert(ethers);
  });

  it("cannot finalize twice and only owner can finalize", async function () {
    const marketId = ethers.encodeBytes32String("ETH/USD");

    await storage.setCollateral(await mockToken.getAddress());
    await storage.setInsuranceFund(owner.address);
    await storage.setMarkOracle(owner.address);
    await storage.setMarketFeedId(marketId);
    await storage.addMarket(marketId, marketId, 5, 10, 75, 80, 150);

    await expect(storage.connect(outsider).finalizeInitialization()).to.be.revert(ethers);

    await storage.finalizeInitialization();
    await expect(storage.finalizeInitialization()).to.be.revert(ethers);
  });
});
