import WebSocket from 'ws';
import axios from 'axios';
import { klineStore } from '../utils/KlineStore';

const BINANCE_BASE = 'https://api.binance.us/api/v3';
const BINANCE_WS = 'wss://stream.binance.us:9443/ws';

const wsConnections = new Map<string, WebSocket>();

export const fetchHistoricalKlines = async (
  symbol: string,
  interval: string,
  limit = 1000
) => {
  const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));

  const response = await axios.get(`${BINANCE_BASE}/klines`, {
    params: { symbol, interval, limit: safeLimit }
  });

  const candles = response.data.map((k: any[]) => ({
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closed: true
  }));

  klineStore.setHistorical(symbol, interval, candles);
};

export const subscribeToKline = (symbol: string, interval: string) => {
  const key = `${symbol}_${interval}`;
  if (wsConnections.has(key)) return;

  const ws = new WebSocket(
    `${BINANCE_WS}/${symbol.toLowerCase()}@kline_${interval}`
  );

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    const k = parsed.k;

    klineStore.updateLive(symbol, interval, {
      timestamp: k.t,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closed: k.x
    });
  });

  ws.on('close', () => {
    wsConnections.delete(key);
    setTimeout(() => subscribeToKline(symbol, interval), 5000);
  });

  wsConnections.set(key, ws);
};