export interface AgentConfig {
  name: string;
  type: 'marketMaker' | 'momentum' | 'retail' | 'whale' | 'liquidator' | 'arbitrageur';
  count: number;
  balance: string; // in USDC
  behavior: {
    minTradeSize: string;
    maxTradeSize: string;
    minLeverage: number;
    maxLeverage: number;
    tradeFrequency: number; // probability per step
    maxPositions?: number;
  };
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    name: 'Market Makers',
    type: 'marketMaker',
    count: 5,
    balance: '500000', // 500k USDC each
    behavior: {
      minTradeSize: '10000',
      maxTradeSize: '50000',
      minLeverage: 1,
      maxLeverage: 3,
      tradeFrequency: 0.22,
      maxPositions: 10
    }
  },
  {
    name: 'Momentum / Swing Traders',
    type: 'momentum',
    count: 10,
    balance: '100000', // 100k USDC each
    behavior: {
      minTradeSize: '2000',
      maxTradeSize: '10000',
      minLeverage: 3,
      maxLeverage: 10,
      tradeFrequency: 0.16,
      maxPositions: 5
    }
  },
  {
    name: 'Retail Traders',
    type: 'retail',
    count: 50,
    balance: '10000', // 10k USDC each
    behavior: {
      minTradeSize: '200',
      maxTradeSize: '600',
      minLeverage: 20,
      maxLeverage: 50,
      tradeFrequency: 0.35,
      maxPositions: 4
    }
  },
  {
    name: 'Whales',
    type: 'whale',
    count: 2,
    balance: '5000000', // 5M USDC each
    behavior: {
      minTradeSize: '500000',
      maxTradeSize: '1500000',
      minLeverage: 2,
      maxLeverage: 5,
      tradeFrequency: 0.03,
      maxPositions: 2
    }
  },
  {
    name: 'Liquidators',
    type: 'liquidator',
    count: 3,
    balance: '200000', // 200k USDC for gas and margin
    behavior: {
      minTradeSize: '0',
      maxTradeSize: '0',
      minLeverage: 1,
      maxLeverage: 1,
      tradeFrequency: 1.0 // Always check for liquidations
    }
  },
  {
    name: 'Arbitrageurs',
    type: 'arbitrageur',
    count: 2,
    balance: '500000',
    behavior: {
      minTradeSize: '5000',
      maxTradeSize: '50000',
      minLeverage: 2,
      maxLeverage: 6,
      tradeFrequency: 0.1
    }
  }
];