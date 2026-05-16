import { getApiBaseUrl } from "./config";
import type {
  SpotOrderIntent,
  SpotOrderIntentRequest,
  SpotOrderIntentStatus,
  SpotOrderBookResponse,
  SpotOrderIntentsResponse,
  SpotOrderMutationResponse,
} from "@dapp/trading-types/spot";

export async function placeSpotOrderIntent(input: SpotOrderIntentRequest): Promise<SpotOrderIntent> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/spot/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as { success: boolean; order?: SpotOrderIntent; error?: string };
  if (!response.ok || !data.success || !data.order) {
    throw new Error(data.error || "Failed to place spot order intent");
  }

  return data.order;
}

export async function getSpotOrderBook(symbol: string, depth = 8): Promise<SpotOrderBookResponse> {
  const encodedSymbol = encodeURIComponent(symbol.toUpperCase());
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/spot/orderbook/${encodedSymbol}?depth=${depth}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as SpotOrderBookResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch spot orderbook");
  }

  return data;
}

export async function getSpotOrderIntents(trader: string, symbol?: string): Promise<SpotOrderIntent[]> {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol.toUpperCase())}` : "";
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/spot/orders/${encodeURIComponent(trader)}${query}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as SpotOrderIntentsResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to fetch spot order intents");
  }

  return data.orders;
}

export async function cancelSpotOrderIntent(orderId: string, trader: string): Promise<SpotOrderMutationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/spot/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trader }),
  });

  const data = (await response.json()) as SpotOrderMutationResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to cancel spot order intent");
  }

  return data;
}

export async function updateSpotOrderIntentStatus(
  orderId: string,
  trader: string,
  status: SpotOrderIntentStatus,
): Promise<SpotOrderMutationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/smart-contracts/spot/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trader, status }),
  });

  const data = (await response.json()) as SpotOrderMutationResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to update spot order intent status");
  }

  return data;
}
