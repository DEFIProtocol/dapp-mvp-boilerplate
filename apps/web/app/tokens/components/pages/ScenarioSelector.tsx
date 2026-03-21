// components/simulation/ScenarioSelector.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronDown, 
  RefreshCw, 
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Zap,
  BarChart3,
  Check,
  Info,
} from 'lucide-react';
import { SimulationApi } from '../services/simulationApi';

interface Props {
  currentScenario: string;
  onSelectScenario: (scenarioId: string) => void;
  onRefresh?: () => void;
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  type: 'bull' | 'bear' | 'blackswan' | 'normal' | 'volatile' | 'custom';
  icon: React.ReactNode;
  color: string;
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  lastRun?: string;
  metrics?: {
    volatility: number;
    drawdown: number;
    volume: number;
  };
}

const SCENARIO_META: Record<
  string,
  {
    name: string;
    description: string;
    type: Scenario['type'];
    color: string;
    riskLevel: Scenario['riskLevel'];
    metrics: { volatility: number; drawdown: number; volume: number };
  }
> = {
  normal: {
    name: 'Normal Market',
    description: 'Sideways market with bounded ±0.5% moves per step',
    type: 'normal',
    color: 'blue',
    riskLevel: 'low',
    metrics: { volatility: 12, drawdown: 5, volume: 500000 },
  },
  bullRun: {
    name: 'Bull Run',
    description: 'Persistent uptrend targeting +133% over the run',
    type: 'bull',
    color: 'green',
    riskLevel: 'medium',
    metrics: { volatility: 40, drawdown: 15, volume: 1200000 },
  },
  bearMarket: {
    name: 'Bear Market',
    description: 'Persistent downtrend targeting -57%',
    type: 'bear',
    color: 'red',
    riskLevel: 'high',
    metrics: { volatility: 55, drawdown: 57, volume: 800000 },
  },
  volatilityShock: {
    name: 'Volatility Shock',
    description: 'Normal regime with a sudden ~30% drawdown shock',
    type: 'volatile',
    color: 'yellow',
    riskLevel: 'high',
    metrics: { volatility: 80, drawdown: 30, volume: 900000 },
  },
  blackSwan: {
    name: 'Black Swan (Random)',
    description: 'One-off extreme shock (direction randomized)',
    type: 'blackswan',
    color: 'purple',
    riskLevel: 'extreme',
    metrics: { volatility: 120, drawdown: 70, volume: 2000000 },
  },
  blackSwanDown: {
    name: 'Black Swan Crash (Down)',
    description: 'Forced 60-80% crash followed by regime normalization',
    type: 'blackswan',
    color: 'purple',
    riskLevel: 'extreme',
    metrics: { volatility: 130, drawdown: 80, volume: 2500000 },
  },
  blackSwanUp: {
    name: 'Black Swan Melt-up (Up)',
    description: 'Forced +500% to +600% melt-up followed by normalization',
    type: 'blackswan',
    color: 'purple',
    riskLevel: 'extreme',
    metrics: { volatility: 130, drawdown: 20, volume: 3000000 },
  },
  liquidityCrisis: {
    name: 'Liquidity Crisis',
    description: 'Few traders, large notional sizes, liquidation stress',
    type: 'volatile',
    color: 'yellow',
    riskLevel: 'high',
    metrics: { volatility: 70, drawdown: 45, volume: 1500000 },
  },
  liquidationCascade: {
    name: 'Liquidation Cascade',
    description: 'Shock-driven unwind cascade with elevated liquidation pressure',
    type: 'volatile',
    color: 'yellow',
    riskLevel: 'extreme',
    metrics: { volatility: 100, drawdown: 50, volume: 1800000 },
  },
  oracleFailure: {
    name: 'Oracle Failure',
    description: 'Frozen price feed while trading activity continues',
    type: 'normal',
    color: 'gray',
    riskLevel: 'medium',
    metrics: { volatility: 0, drawdown: 10, volume: 300000 },
  },
};

const SCENARIO_ORDER = [
  'normal',
  'bullRun',
  'bearMarket',
  'volatilityShock',
  'blackSwan',
  'blackSwanDown',
  'blackSwanUp',
  'liquidityCrisis',
  'liquidationCascade',
  'oracleFailure',
];

