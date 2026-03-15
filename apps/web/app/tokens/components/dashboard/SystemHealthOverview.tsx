// components/dashboard/SystemHealthOverview.tsx
import React from 'react';
import { 
  Shield, 
  TrendingUp, 
  Users, 
  AlertTriangle,
  DollarSign,
  Activity 
} from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics?: SimulationMetrics;
}

export const SystemHealthOverview: React.FC<Props> = ({ metrics }) => {
  if (!metrics) return null;

  const kpiCards = [
    {
      title: 'Total Value Locked',
      value: metrics.tvl,
      format: 'currency',
      icon: TrendingUp,
      color: 'blue',
      delta: metrics.marginVaultDelta,
    },
    {
      title: 'Open Interest',
      value: metrics.openInterest,
      format: 'currency',
      icon: Activity,
      color: 'purple',
      delta: metrics.openInterest - (metrics as any).previousOpenInterest,
    },
    {
      title: 'Insurance Fund',
      value: metrics.insuranceBalance,
      format: 'currency',
      icon: Shield,
      color: 'green',
      delta: metrics.insuranceBalanceDelta,
    },
    {
      title: 'Protocol Revenue',
      value: metrics.protocolRevenue,
      format: 'currency',
      icon: DollarSign,
      color: 'yellow',
      delta: metrics.protocolRevenueDelta,
    },
    {
      title: 'Active Traders',
      value: metrics.uniqueTraders,
      format: 'number',
      icon: Users,
      color: 'pink',
    },
    {
      title: 'Positions at Risk',
      value: metrics.positionsAtRisk,
      format: 'number',
      icon: AlertTriangle,
      color: 'red',
      warning: metrics.positionsAtRisk > 0,
    },
  ];

  const formatValue = (value: number, format: string) => {
    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }
    return value.toLocaleString();
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpiCards.map((card, index) => {
        const Icon = card.icon;
        const delta = card.delta;
        const isPositive = delta && delta > 0;
        
        return (
          <div
            key={index}
            className={`bg-gray-800/50 rounded-xl p-4 border ${
              card.warning 
                ? 'border-red-500/50 animate-pulse' 
                : 'border-gray-700'
            } hover:border-${card.color}-500/50 transition-all group`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                {card.title}
              </span>
              <Icon className={`w-4 h-4 text-${card.color}-400`} />
            </div>
            
            <div className="text-lg font-bold mb-1">
              {formatValue(card.value, card.format)}
            </div>
            
            {delta !== undefined && (
              <div className={`text-xs flex items-center ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`}>
                <span className="mr-1">{isPositive ? '▲' : '▼'}</span>
                {formatValue(Math.abs(delta), card.format)}
                <span className="text-gray-500 ml-1">(step)</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};