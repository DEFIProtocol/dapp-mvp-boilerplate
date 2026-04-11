export type OptionType = "call" | "put";
export type OptionSide = "buy" | "sell";

export interface OptionsUnderlying {
  symbol: string;
  name: string;
  token_address?: string;
  icon_url?: string;
  max_leverage?: number;
}

export interface OptionSeries {
  id: string;
  underlying: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  expiryLabel: string;
  daysToExpiry: number;
  iv: number;
  bid: number;
  ask: number;
  mark: number;
  change24h: number;
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  breakeven: number;
  inTheMoney: boolean;
}

export interface OptionPosition {
  id: string;
  trader: string;
  seriesId: string;
  underlying: string;
  optionType: OptionType;
  side: OptionSide;
  strike: number;
  expiry: string;
  expiryLabel: string;
  quantity: number;
  entryPremium: number;
  openedAt: string;
  status: "open" | "closed";
}

export interface PlaceOptionOrderRequest {
  trader?: string;
  series: OptionSeries;
  side: OptionSide;
  quantity: number;
}

export interface OptionFilters {
  expiry: string;
  optionType: "all" | OptionType;
  search: string;
}
