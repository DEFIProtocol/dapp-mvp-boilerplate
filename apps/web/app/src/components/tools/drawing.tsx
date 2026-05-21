import type { ChartSurface } from "@/lib/chartPreferences";

export type DrawPoint = { time: number; price: number };
export type TrendlineDrawing = { id: string; kind: "trendline"; start: DrawPoint; end: DrawPoint };
export type FibDrawing = { id: string; kind: "fib"; start: DrawPoint; end: DrawPoint };
export type PositionDrawing = {
  id: string;
  kind: "long" | "short";
  entry: DrawPoint;
  stop: DrawPoint;
  targetPrice: number;
};
export type Drawing = TrendlineDrawing | FibDrawing | PositionDrawing;
export type HandleType = "start" | "end" | "entry" | "stop" | "target";
export type DragState = { drawingId: string; handle: HandleType };

export const HANDLE_RADIUS = 6;
export const TRENDLINE_TOOL_ID = "trendline" as const;

export const getChartDrawingsStorageKey = (surface: ChartSurface, symbol: string): string =>
  `chart-drawings:${surface}:${String(symbol || "UNKNOWN").toUpperCase()}`;

export const parseStoredDrawings = (raw: string | null): Drawing[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Drawing[]) : [];
  } catch {
    return [];
  }
};
