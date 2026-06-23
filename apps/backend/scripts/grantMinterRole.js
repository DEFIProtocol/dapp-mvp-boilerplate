/**
 * Script to grant MINTER_ROLE to the backend wallet for paper trading faucet
 * Run with: node apps/backend/scripts/grantMinterRole.js
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const USDC_ADDRESS = "0xAE676c02591db89fC6a070080387f103Ea5a1101";
const BACKEND_WALLET = "0x911158658d4530710F6d6D59156db174BEfD4Dac";
const RPC_URL = "https://base-sepolia.blockpi.network/v1/rpc/public";

// MINTER_ROLE is keccak256("MINTER_ROLE")
const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";

async function main() {
  console.log("🔧 Granting MINTER_ROLE to backend wallet...\n");
  
  // Connect to Base Sepolia
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Get the deployer wallet (the one that deployed the contracts)
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("EVM_PRIVATE_KEY not found in .env");
  }
  
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`📝 Using deployer wallet: ${wallet.address}`);
  console.log(`🎯 Target USDC contract: ${USDC_ADDRESS}`);
  console.log(`👤 Backend wallet to grant role: ${BACKEND_WALLET}\n`);
  
  // USDC contract ABI (only the functions we need)
  const usdcAbi = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function grantRole(bytes32 role, address account)",
    "function getRoleAdmin(bytes32 role) view returns (bytes32)",
    "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"
  ];
  
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, wallet);
  
  // Check if backend wallet already has MINTER_ROLE
  console.log("🔍 Checking current role status...");
  const hasMinterRole = await usdc.hasRole(MINTER_ROLE, BACKEND_WALLET);
  
  if (hasMinterRole) {
    console.log("✅ Backend wallet already has MINTER_ROLE!");
    console.log("🎉 Faucet should work now. Restart your backend server.");
    return;
  }
  
  console.log("❌ Backend wallet does NOT have MINTER_ROLE");
  
  // Check if deployer has admin rights
  const DEFAULT_ADMIN_ROLE = await usdc.DEFAULT_ADMIN_ROLE();
  const isAdmin = await usdc.hasRole(DEFAULT_ADMIN_ROLE, wallet.address);
  
  if (!isAdmin) {
    console.error("\n❌ ERROR: Your deployer wallet is not an admin on this USDC contract!");
    console.error("You need to use the wallet that deployed the contract or has DEFAULT_ADMIN_ROLE");
    process.exit(1);
  }
  
  console.log("✅ Deployer wallet has admin rights\n");
  
  // Grant MINTER_ROLE
  console.log("📤 Sending transaction to grant MINTER_ROLE...");
  const tx = await usdc.grantRole(MINTER_ROLE, BACKEND_WALLET);
  console.log(`⏳ Transaction sent: ${tx.hash}`);
  console.log("⏳ Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
  
  // Verify the role was granted
  const hasRoleNow = await usdc.hasRole(MINTER_ROLE, BACKEND_WALLET);
  
  if (hasRoleNow) {
    console.log("\n🎉 SUCCESS! MINTER_ROLE granted to backend wallet!");
    console.log("🔄 Now restart your backend server and try the faucet again.");
    console.log(`🔗 View transaction: https://sepolia.basescan.org/tx/${tx.hash}`);
  } else {
    console.error("\n❌ ERROR: Role grant transaction succeeded but role not detected!");
    console.error("Please check the transaction on the block explorer.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ ERROR:", error.message);
    if (error.code === "CALL_EXCEPTION") {
      console.error("\nThis usually means:");
      console.error("1. The USDC contract doesn't have a grantRole function (not AccessControl)");
      console.error("2. Your wallet doesn't have permission to grant roles");
      console.error("3. The contract address is incorrect");
    }
    process.exit(1);
  });
