import { expect } from "chai";
import { network } from "hardhat";

describe("Liquidation Engine", function () {

  it("Should call settlement liquidation by position id", async function () {

    const { ethers } = await network.connect();

    const [owner] = await ethers.getSigners();

    console.log("Deploying mock token...");
    const Token = await ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy(
      "Mock",
      "MOCK",
      owner.address,
      ethers.parseEther("1000000")
    );

    console.log("Deploying InsuranceFund...");
    const Insurance = await ethers.getContractFactory("InsuranceFund");
    const insurance = await Insurance.deploy(token.target);

    console.log("Deploying Oracle...");
    const Oracle = await ethers.getContractFactory("MockMarkOracle");
    const oracle = await Oracle.deploy();
    const feedId = ethers.encodeBytes32String("BTCUSD");
    await oracle.setMarkPrice(feedId, ethers.parseUnits("100", 18));

    console.log("Deploying Settlement...");
    const Settlement = await ethers.getContractFactory("PerpSettlement");
    const settlement = await Settlement.deploy(
      token.target,
      insurance.target,
      oracle.target,
      feedId
    );

    console.log("Deploying LiquidationEngine...");
    const Liquidation = await ethers.getContractFactory("LiquidationEngine");
    const liquidation = await Liquidation.deploy(settlement.target);

    await expect(liquidation.liquidatePosition(999)).to.be.revertedWith("Inactive");

  });

});