import type { ChartToolType } from "@/lib/chartPreferences";
import { TRENDLINE_TOOL_ID } from "./drawing";
import { FIB_TOOL } from "./fibRetracement";
import { LONG_TOOL, SHORT_TOOL } from "./longPnl";
import { POINTER_TOOL } from "./selection";

export interface ChartToolDefinition {
  id: ChartToolType;
  label: string;
  description: string;
}

export const TRENDLINE_TOOL: ChartToolDefinition = {
  id: TRENDLINE_TOOL_ID,
  label: "Trendline",
  description: "Draw a straight trendline"
};

export const CHART_TOOLS: ChartToolDefinition[] = [
  POINTER_TOOL,
  TRENDLINE_TOOL,
  FIB_TOOL,
  LONG_TOOL,
  SHORT_TOOL
];
