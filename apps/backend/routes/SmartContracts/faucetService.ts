import { ethers } from "ethers";

/**
 * Distributes testnet USDC to users from a pre-funded backend treasury
 * wallet via plain ERC20 transfer() calls, instead of letting users call
 * MockUSDCFaucet.mint() directly from their own wallet.
 *
 * Why: a brand-new contract exposing a public mint() function is exactly
 * the shape wallet security providers (e.g. Blockaid, used by MetaMask)
 * flag as a likely scam/drainer token, regardless of how safe the mint
 * logic actually is. transfer() between two known, already-funded
 * addresses is the most common, least-suspicious ERC20 action there is,
 * so routing claims through the backend's own wallet avoids the warning
 * without asking users to trust an unfamiliar contract.
 *
 * The treasury wallet auto-tops-up via the contract's owner-only,
 * uncapped `ownerMint` whenever its balance drops to or below
 * FAUCET_LOW_BALANCE_THRESHOLD.
 */

const FAUCET_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function ownerMint(address to, uint256 amount) external",
];

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const DEFAULT_CLAIM_AMOUNT = "10000"; // 10,000 USDC per claim
const DEFAULT_TOP_UP_THRESHOLD = "100000"; // auto-mint when treasury <= 100,000 USDC
const DEFAULT_TOP_UP_AMOUNT = "10000000"; // mint 10,000,000 USDC per top-up

export class FaucetService {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private faucetAddress: string;
  private decimalsCache: number | null = null;

  constructor() {
    const infuraApiKey = requireEnv(
      "INFURA_PRIVATE_KEY or INFURA_API_KEY",
      process.env.INFURA_PRIVATE_KEY ?? process.env.INFURA_API_KEY
    );
    const privateKey = requireEnv("EVM_PRIVATE_KEY", process.env.EVM_PRIVATE_KEY);

    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("Invalid EVM_PRIVATE_KEY format. Expected a 32-byte hex key prefixed with 0x.");
    }

    this.faucetAddress = requireEnv(
      "NEXT_PUBLIC_PAPER_TRADING_USDC_ADDRESS or FAUCET_TOKEN_ADDRESS",
      process.env.FAUCET_TOKEN_ADDRESS ?? process.env.NEXT_PUBLIC_PAPER_TRADING_USDC_ADDRESS
    );

    const network = process.env.SETTLEMENT_NETWORK || "base-sepolia";
    this.provider = new ethers.JsonRpcProvider(`https://${network}.infura.io/v3/${infuraApiKey}`);
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    this.contract = new ethers.Contract(this.faucetAddress, FAUCET_ABI, this.wallet);

    console.log(`[FaucetService] Faucet token: ${this.faucetAddress}`);
    console.log(`[FaucetService] Treasury wallet: ${this.wallet.address}`);
  }

  getTreasuryAddress(): string {
    return this.wallet.address;
  }

  getFaucetAddress(): string {
    return this.faucetAddress;
  }

  async getDecimals(): Promise<number> {
    if (this.decimalsCache === null) {
      this.decimalsCache = Number(await this.contract.decimals());
    }
    return this.decimalsCache;
  }

  async getTreasuryBalance(): Promise<bigint> {
    return await this.contract.balanceOf(this.wallet.address);
  }

  getClaimAmountUnits(decimals: number): bigint {
    const claimAmount = process.env.FAUCET_CLAIM_AMOUNT ?? DEFAULT_CLAIM_AMOUNT;
    return ethers.parseUnits(claimAmount, decimals);
  }

  private getTopUpThresholdUnits(decimals: number): bigint {
    const threshold = process.env.FAUCET_LOW_BALANCE_THRESHOLD ?? DEFAULT_TOP_UP_THRESHOLD;
    return ethers.parseUnits(threshold, decimals);
  }

  private getTopUpAmountUnits(decimals: number): bigint {
    const amount = process.env.FAUCET_TOP_UP_AMOUNT ?? DEFAULT_TOP_UP_AMOUNT;
    return ethers.parseUnits(amount, decimals);
  }

  /**
   * Tops up the treasury via ownerMint if its balance is at or below the
   * configured low-balance threshold. Safe to call before every claim -
   * it's a no-op read (balanceOf) unless the mint is actually needed.
   */
  async ensureTreasuryFunded(): Promise<{ toppedUp: boolean; txHash?: string; newBalance: bigint }> {
    const decimals = await this.getDecimals();
    const balance = await this.getTreasuryBalance();
    const threshold = this.getTopUpThresholdUnits(decimals);

    if (balance > threshold) {
      return { toppedUp: false, newBalance: balance };
    }

    const topUpAmount = this.getTopUpAmountUnits(decimals);
    console.log(
      `[FaucetService] Treasury balance ${ethers.formatUnits(balance, decimals)} is at/below threshold ` +
        `${ethers.formatUnits(threshold, decimals)} - minting ${ethers.formatUnits(topUpAmount, decimals)} more.`
    );

    const tx = await this.contract.ownerMint(this.wallet.address, topUpAmount);
    await tx.wait();

    const newBalance = await this.getTreasuryBalance();
    console.log(`[FaucetService] Treasury topped up. New balance: ${ethers.formatUnits(newBalance, decimals)}`);

    return { toppedUp: true, txHash: tx.hash as string, newBalance };
  }

  /**
   * Sends the fixed claim amount to `to` from the treasury wallet via a
   * plain transfer() - no signature/wallet popup required on the user's
   * end, since the backend's own wallet signs and pays gas.
   */
  async claim(to: string): Promise<{ txHash: string; amount: bigint; decimals: number }> {
    const decimals = await this.getDecimals();
    const amount = this.getClaimAmountUnits(decimals);

    await this.ensureTreasuryFunded();

    const balance = await this.getTreasuryBalance();
    if (balance < amount) {
      throw new Error(
        `Faucet treasury balance (${ethers.formatUnits(balance, decimals)}) is insufficient to cover a ` +
          `${ethers.formatUnits(amount, decimals)} claim, even after attempting a top-up.`
      );
    }

    const tx = await this.contract.transfer(to, amount);
    await tx.wait();

    return { txHash: tx.hash as string, amount, decimals };
  }
}
