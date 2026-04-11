export type SpotOrderSide = "buy" | "sell";

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
