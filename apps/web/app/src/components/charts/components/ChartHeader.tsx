import { type TimeframeOption, type ChartView } from "../types";

interface ChartHeaderProps {
  symbol: string;
  exchange: string;
  selectedTimeframe: string;
  timeframeOptions: TimeframeOption[];
  chartView: ChartView;
  onTimeframeChange: (timeframe: string) => void;
  onChartViewChange: (view: ChartView) => void;
  onIndicatorsClick: () => void;
  onToolsClick: () => void;
  showIndicatorsPanel: boolean;
  showToolsPanel: boolean;
  selectedIndicatorsCount: number;
  palette: any;
}

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

export function ChartHeader({
  symbol,
  exchange,
  selectedTimeframe,
  timeframeOptions,
  chartView,
  onTimeframeChange,
  onChartViewChange,
  onIndicatorsClick,
  onToolsClick,
  showIndicatorsPanel,
  showToolsPanel,
  selectedIndicatorsCount,
  palette,
}: ChartHeaderProps) {
  return (
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
          {timeframeOptions.map((timeframe) => (
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
            onClick={() => onChartViewChange("candles")}
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
            onClick={() => onChartViewChange("line")}
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
          onClick={onIndicatorsClick}
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
          onClick={onToolsClick}
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
  );
}