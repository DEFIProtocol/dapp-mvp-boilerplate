"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
} from "lightweight-charts";
import type { Time } from "lightweight-charts";
import { useTheme } from "@/contexts/ThemeContext";

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface PriceChartProps {
  candles: Candle[];
  symbol: string;
  exchange?: string;
  isLoading?: boolean;
  onTimeframeChange?: (timeframe: string) => void;
  selectedTimeframe?: string;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

const toChartTime = (timestamp: number): Time => {
  const normalized = timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
  return normalized as Time;
};

const emaData = (candles: Candle[], period: number): Array<{ time: Time; value: number }> => {
  const valid = candles.filter((c) => c.timestamp > 0);
  if (!valid.length) return [];
  const multiplier = 2 / (period + 1);
  let current = valid[0].close;
  return valid.map((candle, index) => {
    if (index === 0) current = candle.close;
    else current = (candle.close - current) * multiplier + current;
    return { time: toChartTime(candle.timestamp), value: current };
  });
};

const latest = (data: Array<{ value: number }>): number | null => (data.length ? data[data.length - 1].value : null);

type ChartView = "candles" | "line";
type ToolType = "pointer" | "trendline" | "fib" | "long" | "short";
type DrawPoint = { time: number; price: number };
type TrendlineDrawing = { id: string; kind: "trendline"; start: DrawPoint; end: DrawPoint };
type FibDrawing = { id: string; kind: "fib"; start: DrawPoint; end: DrawPoint };
type PositionDrawing = {
  id: string;
  kind: "long" | "short";
  entry: DrawPoint;
  stop: DrawPoint;
  targetPrice: number;
};
type Drawing = TrendlineDrawing | FibDrawing | PositionDrawing;
type HandleType = "start" | "end" | "entry" | "stop" | "target";
type DragState = { drawingId: string; handle: HandleType };

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
    <polyline points="1.5,10.5 4.5,7.5 7.2,8.6 12.5,3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="4.5" cy="7.5" r="0.9" fill={color} />
    <circle cx="12.5" cy="3.5" r="0.9" fill={color} />
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

const PositionIcon = ({ type }: { type: "long" | "short" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3" y="2" width="10" height="5" rx="1" fill={type === "long" ? "#10b981" : "#334155"} />
    <rect x="3" y="9" width="10" height="5" rx="1" fill={type === "short" ? "#ef4444" : "#334155"} />
  </svg>
);

const HANDLE_RADIUS = 6;
const FIB_LEVELS = [1, 0.618, 0.5, 0.382, 0] as const;

export default function PriceChart({
  candles,
  symbol,
  exchange = "Binance",
  isLoading = false,
  onTimeframeChange,
  selectedTimeframe = "1h",
}: PriceChartProps) {
  const { theme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartOverlayRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [chartView, setChartView] = useState<ChartView>("candles");
  const [showEma9, setShowEma9] = useState(false);
  const [showEma21, setShowEma21] = useState(false);
  const [showEma50, setShowEma50] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>("pointer");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draftStart, setDraftStart] = useState<DrawPoint | null>(null);
  const [draftPoint, setDraftPoint] = useState<DrawPoint | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const selectedIndicatorsCount = [showEma9, showEma21, showEma50, showVolume].filter(Boolean).length;

  const ema9 = useMemo(() => emaData(candles, 9), [candles]);
  const ema21 = useMemo(() => emaData(candles, 21), [candles]);
  const ema50 = useMemo(() => emaData(candles, 50), [candles]);

  const timeToUnix = (time: Time): number => {
    if (typeof time === "number") return Math.floor(time);
    const business = time as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(business.year, business.month - 1, business.day) / 1000);
  };

  const pointFromMouse = (event: React.MouseEvent<HTMLDivElement>): DrawPoint | null => {
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    const priceSeries = candleRef.current ?? lineRef.current;
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
    const priceSeries = candleRef.current ?? lineRef.current;
    if (!chart || !priceSeries) return null;

    const x = chart.timeScale().timeToCoordinate(point.time as Time);
    const y = priceSeries.priceToCoordinate(point.price);
    if (x == null || y == null) return null;

    return { x, y };
  };

  const buildPositionDrawing = (kind: "long" | "short", entry: DrawPoint, stopPoint: DrawPoint): PositionDrawing => {
    const adjustedStopPrice = kind === "long"
      ? Math.min(stopPoint.price, entry.price * 0.999)
      : Math.max(stopPoint.price, entry.price * 1.001);

    const riskPct = Math.abs((entry.price - adjustedStopPrice) / entry.price);
    const rr = 2;
    const targetPrice = kind === "long"
      ? entry.price * (1 + riskPct * rr)
      : entry.price * (1 - riskPct * rr);

    return {
      id: `${Date.now()}-${Math.random()}`,
      kind,
      entry,
      stop: { ...stopPoint, price: adjustedStopPrice },
      targetPrice,
    };
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

  const distanceToSegment = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  };

  const getPositionBounds = (drawing: PositionDrawing) => {
    const entry = pointToCoords(drawing.entry);
    const stop = pointToCoords(drawing.stop);
    const target = pointToCoords({ time: drawing.entry.time, price: drawing.targetPrice });
    if (!entry || !stop || !target) return null;
    const left = Math.min(entry.x, stop.x);
    const rightRaw = Math.max(entry.x, stop.x);
    const right = rightRaw - left < 70 ? left + 70 : rightRaw;
    return { entry, stop, target, left, right };
  };

  const findHandleHit = (x: number, y: number): DragState | null => {
    for (let index = drawings.length - 1; index >= 0; index -= 1) {
      const drawing = drawings[index];

      if (drawing.kind === "trendline" || drawing.kind === "fib") {
        const start = pointToCoords(drawing.start);
        const end = pointToCoords(drawing.end);
        if (!start || !end) continue;

        if (Math.hypot(x - start.x, y - start.y) <= HANDLE_RADIUS + 2) {
          return { drawingId: drawing.id, handle: "start" };
        }
        if (Math.hypot(x - end.x, y - end.y) <= HANDLE_RADIUS + 2) {
          return { drawingId: drawing.id, handle: "end" };
        }
      }

      if (drawing.kind === "long" || drawing.kind === "short") {
        const bounds = getPositionBounds(drawing);
        if (!bounds) continue;
        const handleX = bounds.right;
        if (Math.hypot(x - handleX, y - bounds.entry.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "entry" };
        if (Math.hypot(x - handleX, y - bounds.stop.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "stop" };
        if (Math.hypot(x - handleX, y - bounds.target.y) <= HANDLE_RADIUS + 2) return { drawingId: drawing.id, handle: "target" };
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
        if (x >= minX - 8 && x <= maxX + 16) {
          const high = Math.max(drawing.start.price, drawing.end.price);
          const low = Math.min(drawing.start.price, drawing.end.price);
          for (const level of FIB_LEVELS) {
            const price = low + (high - low) * level;
            const coord = pointToCoords({ time: drawing.start.time, price });
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
      setDrawings((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, kind: "trendline", start: draftStart, end: point }]);
    }

    if (activeTool === "fib") {
      setDrawings((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, kind: "fib", start: draftStart, end: point }]);
    }

    if (activeTool === "long" || activeTool === "short") {
      setDrawings((prev) => [...prev, buildPositionDrawing(activeTool, draftStart, point)]);
    }

    setDraftStart(null);
    setDraftPoint(null);
  };

  const onOverlayMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === "pointer" && dragState) {
      const point = pointFromMouse(event);
      if (!point) return;

      setDrawings((prev) =>
        prev.map((drawing) =>
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
        accent: "#6366f1",
        headerSurface: "#f8fafc",
        railSurface: "#f8fafc",
        buttonBorder: "#cbd5e1",
        loadingOverlay: "rgba(248, 250, 252, 0.68)",
      };
    }

    return {
      chartBackground: "#0f172a",
      chartText: "#d1d5db",
      grid: "#1f2937",
      border: "#334155",
      headerText: "#94a3b8",
      activeButtonBg: "#0f172a",
      activeButtonText: "#e2e8f0",
        accent: "#818cf8",
      headerSurface: "#111827",
      railSurface: "#111827",
      buttonBorder: "#334155",
      loadingOverlay: "rgba(15,23,42,0.12)",
    };
  }, [theme]);

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
      height: 420,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
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
    candleRef.current = candleSeries;
    lineRef.current = lineSeries;
    ema9Ref.current = ema9Series;
    ema21Ref.current = ema21Series;
    ema50Ref.current = ema50Series;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      chart.applyOptions({ width: Math.max(chartContainerRef.current?.clientWidth ?? 320, 320) });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.applyOptions({
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
    });
  }, [palette]);

  useEffect(() => {
    candleRef.current?.applyOptions({ visible: chartView === "candles" });
    lineRef.current?.applyOptions({ visible: chartView === "line" });
    ema9Ref.current?.applyOptions({ visible: showEma9 });
    ema21Ref.current?.applyOptions({ visible: showEma21 });
    ema50Ref.current?.applyOptions({ visible: showEma50 });
    volumeRef.current?.applyOptions({ visible: showVolume });
  }, [chartView, showEma9, showEma21, showEma50, showVolume]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: {
        mode: activeTool === "pointer" ? CrosshairMode.Magnet : CrosshairMode.Normal,
      },
    });
  }, [activeTool]);

  useEffect(() => {
    setDraftStart(null);
    setDraftPoint(null);
  }, [activeTool]);

  useEffect(() => {
    if (!candleRef.current || !candles.length) return;

    const formatted: CandlestickData[] = candles
      .filter((c) => c.timestamp > 0)
      .map((c) => ({
        time: toChartTime(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    if (!formatted.length) return;

    candleRef.current.setData(formatted);
    lineRef.current?.setData(
      candles
        .filter((c) => c.timestamp > 0)
        .map((c) => ({
          time: toChartTime(c.timestamp),
          value: c.close,
        }))
    );
    ema9Ref.current?.setData(ema9);
    ema21Ref.current?.setData(ema21);
    ema50Ref.current?.setData(ema50);
    volumeRef.current?.setData(
      candles
        .filter((c) => c.timestamp > 0)
        .map((c) => ({
          time: toChartTime(c.timestamp),
          value: c.volume ?? 0,
          color: c.close >= c.open ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)",
        }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles, ema9, ema21, ema50]);

  return (
    <div style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 14, overflow: "hidden", background: palette.chartBackground }}>
      <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 12px", borderBottom: `1px solid ${palette.buttonBorder}`, background: palette.headerSurface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ color: palette.activeButtonText, fontWeight: 700, letterSpacing: "0.02em" }}>{symbol} - {exchange}</span>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {TIMEFRAMES.map((timeframe) => (
              <button
                key={timeframe}
                type="button"
                onClick={() => onTimeframeChange?.(timeframe)}
                style={{
                  border: selectedTimeframe === timeframe ? `1px solid ${palette.accent}` : "1px solid transparent",
                  borderRadius: 8,
                  padding: "6px 10px",
                  background: selectedTimeframe === timeframe ? palette.activeButtonBg : "transparent",
                  color: selectedTimeframe === timeframe ? palette.activeButtonText : palette.headerText,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: selectedTimeframe === timeframe ? 700 : 600,
                  boxShadow: selectedTimeframe === timeframe ? `inset 0 0 0 1px ${palette.accent}22` : "none",
                }}
              >
                {timeframe}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowChartTypeMenu((v) => !v)}
              style={{
                border: `1px solid ${palette.buttonBorder}`,
                borderRadius: 8,
                padding: "6px 10px",
                background: palette.activeButtonBg,
                color: palette.activeButtonText,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {chartView === "candles" ? <CandleIcon color={palette.activeButtonText} /> : <LineChartIcon color={palette.activeButtonText} />}
              {chartView === "candles" ? "Candles" : "Line"}
            </button>

            {showChartTypeMenu ? (
              <div style={{ position: "absolute", top: 42, right: 0, zIndex: 8, background: palette.chartBackground, border: `1px solid ${palette.buttonBorder}`, borderRadius: 10, minWidth: 150, padding: 8, boxShadow: theme === "dark" ? "0 8px 24px rgba(0,0,0,0.35)" : "0 8px 24px rgba(15,23,42,0.12)" }}>
                <button
                  type="button"
                  onClick={() => {
                    setChartView("candles");
                    setShowChartTypeMenu(false);
                  }}
                  style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
                >
                  <CandleIcon color={chartView === "candles" ? palette.accent : palette.headerText} /> Candles
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartView("line");
                    setShowChartTypeMenu(false);
                  }}
                  style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
                >
                  <LineChartIcon color={chartView === "line" ? palette.accent : palette.headerText} /> Line
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowIndicatorsMenu((v) => !v)}
            style={{
              border: `1px solid ${palette.buttonBorder}`,
              borderRadius: 8,
              padding: "6px 10px",
              background: selectedIndicatorsCount ? palette.activeButtonBg : "transparent",
              color: selectedIndicatorsCount ? palette.activeButtonText : palette.headerText,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Indicators {selectedIndicatorsCount ? `(${selectedIndicatorsCount})` : ""}
          </button>

          {showIndicatorsMenu ? (
            <div style={{ position: "absolute", top: 42, right: 0, zIndex: 6, background: palette.chartBackground, border: `1px solid ${palette.buttonBorder}`, borderRadius: 10, minWidth: 170, padding: 8, boxShadow: theme === "dark" ? "0 8px 24px rgba(0,0,0,0.35)" : "0 8px 24px rgba(15,23,42,0.12)" }}>
              <button type="button" onClick={() => setShowEma9((v) => !v)} style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {showEma9 ? "☑" : "☐"} EMA 9 {latest(ema9) ? `(${latest(ema9)?.toFixed(2)})` : ""}
              </button>
              <button type="button" onClick={() => setShowEma21((v) => !v)} style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {showEma21 ? "☑" : "☐"} EMA 21 {latest(ema21) ? `(${latest(ema21)?.toFixed(2)})` : ""}
              </button>
              <button type="button" onClick={() => setShowEma50((v) => !v)} style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {showEma50 ? "☑" : "☐"} EMA 50 {latest(ema50) ? `(${latest(ema50)?.toFixed(2)})` : ""}
              </button>
              <button type="button" onClick={() => setShowVolume((v) => !v)} style={{ width: "100%", border: "none", background: "transparent", color: palette.headerText, textAlign: "left", padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {showVolume ? "☑" : "☐"} Volume
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", width: "100%", height: 420 }}>
        <div style={{ width: 50, borderRight: `1px solid ${palette.buttonBorder}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 6px", gap: 6, background: palette.railSurface }}>
          <button
            type="button"
            onClick={() => setActiveTool("pointer")}
            title="Pointer / Edit"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: activeTool === "pointer" ? palette.activeButtonBg : "transparent", color: palette.headerText, cursor: "pointer", fontSize: 16 }}
          >
            ↖
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("trendline")}
            title="Trend Line"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: activeTool === "trendline" ? palette.activeButtonBg : "transparent", color: palette.headerText, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <DrawToolIcon color={palette.headerText} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("fib")}
            title="Fib Retracement"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: activeTool === "fib" ? palette.activeButtonBg : "transparent", color: palette.headerText, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <FibToolIcon color={palette.headerText} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("long")}
            title="Long Position"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: activeTool === "long" ? palette.activeButtonBg : "transparent", color: "#10b981", cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <PositionIcon type="long" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool("short")}
            title="Short Position"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: activeTool === "short" ? palette.activeButtonBg : "transparent", color: "#ef4444", cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <PositionIcon type="short" />
          </button>
          <div style={{ width: "100%", height: 1, background: palette.buttonBorder, margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            title="Reset View"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: "transparent", color: palette.headerText, cursor: "pointer", fontSize: 16 }}
          >
            ⟲
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawings([]);
              setDraftStart(null);
              setDraftPoint(null);
              setSelectedDrawingId(null);
              setDragState(null);
            }}
            title="Clear Drawings"
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${palette.buttonBorder}`, background: "transparent", color: palette.headerText, cursor: "pointer", fontSize: 14 }}
          >
            🗑
          </button>
        </div>

        <div style={{ position: "relative", flex: 1, height: "100%" }}>
          <div ref={chartContainerRef} style={{ width: "100%", height: "100%", cursor: activeTool === "pointer" ? "default" : "crosshair" }} />
          <div
            ref={chartOverlayRef}
            onMouseDown={onOverlayMouseDown}
            onMouseMove={onOverlayMove}
            onMouseUp={onOverlayMouseUp}
            onMouseLeave={() => {
              setDraftPoint(draftStart);
              setDragState(null);
            }}
            style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "auto", cursor: activeTool === "pointer" ? (dragState ? "grabbing" : "default") : "crosshair" }}
          >
            <svg width="100%" height="100%" style={{ overflow: "visible" }}>
              {drawings.map((drawing) => {
                if (drawing.kind === "trendline") {
                  const start = pointToCoords(drawing.start);
                  const end = pointToCoords(drawing.end);
                  if (!start || !end) return null;
                  return (
                    <g key={drawing.id}>
                      <line
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#60a5fa"
                        strokeWidth={selectedDrawingId === drawing.id ? 2.6 : 2}
                      />
                      {selectedDrawingId === drawing.id ? (
                        <>
                          <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill="#60a5fa" stroke="#ffffff" strokeWidth={1.5} />
                          <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill="#60a5fa" stroke="#ffffff" strokeWidth={1.5} />
                        </>
                      ) : null}
                    </g>
                  );
                }

                if (drawing.kind === "fib") {
                  const start = pointToCoords(drawing.start);
                  const end = pointToCoords(drawing.end);
                  if (!start || !end) return null;

                  const minX = Math.min(start.x, end.x);
                  const maxX = Math.max(start.x, end.x);
                  const high = Math.max(drawing.start.price, drawing.end.price);
                  const low = Math.min(drawing.start.price, drawing.end.price);
                  const levels = FIB_LEVELS;

                  return (
                    <g key={drawing.id}>
                      {levels.map((level) => {
                        const price = low + (high - low) * level;
                        const coord = pointToCoords({ time: drawing.start.time, price });
                        if (!coord) return null;
                        return (
                          <g key={`${drawing.id}-${level}`}>
                            <line x1={minX} y1={coord.y} x2={maxX} y2={coord.y} stroke="#a78bfa" strokeWidth={selectedDrawingId === drawing.id ? 1.8 : 1.5} strokeDasharray="3 2" />
                            <text x={maxX + 6} y={coord.y - 2} fill={palette.headerText} fontSize="10">{level.toFixed(3)}</text>
                          </g>
                        );
                      })}
                      {selectedDrawingId === drawing.id ? (
                        <>
                          <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill="#a78bfa" stroke="#ffffff" strokeWidth={1.5} />
                          <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill="#a78bfa" stroke="#ffffff" strokeWidth={1.5} />
                        </>
                      ) : null}
                    </g>
                  );
                }

                const bounds = getPositionBounds(drawing);
                if (!bounds) return null;

                const { entry, stop, target, left, right } = bounds;
                const width = right - left;

                const rewardTop = Math.min(entry.y, target.y);
                const rewardBottom = Math.max(entry.y, target.y);
                const riskTop = Math.min(entry.y, stop.y);
                const riskBottom = Math.max(entry.y, stop.y);

                const profitPct = drawing.kind === "long"
                  ? ((drawing.targetPrice - drawing.entry.price) / drawing.entry.price) * 100
                  : ((drawing.entry.price - drawing.targetPrice) / drawing.entry.price) * 100;
                const riskPct = Math.abs((drawing.entry.price - drawing.stop.price) / drawing.entry.price) * 100;
                const rr = riskPct > 0 ? Math.abs(profitPct) / riskPct : 0;
                const labelY = drawing.kind === "long" ? rewardTop - 6 : rewardBottom + 14;

                return (
                  <g key={drawing.id}>
                    <rect x={left} y={rewardTop} width={width} height={Math.max(1, rewardBottom - rewardTop)} fill="rgba(16,185,129,0.23)" stroke="rgba(16,185,129,0.65)" strokeWidth={1} />
                    <rect x={left} y={riskTop} width={width} height={Math.max(1, riskBottom - riskTop)} fill="rgba(239,68,68,0.23)" stroke="rgba(239,68,68,0.65)" strokeWidth={1} />
                    <line x1={left} y1={entry.y} x2={right} y2={entry.y} stroke={palette.activeButtonText} strokeWidth={1.2} strokeDasharray="2 2" />
                    <text x={left + 4} y={labelY} fill={palette.activeButtonText} fontSize="10" fontWeight="700">
                      P/L {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}% · Risk {riskPct.toFixed(2)}% · R:R 1:{rr.toFixed(2)}
                    </text>
                    {selectedDrawingId === drawing.id ? (
                      <>
                        <circle cx={right} cy={entry.y} r={HANDLE_RADIUS} fill={palette.activeButtonText} stroke="#ffffff" strokeWidth={1.5} />
                        <circle cx={right} cy={stop.y} r={HANDLE_RADIUS} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
                        <circle cx={right} cy={target.y} r={HANDLE_RADIUS} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
                      </>
                    ) : null}
                  </g>
                );
              })}

              {draftStart && draftPoint && activeTool === "trendline" ? (() => {
                const start = pointToCoords(draftStart);
                const end = pointToCoords(draftPoint);
                if (!start || !end) return null;
                return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#60a5fa" strokeWidth={2} strokeDasharray="4 3" opacity={0.8} />;
              })() : null}

              {draftStart && draftPoint && activeTool === "fib" ? (() => {
                const start = pointToCoords(draftStart);
                const end = pointToCoords(draftPoint);
                if (!start || !end) return null;

                const minX = Math.min(start.x, end.x);
                const maxX = Math.max(start.x, end.x);
                const high = Math.max(draftStart.price, draftPoint.price);
                const low = Math.min(draftStart.price, draftPoint.price);
                const levels = FIB_LEVELS;

                return (
                  <g opacity={0.8}>
                    {levels.map((level) => {
                      const price = low + (high - low) * level;
                      const coord = pointToCoords({ time: draftStart.time, price });
                      if (!coord) return null;
                      return <line key={`preview-fib-${level}`} x1={minX} y1={coord.y} x2={maxX} y2={coord.y} stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" />;
                    })}
                  </g>
                );
              })() : null}

              {draftStart && draftPoint && (activeTool === "long" || activeTool === "short") ? (() => {
                const preview = buildPositionDrawing(activeTool, draftStart, draftPoint);
                const entry = pointToCoords(preview.entry);
                const stop = pointToCoords(preview.stop);
                const target = pointToCoords({ time: preview.entry.time, price: preview.targetPrice });
                if (!entry || !stop || !target) return null;

                const left = Math.min(entry.x, stop.x);
                const rightRaw = Math.max(entry.x, stop.x);
                const right = rightRaw - left < 70 ? left + 70 : rightRaw;
                const width = right - left;

                const rewardTop = Math.min(entry.y, target.y);
                const rewardBottom = Math.max(entry.y, target.y);
                const riskTop = Math.min(entry.y, stop.y);
                const riskBottom = Math.max(entry.y, stop.y);

                return (
                  <g opacity={0.75}>
                    <rect x={left} y={rewardTop} width={width} height={Math.max(1, rewardBottom - rewardTop)} fill="rgba(16,185,129,0.2)" stroke="rgba(16,185,129,0.7)" strokeWidth={1} strokeDasharray="4 3" />
                    <rect x={left} y={riskTop} width={width} height={Math.max(1, riskBottom - riskTop)} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.7)" strokeWidth={1} strokeDasharray="4 3" />
                  </g>
                );
              })() : null}
            </svg>
          </div>
          {activeTool !== "pointer" ? (
            <div style={{ position: "absolute", top: 8, left: 8, fontSize: 11, color: palette.headerText, background: theme === "dark" ? "rgba(15,23,42,0.82)" : "rgba(255,255,255,0.88)", border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "4px 8px", pointerEvents: "none" }}>
              {activeTool === "trendline" && "Trendline tool selected"}
              {activeTool === "fib" && "Fib retracement tool selected"}
              {activeTool === "long" && "Long position tool selected"}
              {activeTool === "short" && "Short position tool selected"}
            </div>
          ) : null}
          {isLoading && !candles.length ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: palette.headerText, background: palette.loadingOverlay }}>
              Loading chart...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}