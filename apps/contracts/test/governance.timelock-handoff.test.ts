import { expect } from "chai";
import { network } from "hardhat";

describe("ProtocolTimelock governance handoff", function () {
  this.timeout(120000);

  let ethers: any;
  let deployer: any;
  let multisig: any;
  let outsider: any;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [deployer, multisig, outsider] = await ethers.getSigners();
  });

  it("supports staged role handoff then admin renounce", async function () {
    const ProtocolTimelock = await ethers.getContractFactory("ProtocolTimelock");
    const timelock = await ProtocolTimelock.deploy(
      0,
      [deployer.address],
      [deployer.address],
      deployer.address,
    );
    await timelock.waitForDeployment();

    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();

    await timelock.grantRole(proposerRole, multisig.address);
    await timelock.grantRole(executorRole, multisig.address);

    await timelock.revokeRole(proposerRole, deployer.address);
    await timelock.revokeRole(executorRole, deployer.address);
    await timelock.renounceRole(adminRole, deployer.address);

    expect(await timelock.hasRole(adminRole, deployer.address)).to.equal(false);
    expect(await timelock.hasRole(proposerRole, deployer.address)).to.equal(false);
    expect(await timelock.hasRole(executorRole, deployer.address)).to.equal(false);

    expect(await timelock.hasRole(proposerRole, multisig.address)).to.equal(true);
    expect(await timelock.hasRole(executorRole, multisig.address)).to.equal(true);
  });

  it("prevents former admin from granting roles after renounce", async function () {
    const ProtocolTimelock = await ethers.getContractFactory("ProtocolTimelock");
    const timelock = await ProtocolTimelock.deploy(
      0,
      [deployer.address],
      [deployer.address],
      deployer.address,
    );
    await timelock.waitForDeployment();

    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
    const proposerRole = await timelock.PROPOSER_ROLE();

    await timelock.renounceRole(adminRole, deployer.address);

    await expect(
      timelock.grantRole(proposerRole, outsider.address),
    ).to.be.revert(ethers);
  });
});
