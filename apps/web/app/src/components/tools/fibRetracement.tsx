import type { ChartToolType } from "@/lib/chartPreferences";
import type { ChartToolDefinition } from "./index";

export const FIB_LEVELS = [1, 0.618, 0.5, 0.382, 0] as const;

export const FIB_TOOL: ChartToolDefinition = {
  id: "fib" satisfies ChartToolType,
  label: "Fib Retracement",
  description: "Draw fibonacci retracement levels"
};
