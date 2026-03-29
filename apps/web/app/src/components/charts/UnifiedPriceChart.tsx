"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useAccount } from "wagmi";
import { useTheme } from "@/contexts/ThemeContext";
import { useUser } from "@/contexts/UserContext";
import { patchUserPreferencesByWallet } from "@/lib/api/users";
import {
  type ChartIndicatorId,
  type ChartSurface,
  type ChartToolType,
  type ChartView,
  getDefaultChartPreferences,
} from "@/lib/chartPreferences";
import { CHART_INDICATORS, isImplementedIndicator } from "./indicators";
import { calculateEmaSeries, type SanitizedCandle } from "./indicators/ema";
import { CHART_TOOLS } from "./tools";
import {
  type DragState,
  type DrawPoint,
  type Drawing,
  type HandleType,
  type PositionDrawing,
  HANDLE_RADIUS,
  getChartDrawingsStorageKey,
  parseStoredDrawings,
} from "./tools/drawing";
import { FIB_LEVELS } from "./tools/fibRetracement";
import { buildPositionDrawing } from "./tools/longPnl";

interface Candlestick {
  time?: number;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type TimeframeOption = string | { label: string; value: string };

interface UnifiedPriceChartProps {
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

const DEFAULT_TOKEN_TIMEFRAMES: TimeframeOption[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
];

const TOOL_IDS = new Set<ChartToolType>(["pointer", "trendline", "fib", "long", "short"]);
const INDICATOR_IDS = new Set<ChartIndicatorId>(["ema9", "ema21", "ema50", "macd", "rsi", "volume"]);

const toChartTime = (timestamp: number): Time => {
  const normalized = timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return normalized as Time;
};

const latest = (data: Array<{ value: number }>): number | null =>
  data.length ? data[data.length - 1].value : null;

const toUnixSeconds = (value: unknown): number | null => {
  const raw = typeof value === "string" ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
};

const sanitizeCandles = (candles: Candlestick[]): SanitizedCandle[] => {
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

const CandleIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <line x1="4" y1="1.5" x2="4" y2="12.5" stroke={color} strokeWidth="1.2" />
    <rect x="2.7" y="4" width="2.6" height="5" rx="0.8" fill={color} />
    <line x1="10" y1="1.5" x2="10" y2="12.5" stroke={color} strokeWidth="1.2" />
    <rect x="8.7" y="6" width="2.6" height="3.7" rx="0.8" fill={color} />
  </svg>
);

const LineChartIcon = ({ color }: { color: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <polyline
      points="1.5,10.5 4.5,7.5 7.2,8.6 12.5,3.5"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="4.5" cy="7.5" r="0.9" fill={color} />
    <circle cx="12.5" cy="3.5" r="0.9" fill={color} />
  </svg>
);

const PositionIcon = ({ type }: { type: "long" | "short" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3" y="2" width="10" height="5" rx="1" fill={type === "long" ? "#10b981" : "#334155"} />
    <rect x="3" y="9" width="10" height="5" rx="1" fill={type === "short" ? "#ef4444" : "#334155"} />
  </svg>
);

const DrawToolIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 12.2L11.8 3.4L12.6 4.2L3.8 13H3V12.2Z" fill={color} />
    <path d="M10.9 2.6L12.4 1.1L14.1 2.8L12.6 4.3L10.9 2.6Z" fill={color} />
    <path d="M2.8 13.2L5.1 12.8L3.2 14.7L1.3 15.1L2.8 13.2Z" fill={color} />
  </svg>
);

const FibToolIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="2" y1="3" x2="14" y2="3" stroke={color} strokeWidth="1.3" />
    <line x1="3" y1="6" x2="13" y2="6" stroke={color} strokeWidth="1.3" />
    <line x1="2" y1="9" x2="14" y2="9" stroke={color} strokeWidth="1.3" />
    <line x1="4" y1="12" x2="12" y2="12" stroke={color} strokeWidth="1.3" />
  </svg>
);

const TOOL_ICON_BY_ID: Record<ChartToolType, ReactNode> = {
  pointer: <span style={{ fontSize: 15 }}>↖</span>,
  trendline: <DrawToolIcon color="currentColor" />,
  fib: <FibToolIcon color="currentColor" />,
  long: <PositionIcon type="long" />,
  short: <PositionIcon type="short" />,
};

const formatIndicatorValue = (value: number | null): string | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toFixed(2);
};

export function UnifiedPriceChart({
  candles,
  symbol,
  exchange,
  surface,
  onTimeframeChange,
  selectedTimeframe,
  isLoading,
  height = 450,
  timeframeOptions = DEFAULT_TOKEN_TIMEFRAMES,
}: UnifiedPriceChartProps) {
  const { theme } = useTheme();
  const { user } = useUser();
  const { address } = useAccount();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const hydratedSurfaceRef = useRef<string | null>(null);
  const lastFitRef = useRef<string | null>(null);

  const [chartView, setChartView] = useState<ChartView>("candles");
  const [enabledIndicators, setEnabledIndicators] = useState<ChartIndicatorId[]>([]);
  const [activeTool, setActiveTool] = useState<ChartToolType>("pointer");
  const [showIndicatorsPanel, setShowIndicatorsPanel] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [indicatorQuery, setIndicatorQuery] = useState("");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draftStart, setDraftStart] = useState<DrawPoint | null>(null);
  const [draftPoint, setDraftPoint] = useState<DrawPoint | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const normalizedTimeframes = useMemo(
    () => timeframeOptions.map((item) => (typeof item === "string" ? { label: item, value: item } : item)),
    [timeframeOptions]
  );
  const sanitizedCandles = useMemo(() => sanitizeCandles(candles ?? []), [candles]);
  const ema9 = useMemo(() => calculateEmaSeries(sanitizedCandles, 9), [sanitizedCandles]);
  const ema21 = useMemo(() => calculateEmaSeries(sanitizedCandles, 21), [sanitizedCandles]);
  const ema50 = useMemo(() => calculateEmaSeries(sanitizedCandles, 50), [sanitizedCandles]);
  const indicatorSet = useMemo(() => new Set(enabledIndicators), [enabledIndicators]);
  const selectedIndicatorsCount = enabledIndicators.filter((indicatorId) => isImplementedIndicator(indicatorId)).length;
  const drawingStorageKey = useMemo(() => getChartDrawingsStorageKey(surface, symbol), [surface, symbol]);
  const dataFitKey = useMemo(
    () => `${surface}:${symbol}:${selectedTimeframe}:${sanitizedCandles[0]?.time ?? "none"}:${sanitizedCandles.length}`,
    [sanitizedCandles, selectedTimeframe, surface, symbol]
  );

