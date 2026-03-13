import { network } from "hardhat";
import type { Contract } from "ethers";

export type TestOrder = {
  trader: string;
  side: 0 | 1;
  exposure: bigint;
  limitPrice: bigint;
  expiry: bigint;
  nonce: bigint;
  marketId: string;
};

export type ProtocolContracts = {
  mockToken: Contract;
  mockOracle: Contract;
  insuranceTreasury: Contract;
  protocolTreasury: Contract;
  perpStorage: Contract;
  collateralManager: Contract;
  riskManager: Contract;
  positionManager: Contract;
  settlementEngine: Contract;
  fundingEngine: Contract;
  liquidationEngine: Contract;
};

export type DiagnosticsFixture = {
  ethers: any;
  owner: any;
  traders: any[];
  liquidator: any;
  contracts: ProtocolContracts;
  marketId: string;
  chainId: number;
  nextNonce: () => bigint;
  seedCollateral: (trader: string, amount: bigint) => Promise<void>;
  buildOrder: (trader: string, side: 0 | 1, exposure: bigint, limitPrice: bigint, nonce: bigint) => Promise<TestOrder>;
  signOrder: (signer: any, order: TestOrder) => Promise<string>;
  settleMatch: (longSigner: any, shortSigner: any, exposure: bigint, longLimitPrice?: bigint, shortLimitPrice?: bigint) => Promise<{ longOrder: TestOrder; shortOrder: TestOrder }>;
};

const INITIAL_PRICE = 1_000n * 10n ** 18n;

export async function setupDiagnosticsFixture(): Promise<DiagnosticsFixture> {
  const { ethers } = await network.connect();
  const [owner, ...rest] = await ethers.getSigners();
  const traders = rest.slice(0, 5);
  const liquidator = rest[5];

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("USD Coin", "USDC", 18);
  await mockToken.waitForDeployment();

  const MockOracle = await ethers.getContractFactory("MockOracle");
  const mockOracle = await MockOracle.deploy();
  await mockOracle.waitForDeployment();
  await mockOracle.setPrice(INITIAL_PRICE);

  const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
  const insuranceTreasury = await InsuranceTreasury.deploy(await mockToken.getAddress(), owner.address);
  await insuranceTreasury.waitForDeployment();

  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const protocolTreasury = await ProtocolTreasury.deploy(await mockToken.getAddress(), owner.address);
  await protocolTreasury.waitForDeployment();

  const PerpStorage = await ethers.getContractFactory("PerpStorage");
  const perpStorage = await PerpStorage.deploy();
  await perpStorage.waitForDeployment();

  const CollateralManager = await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManager.deploy(await perpStorage.getAddress());
  await collateralManager.waitForDeployment();

  const RiskManager = await ethers.getContractFactory("RiskManager");
  const riskManager = await RiskManager.deploy(await perpStorage.getAddress());
  await riskManager.waitForDeployment();

  const FundingEngine = await ethers.getContractFactory("FundingEngine");
  const fundingEngine = await FundingEngine.deploy(
    await perpStorage.getAddress(),
    await collateralManager.getAddress()
  );
  await fundingEngine.waitForDeployment();

  const PositionManager = await ethers.getContractFactory("PositionManager");
  const positionManager = await PositionManager.deploy(
    await perpStorage.getAddress(),
    await collateralManager.getAddress(),
    await fundingEngine.getAddress()
  );
  await positionManager.waitForDeployment();

  const SettlementEngine = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await SettlementEngine.deploy(
    await perpStorage.getAddress(),
    await collateralManager.getAddress(),
    await positionManager.getAddress(),
    await riskManager.getAddress()
  );
  await settlementEngine.waitForDeployment();

  const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
  const liquidationEngine = await LiquidationEngine.deploy(
    await perpStorage.getAddress(),
    await collateralManager.getAddress(),
    await positionManager.getAddress(),
    await riskManager.getAddress()
  );
  await liquidationEngine.waitForDeployment();

  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Latest block unavailable");

  const marketId = ethers.encodeBytes32String("ETH/USD");
  await perpStorage.setCollateral(await mockToken.getAddress());
  await perpStorage.setInsuranceFund(await insuranceTreasury.getAddress());
  await perpStorage.setProtocolTreasury(await protocolTreasury.getAddress());
  await perpStorage.setMarkOracle(await mockOracle.getAddress());
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
    collateralManager,
    positionManager,
    riskManager,
    settlementEngine,
    fundingEngine,
    liquidationEngine,
  ];

  for (const moduleContract of modules) {
    await perpStorage.setAuthorizedModule(await moduleContract.getAddress(), true);
  }

  await insuranceTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);
  await insuranceTreasury.setAuthorizedModule(await liquidationEngine.getAddress(), true);
  await protocolTreasury.setAuthorizedModule(await collateralManager.getAddress(), true);

  const contracts: ProtocolContracts = {
    mockToken,
    mockOracle,
    insuranceTreasury,
    protocolTreasury,
    perpStorage,
    collateralManager,
    riskManager,
    positionManager,
    settlementEngine,
    fundingEngine,
    liquidationEngine,
  };

  let nonceCounter = 0;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  async function seedCollateral(trader: string, amount: bigint): Promise<void> {
    await mockToken.transfer(trader, amount);
    const signer = [owner, ...traders, liquidator].find((candidate) => candidate.address === trader);
    if (!signer) throw new Error(`Signer not found for ${trader}`);
    await mockToken.connect(signer).approve(await collateralManager.getAddress(), amount);
    await collateralManager.connect(signer).depositCollateral(amount);
  }

  async function buildOrder(
    trader: string,
    side: 0 | 1,
    exposure: bigint,
    limitPrice: bigint,
    nonce: bigint
  ): Promise<TestOrder> {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Latest block unavailable");

    return {
      trader,
      side,
      exposure,
      limitPrice,
      expiry: BigInt(block.timestamp + 3600),
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

  async function settleMatch(
    longSigner: any,
    shortSigner: any,
    exposure: bigint,
    longLimitPrice: bigint = 0n,
    shortLimitPrice: bigint = 0n
  ): Promise<{ longOrder: TestOrder; shortOrder: TestOrder }> {
    const longOrder = await buildOrder(longSigner.address, 0, exposure, longLimitPrice, BigInt(++nonceCounter));
    const shortOrder = await buildOrder(shortSigner.address, 1, exposure, shortLimitPrice, BigInt(++nonceCounter));

    const longSig = await signOrder(longSigner, longOrder);
    const shortSig = await signOrder(shortSigner, shortOrder);

    await settlementEngine.settleMatch(longOrder, longSig, shortOrder, shortSig, exposure);
    return { longOrder, shortOrder };
  }

  return {
    ethers,
    owner,
    traders,
    liquidator,
    contracts,
    marketId,
    chainId,
    nextNonce: () => BigInt(++nonceCounter),
    seedCollateral,
    buildOrder,
    signOrder,
    settleMatch,
  };
}
