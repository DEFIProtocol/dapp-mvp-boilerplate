// config/scenarios.ts
export interface ScenarioConfig {
  name: string;
  description: string;
  duration: number; // steps
  priceModel: {
    type: 'randomWalk' | 'trending' | 'volatilityShock' | 'blackSwan';
    initialPrice: number;
    volatility: number; // daily volatility
    trend?: number; // trend strength (positive or negative)
    shockStep?: number; // step at which shock occurs
    shockMagnitude?: number; // -0.3 for 30% drop
  };
  traderActivity: {
    baseFrequency: number; // base trade probability
    volumeMultiplier: number; // scales trade sizes
  };
}

export const SCENARIOS: Record<string, ScenarioConfig> = {
  normal: {
    name: 'Normal Market',
    description: 'Low volatility, steady trading',
    duration: 10000,
    priceModel: {
      type: 'randomWalk',
      initialPrice: 2000,
      volatility: 0.002 // 0.2% per step
    },
    traderActivity: {
      baseFrequency: 0.2,
      volumeMultiplier: 1.0
    }
  },
  
  bullRun: {
    name: 'Bull Run',
    description: 'Strong upward trend with high trading volume',
    duration: 15000,
    priceModel: {
      type: 'trending',
      initialPrice: 2000,
      volatility: 0.003,
      trend: 0.005 // 0.5% upward per step
    },
    traderActivity: {
      baseFrequency: 0.3,
      volumeMultiplier: 1.5
    }
  },
  
  bearMarket: {
    name: 'Bear Market',
    description: 'Strong downward trend with panic selling',
    duration: 15000,
    priceModel: {
      type: 'trending',
      initialPrice: 2000,
      volatility: 0.004,
      trend: -0.006 // 0.6% downward per step
    },
    traderActivity: {
      baseFrequency: 0.35,
      volumeMultiplier: 1.3
    }
  },
  
  volatilityShock: {
    name: 'Volatility Shock',
    description: 'Sudden market volatility spike',
    duration: 12000,
    priceModel: {
      type: 'volatilityShock',
      initialPrice: 2000,
      volatility: 0.002,
      shockStep: 5000,
      shockMagnitude: -0.3 // 30% drop at step 5000
    },
    traderActivity: {
      baseFrequency: 0.2,
      volumeMultiplier: 1.0
    }
  },
  
  blackSwan: {
    name: 'Black Swan Crash',
    description: 'Extreme market event - tests insurance fund',
    duration: 8000,
    priceModel: {
      type: 'blackSwan',
      initialPrice: 2000,
      volatility: 0.002,
      shockStep: 3000,
      shockMagnitude: -0.7 // 70% crash!
    },
    traderActivity: {
      baseFrequency: 0.25,
      volumeMultiplier: 1.2
    }
  },
  
  liquidityCrisis: {
    name: 'Liquidity Crisis',
    description: 'Few traders, large positions - tests liquidation engine',
    duration: 5000,
    priceModel: {
      type: 'randomWalk',
      initialPrice: 2000,
      volatility: 0.004
    },
    traderActivity: {
      baseFrequency: 0.05, // Very few trades
      volumeMultiplier: 3.0 // But large sizes
    }
  }
};