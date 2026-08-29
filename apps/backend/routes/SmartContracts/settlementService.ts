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

// Free, public Base Sepolia RPC. Used for all read-only (view) calls so we
// don't burn Infura's daily request quota on traffic that never needs to
// be signed or broadcast (mark price polling, position snapshots, admin
// monitoring, etc.). Infura is reserved for the wallet/signer below, which
// is only used for the handful of state-changing transactions this service
// actually sends.
const DEFAULT_READ_RPC_URL = "https://sepolia.base.org";

export class SettlementService {
  private contract: ethers.Contract;
  private readContract: ethers.Contract;
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private readProvider: ethers.JsonRpcProvider;
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

    const readRpcUrl = process.env.SETTLEMENT_READ_RPC_URL || DEFAULT_READ_RPC_URL;
    this.readProvider = new ethers.JsonRpcProvider(readRpcUrl);

    // Cast the imported JSON data to our DeploymentAddresses type
    this.deployment = deploymentData as DeploymentAddresses;
    this.settlementAddress = this.deployment.addresses.perpEngine;
    this.usdcAddress = this.deployment.initialConfig.collateralToken;

    console.log(`[SettlementService] Loaded deployment from testnetConData`);
    console.log(`[SettlementService] Network: ${this.deployment.network}`);
    console.log(`[SettlementService] Using settlement contract: ${this.settlementAddress}`);
    console.log(`[SettlementService] Using collateral token: ${this.usdcAddress}`);
    console.log(`[SettlementService] Read-only RPC: ${readRpcUrl}`);

    this.contract = new ethers.Contract(
      this.settlementAddress,
      PerpEngineArtifact.abi, // Use .abi from the artifact
      this.wallet
    );

    // Read-only calls (getMarkPrice, position lookups, params, etc.) go
    // through the free public RPC instead of Infura - see readContract
    // usages below.
    this.readContract = new ethers.Contract(
      this.settlementAddress,
      PerpEngineArtifact.abi,
      this.readProvider
    );
  }

  /**
   * Expose the deployed contract addresses relevant to order signing/settlement.
   * The frontend needs the SettlementEngine address to build a matching EIP-712
   * domain (SettlementEngine is the contract that verifies OrderLib signatures).
   */
  getContractAddresses() {
    return {
      chainId: 84532,
      perpEngine: this.deployment.addresses.perpEngine,
      settlementEngine: this.deployment.addresses.settlementEngine,
      collateralToken: this.deployment.initialConfig.collateralToken,
    };
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
        this.readContract.makerFeeBps(),
        this.readContract.takerFeeBps(),
        this.readContract.insuranceBps(),
        this.readContract.maintenanceMarginBps(),
        this.readContract.liquidationRewardBps(),
        this.readContract.liquidationPenaltyBps(),
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
    return await this.readContract.getMarkPrice();
  }

  async getTraderPositionIds(trader: string): Promise<bigint[]> {
    return await this.readContract.getTraderPositions(trader);
  }

  async getPositionWithPnl(positionId: bigint): Promise<any> {
    return await this.readContract.getPositionWithPnL(positionId);
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
    return await this.readContract.getSubAccountEquity(trader, subAccountId);
  }

  /**
   * Admin monitoring helper: enumerate every position ever created on-chain
   * by walking PerpStorage's nextPositionId counter. Positions are returned
   * as raw structs annotated with a resolved `active` flag so callers can
   * split them into "open" vs "closed" without a second contract call.
   */
  async getAllPositionsFromChain(): Promise<any[]> {
    const perpStorageAbi = [
      "function nextPositionId() view returns (uint256)",
      "function getPosition(uint256) view returns (tuple(address trader, uint8 side, uint256 exposure, uint256 margin, uint256 entryPrice, uint256 liquidationPrice, uint256 bankruptcyPrice, int256 entryFunding, uint8 marginMode, bytes32 marketId, uint256 subAccountId, address collateralToken, bool active))",
    ];
    const perpStorage = new ethers.Contract(this.deployment.addresses.perpStorage, perpStorageAbi, this.readProvider);

    const nextId: bigint = await perpStorage.nextPositionId();
    const total = Number(nextId);

    if (total <= 1) return [];

    const ids = Array.from({ length: total - 1 }, (_, i) => i + 1);
    const positions = await Promise.all(
      ids.map(async (id) => {
        try {
          const position = await perpStorage.getPosition(id);
          if (!position || String(position.trader) === ethers.ZeroAddress) return null;

          const sideValue = Number(position.side);
          return {
            positionId: id.toString(),
            trader: String(position.trader),
            side: sideValue === 0 ? "LONG" : "SHORT",
            marketId: String(position.marketId),
            subAccountId: position.subAccountId.toString(),
            exposureUsd: ethers.formatUnits(position.exposure, 18),
            marginUsd: ethers.formatUnits(position.margin, 18),
            entryPriceUsd: ethers.formatUnits(position.entryPrice, 18),
            liquidationPriceUsd: ethers.formatUnits(position.liquidationPrice, 18),
            active: Boolean(position.active),
          };
        } catch {
          return null;
        }
      })
    );

    return positions.filter((p): p is NonNullable<typeof p> => p !== null);
  }

  /**
   * Admin monitoring helper: query PositionManager's `PositionClosed` events
   * to build a realized-PnL history. Closed positions are removed from the
   * trader's active position array on-chain, so events are the only durable
   * source of realized PnL.
   */
  async getClosedPositionsFromChain(fromBlock?: number, toBlock?: number): Promise<any[]> {
    const positionManagerAbi = [
      "event PositionClosed(uint256 indexed positionId, address indexed trader, int256 pnl, int256 fundingPayment, int256 totalReturn)",
    ];
    const positionManager = new ethers.Contract(
      this.deployment.addresses.positionManager,
      positionManagerAbi,
      this.readProvider
    );

    const latestBlock = await this.readProvider.getBlockNumber();
    const startBlock = fromBlock ?? Math.max(latestBlock - 100_000, 0);
    const endBlock = toBlock ?? latestBlock;

    const filter = positionManager.filters.PositionClosed();
    const events = await positionManager.queryFilter(filter, startBlock, endBlock);

    return events.map((event) => {
      const log = event as ethers.EventLog;
      const args = log.args;
      return {
        positionId: args?.positionId?.toString() ?? "",
        trader: args?.trader ?? "",
        realizedPnlUsd: ethers.formatUnits(args?.pnl ?? 0n, 18),
        fundingPaymentUsd: ethers.formatUnits(args?.fundingPayment ?? 0n, 18),
        totalReturnUsd: ethers.formatUnits(args?.totalReturn ?? 0n, 18),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    });
  }

  async getSubAccounts(trader: string): Promise<unknown[]> {
    return await this.readContract.getSubAccounts(trader);
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