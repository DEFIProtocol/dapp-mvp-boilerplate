import type { TimeframeOption, ChartIndicatorId, ChartToolType } from "./types";
import type { SanitizedCandle } from "./indicators/ema";
import { CHART_INDICATORS } from "./indicators";
import { CHART_TOOLS } from "./tools";

export const DEFAULT_TOKEN_TIMEFRAMES: TimeframeOption[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
];

export const TOOL_IDS = new Set<ChartToolType>(["pointer", "trendline", "fib", "long", "short"]);
export const INDICATOR_IDS = new Set<ChartIndicatorId>(["ema9", "ema21", "ema50", "macd", "rsi", "volume"]);

export const HANDLE_RADIUS = 6;
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];