import type { ChartIndicatorId } from "@/lib/chartPreferences";
import { EMA_INDICATORS, type ChartIndicatorDefinition } from "./ema";
import { MACD_INDICATOR } from "./macd";
import { RSI_INDICATOR } from "./rsi";

export const VOLUME_INDICATOR: ChartIndicatorDefinition = {
  id: "volume",
  label: "Volume",
  description: "Volume histogram",
  implemented: true
};

export const CHART_INDICATORS: ChartIndicatorDefinition[] = [
  ...EMA_INDICATORS,
  MACD_INDICATOR,
  RSI_INDICATOR,
  VOLUME_INDICATOR
].sort((left, right) => left.label.localeCompare(right.label));

export const IMPLEMENTED_CHART_INDICATORS = new Set<ChartIndicatorId>(
  CHART_INDICATORS.filter((indicator) => indicator.implemented).map((indicator) => indicator.id)
);

export const isImplementedIndicator = (indicatorId: ChartIndicatorId): boolean =>
  IMPLEMENTED_CHART_INDICATORS.has(indicatorId);
