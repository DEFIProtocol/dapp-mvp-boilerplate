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

  describe("Signature Malleability Resistance", function () {
    it("should reject malleated signatures", async function () {
      const trader = traders[0];
      const exposure = ethers.parseEther("1000");
      const nonce = BigInt(++nonceCounter);
      
      const order = await buildOrder(trader.address, 0, exposure, 0n, nonce);
      const matchingOrder = await buildOrder(traders[1].address, 1, exposure, 0n, nonce + 1n);
      
      // Get valid signature
      const validSig = await signOrder(trader, order);
      
      // Malleate the signature (change s value to non-canonical form)
      // This requires parsing the signature
      const malleatedSig = malleateSignature(validSig);
      
      const matchingSig = await signOrder(traders[1], matchingOrder);
      
      // Should reject malleated signature
      let reverted = false;
      try {
        await settlementEngine.settleMatch(order, malleatedSig, matchingOrder, matchingSig, exposure);
      } catch {
        reverted = true;
      }
      expect(reverted).to.be.true;
    });

    it("should reject signatures with wrong signer", async function () {
      const exposure = ethers.parseEther("1000");
      
      // Create order for trader0
      const order = await buildOrder(traders[0].address, 0, exposure, 0n, BigInt(++nonceCounter));
      const matchingOrder = await buildOrder(traders[1].address, 1, exposure, 0n, BigInt(++nonceCounter));
      
      // Sign with wrong signer (trader2 instead of trader0)
      const wrongSig = await signOrder(traders[2], order);
      const matchingSig = await signOrder(traders[1], matchingOrder);
      
      await expect(
        settlementEngine.settleMatch(order, wrongSig, matchingOrder, matchingSig, exposure)
      ).to.be.revertedWith("Invalid signature");
    });

    it("should reject signatures for different contract address", async function () {
      const trader = traders[0];
      const exposure = ethers.parseEther("1000");
      
      const order = await buildOrder(trader.address, 0, exposure, 0n, BigInt(++nonceCounter));
      const matchingOrder = await buildOrder(traders[1].address, 1, exposure, 0n, BigInt(++nonceCounter));
      
      // Sign with wrong contract address
      const domain = {
        name: "PerpSettlement",
        version: "1",
        chainId,
        verifyingContract: ethers.ZeroAddress, // Wrong address
      };
      
      const types = {
        Order: [
          { name: "trader", type: "address" },
          { name: "side", type: "uint8" },
          { name: "exposure", type: "uint256" },
          { name: "limitPrice", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      };
      
      const wrongSig = await trader.signTypedData(domain, types, order);
      const matchingSig = await signOrder(traders[1], matchingOrder);
      
      await expect(
        settlementEngine.settleMatch(order, wrongSig, matchingOrder, matchingSig, exposure)
      ).to.be.revertedWith("Invalid signature");
    });
  });

  // ==================== 9️⃣ EXTREME LEVERAGE SCENARIOS ====================

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
