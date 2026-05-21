import type { ChartIndicatorId } from "@/lib/chartPreferences";
import { CHART_INDICATORS, isImplementedIndicator } from "../indicators";
import { formatIndicatorValue, latest } from "../utils/chartHelpers";

interface IndicatorsPanelProps {
  enabledIndicators: ChartIndicatorId[];
  indicatorQuery: string;
  onIndicatorQueryChange: (query: string) => void;
  onToggleIndicator: (id: ChartIndicatorId) => void;
  ema9: Array<{ value: number }>;
  ema21: Array<{ value: number }>;
  ema50: Array<{ value: number }>;
  palette: any;
}

export function IndicatorsPanel({
  enabledIndicators,
  indicatorQuery,
  onIndicatorQueryChange,
  onToggleIndicator,
  ema9,
  ema21,
  ema50,
  palette,
}: IndicatorsPanelProps) {
  const filteredIndicators = (() => {
    const query = indicatorQuery.trim().toLowerCase();
    if (!query) return CHART_INDICATORS;
    return CHART_INDICATORS.filter((indicator) => {
      const haystack = `${indicator.label} ${indicator.description}`.toLowerCase();
      return haystack.includes(query);
    });
  })();

  return (
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
          onChange={(event) => onIndicatorQueryChange(event.target.value)}
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
              onClick={() => onToggleIndicator(indicator.id)}
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
  );
}