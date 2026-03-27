import crypto from 'crypto';
import axios from 'axios';

// Type definitions
export interface Asset {
  symbol: string;
  name: string;
  chain: string;
  minAmount: number;
  maxAmount: number;
  icon: string;
  supported: boolean;
  zeroFees?: boolean;
}

export interface PaySession {
  sessionId: string;
  partnerId: string;
  quote: {
    amount: number;
    currency: string;
    destination: {
      address: string;
      chain: string;
      asset: string;
    };
  };
  expiresAt: string;
  createdAt: string;
}

export interface PaySessionRequest {
  amount: number;
  asset?: string;
  walletAddress: string;
  chain?: string;
}

interface CoinbaseCurrency {
  code: string;
  name: string;
  type: string;
  networks?: string[];
  min_amount?: number;
  max_amount?: number;
}

interface CoinbaseRateResponse {
  data: {
    amount: string;
    base: string;
    currency: string;
  };
}

interface SignatureResponse {
  timestamp: number;
  signature: string;
}

// Coinbase API configuration
const COINBASE_API_KEY: string | undefined = process.env.COINBASE_API_KEY || process.env.COINBASE_API;
const COINBASE_API_SECRET: string | undefined = process.env.COINBASE_API_SECRET;
const COINBASE_API_URL: string = 'https://api.coinbase.com/v2';

// Log if API keys are missing
if (!COINBASE_API_KEY) {
  console.warn('⚠️ COINBASE_API_KEY (or legacy COINBASE_API) is not set in environment variables');
}
if (!COINBASE_API_SECRET) {
  console.warn('⚠️ COINBASE_API_SECRET is not set in environment variables');
}

/**
 * Generate Coinbase API signature for authenticated requests
 */
const generateSignature = (method: string, path: string, body: string = ''): SignatureResponse => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = timestamp + method + path + body;
    const signature = crypto
      .createHmac('sha256', COINBASE_API_SECRET || '')
      .update(message)
      .digest('hex');
    
    return {
      timestamp,
      signature
    };
  } catch (error) {
    console.error('Error generating signature:', error);
    return {
      timestamp: Math.floor(Date.now() / 1000),
      signature: 'error-generating-signature'
    };
  }
};

/**
 * Get supported assets from Coinbase
 */
