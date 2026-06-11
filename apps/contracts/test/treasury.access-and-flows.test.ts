import { expect } from "chai";
import { network } from "hardhat";

describe("InsuranceTreasury – access control and withdrawal policy", function () {
  this.timeout(60000);

  let ethers: any;
  let owner: any;
  let module: any;
  let otherModule: any;
  let outsider: any;
  let mockToken: any;
  let insuranceTreasury: any;

  const SEED = (x: bigint) => x * 10n ** 18n;

  beforeEach(async function () {
    ({ ethers } = await network.connect());
    [owner, module, otherModule, outsider] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(
      await mockToken.getAddress(),
      owner.address,
    );
    await insuranceTreasury.waitForDeployment();

    await insuranceTreasury.setAuthorizedModule(module.address, true);
  });

  // ─── helper ──────────────────────────────────────────────────────────────────
  async function seed(amount: bigint) {
    await mockToken.transfer(module.address, amount);
    await mockToken.connect(module).approve(await insuranceTreasury.getAddress(), amount);
    await insuranceTreasury.connect(module).deposit(amount);
  }

  // ─── deposit ─────────────────────────────────────────────────────────────────

  it("authorized module can deposit and balance increases", async function () {
    await seed(SEED(1000n));
    expect(await insuranceTreasury.balance()).to.equal(SEED(1000n));
  });

  it("unauthorized caller cannot deposit", async function () {
    await mockToken.transfer(outsider.address, SEED(100n));
    await mockToken.connect(outsider).approve(await insuranceTreasury.getAddress(), SEED(100n));
    await expect(
      insuranceTreasury.connect(outsider).deposit(SEED(100n)),
    ).to.be.revertedWith("Not authorized module");
  });

  // ─── withdrawTo (module path) ─────────────────────────────────────────────────

  it("authorized module can withdraw within the 50% default cap", async function () {
    await seed(SEED(1000n));
    const balanceBefore = await mockToken.balanceOf(outsider.address);
    // 400 ≤ 500 (50% of 1000) → should succeed
    await insuranceTreasury.connect(module).withdrawTo(outsider.address, SEED(400n));
    expect(await mockToken.balanceOf(outsider.address)).to.equal(balanceBefore + SEED(400n));
    expect(await insuranceTreasury.balance()).to.equal(SEED(600n));
  });

  it("module withdrawal is blocked when amount exceeds the per-call cap", async function () {
    await seed(SEED(1000n));
    // 600 > 500 (50% of 1000) → must revert
    await expect(
      insuranceTreasury.connect(module).withdrawTo(outsider.address, SEED(600n)),
    ).to.be.revertedWith("Exceeds withdrawal cap");
  });

  it("module withdrawal is blocked when it would drop below minimumReserve", async function () {
    await seed(SEED(1000n));
    // Set a 400-token floor; max allowed = min(1000-400, 1000*50%/100) = min(600,500) = 500
    await insuranceTreasury.setWithdrawalPolicy(10000 /* 100% cap */, SEED(400n));
    // 650 would leave 350 < 400 floor → must revert
    await expect(
      insuranceTreasury.connect(module).withdrawTo(outsider.address, SEED(650n)),
    ).to.be.revertedWith("Exceeds withdrawal cap");
  });

  it("module can withdraw exactly up to maxWithdrawable()", async function () {
    await seed(SEED(1000n));
    await insuranceTreasury.setWithdrawalPolicy(3000 /* 30% cap */, SEED(200n));
    // aboveFloor = 800, cappedByBps = 300 → maxWithdrawable = 300
    const max = await insuranceTreasury.maxWithdrawable();
    expect(max).to.equal(SEED(300n));
    await expect(
      insuranceTreasury.connect(module).withdrawTo(outsider.address, max),
    ).to.not.revert(ethers);
  });

  it("unauthorized caller cannot call withdrawTo", async function () {
    await seed(SEED(500n));
    await expect(
      insuranceTreasury.connect(outsider).withdrawTo(outsider.address, SEED(100n)),
    ).to.be.revertedWith("Not authorized module");
  });

  // ─── emergencyWithdrawTo (owner path) ────────────────────────────────────────

  it("owner can emergency-withdraw bypassing the module cap", async function () {
    await seed(SEED(1000n));
    // With default 50% cap, 800 normally exceeds it – but owner path bypasses cap
    const balanceBefore = await mockToken.balanceOf(outsider.address);
    await insuranceTreasury.connect(owner).emergencyWithdrawTo(outsider.address, SEED(800n));
    expect(await mockToken.balanceOf(outsider.address)).to.equal(balanceBefore + SEED(800n));
  });

  it("owner can emergency-withdraw the entire balance including below minimumReserve", async function () {
    await seed(SEED(500n));
    await insuranceTreasury.setWithdrawalPolicy(5000, SEED(300n));
    // Module cannot touch the 300-token floor, but owner can drain it all
    await expect(
      insuranceTreasury.connect(owner).emergencyWithdrawTo(outsider.address, SEED(500n)),
    ).to.not.revert(ethers);
    expect(await insuranceTreasury.balance()).to.equal(0n);
  });

  it("non-owner cannot call emergencyWithdrawTo", async function () {
    await seed(SEED(500n));
    await expect(
      insuranceTreasury.connect(outsider).emergencyWithdrawTo(outsider.address, SEED(100n)),
    ).to.revert(ethers);
  });

  // ─── withdrawal policy management ────────────────────────────────────────────

  it("setWithdrawalPolicy emits WithdrawalPolicyUpdated and updates state", async function () {
    await expect(insuranceTreasury.setWithdrawalPolicy(2500, SEED(50n)))
      .to.emit(insuranceTreasury, "WithdrawalPolicyUpdated")
      .withArgs(2500, SEED(50n));

    expect(await insuranceTreasury.maxSingleWithdrawalBps()).to.equal(2500n);
    expect(await insuranceTreasury.minimumReserve()).to.equal(SEED(50n));
  });

  it("setWithdrawalPolicy reverts when bps exceeds 10 000", async function () {
    await expect(
      insuranceTreasury.setWithdrawalPolicy(10001, 0),
    ).to.be.revertedWith("Exceeds 100%");
  });

  it("non-owner cannot call setWithdrawalPolicy", async function () {
    await expect(
      insuranceTreasury.connect(outsider).setWithdrawalPolicy(9000, 0),
    ).to.revert(ethers);
  });

  // ─── module authorization guards ─────────────────────────────────────────────

  it("setAuthorizedModule rejects zero address", async function () {
    await expect(
      insuranceTreasury.setAuthorizedModule(ethers.ZeroAddress, true),
    ).to.be.revertedWith("Invalid module");
  });

  it("revoking a module blocks further withdrawals from that address", async function () {
    await seed(SEED(500n));
    await insuranceTreasury.setAuthorizedModule(module.address, false);
    await expect(
      insuranceTreasury.connect(module).withdrawTo(outsider.address, SEED(100n)),
    ).to.be.revertedWith("Not authorized module");
  });

  // ─── maxWithdrawable edge cases ───────────────────────────────────────────────

  it("maxWithdrawable returns 0 when balance equals minimumReserve", async function () {
    await seed(SEED(100n));
    await insuranceTreasury.setWithdrawalPolicy(10000, SEED(100n));
    expect(await insuranceTreasury.maxWithdrawable()).to.equal(0n);
  });

  it("maxWithdrawable returns 0 when balance is below minimumReserve", async function () {
    // skipping setWithdrawalPolicy; use high floor
    await seed(SEED(50n));
    await insuranceTreasury.setWithdrawalPolicy(10000, SEED(100n));
    expect(await insuranceTreasury.maxWithdrawable()).to.equal(0n);
  });
});
