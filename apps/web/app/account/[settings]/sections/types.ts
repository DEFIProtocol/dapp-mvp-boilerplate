import type { UserPreferences } from "@/lib/api/users";
import type { Dispatch, SetStateAction } from "react";

export type SettingsSectionId =
  | "account"
  | "chains"
  | "notifications"
  | "theme"
  | "chartLayout"
  | "trading";

export interface ChartSummaryItem {
  surfaceKey: string;
  label: string;
  timeframe: string;
  chartType: string;
  indicators: string[];
  activeTool: string;
}

export interface IndicatorListItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  implemented: boolean;
}

export interface PreferencesSectionProps {
  preferences: UserPreferences;
  setPreferences: Dispatch<SetStateAction<UserPreferences>>;
}
