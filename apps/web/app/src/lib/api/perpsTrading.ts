import type {
  PlacePerpOrderRequest,
  PlacePerpOrderResponse,
  TraderPositionsResponse,
} from "@/types/perpsTrading";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

export async function placePerpOrder(input: PlacePerpOrderRequest): Promise<PlacePerpOrderResponse> {
  const response = await fetch(`${API_BASE}/api/smart-contracts/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    // Try to parse error response
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Failed to place perp order");
    } catch {
      throw new Error(`Failed to place perp order: ${response.status} ${response.statusText}`);
    }
  }

  const data = (await response.json()) as PlacePerpOrderResponse;
  return data;
}

export async function getTraderPerpPositions(
  trader: string,
  symbol: string,
  perpAddress: string,
): Promise<TraderPositionsResponse> {
  const query = new URLSearchParams({ 
    chainId: '84532', // Base Sepolia
    symbol, 
    perpAddress 
  });
  const response = await fetch(`${API_BASE}/api/smart-contracts/positions/${trader}?${query.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Failed to fetch trader positions");
    } catch {
      throw new Error(`Failed to fetch trader positions: ${response.status} ${response.statusText}`);
    }
  }

  const data = (await response.json()) as TraderPositionsResponse;
  return data;
}
