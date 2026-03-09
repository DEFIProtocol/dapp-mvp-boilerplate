// deploy/deployLocal.ts
import hre from "hardhat";

import * as fs from "fs";
import * as path from "path";


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
  agents: {
    [key: string]: string[]; // trader addresses
  };
}

export async function deployLocal(): Promise<DeployedAddresses> {
    const { ethers } = hre;
  console.log("\n🚀 Deploying local test environment...");
  
  const [deployer, insuranceFund, ...traders] = await ethers.getSigners(); // Use ethers for signers
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Insurance Fund: ${insuranceFund.address}`);
  console.log(`Traders available: ${traders.length}`);
  
  // 1. Deploy Mock USDC
  console.log("\n📝 Deploying Mock USDC...");
  const MockUSDC = await ethers.getContractFactory("MockERC20");
  const usdc = await MockUSDC.deploy(
    "USD Coin",
    "USDC",
    6,
    ethers.parseUnits("10000000", 6) // 10M initial supply
  );
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`USDC deployed: ${usdcAddress}`);
  
  // 2. Deploy Mock Oracle
  console.log("\n📝 Deploying Mock Oracle...");
  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy(
    ethers.parseUnits("2000", 8) // Initial price: $2000 with 8 decimals
  );
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
  const positionManager = await PositionManager.deploy(perpStorageAddress, collateralManagerAddress);
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
  
  // 10. Initialize contracts (set permissions, etc.)
  console.log("\n🔧 Initializing contracts...");
  
  // Grant roles/permissions
  // This depends on your access control - adjust as needed
  await perpStorage.grantRole(await perpStorage.COLLATERAL_MANAGER_ROLE(), collateralManagerAddress);
  await perpStorage.grantRole(await perpStorage.POSITION_MANAGER_ROLE(), positionManagerAddress);
  await perpStorage.grantRole(await perpStorage.RISK_MANAGER_ROLE(), riskManagerAddress);
  await perpStorage.grantRole(await perpStorage.LIQUIDATION_ENGINE_ROLE(), liquidationEngineAddress);
  await perpStorage.grantRole(await perpStorage.SETTLEMENT_ENGINE_ROLE(), settlementEngineAddress);
  await perpStorage.grantRole(await perpStorage.FUNDING_ENGINE_ROLE(), fundingEngineAddress);
  
  // Set oracle in relevant contracts
  await perpStorage.setOracle(oracleAddress);
  
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
      
          // Mint USDC based on agent type
          let amount: bigint;
          switch (type) {
            case 'whale':
              amount = ethers.parseUnits("5000000", 6); // 5M USDC
              break;
            case 'marketMaker':
              amount = ethers.parseUnits("500000", 6); // 500k USDC
              break;
            case 'momentum':
              amount = ethers.parseUnits("100000", 6); // 100k USDC
              break;
            case 'liquidator':
              amount = ethers.parseUnits("200000", 6); // 200k USDC
              break;
            case 'arbitrageur':
              amount = ethers.parseUnits("500000", 6); // 500k USDC
              break;
            default:
              amount = ethers.parseUnits("10000", 6); // 10k USDC for retail
          }
      
      await usdc.mint(trader.address, amount);
      console.log(`  Minted ${ethers.formatUnits(amount, 6)} USDC for ${type} ${i}: ${trader.address}`);
      
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
    insuranceFund: insuranceFund.address,
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
if (require.main === module) {
  deployLocal()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}