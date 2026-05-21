"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { type ChartIndicatorId, type ChartSurface, type ChartToolType, type ChartView, getDefaultChartPreferences } from "@/lib/chartPreferences";
import { isImplementedIndicator } from "./indicators";
import { calculateEmaSeries } from "./indicators/ema";
import { CHART_TOOLS } from "./tools";
import { getChartDrawingsStorageKey, parseStoredDrawings } from "./tools/drawing";
import { buildPositionDrawing } from "./tools/longPnl";
import StandardChart from "./StandardChart";
import { useCoinHistory } from "@/hooks/rapidApi/useCoinHistory";

import {
  UnifiedPriceChartProps,
  TimeframeOption,
  type Palette,
} from "./types";
import {
  DEFAULT_TOKEN_TIMEFRAMES,
  TOOL_IDS,
  INDICATOR_IDS,
} from "./constants";
import {
  toChartTime,
  sanitizeCandles,
  hasValidKlines,
  mapTimeframeToCoinRanking,
  getPalette,
} from "./utils/chartHelpers";
import { ChartHeader } from "./components/ChartHeader";
import { IndicatorsPanel } from "./components/IndicatorsPanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { ChartDrawingOverlay } from "./components/ChartDrawingOverlay";

export function UnifiedPriceChart({
  candles,
  symbol,
  exchange,
  surface,
  onTimeframeChange,
  selectedTimeframe,
  isLoading: parentIsLoading,
  height = 450,
  timeframeOptions = DEFAULT_TOKEN_TIMEFRAMES,
}: UnifiedPriceChartProps) {
  const { mode } = useTheme();
  const { user } = useUser();
  const { address } = useAccount();

  // Chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // State
  const [chartView, setChartView] = useState<ChartView>("candles");
  const [enabledIndicators, setEnabledIndicators] = useState<ChartIndicatorId[]>([]);
  const [activeTool, setActiveTool] = useState<ChartToolType>("pointer");
  const [showIndicatorsPanel, setShowIndicatorsPanel] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [indicatorQuery, setIndicatorQuery] = useState("");
  const [drawings, setDrawings] = useState<any[]>([]);
  const [draftStart, setDraftStart] = useState<any>(null);
  const [draftPoint, setDraftPoint] = useState<any>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<any>(null);

  // Refs for persistence
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const hydratedSurfaceRef = useRef<string | null>(null);
  const lastFitRef = useRef<string | null>(null);

  // Memoized values
  const palette = useMemo(() => getPalette(mode), [mode]);
  const normalizedTimeframes = useMemo(
    () => timeframeOptions.map((item) => (typeof item === "string" ? { label: item, value: item } : item)),
    [timeframeOptions]
  );
  const sanitizedCandles = useMemo(() => sanitizeCandles(candles ?? []), [candles]);
  const ema9 = useMemo(() => calculateEmaSeries(sanitizedCandles, 9), [sanitizedCandles]);
  const ema21 = useMemo(() => calculateEmaSeries(sanitizedCandles, 21), [sanitizedCandles]);
  const ema50 = useMemo(() => calculateEmaSeries(sanitizedCandles, 50), [sanitizedCandles]);
  const indicatorSet = useMemo(() => new Set(enabledIndicators), [enabledIndicators]);
  const selectedIndicatorsCount = enabledIndicators.filter((id) => isImplementedIndicator(id)).length;
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

  const validKlines = useMemo(() => hasValidKlines(candles), [candles]);
  const {
    historyPoints,
    isLoading: fallbackLoading,
    error: fallbackError,
    refetch: refetchHistory,
  } = useCoinHistory({
    coinId: symbol,
    timePeriod: mapTimeframeToCoinRanking(selectedTimeframe),
    autoFetch: !validKlines && !parentIsLoading,
  });

  const coinHistoryForFallback = useMemo(() => {
    if (historyPoints.length === 0) return null;
    return { data: { history: historyPoints } };
  }, [historyPoints]);

  const showFallbackChart = !validKlines && !parentIsLoading && historyPoints.length > 0;
  const isLoading = parentIsLoading || (!validKlines && fallbackLoading);

  // Load saved preferences
  useEffect(() => {
    const base = getDefaultChartPreferences(surface);
    const saved = user?.preferences?.chart?.[surface];
    const nextIndicators = Array.isArray(saved?.indicators)
      ? saved.indicators.filter((id): id is ChartIndicatorId => typeof id === "string" && INDICATOR_IDS.has(id))
      : base.indicators;
    const nextTool = typeof saved?.activeTool === "string" && TOOL_IDS.has(saved.activeTool)
      ? saved.activeTool
      : base.activeTool;
    const nextView = saved?.chartType === "line" || saved?.chartType === "candles" ? saved.chartType : base.chartType;

    setChartView(nextView);
    setEnabledIndicators(nextIndicators);
    setActiveTool(nextTool);
    lastPersistedRef.current = JSON.stringify({ timeframe: selectedTimeframe, chartType: nextView, indicators: nextIndicators, activeTool: nextTool });
    hydratedSurfaceRef.current = `${user?.id ?? "anon"}:${surface}`;

    if (saved?.timeframe && saved.timeframe !== selectedTimeframe) {
      onTimeframeChange(saved.timeframe);
    }
  }, [surface, user?.id, user?.preferences?.chart, selectedTimeframe, onTimeframeChange]);

  // Load drawings from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDrawings(parseStoredDrawings(window.localStorage.getItem(drawingStorageKey)));
    setSelectedDrawingId(null);
    setDraftStart(null);
    setDraftPoint(null);
    setDragState(null);
  }, [drawingStorageKey]);

  // Save drawings to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(drawingStorageKey, JSON.stringify(drawings));
  }, [drawingStorageKey, drawings]);

  // Persist preferences to backend
  useEffect(() => {
    if (!address || !user?.id) return;
    if (hydratedSurfaceRef.current !== `${user.id}:${surface}`) return;

    const serialized = JSON.stringify(currentSurfacePreferences);
    if (serialized === lastPersistedRef.current) return;

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      patchUserPreferencesByWallet(address, { chart: { [surface]: currentSurfacePreferences } } as any)
        .then((result) => { if (result) lastPersistedRef.current = serialized; });
    }, 350);
  }, [address, currentSurfacePreferences, surface, user?.id]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: palette.chartBackground }, textColor: palette.chartText },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      width: Math.max(chartContainerRef.current.clientWidth, 320),
      height,
      crosshair: { mode: activeTool === "pointer" ? CrosshairMode.Magnet : CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 8 },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#10b981", downColor: "#ef4444", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444" });
    const lineSeries = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 2, crosshairMarkerVisible: true, priceLineVisible: false });
    const ema9Series = chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 2, priceLineVisible: false });
    const ema21Series = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false });
    const ema50Series = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, priceLineVisible: false });
    const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false, base: 0 });

    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });

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
  }, [activeTool, height, palette]);

  // Update chart options when palette or activeTool changes
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    chartRef.current.applyOptions({
      height,
      width: Math.max(chartContainerRef.current.clientWidth, 320),
      layout: { background: { type: ColorType.Solid, color: palette.chartBackground }, textColor: palette.chartText },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: { mode: activeTool === "pointer" ? CrosshairMode.Magnet : CrosshairMode.Normal },
    });
  }, [activeTool, height, palette]);

  // Update series visibility
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartView === "candles" });
    lineSeriesRef.current?.applyOptions({ visible: chartView === "line" });
    ema9Ref.current?.applyOptions({ visible: indicatorSet.has("ema9") });
    ema21Ref.current?.applyOptions({ visible: indicatorSet.has("ema21") });
    ema50Ref.current?.applyOptions({ visible: indicatorSet.has("ema50") });
    volumeRef.current?.applyOptions({ visible: indicatorSet.has("volume") });
  }, [chartView, indicatorSet]);

  // Set data
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
    lineSeriesRef.current?.setData(sanitizedCandles.map((candle) => ({ time: toChartTime(candle.time), value: candle.close })));
    ema9Ref.current?.setData(ema9);
    ema21Ref.current?.setData(ema21);
    ema50Ref.current?.setData(ema50);
    volumeRef.current?.setData(sanitizedCandles.map((candle) => ({
      time: toChartTime(candle.time),
      value: candle.volume ?? 0,
      color: candle.close >= candle.open ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)",
    })));

    if (sanitizedCandles.length > 0 && lastFitRef.current !== dataFitKey) {
      chartRef.current?.timeScale().fitContent();
      lastFitRef.current = dataFitKey;
    }
  }, [dataFitKey, ema9, ema21, ema50, sanitizedCandles]);

  // Show fallback chart if needed
  if (showFallbackChart) {
    return (
      <StandardChart
        coinHistory={coinHistoryForFallback ?? undefined}
        loading={fallbackLoading}
        error={fallbackError}
        refetchHistory={refetchHistory}
        timePeriod={selectedTimeframe}
        onTimePeriodChange={onTimeframeChange}
        periodOptions={normalizedTimeframes}
      />
    );
  }

  // Loading and error states
  if (isLoading && (!candles || candles.length === 0)) {
    return (
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, overflow: "hidden", background: palette.chartBackground, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: palette.headerText }}>Loading chart data...</div>
      </div>
    );
  }

  if ((!validKlines || !candles || candles.length === 0) && !isLoading) {
    return (
      <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, overflow: "hidden", background: palette.chartBackground, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: palette.headerText }}>No chart data available</div>
      </div>
    );
  }

  // Drawing helper functions (simplified - you'll need to implement these)
  const pointFromMouse = (event: React.MouseEvent<HTMLDivElement>) => {
    // Implementation similar to original
    return null;
  };

  const adjustZoom = (multiplier: number) => {
    if (!chartRef.current) return;
    const currentSpacing = chartRef.current.options().timeScale?.barSpacing ?? 6;
    chartRef.current.applyOptions({ timeScale: { barSpacing: Math.max(2, Math.min(60, currentSpacing * multiplier)) } });
  };

  const toggleIndicator = (indicatorId: ChartIndicatorId) => {
    if (!isImplementedIndicator(indicatorId)) return;
    setEnabledIndicators((current) =>
      current.includes(indicatorId) ? current.filter((v) => v !== indicatorId) : [...current, indicatorId].sort()
    );
  };

  const onOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    // Implementation
  };

  const onOverlayMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    // Implementation
  };

  const onOverlayMouseUp = () => setDragState(null);
  const onOverlayMouseLeave = () => setDragState(null);
  const onOverlayWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
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
    setDrawings((current) => current.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  };

  return (
    <div style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 14, overflow: "hidden", background: palette.chartBackground }}>
      <ChartHeader
        symbol={symbol}
        exchange={exchange}
        selectedTimeframe={selectedTimeframe}
        timeframeOptions={normalizedTimeframes}
        chartView={chartView}
        onTimeframeChange={onTimeframeChange}
        onChartViewChange={setChartView}
        onIndicatorsClick={() => { setShowIndicatorsPanel(!showIndicatorsPanel); setShowToolsPanel(false); }}
        onToolsClick={() => { setShowToolsPanel(!showToolsPanel); setShowIndicatorsPanel(false); }}
        showIndicatorsPanel={showIndicatorsPanel}
        showToolsPanel={showToolsPanel}
        selectedIndicatorsCount={selectedIndicatorsCount}
        palette={palette}
      />

      {showIndicatorsPanel && (
        <IndicatorsPanel
          enabledIndicators={enabledIndicators}
          indicatorQuery={indicatorQuery}
          onIndicatorQueryChange={setIndicatorQuery}
          onToggleIndicator={toggleIndicator}
          ema9={ema9}
          ema21={ema21}
          ema50={ema50}
          palette={palette}
        />
      )}

      {showToolsPanel && (
        <ToolsPanel
          activeTool={activeTool}
          selectedDrawingId={selectedDrawingId}
          onSetActiveTool={setActiveTool}
          onZoomIn={() => adjustZoom(1.2)}
          onZoomOut={() => adjustZoom(1 / 1.2)}
          onResetView={() => chartRef.current?.timeScale().fitContent()}
          onClearDrawings={clearDrawings}
          onDeleteSelected={deleteSelectedDrawing}
          chartRef={chartRef}
          palette={palette}
        />
      )}

      <ChartDrawingOverlay
        chartContainerRef={chartContainerRef}
        chartRef={chartRef}
        candleSeriesRef={candleSeriesRef}
        lineSeriesRef={lineSeriesRef}
        drawings={drawings}
        draftStart={draftStart}
        draftPoint={draftPoint}
        selectedDrawingId={selectedDrawingId}
        dragState={dragState}
        activeTool={activeTool}
        palette={palette}
        height={height}
        onMouseDown={onOverlayMouseDown}
        onMouseMove={onOverlayMouseMove}
        onMouseUp={onOverlayMouseUp}
        onMouseLeave={onOverlayMouseLeave}
        onWheel={onOverlayWheel}
        isLoading={isLoading}
        sanitizedCandles={sanitizedCandles}
      />
    </div>
  );
}