import { network } from "hardhat";

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";


interface DeployedAddresses {
  usdc: string;
  mockOracle: string;
  perpStorage: string;
  collateralManager: string;
  positionManager: string;
  riskManager: string;
  liquidationEngine: string;
  settlementEngine: string;
  fundingEngine: string;
  insuranceFund: string;
  protocolTreasury: string;
  agents: {
    [key: string]: string[]; // trader addresses
  };
}

export async function deployLocal(ethersOverride?: any): Promise<DeployedAddresses> {
  const ethers = ethersOverride ?? ((await network.connect()) as unknown as { ethers: any }).ethers;
    
  console.log("\n🚀 Deploying local test environment...");
  
  const [deployer, ...traders] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Traders available: ${traders.length}`);
  
  // 1. Deploy Mock USDC
  console.log("\n📝 Deploying Mock USDC...");
  const MockUSDC = await ethers.getContractFactory("MockERC20");
  const usdc = await MockUSDC.deploy(
    "USD Coin",
    "USDC",
    6
  );
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`USDC deployed: ${usdcAddress}`);

  // 1.5 Deploy Insurance Treasury
  console.log("\n📝 Deploying Insurance Treasury...");
  const InsuranceTreasury = await ethers.getContractFactory("InsuranceTreasury");
  const insuranceTreasury = await InsuranceTreasury.deploy(usdcAddress, deployer.address);
  await insuranceTreasury.waitForDeployment();
  const insuranceFundAddress = await insuranceTreasury.getAddress();
  console.log(`Insurance Treasury deployed: ${insuranceFundAddress}`);

  console.log("\n📝 Deploying Protocol Treasury...");
  const ProtocolTreasury = await ethers.getContractFactory("ProtocolTreasury");
  const protocolTreasury = await ProtocolTreasury.deploy(usdcAddress, deployer.address);
  await protocolTreasury.waitForDeployment();
  const protocolTreasuryAddress = await protocolTreasury.getAddress();
  console.log(`Protocol Treasury deployed: ${protocolTreasuryAddress}`);
  
  // 2. Deploy Mock Oracle
  console.log("\n📝 Deploying Mock Oracle...");
  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`Oracle deployed: ${oracleAddress}`);
  
  // 3. Deploy PerpStorage
  console.log("\n📝 Deploying PerpStorage...");
  const PerpStorage = await ethers.getContractFactory("PerpStorage");
  const perpStorage = await PerpStorage.deploy();
  await perpStorage.waitForDeployment();
  const perpStorageAddress = await perpStorage.getAddress();
  console.log(`PerpStorage: ${perpStorageAddress}`);
  
  // 4. Deploy CollateralManager
  console.log("\n📝 Deploying CollateralManager...");
  const CollateralManager = await ethers.getContractFactory("CollateralManager");
  const collateralManager = await CollateralManager.deploy(perpStorageAddress);
  await collateralManager.waitForDeployment();
  const collateralManagerAddress = await collateralManager.getAddress();
  console.log(`CollateralManager: ${collateralManagerAddress}`);
  
  // 5. Deploy RiskManager
  console.log("\n📝 Deploying RiskManager...");
  const RiskManager = await ethers.getContractFactory("RiskManager");
  const riskManager = await RiskManager.deploy(perpStorageAddress);
  await riskManager.waitForDeployment();
  const riskManagerAddress = await riskManager.getAddress();
  console.log(`RiskManager: ${riskManagerAddress}`);
  
  // 6. Deploy FundingEngine
  console.log("\n📝 Deploying FundingEngine...");
  const FundingEngine = await ethers.getContractFactory("FundingEngine");
  const fundingEngine = await FundingEngine.deploy(perpStorageAddress, collateralManagerAddress);
  await fundingEngine.waitForDeployment();
  const fundingEngineAddress = await fundingEngine.getAddress();
  console.log(`FundingEngine: ${fundingEngineAddress}`);
  
  // 7. Deploy PositionManager
  console.log("\n📝 Deploying PositionManager...");
  const PositionManager = await ethers.getContractFactory("PositionManager");
  const positionManager = await PositionManager.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    fundingEngineAddress
  );
  await positionManager.waitForDeployment();
  const positionManagerAddress = await positionManager.getAddress();
  console.log(`PositionManager: ${positionManagerAddress}`);
  
  // 8. Deploy SettlementEngine
  console.log("\n📝 Deploying SettlementEngine...");
  const SettlementEngine = await ethers.getContractFactory("SettlementEngine");
  const settlementEngine = await SettlementEngine.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress
  );
  await settlementEngine.waitForDeployment();
  const settlementEngineAddress = await settlementEngine.getAddress();
  console.log(`SettlementEngine: ${settlementEngineAddress}`);
  
  // 9. Deploy LiquidationEngine
  console.log("\n📝 Deploying LiquidationEngine...");
  const LiquidationEngine = await ethers.getContractFactory("LiquidationEngine");
  const liquidationEngine = await LiquidationEngine.deploy(
    perpStorageAddress,
    collateralManagerAddress,
    positionManagerAddress,
    riskManagerAddress
  );
  await liquidationEngine.waitForDeployment();
  const liquidationEngineAddress = await liquidationEngine.getAddress();
  console.log(`LiquidationEngine: ${liquidationEngineAddress}`);
  
  // 10. Initialize contracts (set storage params and module permissions)
  console.log("\n🔧 Initializing contracts...");

  // Configure storage primitives expected by modules.
  await perpStorage.setCollateral(usdcAddress);
  await perpStorage.setInsuranceFund(insuranceFundAddress);
  await perpStorage.setProtocolTreasury(protocolTreasuryAddress);
  await perpStorage.setMarkOracle(oracleAddress);
  await perpStorage.setMarketFeedId(ethers.encodeBytes32String("SIM_MARK"));

  // Use protocol defaults from PerpSettlement constructor.
  await perpStorage.setMakerFeeBps(5);
  await perpStorage.setTakerFeeBps(10);
  await perpStorage.setInsuranceBps(200);
  await perpStorage.setMaintenanceMarginBps(1000);
  await perpStorage.setLiquidationRewardBps(80);
  await perpStorage.setLiquidationPenaltyBps(150);

  const latest = await ethers.provider.getBlock("latest");
  const nowTs = latest?.timestamp ?? Math.floor(Date.now() / 1000);
  await perpStorage.setLastFundingUpdate(nowTs);
  await perpStorage.setNextFundingTime(nowTs + 3600);

  // Authorize all modules in PerpStorage.
  await perpStorage.setAuthorizedModule(collateralManagerAddress, true);
  await perpStorage.setAuthorizedModule(positionManagerAddress, true);
  await perpStorage.setAuthorizedModule(riskManagerAddress, true);
  await perpStorage.setAuthorizedModule(liquidationEngineAddress, true);
  await perpStorage.setAuthorizedModule(settlementEngineAddress, true);
  await perpStorage.setAuthorizedModule(fundingEngineAddress, true);

  // Authorize modules that move funds in/out of treasury.
  await insuranceTreasury.setAuthorizedModule(collateralManagerAddress, true);
  await insuranceTreasury.setAuthorizedModule(liquidationEngineAddress, true);
  await protocolTreasury.setAuthorizedModule(collateralManagerAddress, true);
  
  // 11. Fund traders with USDC
  console.log("\n💰 Funding traders with USDC...");
  
  const agentAddresses: { [key: string]: string[] } = {
    marketMaker: [],
    momentum: [],
    retail: [],
    whale: [],
    liquidator: [],
    arbitrageur: []
  };
  
  // Assign traders to agent types
  const traderCount = traders.length;
  const perType = Math.floor(traderCount / 6);
  
  let traderIndex = 0;
  for (const type of Object.keys(agentAddresses)) {
    for (let i = 0; i < perType && traderIndex < traders.length; i++) {
      const trader = traders[traderIndex];
      agentAddresses[type].push(trader.address);
      
          // Allocate token balances from deployer supply.
          let amount: bigint;
          switch (type) {
            case 'whale':
              amount = ethers.parseUnits("50000", 6); // 50k USDC
              break;
            case 'marketMaker':
              amount = ethers.parseUnits("25000", 6); // 25k USDC
              break;
            case 'momentum':
              amount = ethers.parseUnits("15000", 6); // 15k USDC
              break;
            case 'liquidator':
              amount = ethers.parseUnits("12000", 6); // 12k USDC
              break;
            case 'arbitrageur':
              amount = ethers.parseUnits("20000", 6); // 20k USDC
              break;
            default:
              amount = ethers.parseUnits("5000", 6); // 5k USDC for retail
          }

            await usdc.transfer(trader.address, amount);
      
      console.log(`  Assigned ${ethers.formatUnits(amount, 6)} USDC notional for ${type} ${i}: ${trader.address}`);
      
      traderIndex++;
    }
  }
  
  // 12. Seed initial liquidity (optional)
  console.log("\n💧 Seeding initial liquidity...");
  // Have market makers deposit collateral and open some positions
  
  const addresses: DeployedAddresses = {
    usdc: usdcAddress,
    mockOracle: oracleAddress,
    perpStorage: perpStorageAddress,
    collateralManager: collateralManagerAddress,
    positionManager: positionManagerAddress,
    riskManager: riskManagerAddress,
    liquidationEngine: liquidationEngineAddress,
    settlementEngine: settlementEngineAddress,
    fundingEngine: fundingEngineAddress,
    insuranceFund: insuranceFundAddress,
    protocolTreasury: protocolTreasuryAddress,
    agents: agentAddresses
  };
  
  // Save addresses to file
  const deployDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  
  const outPath = path.join(deployDir, "localhost.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\n✅ Deployment complete! Addresses saved to: ${outPath}`);
  
  return addresses;
}

// Run directly if called as script
const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  deployLocal()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}