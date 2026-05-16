export type SpotOrderSide = "buy" | "sell";
export type SpotOrderIntentStatus = "queued" | "open" | "filled" | "cancelled" | "expired" | "rejected";

export interface SpotMarket {
  symbol: string;
  name: string;
  token_address?: string;
  icon_url?: string;
}

export interface SpotDepthLevel {
  price: number;
  size: number;
  total: number;
}

export interface SpotPosition {
  id: string;
  trader: string;
  symbol: string;
  name: string;
  side: SpotOrderSide;
  quantity: number;
  entryPrice: number;
  openedAt: string;
  status: "open" | "closed";
}

export interface PlaceSpotOrderRequest {
  trader?: string;
  market: SpotMarket;
  side: SpotOrderSide;
  quantity: number;
  executionPrice: number;
}

export interface SpotOrderEstimate {
  executionPrice: number;
  notional: number;
  fees: number;
  total: number;
}

export interface SpotOrderBook {
  bids: SpotDepthLevel[];
  asks: SpotDepthLevel[];
}

export interface SpotOrderIntentRequest {
  symbol: string;
  trader: string;
  side: SpotOrderSide;
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
}

export interface SpotOrderIntent {
  id: string;
  createdAt: string;
  symbol: string;
  trader: string;
  side: SpotOrderSide;
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  status: SpotOrderIntentStatus;
}

export interface SpotOrderFallbackQuote {
  source: "reference";
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadBps: number;
  midPrice: number;
}

export interface SpotOrderBookResponse {
  success: boolean;
  marketType: "spot";
  symbol: string;
  depth: number;
  bids: SpotDepthLevel[];
  asks: SpotDepthLevel[];
  spread: number | null;
  spreadBps: number | null;
  fallbackQuote?: SpotOrderFallbackQuote;
  timestamp: string;
  error?: string;
}

export interface SpotOrderMutationResponse {
  success: boolean;
  order?: SpotOrderIntent;
  error?: string;
}

export interface SpotOrderIntentsResponse {
  success: boolean;
  trader: string;
  symbol?: string;
  orders: SpotOrderIntent[];
  error?: string;
}
