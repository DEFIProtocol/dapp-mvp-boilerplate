import { network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Standalone deploy script for the updated MockUSDCFaucet contract.
 *
 * Usage:
 *   npx hardhat run scripts/deployFaucet.ts --network baseSepolia
 *
 * Writes the resulting address to apps/contracts/deployments/<network>.faucet.json
 * so it can be picked up for updating frontend env vars
 * (NEXT_PUBLIC_PAPER_TRADING_USDC_ADDRESS).
 */
async function main(): Promise<void> {
  const connection = (await network.connect()) as unknown as { networkName: string; ethers: any };
  const networkName = connection.networkName;
  const { ethers } = connection;

  console.log("\nStarting MockUSDCFaucet deployment");
  console.log(`Network: ${networkName}`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  const name = process.env.FAUCET_TOKEN_NAME ?? "USD Coin";
  const symbol = process.env.FAUCET_TOKEN_SYMBOL ?? "USDC";
  const decimals = Number(process.env.FAUCET_TOKEN_DECIMALS ?? "6");
  const treasuryMintAmount = process.env.FAUCET_TREASURY_MINT_AMOUNT ?? "10000000";

  const MockUSDCFaucet = await ethers.getContractFactory("MockUSDCFaucet");
  // deployer is the initial owner - the only address allowed to call
  // ownerMint() to top up the backend's treasury balance.
  const faucet = await MockUSDCFaucet.deploy(name, symbol, decimals, deployer.address);
  const deployTx = faucet.deploymentTransaction();
  console.log(`Deploy tx submitted: ${deployTx?.hash ?? "unknown"}`);

  const receipt = deployTx ? await deployTx.wait() : null;
  console.log(`Deploy tx mined in block: ${receipt ? Number(receipt.blockNumber) : "unknown"}`);

  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();

  console.log(`\nMinting initial treasury balance: ${treasuryMintAmount} ${symbol} to ${deployer.address}`);
  const mintTx = await faucet.ownerMint(
    deployer.address,
    ethers.parseUnits(treasuryMintAmount, decimals),
  );
  await mintTx.wait();
  console.log(`Treasury mint tx: ${mintTx.hash}`);

  // Public testnet RPCs can lag slightly right after the tx is mined; retry
  // getCode a few times before giving up.
  let code = "0x";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = await ethers.provider.getCode(faucetAddress);
    if (code !== "0x") break;
    console.log(`No bytecode yet at ${faucetAddress}, retrying (${attempt + 1}/5)...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (code === "0x") {
    throw new Error(`Deployed address has no bytecode: ${faucetAddress}`);
  }

  console.log(`\nMockUSDCFaucet: ${faucetAddress}`);
  console.log(`Deploy tx:      ${deployTx?.hash ?? "unknown"}`);
  console.log(`Name/Symbol:    ${name} / ${symbol} (decimals=${decimals})`);

  const deployDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  const outPath = path.join(deployDir, `${networkName}.faucet.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        network: networkName,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        address: faucetAddress,
        transactionHash: deployTx?.hash ?? null,
        blockNumber: receipt ? Number(receipt.blockNumber) : null,
        constructorArgs: { name, symbol, decimals, initialOwner: deployer.address },
        treasuryMint: { amount: treasuryMintAmount, txHash: mintTx.hash },
      },
      null,
      2,
    ),
  );
  console.log(`\nSaved deployment info: ${outPath}`);
  console.log(
    `\nUpdate NEXT_PUBLIC_PAPER_TRADING_USDC_ADDRESS=${faucetAddress} in your deployed web app's environment variables.`,
  );

  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error("\nDeployment failed:", error);
  process.exit(1);
});
