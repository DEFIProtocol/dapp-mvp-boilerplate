'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics: SimulationMetrics[];
  currentStep: number;
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

const SYMBOL_OPTIONS = ['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'LINK'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const TokenPricePanel: React.FC<Props> = ({
  metrics,
  currentStep,
  selectedSymbol,
  onSymbolChange,
}) => {
  const currentMetric = metrics[currentStep];

  const priceData = React.useMemo(
    () =>
      metrics.slice(0, currentStep + 1).map((metric, index) => {
        const previousPrice = index > 0 ? metrics[index - 1]?.price ?? metric.price : metric.price;
        return {
          step: metric.step,
          price: metric.price,
          upperBand: Math.max(metric.price, previousPrice),
          lowerBand: Math.min(metric.price, previousPrice),
        };
      }),
    [metrics, currentStep]
  );

  const currentStepData = priceData[priceData.length - 1];

  const chartMin = priceData.length > 0 ? Math.min(...priceData.map((point) => point.lowerBand)) : 0;
  const chartMax = priceData.length > 0 ? Math.max(...priceData.map((point) => point.upperBand)) : 0;

  const domainPadding = Math.max((chartMax - chartMin) * 0.1, 1);

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Token Price</h3>
          <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-200">
            Simulation Playback
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={selectedSymbol}
            onChange={(event) => onSymbolChange(event.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            {SYMBOL_OPTIONS.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          <div className="text-sm font-mono text-blue-300">
            {formatCurrency(currentMetric?.price ?? 0)}
          </div>
        </div>
      </div>

      {priceData.length > 0 ? (
        <div className="h-[360px] rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceData}>
              <defs>
                <linearGradient id="tokenPriceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                domain={[chartMin - domainPadding, chartMax + domainPadding]}
                tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
                formatter={(value: unknown) => [formatCurrency(Number(value) || 0), 'Price']}
                labelFormatter={(label) => `Step ${label}`}
              />
              <ReferenceLine
                x={currentStepData?.step}
                stroke="#22d3ee"
                strokeDasharray="4 4"
                label={{ value: 'Current', fill: '#22d3ee', position: 'insideTopRight' }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#tokenPriceGradient)"
                name="Simulation Price"
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#93c5fd"
                strokeWidth={1}
                dot={false}
                name="Price Path"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[360px] bg-gray-900/40 rounded-lg border border-gray-700 p-3 flex items-center justify-center text-sm text-gray-400">
          No simulation price data available.
        </div>
      )}
    </div>
  );
};
