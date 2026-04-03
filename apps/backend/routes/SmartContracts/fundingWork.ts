import { ethers } from "ethers";
import { PythService } from "../../pricing/pyth/pythService";
import { SettlementService } from "./settlementService";

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

  const marketIdFromEnv = process.env.FUNDING_MARKET_ID;
  const marketId =
    marketIdFromEnv && /^0x[a-fA-F0-9]{64}$/.test(marketIdFromEnv)
      ? marketIdFromEnv
      : ethers.encodeBytes32String("ETH/USD");

  await settlement.updateFundingForMarket(marketId);

  console.log("Funding updated:", { fundingRate, marketId });
}