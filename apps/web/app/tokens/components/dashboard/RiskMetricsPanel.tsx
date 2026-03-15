// components/dashboard/RiskMetricsPanel.tsx
import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { AlertTriangle, Shield, TrendingDown } from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics?: SimulationMetrics;
  historicalMetrics: SimulationMetrics[];
}

export const RiskMetricsPanel: React.FC<Props> = ({ metrics, historicalMetrics }) => {
  if (!metrics) return null;

  const solvencyData = historicalMetrics.map(m => ({
    step: m.step,
    solvency: m.solvencyBuffer,
    price: m.price / 100, // Scale for visualization
    threshold: 0,
  }));

  const riskIndicators = [
    {
      label: 'Solvency Buffer',
      value: metrics.solvencyBuffer,
      threshold: 10,
      unit: '%',
      status: metrics.solvencyBuffer > 20 ? 'healthy' : 
              metrics.solvencyBuffer > 10 ? 'warning' : 'critical',
      icon: Shield,
    },
    {
      label: 'Bad Debt',
      value: metrics.badDebt,
      threshold: 1000,
      unit: '$',
      status: metrics.badDebt === 0 ? 'healthy' : 
              metrics.badDebt < 5000 ? 'warning' : 'critical',
      icon: AlertTriangle,
    },
    {
      label: 'Liquidation Rate',
      value: metrics.liquidationsPer100Orders,
      threshold: 10,
      unit: '%',
      status: metrics.liquidationsPer100Orders < 5 ? 'healthy' :
              metrics.liquidationsPer100Orders < 15 ? 'warning' : 'critical',
      icon: TrendingDown,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'warning': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/20 animate-pulse';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Risk Metrics</h3>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-gray-400">Healthy</span>
          </div>
          <div className="flex items-center space-x-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
            <span className="text-gray-400">Warning</span>
          </div>
          <div className="flex items-center space-x-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-red-400"></div>
            <span className="text-gray-400">Critical</span>
          </div>
        </div>
      </div>

      {/* Risk Indicators */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {riskIndicators.map((indicator, idx) => {
          const Icon = indicator.icon;
          const statusColor = getStatusColor(indicator.status);
          
          return (
            <div key={idx} className={`p-3 rounded-lg border ${statusColor}`}>
              <div className="flex items-center justify-between mb-1">
                <Icon className="w-4 h-4" />
                <span className="text-xs opacity-75">{indicator.unit}</span>
              </div>
              <div className="text-lg font-bold">
                {indicator.unit === '%' 
                  ? indicator.value.toFixed(2) 
                  : indicator.value.toLocaleString()}
              </div>
              <div className="text-xs opacity-75 mt-1">{indicator.label}</div>
            </div>
          );
        })}
      </div>

      {/* Solvency Chart */}
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={solvencyData}>
            <defs>
              <linearGradient id="solvencyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="step" 
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis 
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
                color: '#fff',
              }}
            />
            <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine y={20} stroke="#eab308" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="solvency"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#solvencyGradient)"
              name="Solvency Buffer %"
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#9ca3af"
              strokeWidth={1}
              dot={false}
              name="Price (scaled)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Risk Warnings */}
      {metrics.positionsAtRisk > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400 font-medium">
              {metrics.positionsAtRisk} position{metrics.positionsAtRisk > 1 ? 's' : ''} at risk of liquidation
            </span>
          </div>
        </div>
      )}
    </div>
  );
};