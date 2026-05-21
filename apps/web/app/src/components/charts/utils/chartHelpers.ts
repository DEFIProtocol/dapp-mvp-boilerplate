import type { Time } from "lightweight-charts";
import type { Candlestick, Palette } from "../types";
import type { SanitizedCandle } from "../../indicators/ema";

export const toChartTime = (timestamp: number): Time => {
  const normalized = timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return normalized as Time;
};

export const toUnixSeconds = (value: unknown): number | null => {
  const raw = typeof value === "string" ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
};

export const sanitizeCandles = (candles: Candlestick[]): SanitizedCandle[] => {
  const mapped: Array<SanitizedCandle | null> = candles.map((candle) => {
    const rawTime = candle.time ?? candle.timestamp;
    const time = toUnixSeconds(rawTime);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const isValidPrice = [open, high, low, close].every((price) => Number.isFinite(price));

    if (time === null || !isValidPrice) {
      return null;
    }

    return {
      time,
      open,
      high,
      low,
      close,
      volume: candle.volume,
    };
  });

  const cleaned = mapped
    .filter((candle): candle is SanitizedCandle => candle !== null)
    .sort((left, right) => left.time - right.time);

  const deduped: SanitizedCandle[] = [];
  for (const candle of cleaned) {
    if (deduped.length === 0 || deduped[deduped.length - 1].time !== candle.time) {
      deduped.push(candle);
    } else {
      deduped[deduped.length - 1] = candle;
    }
  }

  return deduped;
};

export const hasValidKlines = (candles: Candlestick[] | null): boolean => {
  if (!candles || candles.length === 0) return false;
  return candles.some(candle => 
    candle.open !== candle.high || 
    candle.open !== candle.low || 
    candle.open !== candle.close
  );
};

export const mapTimeframeToCoinRanking = (timeframe: string): '24h' | '7d' | '30d' => {
  const map: Record<string, '24h' | '7d' | '30d'> = {
    '1h': '24h',
    '4h': '24h',
    '24h': '24h',
    '7d': '7d',
    '30d': '30d',
  };
  return map[timeframe] || '24h';
};

export const getPalette = (mode: "light" | "dark"): Palette => {
  if (mode === "light") {
    return {
      chartBackground: "#ffffff",
      chartText: "#0f172a",
      grid: "#e2e8f0",
      border: "#cbd5e1",
      headerText: "#475569",
      activeButtonBg: "#f1f5f9",
      activeButtonText: "#0f172a",
      accent: "#2563eb",
      headerSurface: "#f8fafc",
      buttonBorder: "#cbd5e1",
      loadingOverlay: "rgba(248,250,252,0.72)",
      panelShadow: "0 8px 24px rgba(15,23,42,0.12)",
    };
  }

  return {
    chartBackground: "#0f172a",
    chartText: "#d1d5db",
    grid: "#1f2937",
    border: "#334155",
    headerText: "#94a3b8",
    activeButtonBg: "#111827",
    activeButtonText: "#e2e8f0",
    accent: "#60a5fa",
    headerSurface: "#111827",
    buttonBorder: "#334155",
    loadingOverlay: "rgba(15,23,42,0.6)",
    panelShadow: "0 8px 24px rgba(0,0,0,0.35)",
  };
};

export const formatIndicatorValue = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toFixed(2);
};

export const latest = (data: Array<{ value: number }>): number | null =>
  data.length ? data[data.length - 1].value : null;