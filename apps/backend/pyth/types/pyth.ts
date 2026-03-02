// backend/pyth/types/pyth.ts
export interface PythPrice {
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}

export interface PythPriceFeed {
  id: string;
  price: PythPrice;
  ema_price: PythPrice;
  metadata?: {
    slot?: number;
    proof_available_time?: number;
    prev_publish_time?: number;
  };
}

export interface PythBatchPriceResponse {
  [key: string]: PythPriceFeed;
}

export interface PythPriceResponse {
  parsed: PythPriceFeed[];
  binary?: {
    encoding: string;
    data: string[];
  };
}

export interface PythPriceFeedMetadata {
  attributes: {
    asset_type: string;
    base: string;
    description: string;
    display_symbol: string;
    quote_currency: string;
    symbol: string;
    cms_symbol?: string;
    country?: string;
    cqs_symbol?: string;
    nasdaq_symbol?: string;
    schema?: string;
  };
  id: string;
}

// Common price feed IDs for major assets
export const PYTH_PRICE_FEEDS: Record<string, Record<string, string>> = {
  ethereum: {
    'eth/usd': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'btc/usd': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    'sol/usd': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    'avax/usd': '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
    'matic/usd': '0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52',
    'link/usd': '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
    'uni/usd': '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501',
    'aave/usd': '0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445',
  },
  bsc: {
    'bnb/usd': '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
    'cake/usd': '0x2356af9529a1064d41e32d617e2ce1dca5733afa901daba9e2b68dee5d53ecf9',
    'eth/usd': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'btc/usd': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  polygon: {
    'matic/usd': '0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52',
    'eth/usd': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'btc/usd': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
  arbitrum: {
    'eth/usd': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'btc/usd': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    'arb/usd': '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
  },
  avalanche: {
    'avax/usd': '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
    'eth/usd': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'btc/usd': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  },
};