import { ethers } from "ethers";
import settlementAbi from "../../../contracts/artifacts/contracts/PerpSettlement.sol/PerpSettlement.json";

export class SettlementService {

  private contract;

  constructor() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

    this.contract = new ethers.Contract(
      process.env.SETTLEMENT_ADDRESS!,
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
}