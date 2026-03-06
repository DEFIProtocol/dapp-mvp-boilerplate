export type OrderSide = "LONG" | "SHORT";
export type OrderType = "market" | "limit";

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
  status: "queued";
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
