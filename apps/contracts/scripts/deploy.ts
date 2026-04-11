import hre from "hardhat";
import { network } from "hardhat";
import { isAddress, isHexString, type BaseContract } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";

dotenv.config();

type DeployConfig = {
  collateralToken: string;
  insuranceFund: string;
  protocolTreasury: string;
  oracle: string;
  feedId: string;
  verify: boolean;
};

type ModuleAddresses = {
  perpStorage: string;
  collateralManager: string;
  positionManager: string;
  riskManager: string;
  liquidationEngine: string;
  adlEngine: string;
  settlementEngine: string;
  fundingEngine: string;
  crossMargin: string;
  subAccountManager: string;
  optionsPricer: string;
  optionsEngine: string;
  timelock: string;
};

type PerpEngineContract = BaseContract & {
  perpStorage(): Promise<string>;
  collateralManager(): Promise<string>;
  positionManager(): Promise<string>;
  riskManager(): Promise<string>;
  liquidationEngine(): Promise<string>;
  adlEngine(): Promise<string>;
  settlementEngine(): Promise<string>;
  fundingEngine(): Promise<string>;
  crossMargin(): Promise<string>;
  subAccountManager(): Promise<string>;
  optionsPricer(): Promise<string>;
  optionsEngine(): Promise<string>;
  setAdlEngine(newAdlEngine: string): Promise<any>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function assertAddress(name: string, value: string): string {
  if (!isAddress(value)) {
    throw new Error(`Invalid address in env var ${name}: ${value}`);
  }
  return value;
}

function assertBytes32(name: string, value: string): string {
  if (!isHexString(value, 32)) {
    throw new Error(`Invalid bytes32 hex in env var ${name}: ${value}`);
  }
  return value;
}

function loadConfig(networkName: string): DeployConfig {
  const verify = process.env.VERIFY === "true";

  // No implicit fallback addresses: fail fast instead of silently deploying broken wiring.
  const collateralToken = assertAddress("COLLATERAL_TOKEN", requiredEnv("COLLATERAL_TOKEN"));
  const insuranceFund = assertAddress("INSURANCE_FUND", requiredEnv("INSURANCE_FUND"));
  const protocolTreasury = assertAddress("PROTOCOL_TREASURY", requiredEnv("PROTOCOL_TREASURY"));
  const oracle = assertAddress("MARK_ORACLE", requiredEnv("MARK_ORACLE"));

  const feedId = process.env.MARKET_FEED_ID ?? "";
  const resolvedFeedId =
    feedId.length > 0
      ? feedId
      : networkName.startsWith("hardhat")
        ? "0x4554482f55534400000000000000000000000000000000000000000000000000"
        : "";

  if (!resolvedFeedId) {
    throw new Error("Missing required env var: MARKET_FEED_ID (bytes32)");
  }

  assertBytes32("MARKET_FEED_ID", resolvedFeedId);

  return {
    collateralToken,
    insuranceFund,
    protocolTreasury,
    oracle,
    feedId: resolvedFeedId,
    verify,
  };
}

async function resolveTreasuryAddress(
  networkName: string,
  ethersLike: any,
  deployerAddress: string,
  collateralToken: string,
  configuredAddress: string,
  contractFactoryName: "InsuranceTreasury" | "ProtocolTreasury",
  label: "INSURANCE_FUND" | "PROTOCOL_TREASURY",
): Promise<string> {
  const code = await ethersLike.provider.getCode(configuredAddress);
  if (code !== "0x") {
    return configuredAddress;
  }

  if (networkName.startsWith("hardhat") || networkName.startsWith("localhost")) {
    console.log(`\n${label} has no bytecode. Deploying ${contractFactoryName} for this run...`);
    const TreasuryFactory = await ethersLike.getContractFactory(contractFactoryName);
    const treasury = await TreasuryFactory.deploy(collateralToken, deployerAddress);
    await treasury.waitForDeployment();
    const treasuryAddress = await treasury.getAddress();
    console.log(`${contractFactoryName}: ${treasuryAddress}`);
    return treasuryAddress;
  }

  throw new Error(
    `${label} is not a contract on ${networkName}: ${configuredAddress}. ` +
    `Deploy ${contractFactoryName} first and set ${label} to that contract address.`,
  );
}

async function getModuleAddresses(perpEngine: PerpEngineContract, timelockAddress: string): Promise<ModuleAddresses> {
  return {
    perpStorage: await perpEngine.perpStorage(),
    collateralManager: await perpEngine.collateralManager(),
    positionManager: await perpEngine.positionManager(),
    riskManager: await perpEngine.riskManager(),
    liquidationEngine: await perpEngine.liquidationEngine(),
    adlEngine: await perpEngine.adlEngine(),
    settlementEngine: await perpEngine.settlementEngine(),
    fundingEngine: await perpEngine.fundingEngine(),
    crossMargin: await perpEngine.crossMargin(),
    subAccountManager: await perpEngine.subAccountManager(),
    optionsPricer: await perpEngine.optionsPricer(),
    optionsEngine: await perpEngine.optionsEngine(),
    timelock: timelockAddress,
  };
}

async function verifyCodeExists(addresses: Record<string, string>, ethersLike: any): Promise<void> {
  for (const [name, address] of Object.entries(addresses)) {
    const code = await ethersLike.provider.getCode(address);
    if (code === "0x") {
      throw new Error(`Deployed address has no bytecode for ${name}: ${address}`);
    }
  }
}

async function saveDeploymentInfo(
  networkName: string,
  deployerAddress: string,
  perpEngineAddress: string,
  deployTxHash: string,
  deployBlock: number,
  config: DeployConfig,
  modules: ModuleAddresses,
): Promise<void> {
  const deploymentInfo = {
    network: networkName,
    timestamp: new Date().toISOString(),
    deployer: deployerAddress,
    addresses: {
      perpEngine: perpEngineAddress,
      ...modules,
    },
    initialConfig: {
      collateralToken: config.collateralToken,
      insuranceFund: config.insuranceFund,
      protocolTreasury: config.protocolTreasury,
      oracle: config.oracle,
      feedId: config.feedId,
    },
    perpEngineConstructorArgs: {
      perpStorage: modules.perpStorage,
      collateralManager: modules.collateralManager,
      positionManager: modules.positionManager,
      riskManager: modules.riskManager,
      liquidationEngine: modules.liquidationEngine,
      settlementEngine: modules.settlementEngine,
      fundingEngine: modules.fundingEngine,
      crossMargin: modules.crossMargin,
      subAccountManager: modules.subAccountManager,
      optionsPricer: modules.optionsPricer,
      optionsEngine: modules.optionsEngine,
    },
    transactionHash: deployTxHash,
    blockNumber: deployBlock,
  };

  const deployDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  const outPath = path.join(deployDir, `${networkName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nSaved deployment info: ${outPath}`);
}

async function verifyContracts(
  perpEngineAddress: string,
  modules: ModuleAddresses,
  config: DeployConfig,
): Promise<void> {
  console.log("\nVerifying contracts...");

  const verifyJobs: Array<{ name: string; address: string; constructorArguments: unknown[] }> = [
    {
      name: "PerpEngine",
      address: perpEngineAddress,
      constructorArguments: [
        modules.perpStorage,
        modules.collateralManager,
        modules.positionManager,
        modules.riskManager,
        modules.liquidationEngine,
        modules.settlementEngine,
        modules.fundingEngine,
        modules.crossMargin,
        modules.subAccountManager,
        modules.optionsPricer,
        modules.optionsEngine,
      ],
    },
    {
      name: "PerpStorage",
      address: modules.perpStorage,
      constructorArguments: [],
    },
    {
      name: "CollateralManager",
      address: modules.collateralManager,
      constructorArguments: [modules.perpStorage],
    },
    {
      name: "RiskManager",
      address: modules.riskManager,
      constructorArguments: [modules.perpStorage],
    },
    {
      name: "FundingEngine",
      address: modules.fundingEngine,
      constructorArguments: [modules.perpStorage, modules.collateralManager],
    },
    {
      name: "CrossMargin",
      address: modules.crossMargin,
      constructorArguments: [modules.perpStorage],
    },
    {
      name: "SubAccountManager",
      address: modules.subAccountManager,
      constructorArguments: [modules.perpStorage],
    },
    {
      name: "OptionsPricerCore",
      address: modules.optionsPricer,
      constructorArguments: [],
    },
    {
      name: "OptionsEngineModule",
      address: modules.optionsEngine,
      constructorArguments: [modules.perpStorage, modules.collateralManager, modules.optionsPricer],
    },
    {
      name: "PositionManager",
      address: modules.positionManager,
      constructorArguments: [modules.perpStorage, modules.collateralManager, modules.fundingEngine],
    },
    {
      name: "SettlementEngine",
      address: modules.settlementEngine,
      constructorArguments: [
        modules.perpStorage,
        modules.collateralManager,
        modules.positionManager,
        modules.riskManager,
      ],
    },
    {
      name: "LiquidationEngine",
      address: modules.liquidationEngine,
      constructorArguments: [
        modules.perpStorage,
        modules.collateralManager,
        modules.positionManager,
        modules.riskManager,
      ],
    },
    {
      name: "ADLEngine",
      address: modules.adlEngine,
      constructorArguments: [
        modules.perpStorage,
        modules.riskManager,
        modules.positionManager,
      ],
    },
  ];

  for (const job of verifyJobs) {
    try {
      await hre.tasks.getTask("verify").run({
        address: job.address,
        constructorArgs: job.constructorArguments,
      });
      console.log(`  OK  ${job.name}`);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.log(`  WARN ${job.name}: ${message}`);
    }
  }
}

async function main(): Promise<void> {
  const connection = (await network.connect()) as unknown as { networkName: string; ethers: any };
  const networkName = connection.networkName;
  const { ethers } = connection;

  console.log("\nStarting PerpEngine deployment");
  console.log(`Network: ${networkName}`);

  const config = loadConfig(networkName);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  const resolvedInsuranceFund = await resolveTreasuryAddress(
    networkName,
    ethers,
    deployer.address,
    config.collateralToken,
    config.insuranceFund,
    "InsuranceTreasury",
    "INSURANCE_FUND",
  );

  const resolvedProtocolTreasury = await resolveTreasuryAddress(
    networkName,
    ethers,
    deployer.address,
    config.collateralToken,
    config.protocolTreasury,
    "ProtocolTreasury",
    "PROTOCOL_TREASURY",
  );

  const PerpStorageFactory = await ethers.getContractFactory("PerpStorage");
  const perpStorage = await PerpStorageFactory.deploy();
  await perpStorage.waitForDeployment();
  const perpStorageAddress = await perpStorage.getAddress();

  const CollateralManagerFactory = await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManagerFactory.deploy(perpStorageAddress);
  await collateralManager.waitForDeployment();
  const collateralManagerAddress = await collateralManager.getAddress();

  const RiskManagerFactory = await ethers.getContractFactory("RiskManager");
  const riskManager = await RiskManagerFactory.deploy(perpStorageAddress);
  await riskManager.waitForDeployment();
  const riskManagerAddress = await riskManager.getAddress();

  const FundingEngineFactory = await ethers.getContractFactory("FundingEngine");
  const fundingEngine = await FundingEngineFactory.deploy(perpStorageAddress, collateralManagerAddress);
  await fundingEngine.waitForDeployment();
  const fundingEngineAddress = await fundingEngine.getAddress();

  const CrossMarginFactory = await ethers.getContractFactory("CrossMargin");
  const crossMargin = await CrossMarginFactory.deploy(perpStorageAddress);
  await crossMargin.waitForDeployment();
  const crossMarginAddress = await crossMargin.getAddress();

  const SubAccountManagerFactory = await ethers.getContractFactory("SubAccountManager");
  const subAccountManager = await SubAccountManagerFactory.deploy(perpStorageAddress);
  await subAccountManager.waitForDeployment();
  const subAccountManagerAddress = await subAccountManager.getAddress();

  const OptionsPricerFactory = await ethers.getContractFactory("OptionsPricerCore");
  const optionsPricer = await OptionsPricerFactory.deploy();
  await optionsPricer.waitForDeployment();
  const optionsPricerAddress = await optionsPricer.getAddress();

  await perpStorage.setCollateral(config.collateralToken);
  await perpStorage.setInsuranceFund(resolvedInsuranceFund);
  await perpStorage.setProtocolTreasury(resolvedProtocolTreasury);
  await perpStorage.setMarkOracle(config.oracle);
  await perpStorage.setOptionsPricer(optionsPricerAddress);
  await perpStorage.setMarketFeedId(config.feedId);
  await perpStorage.setMakerFeeBps(5);
  await perpStorage.setTakerFeeBps(10);
  await perpStorage.setInsuranceBps(200);
  await perpStorage.setMaintenanceMarginBps(75);
  await perpStorage.setLiquidationRewardBps(80);
  await perpStorage.setLiquidationPenaltyBps(150);
  await perpStorage.addMarket(config.feedId, config.feedId, 5, 10, 75, 80, 150);

  const latest = await ethers.provider.getBlock("latest");
  const nowTs = latest?.timestamp ?? Math.floor(Date.now() / 1000);
  await perpStorage.setLastFundingUpdate(nowTs);
  await perpStorage.setNextFundingTime(nowTs + 3600);

  const OptionsEngineFactory = await ethers.getContractFactory("OptionsEngineModule");
  const optionsEngine = await OptionsEngineFactory.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    optionsPricerAddress,
  );
  await optionsEngine.waitForDeployment();
  const optionsEngineAddress = await optionsEngine.getAddress();

  const PositionManagerFactory = await ethers.getContractFactory("PositionManager");
  const positionManager = await PositionManagerFactory.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    fundingEngineAddress,
  );
  await positionManager.waitForDeployment();
  const positionManagerAddress = await positionManager.getAddress();

  const SettlementEngineFactory = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await SettlementEngineFactory.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress,
  );
  await settlementEngine.waitForDeployment();
  const settlementEngineAddress = await settlementEngine.getAddress();

  const LiquidationEngineFactory = await ethers.getContractFactory("LiquidationEngine");
  const liquidationEngine = await LiquidationEngineFactory.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress,
  );
  await liquidationEngine.waitForDeployment();
  const liquidationEngineAddress = await liquidationEngine.getAddress();

  const moduleAddressesToAuthorize = [
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress,
    liquidationEngineAddress,
    settlementEngineAddress,
    fundingEngineAddress,
    crossMarginAddress,
    subAccountManagerAddress,
    optionsEngineAddress,
  ];

  for (const moduleAddress of moduleAddressesToAuthorize) {
    await perpStorage.setAuthorizedModule(moduleAddress, true);
  }

  const insuranceTreasury = await ethers.getContractAt("InsuranceTreasury", resolvedInsuranceFund);
  await insuranceTreasury.setAuthorizedModule(collateralManagerAddress, true);
  await insuranceTreasury.setAuthorizedModule(liquidationEngineAddress, true);

  const protocolTreasury = await ethers.getContractAt("ProtocolTreasury", resolvedProtocolTreasury);
  await protocolTreasury.setAuthorizedModule(collateralManagerAddress, true);

  const PerpEngineFactory = await ethers.getContractFactory("PerpEngine");
  const perpEngine = (await PerpEngineFactory.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress,
    liquidationEngineAddress,
    settlementEngineAddress,
    fundingEngineAddress,
    crossMarginAddress,
    subAccountManagerAddress,
    optionsPricerAddress,
    optionsEngineAddress,
  )) as PerpEngineContract;

  await perpEngine.waitForDeployment();

  const perpEngineAddress = await perpEngine.getAddress();
  const deployTx = perpEngine.deploymentTransaction();

  if (!deployTx) {
    throw new Error("Missing deployment transaction on PerpEngine instance");
  }

  const receipt = await deployTx.wait();
  if (!receipt) {
    throw new Error("Missing deployment receipt for PerpEngine");
  }

  console.log(`\nPerpEngine: ${perpEngineAddress}`);
  console.log(`Deploy tx:  ${deployTx.hash}`);

  const storageTransferTx = await perpStorage.transferOwnership(perpEngineAddress);
  await storageTransferTx.wait();
  console.log("PerpStorage ownership transferred to PerpEngine");

  const ADLEngineFactory = await ethers.getContractFactory("ADLEngine");
  const adlEngine = await ADLEngineFactory.deploy(
    perpStorageAddress,
    riskManagerAddress,
    positionManagerAddress,
  );
  await adlEngine.waitForDeployment();
  const adlEngineAddress = await adlEngine.getAddress();

  const setAdlTx = await perpEngine.setAdlEngine(adlEngineAddress);
  await setAdlTx.wait();
  // ── Governance: deploy TimelockController and transfer ownership ────────────
  // On local hardhat networks use 0-second delay so the timelock can be used
  // immediately in tests/scripts. On any live network use 48 h.
  const timelockDelay = networkName.startsWith("hardhat") || networkName.startsWith("localhost")
    ? 0
    : 2 * 24 * 3600;

  const TimelockFactory = await ethers.getContractFactory("ProtocolTimelock");
  const timelock = await TimelockFactory.deploy(
    timelockDelay,
    [deployer.address], // proposers
    [deployer.address], // executors
    deployer.address,   // admin (can manage roles; renounce after setup)
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log(`\nTimelockController: ${timelockAddress} (delay=${timelockDelay}s)`);

  // Transfer PerpEngine ownership to the timelock.
  const transferTx = await (perpEngine as any).transferOwnership(timelockAddress);
  await transferTx.wait();
  console.log(`PerpEngine ownership transferred to timelock`);
  // ────────────────────────────────────────────────────────────────────────────

  const modules = await getModuleAddresses(perpEngine, timelockAddress);
  await verifyCodeExists({ perpEngine: perpEngineAddress, ...modules }, ethers);

  console.log("\nModule addresses:");
  console.log(`  PerpStorage:       ${modules.perpStorage}`);
  console.log(`  CollateralManager: ${modules.collateralManager}`);
  console.log(`  PositionManager:   ${modules.positionManager}`);
  console.log(`  RiskManager:       ${modules.riskManager}`);
  console.log(`  LiquidationEngine: ${modules.liquidationEngine}`);
  console.log(`  ADLEngine:         ${modules.adlEngine}`);
  console.log(`  SettlementEngine:  ${modules.settlementEngine}`);
  console.log(`  FundingEngine:     ${modules.fundingEngine}`);
  console.log(`  CrossMargin:       ${modules.crossMargin}`);
  console.log(`  SubAccountManager: ${modules.subAccountManager}`);
  console.log(`  OptionsPricer:     ${modules.optionsPricer}`);
  console.log(`  OptionsEngine:     ${modules.optionsEngine}`);
  console.log(`  TimelockController:${modules.timelock}`);

  await saveDeploymentInfo(
    networkName,
    deployer.address,
    perpEngineAddress,
    deployTx.hash,
    Number(receipt.blockNumber),
    {
      ...config,
      insuranceFund: resolvedInsuranceFund,
      protocolTreasury: resolvedProtocolTreasury,
    },
    modules,
  );

  if (config.verify) {
    await verifyContracts(perpEngineAddress, modules, {
      ...config,
      insuranceFund: resolvedInsuranceFund,
      protocolTreasury: resolvedProtocolTreasury,
    });
  }

  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error("\nDeployment failed:", error);
  process.exit(1);
});
