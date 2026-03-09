export interface ScenarioConfig {
  name: string;
  description: string;
  duration: number; // steps
  priceModel: {
    type: 'randomWalk' | 'trending' | 'volatilityShock' | 'blackSwan' | 'frozen';
    initialPrice: number;
    volatility: number; // daily volatility
    trend?: number; // trend strength (positive or negative)
    targetReturnPct?: number; // total return target over scenario (e.g. 133 for +133%)
    targetReturnHorizonSteps?: number; // steps over which target return should be achieved
    maxStepMovePct?: number; // hard cap for sideways models (e.g. 0.005 = +/-0.5%)
    shockStep?: number; // step at which shock occurs
    shockMagnitude?: number; // -0.3 for 30% drop
    shockDirection?: 'up' | 'down' | 'either';
    shockMagnitudeMin?: number;
    shockMagnitudeMax?: number;
  };
  traderActivity: {
    baseFrequency: number; // base trade probability
    volumeMultiplier: number; // scales trade sizes
  };
}

export const SCENARIOS: Record<string, ScenarioConfig> = {
  normal: {
    name: 'Normal Market',
    description: 'Sideways market with small bounded moves',
    duration: 10000,
    priceModel: {
      type: 'randomWalk',
      initialPrice: 2000,
      volatility: 0.002,
      maxStepMovePct: 0.005 // +/-0.5% step bound
    },
    traderActivity: {
      baseFrequency: 0.2,
      volumeMultiplier: 1.0
    }
  },
  
  bullRun: {
    name: 'Bull Run',
    description: 'Persistent uptrend with a target +133% move over the run',
    duration: 15000,
    priceModel: {
      type: 'trending',
      initialPrice: 2000,
      volatility: 0.001,
      targetReturnPct: 133,
      targetReturnHorizonSteps: 1000,
      trend: 0.001
    },
    traderActivity: {
      baseFrequency: 0.3,
      volumeMultiplier: 1.5
    }
  },
  
  bearMarket: {
    name: 'Bear Market',
    description: 'Persistent downtrend mirroring bull-run magnitude',
    duration: 15000,
    priceModel: {
      type: 'trending',
      initialPrice: 2000,
      volatility: 0.001,
      targetReturnPct: -57,
      targetReturnHorizonSteps: 1000,
      trend: -0.001
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
    description: 'Normal regime, one-off extreme shock, then normal regime resumes',
    duration: 8000,
    priceModel: {
      type: 'blackSwan',
      initialPrice: 2000,
      volatility: 0.002,
      shockStep: 300,
      maxStepMovePct: 0.005,
      shockDirection: 'either',
      shockMagnitudeMin: 0.6,
      shockMagnitudeMax: 0.8,
      shockMagnitude: -0.7 // fallback for compatibility
    },
    traderActivity: {
      baseFrequency: 0.25,
      volumeMultiplier: 1.2
    }
  },

  blackSwanDown: {
    name: 'Black Swan Crash (Forced Down)',
    description: 'Normal regime, forced one-off 60-80% crash, then normal regime resumes',
    duration: 8000,
    priceModel: {
      type: 'blackSwan',
      initialPrice: 2000,
      volatility: 0.002,
      shockStep: 300,
      maxStepMovePct: 0.005,
      shockDirection: 'down',
      shockMagnitudeMin: 0.6,
      shockMagnitudeMax: 0.8,
      shockMagnitude: -0.7
    },
    traderActivity: {
      baseFrequency: 0.25,
      volumeMultiplier: 1.2
    }
  },

  blackSwanUp: {
    name: 'Black Swan Melt-up (Forced Up)',
    description: 'Normal regime, forced one-off +500% to +600% appreciation, then normal regime resumes',
    duration: 8000,
    priceModel: {
      type: 'blackSwan',
      initialPrice: 2000,
      volatility: 0.002,
      shockStep: 300,
      maxStepMovePct: 0.005,
      shockDirection: 'up',
      shockMagnitudeMin: 0.6,
      shockMagnitudeMax: 0.8,
      shockMagnitude: 5.5
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
  },

  liquidationCascade: {
    name: 'Liquidation Cascade',
    description: 'Sharp sell-off with high leverage unwind pressure',
    duration: 10000,
    priceModel: {
      type: 'volatilityShock',
      initialPrice: 2000,
      volatility: 0.004,
      shockStep: 1800,
      shockMagnitude: -0.2
    },
    traderActivity: {
      baseFrequency: 0.38,
      volumeMultiplier: 1.8
    }
  },

  oracleFailure: {
    name: 'Oracle Failure (Frozen Price)',
    description: 'Price feed stalls while trading pressure continues',
    duration: 6000,
    priceModel: {
      type: 'frozen',
      initialPrice: 2000,
      volatility: 0.0
    },
    traderActivity: {
      baseFrequency: 0.2,
      volumeMultiplier: 1.0
    }
  }
};

// Alias to support CLI usage with "bearRun"
SCENARIOS.bearRun = SCENARIOS.bearMarket;