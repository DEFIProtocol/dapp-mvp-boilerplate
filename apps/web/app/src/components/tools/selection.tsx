import type { ChartToolType } from "@/lib/chartPreferences";
import type { ChartToolDefinition } from "./index";

export const POINTER_TOOL: ChartToolDefinition = {
  id: "pointer" satisfies ChartToolType,
  label: "Pointer",
  description: "Select and edit all drawings"
};
