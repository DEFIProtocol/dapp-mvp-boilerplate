import { ethers } from "ethers";
import settlementAbi from "../../../contracts/artifacts/contracts/PerpSettlement.sol/PerpSettlement.json";

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

export class SettlementService {

  private contract: ethers.Contract;

  constructor() {
    const infuraApiKey = requireEnv(
      "INFURA_PRIVATE_KEY or INFURA_API_KEY",
      process.env.INFURA_PRIVATE_KEY ?? process.env.INFURA_API_KEY
    );
    const privateKey = requireEnv("EVM_PRIVATE_KEY", process.env.EVM_PRIVATE_KEY);
    const settlementAddress = requireEnv(
      "SETTLEMENT_ADDRESS or ADMIN_ADDRESS",
      process.env.SETTLEMENT_ADDRESS ?? process.env.ADMIN_ADDRESS
    );

    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("Invalid EVM_PRIVATE_KEY format. Expected a 32-byte hex key prefixed with 0x.");
    }

    const provider = new ethers.JsonRpcProvider(`https://base-sepolia.infura.io/v3/${infuraApiKey}`);
    const wallet = new ethers.Wallet(privateKey, provider);

    this.contract = new ethers.Contract(
      settlementAddress,
      settlementAbi.abi,
      wallet
    );
  }

  async liquidate(positionId: number, markPrice: number) {
    const tx = await this.contract.liquidateWithPrice(
      positionId,
      ethers.parseUnits(markPrice.toString(), 18)
    );

    await tx.wait();
    return tx.hash;
  }

  async updateFunding(longFunding: number, shortFunding: number) {
    const parseSignedRate = (value: number) => {
      const sign = value < 0 ? "-" : "";
      const absolute = Math.abs(value).toString();
      return ethers.parseUnits(`${sign}${absolute}`, 18);
    };

    const tx = await this.contract.updateFunding(
      parseSignedRate(longFunding),
      parseSignedRate(shortFunding)
    );

    await tx.wait();
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

  async getTraderPositionSnapshots(trader: string) {
    const positionIds = await this.getTraderPositionIds(trader);
    const snapshots = await Promise.all(
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

    return snapshots;
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
}