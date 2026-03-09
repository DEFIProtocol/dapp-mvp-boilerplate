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
      maxLeverage: 2,
      tradeFrequency: 0.3, // 30% chance per step
      maxPositions: 10
    }
  },
  {
    name: 'Momentum Traders',
    type: 'momentum',
    count: 10,
    balance: '100000', // 100k USDC each
    behavior: {
      minTradeSize: '5000',
      maxTradeSize: '25000',
      minLeverage: 2,
      maxLeverage: 5,
      tradeFrequency: 0.2,
      maxPositions: 5
    }
  },
  {
    name: 'Retail Traders',
    type: 'retail',
    count: 50,
    balance: '10000', // 10k USDC each
    behavior: {
      minTradeSize: '100',
      maxTradeSize: '5000',
      minLeverage: 15,
      maxLeverage: 40,
      tradeFrequency: 0.1,
      maxPositions: 3
    }
  },
  {
    name: 'Whales',
    type: 'whale',
    count: 2,
    balance: '5000000', // 5M USDC each
    behavior: {
      minTradeSize: '500000',
      maxTradeSize: '2000000',
      minLeverage: 5,
      maxLeverage: 10,
      tradeFrequency: 0.05,
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
      minTradeSize: '10000',
      maxTradeSize: '100000',
      minLeverage: 1,
      maxLeverage: 3,
      tradeFrequency: 0.15
    }
  }
];