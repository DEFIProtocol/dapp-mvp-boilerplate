import { getApiBaseUrl } from "./config";
import type {
  OrderIntentStatus,
  PlacePerpOrderRequest,
  PlacePerpOrderResponse,
  PerpsOrderBookResponse,
  PerpsOrderMutationResponse,
  TraderPositionsResponse,
} from "@dapp/trading-types/perps";

export async function placePerpOrder(input: PlacePerpOrderRequest): Promise<PlacePerpOrderResponse> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/orders`, {
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
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/positions/${trader}?${query.toString()}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as TraderPositionsResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch trader positions");
  }

  return data;
}

export async function getPerpsOrderBook(symbol: string, depth = 8): Promise<PerpsOrderBookResponse> {
  const encodedSymbol = encodeURIComponent(symbol.toUpperCase());
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/perps/orderbook/${encodedSymbol}?depth=${depth}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as PerpsOrderBookResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch perp orderbook");
  }

  return data;
}

export async function cancelPerpOrder(orderId: string, trader: string): Promise<PerpsOrderMutationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trader }),
  });

  const data = (await response.json()) as PerpsOrderMutationResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to cancel perp order");
  }

  return data;
}

export async function updatePerpOrderStatus(
  orderId: string,
  trader: string,
  status: OrderIntentStatus,
): Promise<PerpsOrderMutationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trader, status }),
  });

  const data = (await response.json()) as PerpsOrderMutationResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to update perp order status");
  }

  return data;
}
