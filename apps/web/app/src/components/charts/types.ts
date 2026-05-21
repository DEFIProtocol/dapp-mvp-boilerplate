import type { ReactNode } from "react";
import type { ChartIndicatorId, ChartSurface, ChartToolType, ChartView } from "@/lib/chartPreferences";
import type { DrawPoint, Drawing, DragState, HandleType, PositionDrawing } from "./tools/drawing";

export interface Candlestick {
  time?: number;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type TimeframeOption = string | { label: string; value: string };

export interface UnifiedPriceChartProps {
  candles: Candlestick[] | null;
  symbol: string;
  exchange: string;
  surface: ChartSurface;
  onTimeframeChange: (timeframe: string) => void;
  selectedTimeframe: string;
  isLoading: boolean;
  height?: number;
  timeframeOptions?: TimeframeOption[];
}

export interface Palette {
  chartBackground: string;
  chartText: string;
  grid: string;
  border: string;
  headerText: string;
  activeButtonBg: string;
  activeButtonText: string;
  accent: string;
  headerSurface: string;
  buttonBorder: string;
  loadingOverlay: string;
  panelShadow: string;
}

export interface ChartState {
  chartView: ChartView;
  enabledIndicators: ChartIndicatorId[];
  activeTool: ChartToolType;
  showIndicatorsPanel: boolean;
  showToolsPanel: boolean;
  indicatorQuery: string;
  drawings: Drawing[];
  draftStart: DrawPoint | null;
  draftPoint: DrawPoint | null;
  selectedDrawingId: string | null;
  dragState: DragState | null;
}