export const getAssets = async (): Promise<Asset[]> => {
  console.log('Fetching assets from Coinbase...');
  
  // Try to call Coinbase API with correct headers
  let assets: Asset[] = [];
  try {
    if (COINBASE_API_KEY && COINBASE_API_SECRET) {
      // Use the correct Coinbase header format
      const { timestamp, signature } = generateSignature('GET', '/v2/currencies');
      
      const response = await axios.get<{ data: CoinbaseCurrency[] }>(`${COINBASE_API_URL}/currencies`, {
        headers: {
          'CB-ACCESS-KEY': COINBASE_API_KEY,
          'CB-ACCESS-SIGN': signature,
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-VERSION': '2024-02-01',
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      if (response.data?.data) {
        assets = response.data.data
          .filter(currency => currency.type === 'crypto')
          .map(currency => ({
            symbol: currency.code,
            name: currency.name,
            chain: currency.networks?.[0] || 'ethereum',
            minAmount: currency.min_amount || 10,
            maxAmount: currency.max_amount || 10000,
            icon: getIconForSymbol(currency.code),
            supported: true,
            zeroFees: currency.code === 'USDC'
          }));
      }
    }
  } catch (apiError) {
    console.log('Coinbase API unavailable, using fallback assets:', (apiError as Error).message);
  }
  
  // If no assets from API, use fallback
  if (assets.length === 0) {
    assets = getFallbackAssets();
  }

  return assets.slice(0, 10);
};

/**
 * Create a Coinbase Pay session
 */
export const createPaySession = async (request: PaySessionRequest): Promise<{ session: PaySession; paymentUrl: string }> => {
  console.log('Creating pay session with data:', request);
  
  const { 
    amount, 
    asset = 'USDC',
    walletAddress,
    chain = 'ethereum'
  } = request;

  // Validation
  if (!amount) {
    throw new Error('Amount is required');
  }
  
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  // Generate a unique session ID
  const sessionId: string = crypto.randomBytes(16).toString('hex');

  // This is where you'd make actual Coinbase Pay API call
  // For now, we'll create a session object
  const paySession: PaySession = {
    sessionId,
    partnerId: process.env.COINBASE_PARTNER_ID || 'test-partner',
    quote: {
      amount: parseFloat(amount.toString()),
      currency: 'USD',
      destination: {
        address: walletAddress,
        chain: chain,
        asset: asset
      }
    },
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    createdAt: new Date().toISOString()
  };

  // Generate a payment URL
  const paymentUrl: string = `https://pay.coinbase.com/buy/select-asset?session=${sessionId}`;

  console.log('Session created successfully:', sessionId);

  return {
    session: paySession,
    paymentUrl
  };
};

/**
 * Get exchange rate from Coinbase
 */
export const getExchangeRate = async (asset: string, amount?: string): Promise<{
  asset: string;
  rate: number | null;
  estimatedAmount: number | null;
  timestamp: string;
}> => {
  console.log(`Fetching rate for ${asset}${amount ? ` with amount ${amount}` : ''}`);

  let rate: number | null = null;
  try {
    if (COINBASE_API_KEY && COINBASE_API_SECRET) {
      // Use correct Coinbase headers for rate endpoint
      const path = `/v2/prices/${asset}-USD/spot`;
      const { timestamp, signature } = generateSignature('GET', path);
      
      const response = await axios.get<CoinbaseRateResponse>(`${COINBASE_API_URL}${path}`, {
        headers: {
          'CB-ACCESS-KEY': COINBASE_API_KEY,
          'CB-ACCESS-SIGN': signature,
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-VERSION': '2024-02-01',
          'Content-Type': 'application/json'
        },
        timeout: 3000
      });
      
      rate = parseFloat(response.data.data.amount);
    }
  } catch (apiError) {
    console.log('Coinbase API unavailable for rate, using fallback');
  }

  // Fallback rates
  if (!rate) {
    rate = getFallbackRate(asset);
  }
  
  const estimatedAmount: number | null = amount && rate ? parseFloat(amount) / rate : null;

  return {
    asset,
    rate,
    estimatedAmount,
    timestamp: new Date().toISOString()
  };
};

/**
 * Get fallback assets when API is unavailable
 */
const getFallbackAssets = (): Asset[] => {
  return [
    { symbol: 'ETH', name: 'Ethereum', chain: 'ethereum', minAmount: 20, maxAmount: 10000, icon: '⟠', supported: true },
    { symbol: 'SOL', name: 'Solana', chain: 'solana', minAmount: 10, maxAmount: 5000, icon: '◎', supported: true },
    { symbol: 'USDC', name: 'USD Coin', chain: 'ethereum', minAmount: 10, maxAmount: 10000, icon: '●', supported: true, zeroFees: true },
    { symbol: 'USDT', name: 'Tether', chain: 'ethereum', minAmount: 10, maxAmount: 10000, icon: '₮', supported: true }
  ];
};

/**
 * Get fallback rate when API is unavailable
 */
const getFallbackRate = (asset: string): number | null => {
  const fallbackRates: Record<string, number> = {
    ETH: 2800,
    SOL: 140,
    USDC: 1,
    USDT: 1,
    BTC: 43000,
    ADA: 0.45,
    BNB: 320
  };
  return fallbackRates[asset.toUpperCase()] || null;
};

/**
 * Helper function to get icon for symbol
 */
const getIconForSymbol = (symbol: string): string => {
  const icons: Record<string, string> = {
    BTC: '₿',
    ETH: '⟠',
    SOL: '◎',
    USDC: '●',
    USDT: '₮',
    ADA: '🔷',
    BNB: 'ⓑ',
    MATIC: '⬡',
    DOT: '●',
    AVAX: '🔺'
  };
  return icons[symbol] || '🪙';
};