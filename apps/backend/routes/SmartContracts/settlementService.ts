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
    const infuraApiKey = requireEnv("INFURA_API_KEY", process.env.INFURA_API_KEY);
    const privateKey = requireEnv("EVM_PRIVATE_KEY", process.env.EVM_PRIVATE_KEY);
    const adminAddress = requireEnv("ADMIN_ADDRESS", process.env.ADMIN_ADDRESS);

    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("Invalid EVM_PRIVATE_KEY format. Expected a 32-byte hex key prefixed with 0x.");
    }

    const provider = new ethers.JsonRpcProvider(`https://base-sepolia.infura.io/v3/${infuraApiKey}`);
    const wallet = new ethers.Wallet(privateKey, provider);

    this.contract = new ethers.Contract(
      adminAddress,
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