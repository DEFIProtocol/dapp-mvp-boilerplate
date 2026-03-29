export type ChartSurface = "token" | "crypto" | "futures";
export type ChartView = "candles" | "line";
export type ChartToolType = "pointer" | "trendline" | "fib" | "long" | "short";
export type ChartIndicatorId = "ema9" | "ema21" | "ema50" | "macd" | "rsi" | "volume";

export interface SavedChartSurfacePreferences {
  timeframe: string;
  chartType: ChartView;
  indicators: ChartIndicatorId[];
  activeTool: ChartToolType;
}

export type UserChartPreferences = Record<ChartSurface, SavedChartSurfacePreferences>;

export const DEFAULT_CHART_PREFERENCES: UserChartPreferences = {
  token: {
    timeframe: "24h",
    chartType: "candles",
    indicators: ["ema9", "ema21"],
    activeTool: "pointer"
  },
  crypto: {
    timeframe: "1h",
    chartType: "candles",
    indicators: ["ema9", "ema21", "volume"],
    activeTool: "pointer"
  },
  futures: {
    timeframe: "1h",
    chartType: "candles",
    indicators: ["ema9", "ema21", "volume"],
    activeTool: "pointer"
  }
};

export const CHART_SURFACE_LABELS: Record<ChartSurface, string> = {
  token: "Token",
  crypto: "Crypto",
  futures: "Futures"
};

export const getDefaultChartPreferences = (surface: ChartSurface): SavedChartSurfacePreferences => ({
  ...DEFAULT_CHART_PREFERENCES[surface],
  indicators: [...DEFAULT_CHART_PREFERENCES[surface].indicators]
});
