export type OrderSide = "LONG" | "SHORT";
export type OrderType = "market" | "limit";
export type OrderIntentStatus = "queued" | "open" | "filled" | "cancelled" | "expired" | "rejected";

export type PlacePerpOrderRequest = {
  symbol: string;
  perpAddress: string;
  trader: string;
  side: OrderSide;
  orderType: OrderType;
  exposureUsd: number;
  leverage: number;
  limitPrice?: number;
};

export type PendingPerpOrder = {
  id: string;
  createdAt: string;
  symbol: string;
  perpAddress: string;
  trader: string;
  side: OrderSide;
  orderType: OrderType;
  exposureUsd: number;
  leverage: number;
  limitPrice?: number;
  status: OrderIntentStatus;
};

export type TraderPositionSnapshot = {
  positionId: string;
  trader: string;
  side: OrderSide;
  exposure: string;
  margin: string;
  entryPrice: string;
  active: boolean;
  exposureUsd: string;
  marginUsd: string;
  entryPriceUsd: string;
  unrealizedPnlUsd: string;
  unrealizedFundingUsd: string;
  equityUsd: string;
};

export type PlacePerpOrderResponse = {
  success: boolean;
  order?: PendingPerpOrder;
  onChain?: {
    markPrice: string;
    markPriceUsd: number;
    engineExecution: string;
    note: string;
  };
  error?: string;
};

export type TraderPositionsResponse = {
  success: boolean;
  trader: string;
  symbol?: string;
  perpAddress?: string;
  markPrice: string;
  markPriceUsd: number;
  positions: TraderPositionSnapshot[];
  pendingOrders: PendingPerpOrder[];
  error?: string;
};

export type OrderBookLevel = {
  price: number;
  size: number;
  total: number;
  orders: number;
};

export type OrderBookFallbackQuote = {
  source: "reference";
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadBps: number;
  midPrice: number;
};

export type PerpsOrderBookResponse = {
  success: boolean;
  marketType: "perps";
  symbol: string;
  depth: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number | null;
  spreadBps: number | null;
  fallbackQuote?: OrderBookFallbackQuote;
  timestamp: string;
  error?: string;
};

export type PerpsOrderMutationResponse = {
  success: boolean;
  order?: PendingPerpOrder;
  error?: string;
};
