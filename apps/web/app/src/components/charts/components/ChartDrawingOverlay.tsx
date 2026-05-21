import { useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { DrawPoint, Drawing, DragState } from "../tools/drawing";
import { HANDLE_RADIUS, FIB_LEVELS } from "../constants";
import type { Palette } from "../types";
import type { SanitizedCandle } from "../indicators/ema";

interface ChartDrawingOverlayProps {
  chartContainerRef: React.RefObject<HTMLDivElement>;
  chartRef: React.MutableRefObject<IChartApi | null>;
  candleSeriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  lineSeriesRef: React.MutableRefObject<ISeriesApi<"Line"> | null>;
  drawings: Drawing[];
  draftStart: DrawPoint | null;
  draftPoint: DrawPoint | null;
  selectedDrawingId: string | null;
  dragState: DragState | null;
  activeTool: string;
  palette: Palette;
  height: number;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  isLoading: boolean;
  sanitizedCandles: SanitizedCandle[];
}

export function ChartDrawingOverlay({
  chartContainerRef,
  chartRef,
  candleSeriesRef,
  lineSeriesRef,
  drawings,
  draftStart,
  draftPoint,
  selectedDrawingId,
  dragState,
  activeTool,
  palette,
  height,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  isLoading,
  sanitizedCandles,
}: ChartDrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const pointToCoords = (point: DrawPoint): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const priceSeries = candleSeriesRef.current ?? lineSeriesRef.current;
    if (!chart || !priceSeries) return null;

    const x = chart.timeScale().timeToCoordinate(point.time as any);
    const y = priceSeries.priceToCoordinate(point.price);
    if (x == null || y == null) return null;
    return { x, y };
  };

  const getPositionBounds = (drawing: any) => {
    const entry = pointToCoords(drawing.entry);
    const stop = pointToCoords(drawing.stop);
    const target = pointToCoords({ time: drawing.entry.time, price: drawing.targetPrice });
    if (!entry || !stop || !target) return null;

    const left = Math.min(entry.x, stop.x);
    const rawRight = Math.max(entry.x, stop.x);
    const right = rawRight - left < 70 ? left + 70 : rawRight;
    return { entry, stop, target, left, right };
  };

  const isSelected = (drawingId: string) => selectedDrawingId === drawingId;

  const renderTrendline = (drawing: any, draft = false) => {
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
        {selected && (
          <>
            <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        )}
      </g>
    );
  };

  const renderFib = (drawing: any, draft = false) => {
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
        {selected && (
          <>
            <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        )}
      </g>
    );
  };

  const renderPosition = (drawing: any, draft = false) => {
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
        {selected && (
          <>
            <circle cx={bounds.right} cy={bounds.entry.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={bounds.right} cy={bounds.stop.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
            <circle cx={bounds.right} cy={bounds.target.y} r={HANDLE_RADIUS} fill={palette.chartBackground} stroke={palette.accent} strokeWidth={2} />
          </>
        )}
      </g>
    );
  };

  const getDraftDrawing = (): Drawing | null => {
    if (!draftStart || !draftPoint) return null;
    if (activeTool === "trendline") return { id: "draft", kind: "trendline", start: draftStart, end: draftPoint };
    if (activeTool === "fib") return { id: "draft", kind: "fib", start: draftStart, end: draftPoint };
    if (activeTool === "long" || activeTool === "short") {
      return {
        id: "draft",
        kind: activeTool,
        entry: draftStart,
        stop: draftPoint,
        targetPrice: draftStart.price,
      } as any;
    }
    return null;
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
  ].filter(Boolean);

  const width = chartContainerRef.current?.clientWidth ?? 0;

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={chartContainerRef} style={{ width: "100%", height }} />

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
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
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onWheel={onWheel}
        style={{
          position: "absolute",
          inset: 0,
          cursor: activeTool === "pointer" ? (dragState ? "grabbing" : "default") : "crosshair",
          background: "transparent",
        }}
      />

      {draftStart && activeTool !== "pointer" && (
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
      )}

      {!sanitizedCandles.length && !isLoading && (
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
      )}

      {isLoading && (
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
      )}
    </div>
  );
}