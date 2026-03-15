import { expect } from "chai";
import { network } from "hardhat";
import type { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type TestOrder = {
  trader: string;
  side: 0 | 1;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
  marketId: string;
};

describe("PerpSettlement - Security & Edge Cases", function () {
  this.timeout(300000); // 5 minutes

  const INITIAL_PRICE = 1000n * 10n ** 18n;
  const BPS_DENOMINATOR = 10000n;
  const MAX_LEVERAGE = 100n;

  let mockToken: Contract;
  let mockOracle: Contract;
  let insuranceTreasury: Contract;
  let protocolTreasury: Contract;

  let perpStorage: Contract;
  let collateralManager: Contract;
  let riskManager: Contract;
  let positionManager: Contract;
  let settlementEngine: Contract;
  let fundingEngine: Contract;
  let liquidationEngine: Contract;

  let owner: SignerWithAddress;
  let traders: SignerWithAddress[];
  let liquidator: SignerWithAddress;
  let attacker: SignerWithAddress;
  let ethers: any;

  let nonceCounter = 0;
  let chainId: number;
  let rngState = 0x9abcdef0n;

  before(async function () {
    ({ ethers } = await network.connect());
    const signers = await ethers.getSigners();
    owner = signers[0];
    traders = signers.slice(1, 6);
    liquidator = signers[6];
    attacker = signers[7];
    
    const currentNetwork = await ethers.provider.getNetwork();
    chainId = Number(currentNetwork.chainId);
  });

  beforeEach(async function () {
    rngState = 0x9abcdef0n;
    // Deploy all contracts (same as in your existing tests)
    await deployContracts();
    await setupContracts();
    await seedInitialCollateral();
  });

  // ==================== 1️⃣ NONCE & REPLAY PROTECTION ====================

  describe("Price Slippage Protection", function () {
    it("should reject crossed orders when execution drifts more than 5% from oracle", async function () {
      const trader = traders[0];
      const exposure = ethers.parseEther("1000");
      
      // Long wants to buy at max 1050, short wants to sell at min 950
      const longLimit = INITIAL_PRICE * 105n / 100n; // 1050
      const shortLimit = INITIAL_PRICE * 95n / 100n; // 950
      
      // Current price is 1000, so orders cross
      const longOrder = await buildOrder(trader.address, 0, exposure, longLimit, BigInt(++nonceCounter));
      const shortOrder = await buildOrder(traders[1].address, 1, exposure, shortLimit, BigInt(++nonceCounter));
      
      const longSig = await signOrder(trader, longOrder);
      const shortSig = await signOrder(traders[1], shortOrder);
      
      // Should succeed at current price
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      // Now price moves up to 1100
      await mockOracle.setPrice(INITIAL_PRICE * 110n / 100n);
      
      // Try same orders again with fresh nonces
      const longOrder2 = await buildOrder(trader.address, 0, exposure, longLimit, BigInt(++nonceCounter));
      const shortOrder2 = await buildOrder(traders[1].address, 1, exposure, shortLimit, BigInt(++nonceCounter));
      
      const longSig2 = await signOrder(trader, longOrder2);
      const shortSig2 = await signOrder(traders[1], shortOrder2);
      
      // Orders still cross on limits, but execution is now blocked if midpoint drifts too far from oracle.
      await expect(
        settlementEngine.settleMatch(longOrder2, longSig2, shortOrder2, shortSig2, exposure)
      ).to.be.revertedWith("Price deviation > 5%");
    });

    it("should respect tight slippage limits", async function () {
      const trader = traders[0];
      const exposure = ethers.parseEther("1000");
      
      // Long wants to buy at exactly 1000 (no slippage)
      const exactPrice = INITIAL_PRICE;
      const longOrder = await buildOrder(trader.address, 0, exposure, exactPrice, BigInt(++nonceCounter));
      const shortOrder = await buildOrder(traders[1].address, 1, exposure, exactPrice, BigInt(++nonceCounter));
      
      const longSig = await signOrder(trader, longOrder);
      const shortSig = await signOrder(traders[1], shortOrder);
      
      // Should succeed when price matches exactly
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
      
      // Slightly different price (0.1% difference)
      const slightlyHigher = INITIAL_PRICE * 1001n / 1000n; // 1001
      
      const longOrder2 = await buildOrder(trader.address, 0, exposure, slightlyHigher, BigInt(++nonceCounter));
      const shortOrder2 = await buildOrder(traders[1].address, 1, exposure, slightlyHigher, BigInt(++nonceCounter));
      
      const longSig2 = await signOrder(trader, longOrder2);
      const shortSig2 = await signOrder(traders[1], shortOrder2);
      
      // Price is 1000, long's limit is 1001, short's limit is 1001 - still crosses
      await settlementEngine.settleMatch(longOrder2, longSig2, shortOrder2, shortSig2, exposure);
      
      // Engine may anchor execution between mark and limits; assert bounded fill
      const positions = await positionManager.getTraderPositions(trader.address);
      const pos = await perpStorage.positions(positions[positions.length - 1]);
      expect(pos.entryPrice).to.be.gte(INITIAL_PRICE);
      expect(pos.entryPrice).to.be.lte(slightlyHigher);
    });

    it("should handle partial fills with price limits", async function () {
      // This test assumes your system supports partial fills
      // If not, it will test the revert condition
      const trader = traders[0];
      const totalExposure = ethers.parseEther("2000");
      
      const longOrder = await buildOrder(trader.address, 0, totalExposure, INITIAL_PRICE * 102n / 100n, BigInt(++nonceCounter));
      const shortOrder = await buildOrder(traders[1].address, 1, totalExposure, INITIAL_PRICE * 98n / 100n, BigInt(++nonceCounter));
      
      const longSig = await signOrder(trader, longOrder);
      const shortSig = await signOrder(traders[1], shortOrder);
      
      // Partial fills are supported via filledAmount tracking in PerpStorage
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, totalExposure / 2n);
      
      // Fill the remaining half
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, totalExposure / 2n);

      // Third fill should fail (fully filled)
      await expect(
        settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, 1n)
      ).to.be.revertedWith("Long order overfill");
    });
  });

  // ==================== 3️⃣ ORACLE STALENESS & MANIPULATION ====================

  async function deployContracts() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
    await mockToken.waitForDeployment();

    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    await mockOracle.setPrice(INITIAL_PRICE);

    const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
    insuranceTreasury = await InsuranceTreasury.deploy(await mockToken.getAddress(), owner.address);
    await insuranceTreasury.waitForDeployment();

    const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
    protocolTreasury = await ProtocolTreasury.deploy(await mockToken.getAddress(), owner.address);
    await protocolTreasury.waitForDeployment();

    const PerpStorage = await ethers.getContractFactory("PerpStorage");
    perpStorage = await PerpStorage.deploy();
    await perpStorage.waitForDeployment();

    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
    await collateralManager.waitForDeployment();

    const RiskManager = await ethers.getContractFactory("RiskManager");
    riskManager = await RiskManager.deploy(await perpStorage.getAddress());
    await riskManager.waitForDeployment();

    const FundingEngine = await ethers.getContractFactory("FundingEngine");
    fundingEngine = await FundingEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress()
    );
    await fundingEngine.waitForDeployment();

    const PositionManager = await ethers.getContractFactory("PositionManager");
    positionManager = await PositionManager.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await fundingEngine.getAddress()
    );
    await positionManager.waitForDeployment();

    const SettlementEngine = await ethers.getContractFactory("SettlementEngine");
    settlementEngine = await SettlementEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await settlementEngine.waitForDeployment();

    const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
    liquidationEngine = await LiquidationEngine.deploy(
      await perpStorage.getAddress(),
      await collateralManager.getAddress(),
      await positionManager.getAddress(),
      await riskManager.getAddress()
    );
    await liquidationEngine.waitForDeployment();
  }

  async function setupContracts() {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");

    await perpStorage.setCollateral(await mockToken.getAddress());
    await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
    await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
    await perpStorage.setMarkOracle(await mockOracle.getAddress());
    const marketId = ethers.encodeBytes32String("ETH/USD");
    await perpStorage.setMarketFeedId(marketId);

    await perpStorage.setMakerFeeBps(3);
    await perpStorage.setTakerFeeBps(5);
    await perpStorage.setInsuranceBps(200);
    await perpStorage.setMaintenanceMarginBps(75);
    await perpStorage.setLiquidationRewardBps(80);
    await perpStorage.setLiquidationPenaltyBps(150);
    await perpStorage.addMarket(marketId, marketId, 3, 5, 75, 80, 150);
    await perpStorage.setLastFundingUpdate(latest.timestamp);
    await perpStorage.setNextFundingTime(latest.timestamp + 3600);

    const modules = [
      collateralManager, positionManager, riskManager, 
      settlementEngine, fundingEngine, liquidationEngine
    ];
    for (const mod of modules) {
      await perpStorage.setAuthorizedModule(await mod.getAddress(), true);
    }

    await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
    await insuranceTreasury.setAuthorizedModule(await liquidationEngine.getAddress(), true);
    await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
  }

  async function seedInitialCollateral() {
    const amount = ethers.parseEther("100000");
    
    for (const trader of traders) {
      await mockToken.transfer(trader.address, amount);
      await mockToken.connect(trader).approve(await collateralManager.getAddress(), amount);
      await collateralManager.connect(trader).depositCollateral(amount);
    }
    
    await mockToken.transfer(liquidator.address, amount);
    await mockToken.connect(liquidator).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(liquidator).depositCollateral(amount);
    
    await mockToken.transfer(attacker.address, amount);
    await mockToken.connect(attacker).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(attacker).depositCollateral(amount);
  }

  async function buildOrder(
    trader: string,
    side: 0 | 1,
    exposure: bigint,
    limitPrice: bigint,
    nonce: bigint
  ): Promise<TestOrder> {
    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Latest block unavailable");
    
    return {
      trader,
      side,
      exposure,
      limitPrice,
      expiry: BigInt(latest.timestamp + 3600),
      nonce,
      marketId: await perpStorage.marketFeedId(),
    };
  }

  async function signOrder(signer: any, order: TestOrder): Promise<string> {
    const domain = {
      name: "PerpSettlement",
      version: "1",
      chainId,
      verifyingContract: await settlementEngine.getAddress(),
    };
    
    const types = {
      Order: [
        { name: "trader", type: "address" },
        { name: "side", type: "uint8" },
        { name: "exposure", type: "uint256" },
        { name: "limitPrice", type: "uint256" },
        { name: "expiry", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "marketId", type: "bytes32" },
      ],
    };
    
    return signer.signTypedData(domain, types, order);
  }

  function malleateSignature(signature: string): string {
    // Extract r, s, v from signature
    const r = signature.slice(0, 66);
    let s = signature.slice(66, 130);
    const v = signature.slice(130, 132);
    
    // Malleate s: s' = secp256k1.n - s
    // For secp256k1, n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    const secp256k1n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const sBigInt = BigInt("0x" + s);
    const malleatedSBigInt = secp256k1n - sBigInt;
    let malleatedS = malleatedSBigInt.toString(16).padStart(64, '0');
    
    // Adjust v if needed (if using ecrecover)
    const vNum = parseInt(v, 16);
    const malleatedV = (vNum % 2 === 0) ? (vNum + 1).toString(16) : (vNum - 1).toString(16);
    
    return r + malleatedS + malleatedV.padStart(2, '0');
  }

  function nextRandomUnit(): number {
    rngState = (1664525n * rngState + 1013904223n) % 4294967296n;
    return Number(rngState) / 4294967296;
  }

  function nextRandomIndex(length: number): number {
    return Math.floor(nextRandomUnit() * length);
  }

  function nextRandomInt(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(nextRandomUnit() * (maxInclusive - minInclusive + 1));
  }

  async function openPosition(trader: SignerWithAddress, side: 0 | 1, exposure: bigint, margin: bigint) {
    // Find counterparty
    const otherTraders = traders.filter(t => t.address !== trader.address);
    const counterparty = otherTraders[nextRandomIndex(otherTraders.length)];

    const longTrader = side === 0 ? trader : counterparty;
    const shortTrader = side === 0 ? counterparty : trader;
    
    const nonce1 = BigInt(++nonceCounter);
    const nonce2 = BigInt(++nonceCounter);
    
    const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, nonce1);
    const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, nonce2);
    
    const longSig = await signOrder(longTrader, longOrder);
    const shortSig = await signOrder(shortTrader, shortOrder);
    
    await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
  }

  async function executeRandomTrade() {
    const longIndex = nextRandomIndex(traders.length);
    let shortIndex;
    do {
      shortIndex = nextRandomIndex(traders.length);
    } while (shortIndex === longIndex);
    
    const longTrader = traders[longIndex];
    const shortTrader = traders[shortIndex];
    
    const exposure = ethers.parseEther(nextRandomInt(100, 5000).toString());
    
    try {
      const nonce1 = BigInt(++nonceCounter);
      const nonce2 = BigInt(++nonceCounter);
      
      const longOrder = await buildOrder(longTrader.address, 0, exposure, 0n, nonce1);
      const shortOrder = await buildOrder(shortTrader.address, 1, exposure, 0n, nonce2);
      
      const longSig = await signOrder(longTrader, longOrder);
      const shortSig = await signOrder(shortTrader, shortOrder);
      
      await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
    } catch (e) {
      // Trades can fail for valid reasons
    }
  }

  async function assertAccountingInvariant() {
    const collateralManagerBalance = await mockToken.balanceOf(await collateralManager.getAddress());
    const insuranceTreasuryBalance = await mockToken.balanceOf(await insuranceTreasury.getAddress());
    const protocolTreasuryBalance = await mockToken.balanceOf(await protocolTreasury.getAddress());
    const totalContractBalance = collateralManagerBalance + insuranceTreasuryBalance + protocolTreasuryBalance;

    let totalUserCollateral = 0n;
    for (const trader of [...traders, liquidator, attacker]) {
      totalUserCollateral += await perpStorage.accountCollateral(trader.address);
    }

    const insuranceBalance = await perpStorage.insuranceFundBalance();
  const feePool = await perpStorage.feePool();
  const totalBooked = totalUserCollateral + insuranceBalance + feePool;

    // Collateral manager can hold unrealized PnL buffer; require solvency bound
    expect(totalContractBalance).to.be.gte(totalBooked);
  }

  async function testWithMaliciousToken(maliciousToken: Contract) {
    // This is a separate test instance
    // Deploy new PerpStorage with malicious token
    const MaliciousPerpStorage = await ethers.getContractFactory("PerpStorage");
    const maliciousStorage = await MaliciousPerpStorage.deploy();
    await maliciousStorage.waitForDeployment();
    
    // Configure with malicious token
    await maliciousStorage.setCollateral(await maliciousToken.getAddress());
    // ... rest of setup
    
    // Try reentrancy attack
    // This will be handled by the ReentrancyAttacker test above
  }
});
