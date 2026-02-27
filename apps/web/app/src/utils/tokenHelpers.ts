// Token data interface
export interface Token {
  id?: string | number;
  symbol: string;
  name?: string;
  price?: string | number;
  marketCap?: string | number;
  market_cap?: string | number;
  volume_24h?: string | number;
  decimals?: number;
  type?: string;
  image?: string;
  uuid?: string;
  chains?: Record<string, string>;
  addresses?: Record<string, string>;
}

// Sort configuration interface
export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * Filter and sort tokens based on search term and sort configuration
 */
export const filterAndSortTokens = (
  tokens: Token[],
  searchTerm: string,
  sortConfig: SortConfig
): Token[] => {
  if (!tokens.length) return [];

  let filtered = tokens;
  
  // Apply search filter
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = tokens.filter(t => 
      t.symbol?.toLowerCase().includes(term) ||
      t.name?.toLowerCase().includes(term)
    );
  }

  // Apply sorting
  if (sortConfig.key) {
    filtered.sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      
      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      // Numeric comparison
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      
      return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }

  return filtered;
};

/**
 * Get sort value for a token based on key
 */
const getSortValue = (token: Token, key: string): string | number => {
  switch(key) {
    case 'symbol':
      return token.symbol?.toLowerCase() || '';
      
    case 'name':
      return token.name?.toLowerCase() || '';
      
    case 'price':
      return parseFloat(token.price as string) || 0;
      
    case 'market_cap':
      return parseFloat(
        (token.marketCap || token.market_cap) as string
      ) || 0;
      
    case 'volume_24h':
      return parseFloat(token.volume_24h as string) || 0;
      
    case 'decimals':
      return token.decimals || 0;
      
    default:
      return 0;
  }
};

/**
 * Format price with appropriate decimal places
 */
export const formatPrice = (price: string | number | undefined | null): string => {
  if (price === undefined || price === null) return '—';
  
  const num = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(num)) return '—';
  
  if (num < 0.000001) return num.toFixed(8);
  if (num < 0.0001) return num.toFixed(6);
  if (num < 0.01) return num.toFixed(6);
  if (num < 1) return num.toFixed(4);
  if (num < 100) return num.toFixed(2);
  if (num < 10000) return num.toFixed(2);
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Format price with currency symbol
 */
export const formatPriceWithSymbol = (
  price: string | number | undefined | null,
  symbol: string = '$'
): string => {
  const formatted = formatPrice(price);
  return formatted === '—' ? formatted : `${symbol}${formatted}`;
};

/**
 * Format market cap with B/M/K suffixes
 */
export const formatMarketCap = (cap: string | number | undefined | null): string => {
  if (cap === undefined || cap === null) return '—';
  
  const num = typeof cap === 'string' ? parseFloat(cap) : cap;
  
  if (isNaN(num)) return '—';
  
  if (num >= 1e12) {
    return `$${(num / 1e12).toFixed(2)}T`;
  }
  if (num >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  }
  if (num >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  }
  if (num >= 1e3) {
    return `$${(num / 1e3).toFixed(2)}K`;
  }
  
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

/**
 * Format large number with B/M/K suffixes (no currency symbol)
 */
export const formatLargeNumber = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null) return '—';
  
  const value = typeof num === 'string' ? parseFloat(num) : num;
  
  if (isNaN(value)) return '—';
  
  if (value >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`;
  }
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }
  
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Format percentage with +/-
 */
export const formatPercentage = (percent: string | number | undefined | null): string => {
  if (percent === undefined || percent === null) return '—';
  
  const num = typeof percent === 'string' ? parseFloat(percent) : percent;
  
  if (isNaN(num)) return '—';
  
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

/**
 * Truncate address for display
 */
export const truncateAddress = (address: string, start: number = 6, end: number = 4): string => {
  if (!address) return '';
  if (address.length <= start + end) return address;
  return `${address.substring(0, start)}...${address.substring(address.length - end)}`;
};

/**
 * Validate if string is a valid Ethereum address
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Get source badge class based on price source
 */
export const getSourceBadgeClass = (source: string): string => {
  switch(source?.toLowerCase()) {
    case 'binance':
      return 'badge binance';
    case 'coinbase':
      return 'badge coinbase';
    case 'coinranking':
      return 'badge coinranking';
    default:
      return 'badge';
  }
};

/**
 * Get source indicator class based on price source
 */
export const getSourceIndicatorClass = (source: string): string => {
  switch(source?.toLowerCase()) {
    case 'binance':
      return 'source-indicator binance';
    case 'coinbase':
      return 'source-indicator coinbase';
    case 'coinranking':
      return 'source-indicator coinranking';
    default:
      return 'source-indicator';
  }
};

/**
 * Group tokens by first letter for alphabet navigation
 */
export const groupTokensByFirstLetter = (tokens: Token[]): Record<string, Token[]> => {
  const groups: Record<string, Token[]> = {};
  
  tokens.forEach(token => {
    const firstLetter = token.symbol?.charAt(0)?.toUpperCase() || '#';
    if (!groups[firstLetter]) {
      groups[firstLetter] = [];
    }
    groups[firstLetter].push(token);
  });
  
  // Sort each group
  Object.keys(groups).forEach(key => {
    groups[key].sort((a, b) => a.symbol.localeCompare(b.symbol));
  });
  
  return groups;
};

/**
 * Calculate token statistics
 */
export const calculateTokenStats = (tokens: Token[]): {
  total: number;
  withPrice: number;
  withMarketCap: number;
  averagePrice: number;
  totalMarketCap: number;
} => {
  let withPrice = 0;
  let withMarketCap = 0;
  let totalPrice = 0;
  let totalMarketCap = 0;
  
  tokens.forEach(token => {
    const price = parseFloat(token.price as string);
    const marketCap = parseFloat((token.marketCap || token.market_cap) as string);
    
    if (!isNaN(price) && price > 0) {
      withPrice++;
      totalPrice += price;
    }
    
    if (!isNaN(marketCap) && marketCap > 0) {
      withMarketCap++;
      totalMarketCap += marketCap;
    }
  });
  
  return {
    total: tokens.length,
    withPrice,
    withMarketCap,
    averagePrice: withPrice > 0 ? totalPrice / withPrice : 0,
    totalMarketCap
  };
};