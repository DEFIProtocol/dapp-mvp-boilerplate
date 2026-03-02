import axios from 'axios';
import WebSocket from 'ws';
import { klineStore } from '../utils/KlineStore';

const BASE = 'https://api.exchange.coinbase.com';
const WS_URL = 'wss://ws-feed.exchange.coinbase.com';

let ws: WebSocket | null = null;

export const fetchCoinbaseCandles = async (
  product_id: string,
  granularity: number,
  limit = 1000
) => {
  const MAX_LIMIT = 1000;
  const COINBASE_BATCH_SIZE = 300;
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const allCandles: any[] = [];
  let end = nowSeconds;

  while (allCandles.length < safeLimit) {
    const remaining = safeLimit - allCandles.length;
    const batchSize = Math.min(COINBASE_BATCH_SIZE, remaining);
    const batchWindowSeconds = batchSize * granularity;
    const start = end - batchWindowSeconds;

    const response = await axios.get(
      `${BASE}/products/${product_id}/candles`,
      {
        params: {
          granularity,
          start: new Date(start * 1000).toISOString(),
          end: new Date(end * 1000).toISOString(),
        }
      }
    );

    const batch = Array.isArray(response.data) ? response.data : [];
    if (batch.length === 0) break;

    allCandles.push(...batch);
    end = start - granularity;

    if (batch.length < batchSize) {
      break;
    }
  }

  const uniqueByTimestamp = new Map<number, any[]>();
  for (const candle of allCandles) {
    const ts = Number(candle[0]);
    if (!Number.isNaN(ts)) {
      uniqueByTimestamp.set(ts, candle);
    }
  }

  const candles = [...uniqueByTimestamp.values()]
    .sort((left, right) => left[0] - right[0])
    .slice(-safeLimit)
    .map((c: any[]) => ({
      timestamp: c[0] * 1000,
      low: c[1],
      high: c[2],
      open: c[3],
      close: c[4],
      volume: c[5],
      closed: true
    }));

  const symbol = product_id.replace('-USD', '') + 'USDT';

  klineStore.setHistorical(symbol, `${granularity}s`, candles);
};

export const subscribeCoinbaseTicker = (product_id: string) => {
  if (!ws) {
    ws = new WebSocket(WS_URL);
  }

  ws.on('open', () => {
    ws?.send(JSON.stringify({
      type: 'subscribe',
      product_ids: [product_id],
      channels: ['ticker']
    }));
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type !== 'ticker') return;

    const symbol = product_id.replace('-USD', '') + 'USDT';
    const now = Date.now();

    klineStore.updateLive(symbol, '1m', {
      timestamp: now - (now % 60000),
      open: parseFloat(data.price),
      high: parseFloat(data.price),
      low: parseFloat(data.price),
      close: parseFloat(data.price),
      volume: parseFloat(data.volume_24h || '0'),
      closed: false
    });
  });
};