  const currentSurfacePreferences = useMemo(
    () => ({
      timeframe: selectedTimeframe,
      chartType: chartView,
      indicators: enabledIndicators,
      activeTool,
    }),
    [activeTool, chartView, enabledIndicators, selectedTimeframe]
  );

  const filteredIndicators = useMemo(() => {
    const query = indicatorQuery.trim().toLowerCase();
    if (!query) return CHART_INDICATORS;

    return CHART_INDICATORS.filter((indicator) => {
      const haystack = `${indicator.label} ${indicator.description}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [indicatorQuery]);

  const palette = useMemo(() => {
    if (theme === "light") {
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
  }, [theme]);

  const timeToUnix = (time: Time): number => {
    if (typeof time === "number") return Math.floor(time);
    const business = time as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(business.year, business.month - 1, business.day) / 1000);
  };

  const pointFromMouse = (event: React.MouseEvent<HTMLDivElement>): DrawPoint | null => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    const priceSeries = candleSeriesRef.current ?? lineSeriesRef.current;
    if (!container || !chart || !priceSeries) return null;

    const rect = container.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

    const time = chart.timeScale().coordinateToTime(x);
    const price = priceSeries.coordinateToPrice(y);
    if (time == null || price == null) return null;

    return { time: timeToUnix(time), price };
  };

  const pointToCoords = (point: DrawPoint): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const priceSeries = candleSeriesRef.current ?? lineSeriesRef.current;
    if (!chart || !priceSeries) return null;

    const x = chart.timeScale().timeToCoordinate(point.time as Time);
    const y = priceSeries.priceToCoordinate(point.price);
    if (x == null || y == null) return null;

    return { x, y };
  };

  const mouseToLocal = (event: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
    const container = chartContainerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    };
  };

  const distanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

    const ratio = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projectedX = x1 + ratio * dx;
    const projectedY = y1 + ratio * dy;
    return Math.hypot(px - projectedX, py - projectedY);
  };

  const getPositionBounds = (drawing: PositionDrawing) => {
    const entry = pointToCoords(drawing.entry);
    const stop = pointToCoords(drawing.stop);
    const target = pointToCoords({ time: drawing.entry.time, price: drawing.targetPrice });
    if (!entry || !stop || !target) return null;

    const left = Math.min(entry.x, stop.x);
    const rawRight = Math.max(entry.x, stop.x);
    const right = rawRight - left < 70 ? left + 70 : rawRight;
    return { entry, stop, target, left, right };
  };

  const findHandleHit = (x: number, y: number): DragState | null => {
    for (let index = drawings.length - 1; index >= 0; index -= 1) {
      const drawing = drawings[index];

      if (drawing.kind === "trendline" || drawing.kind === "fib") {
        const start = pointToCoords(drawing.start);
        const end = pointToCoords(drawing.end);
        if (!start || !end) continue;
        if (Math.hypot(x - start.x, y - start.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "start" };
        if (Math.hypot(x - end.x, y - end.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "end" };
      }

      if (drawing.kind === "long" || drawing.kind === "short") {
        const bounds = getPositionBounds(drawing);
        if (!bounds) continue;
        if (Math.hypot(x - bounds.right, y - bounds.entry.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "entry" };
        if (Math.hypot(x - bounds.right, y - bounds.stop.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "stop" };
        if (Math.hypot(x - bounds.right, y - bounds.target.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "target" };
      }
    }

    return null;
  };

  const findDrawingHit = (x: number, y: number): string | null => {
    for (let index = drawings.length - 1; index >= 0; index -= 1) {
      const drawing = drawings[index];

      if (drawing.kind === "trendline") {
        const start = pointToCoords(drawing.start);
        const end = pointToCoords(drawing.end);
        if (!start || !end) continue;
        if (distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= 6) return drawing.id;
      }

      if (drawing.kind === "fib") {
        const start = pointToCoords(drawing.start);
        const end = pointToCoords(drawing.end);
        if (!start || !end) continue;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        if (x >= minX - 8 && x <= maxX + 20) {
          const high = Math.max(drawing.start.price, drawing.end.price);
          const low = Math.min(drawing.start.price, drawing.end.price);
          for (const level of FIB_LEVELS) {
            const coord = pointToCoords({ time: drawing.start.time, price: low + (high - low) * level });
            if (coord && Math.abs(y - coord.y) <= 6) return drawing.id;
          }
        }
      }

      if (drawing.kind === "long" || drawing.kind === "short") {
        const bounds = getPositionBounds(drawing);
        if (!bounds) continue;
        if (x >= bounds.left && x <= bounds.right) {
          if (Math.abs(y - bounds.entry.y) <= 7 || Math.abs(y - bounds.stop.y) <= 7 || Math.abs(y - bounds.target.y) <= 7) {
            return drawing.id;
          }
        }
      }
    }

    return null;
  };

  const updateDrawingByHandle = (drawing: Drawing, handle: HandleType, point: DrawPoint): Drawing => {
    if (drawing.kind === "trendline" || drawing.kind === "fib") {
      if (handle === "start") return { ...drawing, start: point };
      if (handle === "end") return { ...drawing, end: point };
      return drawing;
    }

    if (drawing.kind === "long" || drawing.kind === "short") {
      if (handle === "entry") return { ...drawing, entry: { ...drawing.entry, price: point.price } };
      if (handle === "stop") return { ...drawing, stop: { ...drawing.stop, price: point.price } };
      if (handle === "target") return { ...drawing, targetPrice: point.price };
    }

    return drawing;
  };

  const adjustZoom = (multiplier: number) => {
    if (!chartRef.current) return;
    const currentSpacing = chartRef.current.options().timeScale?.barSpacing ?? 6;
    chartRef.current.applyOptions({
      timeScale: {
        barSpacing: Math.max(2, Math.min(60, currentSpacing * multiplier)),
      },
    });
  };

  const toggleIndicator = (indicatorId: ChartIndicatorId) => {
    if (!isImplementedIndicator(indicatorId)) return;

    setEnabledIndicators((current) =>
      current.includes(indicatorId)
        ? current.filter((value) => value !== indicatorId)
        : [...current, indicatorId].sort((left, right) => left.localeCompare(right))
    );
  };

  const getDraftDrawing = (): Drawing | null => {
    if (!draftStart || !draftPoint) return null;
    if (activeTool === "trendline") return { id: "draft", kind: "trendline", start: draftStart, end: draftPoint };
    if (activeTool === "fib") return { id: "draft", kind: "fib", start: draftStart, end: draftPoint };
    if (activeTool === "long" || activeTool === "short") return buildPositionDrawing(activeTool, draftStart, draftPoint);
    return null;
  };

  const isSelected = (drawingId: string) => selectedDrawingId === drawingId;

  useEffect(() => {
    const base = getDefaultChartPreferences(surface);
    const saved = user?.preferences?.chart?.[surface];
    const nextIndicators = Array.isArray(saved?.indicators)
      ? saved.indicators.filter((indicatorId): indicatorId is ChartIndicatorId => {
          return typeof indicatorId === "string" && INDICATOR_IDS.has(indicatorId as ChartIndicatorId);
        })
      : base.indicators;
    const nextTool = typeof saved?.activeTool === "string" && TOOL_IDS.has(saved.activeTool as ChartToolType)
      ? (saved.activeTool as ChartToolType)
      : base.activeTool;
    const nextView = saved?.chartType === "line" || saved?.chartType === "candles" ? saved.chartType : base.chartType;
    const next = {
      timeframe: typeof saved?.timeframe === "string" && saved.timeframe ? saved.timeframe : base.timeframe,
      chartType: nextView,
      indicators: nextIndicators,
      activeTool: nextTool,
    };

    setChartView(next.chartType);
    setEnabledIndicators(next.indicators);
    setActiveTool(next.activeTool);
    lastPersistedRef.current = JSON.stringify(next);
    hydratedSurfaceRef.current = `${user?.id ?? "anon"}:${surface}`;

    if (next.timeframe !== selectedTimeframe) {
      onTimeframeChange(next.timeframe);
    }
  }, [onTimeframeChange, selectedTimeframe, surface, user?.id, user?.preferences?.chart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDrawings(parseStoredDrawings(window.localStorage.getItem(drawingStorageKey)));
    setSelectedDrawingId(null);
    setDraftStart(null);
    setDraftPoint(null);
    setDragState(null);
  }, [drawingStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(drawingStorageKey, JSON.stringify(drawings));
  }, [drawingStorageKey, drawings]);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!address || !user?.id) return;
    if (hydratedSurfaceRef.current !== `${user.id}:${surface}`) return;

    const serialized = JSON.stringify(currentSurfacePreferences);
    if (serialized === lastPersistedRef.current) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      patchUserPreferencesByWallet(address, {
        chart: {
          [surface]: currentSurfacePreferences,
        },
      } as any).then((result) => {
        if (result) {
          lastPersistedRef.current = serialized;
        }
      });
    }, 350);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [address, currentSurfacePreferences, surface, user?.id]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: palette.chartBackground },
        textColor: palette.chartText,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      width: Math.max(chartContainerRef.current.clientWidth, 320),
      height,
      crosshair: {
        mode: activeTool === "pointer" ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      priceLineVisible: false,
    });
    const ema9Series = chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 2, priceLineVisible: false });
    const ema21Series = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false });
    const ema50Series = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, priceLineVisible: false });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
      base: 0,
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    lineSeriesRef.current = lineSeries;
    ema9Ref.current = ema9Series;
    ema21Ref.current = ema21Series;
    ema50Ref.current = ema50Series;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: Math.max(chartContainerRef.current.clientWidth, 320) });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
      ema50Ref.current = null;
      volumeRef.current = null;
    };
  }, [activeTool, height, palette.chartBackground, palette.chartText, palette.grid]);

  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;

    chartRef.current.applyOptions({
      height,
      width: Math.max(chartContainerRef.current.clientWidth, 320),
      layout: {
        background: { type: ColorType.Solid, color: palette.chartBackground },
        textColor: palette.chartText,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
      },
      timeScale: {
        borderColor: palette.border,
      },
      crosshair: {
        mode: activeTool === "pointer" ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [activeTool, height, palette]);

  useEffect(() => {
    setDraftStart(null);
    setDraftPoint(null);
  }, [activeTool]);

  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartView === "candles" });
    lineSeriesRef.current?.applyOptions({ visible: chartView === "line" });
    ema9Ref.current?.applyOptions({ visible: indicatorSet.has("ema9") });
    ema21Ref.current?.applyOptions({ visible: indicatorSet.has("ema21") });
    ema50Ref.current?.applyOptions({ visible: indicatorSet.has("ema50") });
    volumeRef.current?.applyOptions({ visible: indicatorSet.has("volume") });
  }, [chartView, indicatorSet]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const formattedCandles: CandlestickData<Time>[] = sanitizedCandles.map((candle) => ({
      time: toChartTime(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candleSeriesRef.current.setData(formattedCandles);
    lineSeriesRef.current?.setData(
      sanitizedCandles.map((candle) => ({
        time: toChartTime(candle.time),
        value: candle.close,
      }))
    );
    ema9Ref.current?.setData(ema9);
    ema21Ref.current?.setData(ema21);
    ema50Ref.current?.setData(ema50);
    volumeRef.current?.setData(
      sanitizedCandles.map((candle) => ({
        time: toChartTime(candle.time),
        value: candle.volume ?? 0,
        color: candle.close >= candle.open ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)",
      }))
    );

    if (sanitizedCandles.length > 0 && lastFitRef.current !== dataFitKey) {
      chartRef.current?.timeScale().fitContent();
      lastFitRef.current = dataFitKey;
    }
  }, [dataFitKey, ema9, ema21, ema50, sanitizedCandles]);

  const onOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "pointer") {
      const local = mouseToLocal(event);
      if (!local) return;

      const handle = findHandleHit(local.x, local.y);
      if (handle) {
        setSelectedDrawingId(handle.drawingId);
        setDragState(handle);
        return;
      }

      const drawingId = findDrawingHit(local.x, local.y);
      setSelectedDrawingId(drawingId);
      return;
    }

    const point = pointFromMouse(event);
    if (!point) return;

    if (!draftStart) {
      setDraftStart(point);
      setDraftPoint(point);
      return;
    }

    if (activeTool === "trendline") {
      setDrawings((current) => [...current, { id: `${Date.now()}-${Math.random()}`, kind: "trendline", start: draftStart, end: point }]);
    }

    if (activeTool === "fib") {
      setDrawings((current) => [...current, { id: `${Date.now()}-${Math.random()}`, kind: "fib", start: draftStart, end: point }]);
    }

    if (activeTool === "long" || activeTool === "short") {
      setDrawings((current) => [...current, buildPositionDrawing(activeTool, draftStart, point)]);
    }

    setDraftStart(null);
    setDraftPoint(null);
  };

  const onOverlayMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "pointer" && dragState) {
      const point = pointFromMouse(event);
      if (!point) return;
      setDrawings((current) =>
        current.map((drawing) =>
          drawing.id === dragState.drawingId ? updateDrawingByHandle(drawing, dragState.handle, point) : drawing
        )
      );
      return;
    }

    if (!draftStart || activeTool === "pointer") return;
    const point = pointFromMouse(event);
    if (!point) return;
    setDraftPoint(point);
  };

  const onOverlayMouseUp = () => {
    setDragState(null);
  };

  const onOverlayMouseLeave = () => {
    setDragState(null);
  };

  const onOverlayWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    adjustZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const clearDrawings = () => {
    setDrawings([]);
    setDraftStart(null);
    setDraftPoint(null);
    setSelectedDrawingId(null);
    setDragState(null);
  };

  const deleteSelectedDrawing = () => {
    if (!selectedDrawingId) return;
    setDrawings((current) => current.filter((drawing) => drawing.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  };

  const renderTrendline = (drawing: Extract<Drawing, { kind: "trendline" }>, draft = false) => {
    const start = pointToCoords(drawing.start);
    const end = pointToCoords(drawing.end);
    if (!start || !end) return null;

    const selected = isSelected(drawing.id) && !draft;
    return (
      <g key={draft ? "draft-trendline" : drawing.id}>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={draft ? palette.accent : "#38bdf8"}
          strokeWidth={selected ? 2.6 : 2}
          strokeOpacity={draft ? 0.65 : 0.95}
        />
        {selected ? (
          <>
            <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        ) : null}
      </g>
    );
  };

  const renderFib = (drawing: Extract<Drawing, { kind: "fib" }>, draft = false) => {
    const start = pointToCoords(drawing.start);
    const end = pointToCoords(drawing.end);
    if (!start || !end) return null;

    const high = Math.max(drawing.start.price, drawing.end.price);
    const low = Math.min(drawing.start.price, drawing.end.price);
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const selected = isSelected(drawing.id) && !draft;

    return (
      <g key={draft ? "draft-fib" : drawing.id}>
        {FIB_LEVELS.map((level) => {
          const coord = pointToCoords({ time: drawing.start.time, price: low + (high - low) * level });
          if (!coord) return null;
          return (
            <g key={`${drawing.id}-${level}`}>
              <line
                x1={minX}
                y1={coord.y}
                x2={maxX}
                y2={coord.y}
                stroke={draft ? palette.accent : "#f59e0b"}
                strokeWidth={selected ? 2.2 : 1.5}
                strokeOpacity={draft ? 0.6 : 0.85}
              />
              <text x={maxX + 6} y={coord.y - 2} fill={palette.headerText} fontSize="10">
                {level.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}
              </text>
            </g>
          );
        })}
        {selected ? (
          <>
            <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        ) : null}
      </g>
    );
  };

  const renderPosition = (drawing: Extract<Drawing, { kind: "long" | "short" }>, draft = false) => {
    const bounds = getPositionBounds(drawing);
    if (!bounds) return null;

    const selected = isSelected(drawing.id) && !draft;
    const isLong = drawing.kind === "long";
    const targetTop = Math.min(bounds.entry.y, bounds.target.y);
    const targetHeight = Math.abs(bounds.target.y - bounds.entry.y);
    const stopTop = Math.min(bounds.entry.y, bounds.stop.y);
    const stopHeight = Math.abs(bounds.stop.y - bounds.entry.y);
    const entryColor = isLong ? "#10b981" : "#ef4444";
    const riskColor = isLong ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.18)";
    const rewardColor = isLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";

    return (
      <g key={draft ? `draft-${drawing.kind}` : drawing.id}>
        <rect x={bounds.left} y={targetTop} width={bounds.right - bounds.left} height={targetHeight} fill={rewardColor} />
        <rect x={bounds.left} y={stopTop} width={bounds.right - bounds.left} height={stopHeight} fill={riskColor} />
        <line x1={bounds.left} y1={bounds.entry.y} x2={bounds.right} y2={bounds.entry.y} stroke={entryColor} strokeWidth={2} />
        <line x1={bounds.left} y1={bounds.stop.y} x2={bounds.right} y2={bounds.stop.y} stroke="#ef4444" strokeWidth={1.6} strokeDasharray="5 4" />
        <line x1={bounds.left} y1={bounds.target.y} x2={bounds.right} y2={bounds.target.y} stroke="#10b981" strokeWidth={1.6} strokeDasharray="5 4" />
        {selected ? (
          <>
            <circle cx={bounds.right} cy={bounds.entry.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={bounds.right} cy={bounds.stop.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={bounds.right} cy={bounds.target.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        ) : null}
      </g>
    );
  };

  const draftDrawing = getDraftDrawing();
  const overlayContent = [
    ...drawings.map((drawing) => {
      if (drawing.kind === "trendline") return renderTrendline(drawing);
      if (drawing.kind === "fib") return renderFib(drawing);
      return renderPosition(drawing);
    }),
    draftDrawing
      ? draftDrawing.kind === "trendline"
        ? renderTrendline(draftDrawing, true)
        : draftDrawing.kind === "fib"
          ? renderFib(draftDrawing, true)
          : renderPosition(draftDrawing, true)
      : null,
  ];

  return (
    <div
      style={{
        border: `1px solid ${palette.buttonBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        background: palette.chartBackground,
      }}
    >
      <div
        style={{
          minHeight: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderBottom: `1px solid ${palette.buttonBorder}`,
          background: palette.headerSurface,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ color: palette.activeButtonText, fontWeight: 700, letterSpacing: "0.02em" }}>
            {symbol} - {exchange}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            {normalizedTimeframes.map((timeframe) => (
              <button
                key={timeframe.value}
                type="button"
                onClick={() => onTimeframeChange(timeframe.value)}
                style={{
                  border: selectedTimeframe === timeframe.value ? `1px solid ${palette.accent}` : "1px solid transparent",
                  borderRadius: 8,
                  padding: "6px 10px",
                  background: selectedTimeframe === timeframe.value ? palette.activeButtonBg : "transparent",
                  color: selectedTimeframe === timeframe.value ? palette.activeButtonText : palette.headerText,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: selectedTimeframe === timeframe.value ? 700 : 600,
                }}
              >
                {timeframe.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              border: `1px solid ${palette.buttonBorder}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setChartView("candles")}
              style={{
                border: "none",
                padding: "7px 10px",
                background: chartView === "candles" ? palette.activeButtonBg : "transparent",
                color: chartView === "candles" ? palette.activeButtonText : palette.headerText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <CandleIcon color={chartView === "candles" ? palette.activeButtonText : palette.headerText} />
              Candles
            </button>
            <button
              type="button"
              onClick={() => setChartView("line")}
              style={{
                border: "none",
                padding: "7px 10px",
                background: chartView === "line" ? palette.activeButtonBg : "transparent",
                color: chartView === "line" ? palette.activeButtonText : palette.headerText,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <LineChartIcon color={chartView === "line" ? palette.activeButtonText : palette.headerText} />
              Line
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowIndicatorsPanel((value) => !value);
              setShowToolsPanel(false);
            }}
            style={{
              border: `1px solid ${palette.buttonBorder}`,
              borderRadius: 8,
              padding: "6px 10px",
              background: showIndicatorsPanel ? palette.activeButtonBg : "transparent",
              color: showIndicatorsPanel ? palette.activeButtonText : palette.headerText,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Indicators {selectedIndicatorsCount ? `(${selectedIndicatorsCount})` : ""}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowToolsPanel((value) => !value);
              setShowIndicatorsPanel(false);
            }}
            style={{
              border: `1px solid ${palette.buttonBorder}`,
              borderRadius: 8,
              padding: "6px 10px",
              background: showToolsPanel ? palette.activeButtonBg : "transparent",
              color: showToolsPanel ? palette.activeButtonText : palette.headerText,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Tools
          </button>
        </div>
      </div>

      {showIndicatorsPanel ? (
        <div
          style={{
            padding: 12,
            borderBottom: `1px solid ${palette.buttonBorder}`,
            background: palette.headerSurface,
            boxShadow: palette.panelShadow,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <strong style={{ color: palette.activeButtonText, fontSize: 13 }}>Indicators</strong>
            <input
              value={indicatorQuery}
              onChange={(event) => setIndicatorQuery(event.target.value)}
              placeholder="Search indicators"
              style={{
                minWidth: 220,
                border: `1px solid ${palette.buttonBorder}`,
                borderRadius: 8,
                padding: "8px 10px",
                background: palette.chartBackground,
                color: palette.activeButtonText,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {filteredIndicators.map((indicator) => {
              const enabled = enabledIndicators.includes(indicator.id);
              const latestValue =
                indicator.id === "ema9"
                  ? latest(ema9)
                  : indicator.id === "ema21"
                    ? latest(ema21)
                    : indicator.id === "ema50"
                      ? latest(ema50)
                      : null;

              return (
                <button
                  key={indicator.id}
                  type="button"
                  disabled={!indicator.implemented}
                  onClick={() => toggleIndicator(indicator.id)}
                  style={{
                    border: `1px solid ${enabled ? palette.accent : palette.buttonBorder}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: enabled ? palette.activeButtonBg : palette.chartBackground,
                    color: indicator.implemented ? palette.activeButtonText : palette.headerText,
                    cursor: indicator.implemented ? "pointer" : "not-allowed",
                    opacity: indicator.implemented ? 1 : 0.6,
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{indicator.label}</span>
                    <span style={{ fontSize: 11 }}>{indicator.implemented ? (enabled ? "On" : "Off") : "Soon"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: palette.headerText, marginTop: 4 }}>{indicator.description}</div>
                  {formatIndicatorValue(latestValue) ? (
                    <div style={{ fontSize: 11, marginTop: 6 }}>Latest {formatIndicatorValue(latestValue)}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showToolsPanel ? (
        <div
          style={{
            padding: 12,
            borderBottom: `1px solid ${palette.buttonBorder}`,
            background: palette.headerSurface,
            boxShadow: palette.panelShadow,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            {CHART_TOOLS.map((tool) => {
              const active = tool.id === activeTool;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  style={{
                    border: `1px solid ${active ? palette.accent : palette.buttonBorder}`,
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: active ? palette.activeButtonBg : palette.chartBackground,
                    color: active ? palette.activeButtonText : palette.headerText,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                    {TOOL_ICON_BY_ID[tool.id]}
                    <span>{tool.label}</span>
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{tool.description}</div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => adjustZoom(1.2)}
              style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
            >
              Zoom In
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(1 / 1.2)}
              style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
            >
              Zoom Out
            </button>
            <button
              type="button"
              onClick={() => chartRef.current?.timeScale().fitContent()}
              style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
            >
              Reset View
            </button>
            <button
              type="button"
              onClick={clearDrawings}
              style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
            >
              Clear Drawings
            </button>
            <button
              type="button"
              onClick={deleteSelectedDrawing}
              disabled={!selectedDrawingId}
              style={{
                border: `1px solid ${palette.buttonBorder}`,
                borderRadius: 8,
                padding: "7px 10px",
                background: "transparent",
                color: selectedDrawingId ? palette.headerText : palette.border,
                cursor: selectedDrawingId ? "pointer" : "not-allowed",
              }}
            >
              Delete Selected
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ position: "relative", width: "100%", height }}>
        <div ref={chartContainerRef} style={{ width: "100%", height }} />

        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${chartContainerRef.current?.clientWidth ?? 0} ${height}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {overlayContent}
        </svg>

        <div
          onMouseDown={onOverlayMouseDown}
          onMouseMove={onOverlayMove}
          onMouseUp={onOverlayMouseUp}
          onMouseLeave={onOverlayMouseLeave}
          onWheel={onOverlayWheel}
          style={{
            position: "absolute",
            inset: 0,
            cursor: activeTool === "pointer" ? (dragState ? "grabbing" : "default") : "crosshair",
            background: "transparent",
          }}
        />

        {draftStart && activeTool !== "pointer" ? (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              padding: "6px 10px",
              borderRadius: 999,
              background: palette.headerSurface,
              border: `1px solid ${palette.buttonBorder}`,
              color: palette.headerText,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Click to place {activeTool === "trendline" ? "trendline" : activeTool === "fib" ? "fib range" : `${activeTool} position`}
          </div>
        ) : null}

        {!sanitizedCandles.length && !isLoading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: palette.headerText,
              fontSize: 14,
              background: palette.loadingOverlay,
            }}
          >
            No chart data available.
          </div>
        ) : null}

        {isLoading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: palette.activeButtonText,
              fontSize: 14,
              fontWeight: 700,
              background: palette.loadingOverlay,
              backdropFilter: "blur(2px)",
            }}
          >
            Loading chart...
          </div>
        ) : null}
      </div>
    </div>
  );
}
