import type { ChartToolType } from "@/lib/chartPreferences";
import { CHART_TOOLS } from "../../tools";
import type { IChartApi } from "lightweight-charts";

interface ToolsPanelProps {
  activeTool: ChartToolType;
  selectedDrawingId: string | null;
  onSetActiveTool: (tool: ChartToolType) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onClearDrawings: () => void;
  onDeleteSelected: () => void;
  chartRef: React.MutableRefObject<IChartApi | null>;
  palette: any;
}

const TOOL_ICON_BY_ID: Record<ChartToolType, React.ReactNode> = {
  pointer: <span style={{ fontSize: 15 }}>↖</span>,
  trendline: <DrawToolIcon color="currentColor" />,
  fib: <FibToolIcon color="currentColor" />,
  long: <PositionIcon type="long" />,
  short: <PositionIcon type="short" />,
};

function DrawToolIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 12.2L11.8 3.4L12.6 4.2L3.8 13H3V12.2Z" fill={color} />
      <path d="M10.9 2.6L12.4 1.1L14.1 2.8L12.6 4.3L10.9 2.6Z" fill={color} />
      <path d="M2.8 13.2L5.1 12.8L3.2 14.7L1.3 15.1L2.8 13.2Z" fill={color} />
    </svg>
  );
}

function FibToolIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <line x1="2" y1="3" x2="14" y2="3" stroke={color} strokeWidth="1.3" />
      <line x1="3" y1="6" x2="13" y2="6" stroke={color} strokeWidth="1.3" />
      <line x1="2" y1="9" x2="14" y2="9" stroke={color} strokeWidth="1.3" />
      <line x1="4" y1="12" x2="12" y2="12" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function PositionIcon({ type }: { type: "long" | "short" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="10" height="5" rx="1" fill={type === "long" ? "#10b981" : "#334155"} />
      <rect x="3" y="9" width="10" height="5" rx="1" fill={type === "short" ? "#ef4444" : "#334155"} />
    </svg>
  );
}

export function ToolsPanel({
  activeTool,
  selectedDrawingId,
  onSetActiveTool,
  onZoomIn,
  onZoomOut,
  onResetView,
  onClearDrawings,
  onDeleteSelected,
  palette,
}: ToolsPanelProps) {
  return (
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
              onClick={() => onSetActiveTool(tool.id)}
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
          onClick={onZoomIn}
          style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
        >
          Zoom In
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
        >
          Zoom Out
        </button>
        <button
          type="button"
          onClick={onResetView}
          style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
        >
          Reset View
        </button>
        <button
          type="button"
          onClick={onClearDrawings}
          style={{ border: `1px solid ${palette.buttonBorder}`, borderRadius: 8, padding: "7px 10px", background: "transparent", color: palette.headerText, cursor: "pointer" }}
        >
          Clear Drawings
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
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
  );
}