import type {
  PlacePerpOrderRequest,
  PlacePerpOrderResponse,
  TraderPositionsResponse,
} from "@/types/perpsTrading";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export async function placePerpOrder(input: PlacePerpOrderRequest): Promise<PlacePerpOrderResponse> {
  const response = await fetch(`${API_BASE}/smart-contracts/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as PlacePerpOrderResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to place perp order");
  }

  return data;
}

export async function getTraderPerpPositions(
  trader: string,
  symbol: string,
  perpAddress: string,
): Promise<TraderPositionsResponse> {
  const query = new URLSearchParams({ symbol, perpAddress });
  const response = await fetch(`${API_BASE}/smart-contracts/positions/${trader}?${query.toString()}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as TraderPositionsResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch trader positions");
  }

  return data;
}
