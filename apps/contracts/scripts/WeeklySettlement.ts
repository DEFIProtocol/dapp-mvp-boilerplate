import { network } from "hardhat";

async function main() {

  const { ethers } = await network.connect();

  const feeBatcherAddress = "DEPLOYED_BATCHER_ADDRESS";

  const FeeBatcher = await ethers.getContractFactory("FeeBatcher");
  const batcher = FeeBatcher.attach(feeBatcherAddress);

  console.log("Triggering weekly fee distribution...");

  const tx = await batcher.distribute("TREASURY_ADDRESS");
  await tx.wait();

  console.log("Weekly distribution complete.");
}

main().catch(console.error);