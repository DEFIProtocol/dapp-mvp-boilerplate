import { network } from "hardhat";

async function main() {

  const { ethers } = await network.connect();

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Token = await ethers.getContractFactory("ERC20Mock");
  const token = await Token.deploy(
    "Mock",
    "MOCK",
    deployer.address,
    ethers.parseEther("1000000")
  );
  await token.waitForDeployment();

  console.log("Token:", token.target);

  const Insurance = await ethers.getContractFactory("InsuranceFund");
  const insurance = await Insurance.deploy(token.target);
  await insurance.waitForDeployment();

  console.log("Insurance:", insurance.target);

  const Oracle = await ethers.getContractFactory("MockMarkOracle");
  const oracle = await Oracle.deploy();
  await oracle.waitForDeployment();
  const feedId = ethers.encodeBytes32String("BTCUSD");
  await oracle.setMarkPrice(feedId, ethers.parseUnits("100", 18));

  console.log("Oracle:", oracle.target);

  const Settlement = await ethers.getContractFactory("PerpSettlement");
  const settlement = await Settlement.deploy(
    token.target,
    insurance.target,
    oracle.target,
    feedId
  );
  await settlement.waitForDeployment();

  console.log("Settlement:", settlement.target);

  const Liquidation = await ethers.getContractFactory("LiquidationEngine");
  const liquidation = await Liquidation.deploy(settlement.target);
  await liquidation.waitForDeployment();

  console.log("Liquidation:", liquidation.target);

  console.log("Deployment complete.");
}

main().catch(console.error);