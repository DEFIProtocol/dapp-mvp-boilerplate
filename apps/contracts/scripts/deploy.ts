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
  settlementEngine: string;
  fundingEngine: string;
};

type PerpEngineContract = BaseContract & {
  perpStorage(): Promise<string>;
  collateralManager(): Promise<string>;
  positionManager(): Promise<string>;
  riskManager(): Promise<string>;
  liquidationEngine(): Promise<string>;
  settlementEngine(): Promise<string>;
  fundingEngine(): Promise<string>;
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
    oracle,
    feedId: resolvedFeedId,
    verify,
  };
}

async function getModuleAddresses(perpEngine: PerpEngineContract): Promise<ModuleAddresses> {
  return {
    perpStorage: await perpEngine.perpStorage(),
    collateralManager: await perpEngine.collateralManager(),
    positionManager: await perpEngine.positionManager(),
    riskManager: await perpEngine.riskManager(),
    liquidationEngine: await perpEngine.liquidationEngine(),
    settlementEngine: await perpEngine.settlementEngine(),
    fundingEngine: await perpEngine.fundingEngine(),
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
    constructorArgs: {
      collateralToken: config.collateralToken,
      insuranceFund: config.insuranceFund,
      oracle: config.oracle,
      feedId: config.feedId,
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
      constructorArguments: [config.collateralToken, config.insuranceFund, config.oracle, config.feedId],
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
      name: "PositionManager",
      address: modules.positionManager,
      constructorArguments: [modules.perpStorage, modules.collateralManager],
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

  const PerpEngineFactory = await ethers.getContractFactory("PerpEngine");
  const perpEngine = (await PerpEngineFactory.deploy(
    config.collateralToken,
    config.insuranceFund,
    config.oracle,
    config.feedId,
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

  const modules = await getModuleAddresses(perpEngine);
  await verifyCodeExists({ perpEngine: perpEngineAddress, ...modules }, ethers);

  console.log("\nModule addresses:");
  console.log(`  PerpStorage:       ${modules.perpStorage}`);
  console.log(`  CollateralManager: ${modules.collateralManager}`);
  console.log(`  PositionManager:   ${modules.positionManager}`);
  console.log(`  RiskManager:       ${modules.riskManager}`);
  console.log(`  LiquidationEngine: ${modules.liquidationEngine}`);
  console.log(`  SettlementEngine:  ${modules.settlementEngine}`);
  console.log(`  FundingEngine:     ${modules.fundingEngine}`);

  await saveDeploymentInfo(
    networkName,
    deployer.address,
    perpEngineAddress,
    deployTx.hash,
    Number(receipt.blockNumber),
    config,
    modules,
  );

  if (config.verify) {
    await verifyContracts(perpEngineAddress, modules, config);
  }

  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error("\nDeployment failed:", error);
  process.exit(1);
});
