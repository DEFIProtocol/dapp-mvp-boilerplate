import { network } from "hardhat";

async function main() {

  const { ethers } = await network.connect();

  const settlementAddress = process.env.SETTLEMENT!;
  const newFunding = 100; // example funding update

  const Settlement = await ethers.getContractFactory("PerpSettlement");
  const settlement = Settlement.attach(settlementAddress);

  console.log("Updating funding...");

  const tx = await settlement.updateFunding(newFunding, newFunding);
  await tx.wait();

  console.log("Funding updated.");
}

main().catch(console.error);