// components/charts/LiquidationHeatMap.tsx
import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from 'recharts';
import { Flame, TrendingDown, AlertTriangle } from 'lucide-react';
import type { SimulationMetrics, LiquidationActivity } from '../../types/simulation';

interface Props {
  metrics: SimulationMetrics[];
  liquidations: LiquidationActivity[];
  currentStep: number;
  onStepSelect?: (step: number) => void;
}

interface HeatMapDataPoint {
  step: number;
  price: number;
  liquidationVolume: number;
  liquidationCount: number;
  intensity: number;
  isCascade: boolean;
  avgPenalty: number;
}

export const LiquidationHeatMap: React.FC<Props> = ({ 
  metrics, 
  liquidations, 
  currentStep,
  onStepSelect 
}) => {
  const heatMapData = useMemo(() => {
    const data: HeatMapDataPoint[] = [];
    
    // Create price bins for intensity calculation
    const priceSteps = metrics.map(m => m.price);
    const minPrice = Math.min(...priceSteps);
    const maxPrice = Math.max(...priceSteps);
    const priceRange = maxPrice - minPrice;
    
    metrics.forEach((metric, idx) => {
      const liquidation = liquidations[idx];
      const liquidationVolume = liquidation?.marginReturnedFromLiquidation || 0;
      const liquidationCount = liquidation?.liquidations || 0;
      
      // Calculate intensity (0-100) based on volume and frequency
      const volumeIntensity = Math.min(100, (liquidationVolume / 50000) * 100);
      const frequencyIntensity = Math.min(100, (liquidationCount / 10) * 100);
      const intensity = Math.min(100, (volumeIntensity + frequencyIntensity) / 2);
      
      // Detect cascade liquidations (multiple in same step or high volume)
      const isCascade = liquidationCount >= 3 || liquidationVolume > 100000;
      
      // Calculate average penalty per liquidation
      const avgPenalty = liquidationCount > 0 
        ? (liquidation?.liquidationPenaltyCollected || 0) / liquidationCount 
        : 0;
      
      data.push({
        step: metric.step,
        price: metric.price,
        liquidationVolume,
        liquidationCount,
        intensity,
        isCascade,
        avgPenalty,
      });
    });
    
    return data;
  }, [metrics, liquidations]);

  const getIntensityColor = (intensity: number) => {
    if (intensity === 0) return '#1f2937'; // gray-800
    if (intensity < 20) return '#fef3c7'; // yellow-100
    if (intensity < 40) return '#fcd34d'; // yellow-300
    if (intensity < 60) return '#f59e0b'; // yellow-500
    if (intensity < 80) return '#dc2626'; // red-600
    return '#7f1d1d'; // red-900
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-sm font-medium mb-2">Step {data.step}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Price:</span>
              <span className="font-mono">${data.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Liquidations:</span>
              <span className="font-mono text-red-400">{data.liquidationCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Volume:</span>
              <span className="font-mono">${data.liquidationVolume.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Penalty:</span>
              <span className="font-mono">${data.avgPenalty.toFixed(2)}</span>
            </div>
            {data.isCascade && (
              <div className="flex items-center space-x-1 text-yellow-400 mt-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Cascade Event</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Flame className="w-5 h-5 text-orange-400" />
          <h3 className="text-lg font-semibold">Liquidation Volcano</h3>
        </div>
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-gray-700 rounded" />
            <span className="text-gray-400">No activity</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-300 rounded" />
            <span className="text-gray-400">Low</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-orange-500 rounded" />
            <span className="text-gray-400">Medium</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-600 rounded" />
            <span className="text-gray-400">High</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-900 rounded" />
            <span className="text-gray-400">Extreme</span>
          </div>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={heatMapData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="step" 
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              label={{ 
                value: 'Price ($)', 
                angle: -90, 
                position: 'insideLeft',
                style: { fill: '#9ca3af' }
              }}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              label={{ 
                value: 'Liquidation Volume', 
                angle: 90, 
                position: 'insideRight',
                style: { fill: '#9ca3af' }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Price line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="price"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Price"
            />
            
            {/* Liquidation volume bars with intensity-based coloring */}
            <Bar
              yAxisId="right"
              dataKey="liquidationVolume"
              name="Liquidation Volume"
              onClick={(data) => onStepSelect?.(data.step)}
            >
              {heatMapData.map((entry, index) => (
                <rect
                  key={`bar-${index}`}
                  fill={getIntensityColor(entry.intensity)}
                  cursor="pointer"
                  className="transition-opacity hover:opacity-80"
                />
              ))}
            </Bar>
            
            {/* Cascade markers */}
            <Scatter
              yAxisId="right"
              dataKey="liquidationCount"
              data={heatMapData.filter(d => d.isCascade)}
              fill="#eab308"
              shape="star"
              name="Cascade Event"
            />
            
            {/* Current step indicator */}
            <ReferenceArea
              x1={currentStep - 0.5}
              x2={currentStep + 0.5}
              yAxisId="left"
              stroke="#eab308"
              strokeWidth={2}
              strokeDasharray="3 3"
              fill="#eab308"
              fillOpacity={0.1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        {[
          {
            label: 'Total Liquidations',
            value: liquidations.reduce((sum, l) => sum + l.liquidations, 0),
            color: 'text-red-400',
          },
          {
            label: 'Total Volume',
            value: `$${liquidations.reduce((sum, l) => sum + l.marginReturnedFromLiquidation, 0).toLocaleString()}`,
            color: 'text-orange-400',
          },
          {
            label: 'Cascade Events',
            value: heatMapData.filter(d => d.isCascade).length,
            color: 'text-yellow-400',
          },
          {
            label: 'Avg Penalty',
            value: `$${(liquidations.reduce((sum, l) => sum + l.liquidationPenaltyCollected, 0) / 
              liquidations.reduce((sum, l) => sum + l.liquidations, 0) || 0).toFixed(2)}`,
            color: 'text-green-400',
          },
        ].map((stat, idx) => (
          <div key={idx} className="bg-gray-900/50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};