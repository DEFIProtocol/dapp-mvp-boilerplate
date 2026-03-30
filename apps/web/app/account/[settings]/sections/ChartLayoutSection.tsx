import { BarChart3 } from "lucide-react";
import type { ChartSummaryItem, IndicatorListItem } from "./types";
import styles from "../SettingsPage.module.css";

interface ChartLayoutSectionProps {
  chartSummary: ChartSummaryItem[];
  indicatorList: IndicatorListItem[];
}

export function ChartLayoutSection({ chartSummary, indicatorList }: ChartLayoutSectionProps) {
  return (
    <div className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardIcon}>
            <BarChart3 size={18} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Chart Layout</h2>
            <p className={styles.cardDescription}>Per-surface chart controls and indicator status</p>
          </div>
        </div>
      </div>

      <div className={styles.chartSummarySection}>
        {chartSummary.map((item) => (
          <div key={item.surfaceKey} className={styles.chartSurfaceCard}>
            <div className={styles.chartSurfaceTitle}>{item.label}</div>
            <div className={styles.chartSurfaceMeta}>
              <span>{item.timeframe}</span>
              <span>{item.chartType}</span>
              <span>{item.activeTool}</span>
            </div>
            <div className={styles.chartSurfaceIndicators}>Indicators: {item.indicators.join(", ") || "none"}</div>
          </div>
        ))}

        <div className={styles.indicatorListWrap}>
          <div className={styles.indicatorListTitle}>All Indicators</div>
          <ul className={styles.indicatorList}>
            {indicatorList.map((indicator) => (
              <li key={indicator.id} className={styles.indicatorListItem}>
                <div>
                  <div className={styles.indicatorName}>{indicator.label}</div>
                  <div className={styles.indicatorDescription}>{indicator.description}</div>
                </div>
                <span className={`${styles.indicatorStatus} ${indicator.enabled ? styles.indicatorEnabled : styles.indicatorDisabled}`}>
                  {indicator.implemented ? (indicator.enabled ? "enabled" : "disabled") : "coming soon"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
