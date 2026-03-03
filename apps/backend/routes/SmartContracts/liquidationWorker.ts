import { PythService } from "../pyth/pythService";
import { SettlementService } from "../services/settlementService";

const pyth = new PythService();
const settlement = new SettlementService();

export async function runLiquidations() {

  const feedId = "YOUR_ETH_USD_FEED_ID";

  const priceFeed = await pyth.getPrice(feedId);

  if (!priceFeed) return;

  const markPrice =
    priceFeed.price.price * Math.pow(10, priceFeed.price.expo);

  console.log("Mark Price:", markPrice);

  // Example: scan open positions from DB
  const openPositions = [0, 1, 2]; // replace with real DB lookup

  for (const id of openPositions) {
    try {
      await settlement.liquidate(id, markPrice);
      console.log("Liquidated position:", id);
    } catch (err) {
      console.log("Position safe:", id);
    }
  }
}