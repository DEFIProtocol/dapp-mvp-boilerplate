import { ethers } from "ethers";
import settlementAbi from "../../../contracts/artifacts/contracts/PerpSettlement.sol/PerpEngine.json";
import { loadDeploymentConfig } from "./deploymentConfig";

type PositionSnapshot = {
  positionId: string;
  trader: string;
  side: "LONG" | "SHORT";
  marketId: string;
  subAccountId: string;
  exposure: string;
  margin: string;
  entryPrice: string;
  active: boolean;
  exposureUsd: string;
  marginUsd: string;
  entryPriceUsd: string;
  unrealizedPnlUsd: string;
  unrealizedFundingUsd: string;
  equityUsd: string;
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

export class SettlementService {

  private contract: ethers.Contract;
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private deployment = loadDeploymentConfig();

  constructor() {
    const infuraApiKey = requireEnv(
      "INFURA_PRIVATE_KEY or INFURA_API_KEY",
      process.env.INFURA_PRIVATE_KEY ?? process.env.INFURA_API_KEY
    );
    const privateKey = requireEnv("EVM_PRIVATE_KEY", process.env.EVM_PRIVATE_KEY);

    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("Invalid EVM_PRIVATE_KEY format. Expected a 32-byte hex key prefixed with 0x.");
    }

    const network = process.env.SETTLEMENT_NETWORK || "base-sepolia";
    this.provider = new ethers.JsonRpcProvider(`https://${network}.infura.io/v3/${infuraApiKey}`);
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    console.log(`[SettlementService] Loaded deployment manifest: ${this.deployment.manifestPath}`);
    console.log(`[SettlementService] Using settlement contract: ${this.deployment.settlementAddress}`);
    console.log(`[SettlementService] Using collateral token: ${this.deployment.usdcAddress}`);

    this.contract = new ethers.Contract(
      this.deployment.settlementAddress,
      settlementAbi.abi,
      this.wallet
    );
  }

  async liquidate(positionId: number) {
    const tx = await this.contract.liquidate(positionId);

    await tx.wait();
    return tx.hash;
  }

  async updateFunding() {
    const tx = await this.contract.updateFunding();

    await tx.wait();
    return tx.hash;
  }

  async updateFundingForMarket(marketId: string) {
    const tx = await this.contract.updateFundingForMarket(marketId);
    await tx.wait();
    return tx.hash;
  }

  async settleMatchForMarket(
    marketId: string,
    longOrder: unknown,
    longSignature: string,
    shortOrder: unknown,
    shortSignature: string,
    matchSize: bigint
  ) {
    const tx = await this.contract.settleMatchForMarket(
      marketId,
      longOrder,
      longSignature,
      shortOrder,
      shortSignature,
      matchSize
    );

    await tx.wait();
    return tx.hash;
  }

  async settleMatchWithRolesForMarket(
    marketId: string,
    longOrder: unknown,
    longSignature: string,
    shortOrder: unknown,
    shortSignature: string,
    matchSize: bigint,
    longIsTaker: boolean
  ) {
    const tx = await this.contract.settleMatchWithRolesForMarket(
      marketId,
      longOrder,
      longSignature,
      shortOrder,
      shortSignature,
      matchSize,
      longIsTaker
    );

    await tx.wait();
    return tx.hash;
  }

  async getParams() {
    const [makerFeeBps, takerFeeBps, insuranceBps, maintenanceMarginBps, liquidationRewardBps, liquidationPenaltyBps] =
      await Promise.all([
        this.contract.makerFeeBps(),
        this.contract.takerFeeBps(),
        this.contract.insuranceBps(),
        this.contract.maintenanceMarginBps(),
        this.contract.liquidationRewardBps(),
        this.contract.liquidationPenaltyBps(),
      ]);

    return {
      makerFeeBps: Number(makerFeeBps),
      takerFeeBps: Number(takerFeeBps),
      insuranceBps: Number(insuranceBps),
      maintenanceMarginBps: Number(maintenanceMarginBps),
      liquidationRewardBps: Number(liquidationRewardBps),
      liquidationPenaltyBps: Number(liquidationPenaltyBps),
    };
  }

  async getMarkPrice(): Promise<bigint> {
    return await this.contract.getMarkPrice();
  }

  async getTraderPositionIds(trader: string): Promise<bigint[]> {
    return await this.contract.getTraderPositions(trader);
  }

  async getPositionWithPnl(positionId: bigint): Promise<any> {
    return await this.contract.getPositionWithPnL(positionId);
  }

  async getTraderPositionSnapshots(
    trader: string,
    options?: { marketId?: string; subAccountId?: string }
  ): Promise<PositionSnapshot[]> {
    const positionIds = await this.getTraderPositionIds(trader);
    const snapshots: PositionSnapshot[] = await Promise.all(
      positionIds.map(async (id) => {
        const positionTuple = await this.getPositionWithPnl(id);

        const position = positionTuple[0];
        const unrealizedPnl = positionTuple[1] as bigint;
        const unrealizedFunding = positionTuple[2] as bigint;
        const equity = positionTuple[3] as bigint;

        const sideValue = Number(position.side);

        return {
          positionId: id.toString(),
          trader: String(position.trader),
          side: sideValue === 0 ? "LONG" : "SHORT",
          marketId: String(position.marketId),
          subAccountId: position.subAccountId.toString(),
          exposure: position.exposure.toString(),
          margin: position.margin.toString(),
          entryPrice: position.entryPrice.toString(),
          active: Boolean(position.active),
          exposureUsd: ethers.formatUnits(position.exposure, 18),
          marginUsd: ethers.formatUnits(position.margin, 18),
          entryPriceUsd: ethers.formatUnits(position.entryPrice, 18),
          unrealizedPnlUsd: ethers.formatUnits(unrealizedPnl, 18),
          unrealizedFundingUsd: ethers.formatUnits(unrealizedFunding, 18),
          equityUsd: ethers.formatUnits(equity, 18),
        };
      })
    );

    return snapshots.filter((snapshot) => {
      if (options?.marketId && snapshot.marketId.toLowerCase() !== options.marketId.toLowerCase()) {
        return false;
      }

      if (options?.subAccountId && snapshot.subAccountId !== options.subAccountId) {
        return false;
      }

      return true;
    });
  }

  async getSubAccountEquity(trader: string, subAccountId: bigint): Promise<bigint> {
    return await this.contract.getSubAccountEquity(trader, subAccountId);
  }

  async getSubAccounts(trader: string): Promise<unknown[]> {
    return await this.contract.getSubAccounts(trader);
  }

  async setFeeParams(makerFeeBps: number, takerFeeBps: number, insuranceBps: number) {
    const tx = await this.contract.setFeeParams(makerFeeBps, takerFeeBps, insuranceBps);
    await tx.wait();
    return tx.hash as string;
  }

  async setRiskParams(maintenanceMarginBps: number, liquidationRewardBps: number, liquidationPenaltyBps: number) {
    const tx = await this.contract.setRiskParams(
      maintenanceMarginBps,
      liquidationRewardBps,
      liquidationPenaltyBps
    );

    await tx.wait();
    return tx.hash as string;
  }

  /**
   * Register a new market on-chain after deployment finalization.
   * Calls PerpStorage.addMarketAdmin — owner-only, no finalization restriction.
   */
  async addMarket(params: {
    marketId: string;  // bytes32 hex
    feedId: string;    // bytes32 hex
    makerFeeBps: number;
    takerFeeBps: number;
    maintenanceMarginBps: number;
    liquidationRewardBps: number;
    liquidationPenaltyBps: number;
  }): Promise<string> {
    const perpStorageAbi = [
      "function addMarketAdmin(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256) external",
    ];
    const manifest = this.deployment;
    const deploymentJson = JSON.parse(
      require("fs").readFileSync(manifest.manifestPath, "utf8")
    );
    const perpStorageAddress = deploymentJson?.addresses?.perpStorage;
    if (!perpStorageAddress) throw new Error("perpStorage address not found in deployment manifest");

    const perpStorage = new ethers.Contract(perpStorageAddress, perpStorageAbi, this.wallet);
    const tx = await perpStorage.addMarketAdmin(
      params.marketId,
      params.feedId,
      params.makerFeeBps,
      params.takerFeeBps,
      params.maintenanceMarginBps,
      params.liquidationRewardBps,
      params.liquidationPenaltyBps
    );
    await tx.wait();
    return tx.hash as string;
  }

  /**
   * Set the oracle price for a specific feedId on the MockOracle.
   * Only works when the deployed oracle is MockOracle (testnet).
   */
  async setOraclePriceForFeed(feedId: string, priceUsd: number): Promise<string> {
    const manifest = this.deployment;
    const deploymentJson = JSON.parse(
      require("fs").readFileSync(manifest.manifestPath, "utf8")
    );
    const oracleAddress = deploymentJson?.initialConfig?.oracle;
    if (!oracleAddress) throw new Error("oracle address not found in deployment manifest");

    const mockOracleAbi = [
      "function setPriceForFeed(bytes32 feedId, uint256 price) external",
    ];
    const oracle = new ethers.Contract(oracleAddress, mockOracleAbi, this.wallet);
    const priceWei = ethers.parseUnits(priceUsd.toString(), 18);
    const tx = await oracle.setPriceForFeed(feedId, priceWei);
    await tx.wait();
    return tx.hash as string;
  }

  async grantPaperTradingFunds(recipient: string): Promise<{ usdcTxHash: string; ethTxHash?: string; ethDripError?: string }> {
    const usdcAddress = this.deployment.usdcAddress;

    const usdcDecimals = Number.parseInt(process.env.PAPER_TRADING_USDC_DECIMALS ?? "6", 10);
    const usdcAmount = ethers.parseUnits(process.env.PAPER_TRADING_USDC_AMOUNT ?? "10000", usdcDecimals);
    const usdcMode = (process.env.PAPER_TRADING_USDC_MODE ?? "mint").toLowerCase();
    const token = new ethers.Contract(
      usdcAddress,
      [
        "function mint(address to, uint256 amount)",
        "function transfer(address to, uint256 amount) returns (bool)",
      ],
      this.wallet
    );

    let usdcTxHash: string;
    if (usdcMode === "transfer") {
      const transferTx = await token.transfer(recipient, usdcAmount);
      await transferTx.wait();
      usdcTxHash = transferTx.hash;
    } else {
      const mintTx = await token.mint(recipient, usdcAmount);
      await mintTx.wait();
      usdcTxHash = mintTx.hash;
    }

    const ethDripWeiRaw = process.env.PAPER_TRADING_ETH_DRIP_WEI ?? "0";
    const ethDripWei = BigInt(ethDripWeiRaw);
    const minWalletEthWei = BigInt(process.env.PAPER_TRADING_ETH_MIN_BALANCE_WEI ?? "0");

    let ethTxHash: string | undefined;
    let ethDripError: string | undefined;
    if (ethDripWei > 0n) {
      const currentBalance = await this.provider.getBalance(recipient);
      if (currentBalance < minWalletEthWei) {
        try {
          const ethTx = await this.wallet.sendTransaction({
            to: recipient,
            value: ethDripWei,
          });
          await ethTx.wait();
          ethTxHash = ethTx.hash;
        } catch (error) {
          ethDripError = error instanceof Error ? error.message : "Failed to send ETH drip";
        }
      }
    }

    return { usdcTxHash, ethTxHash, ethDripError };
  }
}