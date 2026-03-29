import type { Time } from "lightweight-charts";
import type { ChartIndicatorId } from "@/lib/chartPreferences";

export interface SanitizedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | undefined;
}

export interface ChartIndicatorDefinition {
  id: ChartIndicatorId;
  label: string;
  description: string;
  implemented: boolean;
}

const toChartTime = (timestamp: number): Time => {
  const normalized = timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return normalized as Time;
};

export const calculateEmaSeries = (
  candles: SanitizedCandle[],
  period: number
): Array<{ time: Time; value: number }> => {
  if (!candles.length) return [];

  const multiplier = 2 / (period + 1);
  let current = candles[0].close;

  return candles.map((candle, index) => {
    if (index === 0) current = candle.close;
    else current = (candle.close - current) * multiplier + current;

    return { time: toChartTime(candle.time), value: current };
  });
};

export const EMA_INDICATORS: ChartIndicatorDefinition[] = [
  {
    id: "ema9",
    label: "EMA 9",
    description: "Fast exponential moving average",
    implemented: true
  },
  {
    id: "ema21",
    label: "EMA 21",
    description: "Medium exponential moving average",
    implemented: true
  },
  {
    id: "ema50",
    label: "EMA 50",
    description: "Slow exponential moving average",
    implemented: true
  }
];
