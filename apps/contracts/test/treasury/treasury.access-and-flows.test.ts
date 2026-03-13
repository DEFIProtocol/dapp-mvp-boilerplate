import { expect } from "chai";
import { network } from "hardhat";
import type { Contract } from "ethers";

describe("Treasury Contracts", function () {
  let ethers: any;
  let owner: any;
  let moduleA: any;
  let moduleB: any;
  let recipient: any;

  let mockToken: Contract;
  let insuranceTreasury: Contract;
  let protocolTreasury: Contract;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, moduleA, moduleB, recipient] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(await mockToken.getAddress(), owner.address);
    await insuranceTreasury.waitForDeployment();

    const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    protocolTreasury = await ProtocolTreasury.deploy(await mockToken.getAddress(), owner.address);
    await protocolTreasury.waitForDeployment();

    const seed = ethers.parseEther("10000");
    await mockToken.transfer(moduleA.address, seed);
    await mockToken.transfer(moduleB.address, seed);
  });

  describe("InsuranceTreasury", function () {
    it("allows owner to authorize modules", async function () {
      await insuranceTreasury.setAuthorizedModule(moduleA.address, true);
      expect(await insuranceTreasury.authorizedModules(moduleA.address)).to.equal(true);
    });

    it("rejects module auth changes from non-owner", async function () {
      await expect(
        insuranceTreasury.connect(moduleA).setAuthorizedModule(moduleB.address, true)
      ).to.be.revert(ethers);
    });

    it("accepts deposits only from authorized modules", async function () {
      const amount = ethers.parseEther("250");
      await insuranceTreasury.setAuthorizedModule(moduleA.address, true);
      await mockToken.connect(moduleA).approve(await insuranceTreasury.getAddress(), amount);

      await insuranceTreasury.connect(moduleA).deposit(amount);

      expect(await insuranceTreasury.balance()).to.equal(amount);
    });

    it("rejects unauthorized deposits", async function () {
      const amount = ethers.parseEther("1");
      await mockToken.connect(moduleA).approve(await insuranceTreasury.getAddress(), amount);

      await expect(insuranceTreasury.connect(moduleA).deposit(amount)).to.be.revertedWith("Not authorized module");
    });

    it("allows authorized module withdrawals to recipients", async function () {
      const depositAmount = ethers.parseEther("200");
      const withdrawAmount = ethers.parseEther("80");

      await insuranceTreasury.setAuthorizedModule(moduleA.address, true);
      await mockToken.connect(moduleA).approve(await insuranceTreasury.getAddress(), depositAmount);
      await insuranceTreasury.connect(moduleA).deposit(depositAmount);

      await insuranceTreasury.connect(moduleA).withdrawTo(recipient.address, withdrawAmount);

      expect(await mockToken.balanceOf(recipient.address)).to.equal(withdrawAmount);
      expect(await insuranceTreasury.balance()).to.equal(depositAmount - withdrawAmount);
    });

    it("rejects insurance withdraw with invalid params", async function () {
      await insuranceTreasury.setAuthorizedModule(moduleA.address, true);

      await expect(
        insuranceTreasury.connect(moduleA).withdrawTo(ethers.ZeroAddress, 1n)
      ).to.be.revertedWith("Invalid recipient");
      await expect(
        insuranceTreasury.connect(moduleA).withdrawTo(recipient.address, 0n)
      ).to.be.revertedWith("Zero amount");
    });
  });

  describe("ProtocolTreasury", function () {
    it("accepts deposits from authorized modules", async function () {
      const amount = ethers.parseEther("125");

      await protocolTreasury.setAuthorizedModule(moduleA.address, true);
      await mockToken.connect(moduleA).approve(await protocolTreasury.getAddress(), amount);
      await protocolTreasury.connect(moduleA).deposit(amount);

      expect(await protocolTreasury.balance()).to.equal(amount);
    });

    it("rejects protocol deposits from unauthorized modules", async function () {
      const amount = ethers.parseEther("2");
      await mockToken.connect(moduleA).approve(await protocolTreasury.getAddress(), amount);

      await expect(protocolTreasury.connect(moduleA).deposit(amount)).to.be.revertedWith("Not authorized module");
    });

    it("allows only owner to withdraw protocol funds", async function () {
      const depositAmount = ethers.parseEther("300");
      const withdrawAmount = ethers.parseEther("120");

      await protocolTreasury.setAuthorizedModule(moduleA.address, true);
      await mockToken.connect(moduleA).approve(await protocolTreasury.getAddress(), depositAmount);
      await protocolTreasury.connect(moduleA).deposit(depositAmount);

      await expect(
        protocolTreasury.connect(moduleA).withdrawTo(recipient.address, 1n)
      ).to.be.revert(ethers);

      await protocolTreasury.withdrawTo(recipient.address, withdrawAmount);

      expect(await mockToken.balanceOf(recipient.address)).to.equal(withdrawAmount);
      expect(await protocolTreasury.balance()).to.equal(depositAmount - withdrawAmount);
    });

    it("rejects protocol withdraw with invalid params", async function () {
      await expect(protocolTreasury.withdrawTo(ethers.ZeroAddress, 1n)).to.be.revertedWith("Invalid recipient");
      await expect(protocolTreasury.withdrawTo(recipient.address, 0n)).to.be.revertedWith("Zero amount");
    });
  });
});
