import { ethers } from "ethers";
// This should be the Hardhat/Truffle artifact with the ABI
import PerpEngineArtifact from "./testnetConData/PerpEngine.json";
// This should be your deployment addresses JSON
import deploymentData from "./testnetConData/deployment-addresses.json";

// Define the type for our deployment addresses
type DeploymentAddresses = {
  network: string;
  timestamp: string;
  deployer: string;
  addresses: {
    perpEngine: string;
    perpStorage: string;
    collateralManager: string;
    positionManager: string;
    riskManager: string;
    liquidationEngine: string;
    adlEngine: string;
    settlementEngine: string;
    fundingEngine: string;
    crossMargin: string;
    subAccountManager: string;
    optionsPricer: string;
    optionsEngine: string;
    timelock: string;
  };
  initialConfig: {
    collateralToken: string;
    insuranceFund: string;
    protocolTreasury: string;
    oracle: string;
    feedId: string;
  };
};

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
  private settlementAddress: string;
  private usdcAddress: string;
  private deployment: DeploymentAddresses;

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

    // Cast the imported JSON data to our DeploymentAddresses type
    this.deployment = deploymentData as DeploymentAddresses;
    this.settlementAddress = this.deployment.addresses.perpEngine;
    this.usdcAddress = this.deployment.initialConfig.collateralToken;

    console.log(`[SettlementService] Loaded deployment from testnetConData`);
    console.log(`[SettlementService] Network: ${this.deployment.network}`);
    console.log(`[SettlementService] Using settlement contract: ${this.settlementAddress}`);
    console.log(`[SettlementService] Using collateral token: ${this.usdcAddress}`);

    this.contract = new ethers.Contract(
      this.settlementAddress,
      PerpEngineArtifact.abi, // Use .abi from the artifact
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
   * Uses perpStorage address from the imported deployment data.
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
    
    const perpStorageAddress = this.deployment.addresses.perpStorage;
    console.log(`[addMarket] Using perpStorage at: ${perpStorageAddress}`);

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
   * Uses oracle address from the imported deployment data.
   */
  async setOraclePriceForFeed(feedId: string, priceUsd: number): Promise<string> {
    const oracleAddress = this.deployment.initialConfig.oracle;
    console.log(`[setOraclePriceForFeed] Using oracle at: ${oracleAddress}`);

    const mockOracleAbi = [
      "function setPriceForFeed(bytes32 feedId, uint256 price) external",
      "function setPrice(uint256 price) external",
    ];
    const oracle = new ethers.Contract(oracleAddress, mockOracleAbi, this.wallet);
    const priceWei = ethers.parseUnits(priceUsd.toString(), 18);
    
    // Try both methods - setPrice (global) and setPriceForFeed (per-feed)
    try {
      // First try the global setPrice (for contracts that don't use feedId)
      const tx1 = await oracle.setPrice(priceWei);
      await tx1.wait();
      console.log(`[setOraclePriceForFeed] Set global price: ${priceUsd}`);
      
      // Also set per-feed price for compatibility
      try {
        const tx2 = await oracle.setPriceForFeed(feedId, priceWei);
        await tx2.wait();
        console.log(`[setOraclePriceForFeed] Set feedId price: ${priceUsd}`);
      } catch (feedErr) {
        console.warn(`[setOraclePriceForFeed] setPriceForFeed not available, using global only`);
      }
      
      return tx1.hash as string;
    } catch (err) {
      // Fallback to feedId-specific if global doesn't exist
      console.log(`[setOraclePriceForFeed] Using setPriceForFeed only`);
      const tx = await oracle.setPriceForFeed(feedId, priceWei);
      await tx.wait();
      return tx.hash as string;
    }
  }

}