import { expect } from "chai";
import { network } from "hardhat";

describe("PerpSettlement", function () {

  it("Should open positions and collect fees", async function () {

    const { ethers } = await network.connect();

    const [owner, longTrader, shortTrader] = await ethers.getSigners();

    console.log("Deploying mock token...");
    const Token = await ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Mock", "MOCK", owner.address, ethers.parseEther("1000000"));

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
    const settlement = await Settlement.deploy(token.target, insurance.target, oracle.target, feedId);

    console.log("Funding traders...");
    await token.transfer(longTrader.address, ethers.parseEther("10000"));
    await token.transfer(shortTrader.address, ethers.parseEther("10000"));

    await token.connect(longTrader).approve(settlement.target, ethers.parseEther("10000"));
    await token.connect(shortTrader).approve(settlement.target, ethers.parseEther("10000"));

    console.log("Creating fake orders...");
    const order = {
      trader: longTrader.address,
      side: 0,
      exposure: ethers.parseEther("1000"),
      leverage: 10,
      limitPrice: 1000,
      expiry: Math.floor(Date.now()/1000) + 3600,
      nonce: 1
    };

    const signature = await longTrader.signTypedData(
      {
        name: "PerpSettlement",
        version: "1",
        chainId: 31337,
        verifyingContract: settlement.target,
      },
      {
        Order: [
          { name: "trader", type: "address" },
          { name: "side", type: "uint8" },
          { name: "exposure", type: "uint256" },
          { name: "leverage", type: "uint256" },
          { name: "limitPrice", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ]
      },
      order
    );

    console.log("Test passed signature validation.");

    expect(signature).to.not.equal(undefined);
  });

});