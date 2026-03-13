// apps/backend/routes/SmartContracts/liquidationWorker.ts
//
// Gate conditions (ALL must pass before any on-chain liquidation call):
//   1. priceAggregator returns a result for the symbol
//   2. Circuit breaker is NOT triggered:
//      - At least one fresh oracle-grade source (Chainlink or Pyth) is available
//      - Chainlink/Pyth spread <= 0.5 %
//      - Oracle index vs CEX median spread <= 2 %
//   3. indexPrice is non-zero
//
// The contract reads its own mark price from MarkPrice.sol (after cutover), which
// is kept in sync by the keeper relayer posting to Oracle.sol. The price used here
// for pre-screening should always agree with what MarkPrice.sol returns.

import { getAggregatedPrice } from '../../utils/priceAggregator';
import { SettlementService } from './settlementService';

const settlement = new SettlementService();

export async function runLiquidations(
  marketSymbol: string,
  positionIds: number[]
): Promise<void> {
  const priceData = await getAggregatedPrice(marketSymbol);

  if (!priceData) {
    console.error(`[liquidationWorker] No aggregator data for ${marketSymbol}`);
    return;
  }

  if (priceData.circuitBreaker.triggered) {
    console.warn(
      `[liquidationWorker] Circuit breaker ACTIVE for ${marketSymbol} — liquidations paused:`,
      priceData.circuitBreaker.reasons
    );
    return;
  }

  if (priceData.indexPrice <= 0) {
    console.error(`[liquidationWorker] Zero index price for ${marketSymbol}`);
    return;
  }

  console.log(
    `[liquidationWorker] ${marketSymbol}` +
    ` index=${priceData.indexPrice}` +
    ` mark=${priceData.markPrice}` +
    ` (chainlink=${priceData.sources.chainlink?.price ?? 'n/a'}` +
    ` pyth=${priceData.sources.pyth?.price ?? 'n/a'})`
  );

  for (const positionId of positionIds) {
    try {
      await settlement.liquidate(positionId, priceData.markPrice);
      console.log(`[liquidationWorker] Liquidated position #${positionId}`);
    } catch {
      // Expected — position is above maintenance margin
    }
  }
}