export const ScenarioSelector: React.FC<Props> = ({ 
  currentScenario, 
  onSelectScenario,
  onRefresh 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredScenario, setHoveredScenario] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load available scenarios
  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    setIsLoading(true);
    try {
      // Try to load from API first
      const runs = await SimulationApi.getSimulationRuns();
      const latestByScenario = new Map<string, string>();
      for (const run of runs.runs) {
        if (!run.scenario || !SCENARIO_META[run.scenario]) continue;
        const existing = latestByScenario.get(run.scenario);
        if (!existing || existing < run.createdAt) {
          latestByScenario.set(run.scenario, run.createdAt);
        }
      }

      const defaultScenarios: Scenario[] = SCENARIO_ORDER.map((scenarioId) => {
        const meta = SCENARIO_META[scenarioId];
        return {
          id: scenarioId,
          name: meta.name,
          description: meta.description,
          type: meta.type,
          icon: getScenarioIcon(meta.type),
          color: meta.color,
          riskLevel: meta.riskLevel,
          lastRun: latestByScenario.get(scenarioId)
            ? new Date(latestByScenario.get(scenarioId) as string).toLocaleString()
            : undefined,
          metrics: meta.metrics,
        };
      });

      setScenarios(defaultScenarios);
    } catch (error) {
      console.error('Failed to load scenarios:', error);
      // Fallback to defaults
      setScenarios(
        SCENARIO_ORDER.map((scenarioId) => {
          const meta = SCENARIO_META[scenarioId];
          return {
            id: scenarioId,
            name: meta.name,
            description: meta.description,
            type: meta.type,
            icon: getScenarioIcon(meta.type),
            color: meta.color,
            riskLevel: meta.riskLevel,
            metrics: meta.metrics,
          };
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions for scenario metadata
  const getScenarioType = (scenario: string): Scenario['type'] => {
    return SCENARIO_META[scenario]?.type ?? 'normal';
  };

  const getScenarioIcon = (type: Scenario['type']) => {
    switch (type) {
      case 'bull': return <TrendingUp className="w-4 h-4" />;
      case 'bear': return <TrendingDown className="w-4 h-4" />;
      case 'blackswan': return <AlertTriangle className="w-4 h-4" />;
      case 'volatile': return <Zap className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  const getScenarioColor = (type: Scenario['type']): string => {
    switch (type) {
      case 'bull': return 'green';
      case 'bear': return 'red';
      case 'blackswan': return 'purple';
      case 'volatile': return 'yellow';
      default: return 'blue';
    }
  };

  const getScenarioRisk = (scenario: string): Scenario['riskLevel'] => {
    return SCENARIO_META[scenario]?.riskLevel ?? 'low';
  };

  const getScenarioDescription = (scenario: string): string => {
    return SCENARIO_META[scenario]?.description ?? 'Standard market conditions';
  };

  const currentScenarioData = scenarios.find(s => s.name === currentScenario || s.id === currentScenario);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-400 bg-green-400/10';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10';
      case 'high': return 'text-orange-400 bg-orange-400/10';
      case 'extreme': return 'text-red-400 bg-red-400/10 animate-pulse';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg border border-gray-700 transition group"
      >
        {currentScenarioData ? (
          <>
            <span className={getScenarioColor(currentScenarioData.type)}>
              {currentScenarioData.icon}
            </span>
            <span className="text-sm font-medium">{currentScenarioData.name}</span>
          </>
        ) : (
          <>
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm">Select Scenario</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        
        {isLoading && (
          <RefreshCw className="w-3 h-3 text-gray-400 animate-spin ml-2" />
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="p-3 border-b border-gray-700 bg-gray-900/50">
            <h3 className="text-sm font-medium">Select Simulation Scenario</h3>
            <p className="text-xs text-gray-400 mt-1">Choose market conditions to simulate</p>
          </div>

          {/* Scenario List */}
          <div className="max-h-96 overflow-y-auto">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => {
                  onSelectScenario(scenario.id);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHoveredScenario(scenario.id)}
                onMouseLeave={() => setHoveredScenario(null)}
                className={`w-full text-left p-3 border-b border-gray-700 last:border-0 transition ${
                  (scenario.name === currentScenario || scenario.id === currentScenario)
                    ? 'bg-blue-600/20 hover:bg-blue-600/30'
                    : 'hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-start space-x-3">
                  {/* Icon */}
                  <div className={`p-2 rounded-lg ${
                    scenario.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                    scenario.color === 'green' ? 'bg-green-500/20 text-green-400' :
                    scenario.color === 'red' ? 'bg-red-500/20 text-red-400' :
                    scenario.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                    scenario.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {scenario.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium">{scenario.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getRiskColor(scenario.riskLevel)}`}>
                        {scenario.riskLevel}
                      </span>
                    </div>
                    
                    <p className="text-xs text-gray-400 mb-2">{scenario.description}</p>
                    
                    {/* Metrics (shown on hover) */}
                    {hoveredScenario === scenario.id && scenario.metrics && (
                      <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-700">
                        <div>
                          <div className="text-xs text-gray-500">Volatility</div>
                          <div className="text-sm font-mono">{scenario.metrics.volatility.toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Max DD</div>
                          <div className="text-sm font-mono">{scenario.metrics.drawdown.toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Volume</div>
                          <div className="text-sm font-mono">${(scenario.metrics.volume / 1000000).toFixed(1)}M</div>
                        </div>
                      </div>
                    )}

                    {/* Last run info */}
                    {scenario.lastRun && (
                      <div className="flex items-center space-x-1 mt-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        <span>Last run: {scenario.lastRun}</span>
                      </div>
                    )}
                  </div>

                  {/* Selected checkmark */}
                  {(scenario.name === currentScenario || scenario.id === currentScenario) && (
                    <div className="text-blue-400">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Footer with actions */}
          <div className="p-3 border-t border-gray-700 bg-gray-900/50 flex items-center justify-between">
            <button
              onClick={() => {
                onRefresh?.();
                setIsOpen(false);
              }}
              className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  // Load custom scenario
                  setIsOpen(false);
                }}
                className="text-xs bg-blue-600 px-3 py-1 rounded-lg hover:bg-blue-700 transition"
              >
                Load Selected
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs bg-gray-700 px-3 py-1 rounded-lg hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Info Tooltip (optional) */}
      {currentScenarioData && !isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl hidden group-hover:block">
          <div className="text-xs">
            <div className="flex items-center space-x-1 text-gray-400">
              <Info className="w-3 h-3" />
              <span>{currentScenarioData.description}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};