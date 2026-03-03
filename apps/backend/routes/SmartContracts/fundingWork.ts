import { PythService } from "../pyth/pythService";
import { SettlementService } from "../services/settlementService";

const pyth = new PythService();
const settlement = new SettlementService();

export async function updateFunding() {

  const feedId = "YOUR_ETH_USD_FEED_ID";

  const priceFeed = await pyth.getPrice(feedId);
  if (!priceFeed?.ema_price) return;

  const spot =
    priceFeed.price.price * Math.pow(10, priceFeed.price.expo);

  const ema =
    priceFeed.ema_price.price *
    Math.pow(10, priceFeed.ema_price.expo);

  const deviation = (spot - ema) / ema;

  const fundingRate = deviation * 0.5;

  await settlement.updateFunding(fundingRate, -fundingRate);

  console.log("Funding updated:", fundingRate);
}