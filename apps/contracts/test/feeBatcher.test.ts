import { expect } from "chai";
import { network } from "hardhat";

describe("FeeBatcher Weekly Distribution", function () {

  it("Should distribute weekly", async function () {

    const { ethers } = await network.connect();

    const [owner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC20Mock");
    const token = await Token.deploy("Mock", "MOCK", owner.address, ethers.parseEther("100000"));

    const FeeBatcher = await ethers.getContractFactory("FeeBatcher");
    const batcher = await FeeBatcher.deploy(token.target);

    await token.transfer(batcher.target, ethers.parseEther("1000"));

    console.log("Recording 1000 fees...");
    await batcher.recordFee(ethers.parseEther("1000"));

    console.log("Fast forwarding 1 week...");
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    console.log("Distributing...");
    await batcher.distribute(owner.address);

    console.log("Distribution complete.");

    expect(await batcher.accumulatedFees()).to.equal(0);
  });

});