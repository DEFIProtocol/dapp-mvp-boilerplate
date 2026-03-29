import type { ChartToolType } from "@/lib/chartPreferences";
import type { ChartToolDefinition } from "./index";
import type { DrawPoint, PositionDrawing } from "./drawing";

export const LONG_TOOL: ChartToolDefinition = {
  id: "long" satisfies ChartToolType,
  label: "Long Position",
  description: "Draw long risk-reward box"
};

export const SHORT_TOOL: ChartToolDefinition = {
  id: "short" satisfies ChartToolType,
  label: "Short Position",
  description: "Draw short risk-reward box"
};

export const buildPositionDrawing = (
  kind: "long" | "short",
  entry: DrawPoint,
  stopPoint: DrawPoint
): PositionDrawing => {
  const adjustedStopPrice = kind === "long"
    ? Math.min(stopPoint.price, entry.price * 0.999)
    : Math.max(stopPoint.price, entry.price * 1.001);

  const riskPct = Math.abs((entry.price - adjustedStopPrice) / entry.price);
  const riskReward = 2;
  const targetPrice = kind === "long"
    ? entry.price * (1 + riskPct * riskReward)
    : entry.price * (1 - riskPct * riskReward);

  return {
    id: `${Date.now()}-${Math.random()}`,
    kind,
    entry,
    stop: { ...stopPoint, price: adjustedStopPrice },
    targetPrice
  };
};
