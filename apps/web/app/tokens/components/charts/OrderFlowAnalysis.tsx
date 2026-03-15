// components/charts/OrderFlowAnalysis.tsx
import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics: SimulationMetrics[];
}

interface OrderFlowData {
  step: number;
  newOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  netOrderFlow: number;
  fillRate: number;
  spread: number;
  slippage: number;
}

export const OrderFlowAnalysis: React.FC<Props> = ({ metrics }) => {
  const [timeRange, setTimeRange] = useState<'all' | 'recent' | 'critical'>('all');
  const [metric, setMetric] = useState<'volume' | 'rates' | 'impact'>('volume');

  const orderFlowData = useMemo(() => {
    return metrics.map(m => {
      const totalOrders = m.newOrders + m.filledOrders + m.cancelledOrders;
      const fillRate = totalOrders > 0 ? (m.filledOrders / totalOrders) * 100 : 0;
      
      return {
        step: m.step,
        newOrders: m.newOrders,
        filledOrders: m.filledOrders,
        cancelledOrders: m.cancelledOrders,
        netOrderFlow: m.newOrders - (m.filledOrders + m.cancelledOrders),
        fillRate,
        spread: m.spreadBps / 100, // Convert to percentage
        slippage: m.slippageBps / 100,
        priceImpact: m.priceImpactBps / 100,
        price: m.price,
      };
    });
  }, [metrics]);

  const filteredData = useMemo(() => {
    if (timeRange === 'all') return orderFlowData;
    if (timeRange === 'recent') return orderFlowData.slice(-50);
    // critical - show only steps with high slippage or price impact
    return orderFlowData.filter(d => d.slippage > 1 || d.priceImpact > 2);
  }, [orderFlowData, timeRange]);

  const stats = useMemo(() => {
    const total = orderFlowData.reduce(
      (acc, d) => ({
        newOrders: acc.newOrders + d.newOrders,
        filledOrders: acc.filledOrders + d.filledOrders,
        cancelledOrders: acc.cancelledOrders + d.cancelledOrders,
        avgFillRate: acc.avgFillRate + d.fillRate,
        maxSlippage: Math.max(acc.maxSlippage, d.slippage),
      }),
      { newOrders: 0, filledOrders: 0, cancelledOrders: 0, avgFillRate: 0, maxSlippage: 0 }
    );
    
    return {
      ...total,
      avgFillRate: total.avgFillRate / orderFlowData.length,
    };
  }, [orderFlowData]);

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
              <span className="text-gray-400">New Orders:</span>
              <span className="font-mono text-blue-400">{data.newOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Filled:</span>
              <span className="font-mono text-green-400">{data.filledOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cancelled:</span>
              <span className="font-mono text-red-400">{data.cancelledOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Fill Rate:</span>
              <span className="font-mono">{data.fillRate.toFixed(1)}%</span>
            </div>
            {metric === 'impact' && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Spread:</span>
                  <span className="font-mono">{data.spread.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Slippage:</span>
                  <span className="font-mono">{data.slippage.toFixed(2)}%</span>
                </div>
              </>
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
          <Activity className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold">Order Flow Analysis</h3>
        </div>
        
        <div className="flex space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="bg-gray-700 text-sm rounded-lg px-3 py-1 border border-gray-600"
          >
            <option value="all">All Time</option>
            <option value="recent">Recent (50 steps)</option>
            <option value="critical">Critical Only</option>
          </select>
          
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as any)}
            className="bg-gray-700 text-sm rounded-lg px-3 py-1 border border-gray-600"
          >
            <option value="volume">Order Volume</option>
            <option value="rates">Fill Rates</option>
            <option value="impact">Market Impact</option>
          </select>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Total Orders</span>
            <Layers className="w-3 h-3 text-gray-400" />
          </div>
          <div className="text-lg font-bold">{stats.newOrders + stats.filledOrders + stats.cancelledOrders}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Fill Rate</span>
            <TrendingUp className="w-3 h-3 text-green-400" />
          </div>
          <div className="text-lg font-bold text-green-400">{stats.avgFillRate.toFixed(1)}%</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Cancellation Rate</span>
            <TrendingDown className="w-3 h-3 text-red-400" />
          </div>
          <div className="text-lg font-bold text-red-400">
            {((stats.cancelledOrders / (stats.newOrders + stats.filledOrders + stats.cancelledOrders)) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Max Slippage</span>
            <Activity className="w-3 h-3 text-yellow-400" />
          </div>
          <div className="text-lg font-bold text-yellow-400">{stats.maxSlippage.toFixed(2)}%</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'volume' ? (
            <AreaChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="newOrders" 
                stackId="1"
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.3}
                name="New Orders"
              />
              <Area 
                type="monotone" 
                dataKey="filledOrders" 
                stackId="1"
                stroke="#10b981" 
                fill="#10b981" 
                fillOpacity={0.3}
                name="Filled Orders"
              />
              <Area 
                type="monotone" 
                dataKey="cancelledOrders" 
                stackId="1"
                stroke="#ef4444" 
                fill="#ef4444" 
                fillOpacity={0.3}
                name="Cancelled Orders"
              />
              <Brush dataKey="step" height={30} stroke="#4b5563" />
            </AreaChart>
          ) : metric === 'rates' ? (
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="fillRate" 
                stroke="#10b981" 
                strokeWidth={2}
                dot={false}
                name="Fill Rate %"
              />
              <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="3 3" />
            </LineChart>
          ) : (
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="spread" 
                stroke="#f59e0b" 
                strokeWidth={2}
                dot={false}
                name="Spread %"
              />
              <Line 
                type="monotone" 
                dataKey="slippage" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={false}
                name="Slippage %"
              />
              <Line 
                type="monotone" 
                dataKey="priceImpact" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                dot={false}
                name="Price Impact %"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="mt-4 text-xs text-gray-400 border-t border-gray-700 pt-3">
        <div className="flex items-start space-x-2">
          <Activity className="w-3 h-3 mt-0.5" />
          <div>
            <span className="text-white font-medium">Insight: </span>
            {stats.maxSlippage > 5 ? (
              <span>High slippage detected - consider adjusting position sizes or adding liquidity</span>
            ) : stats.avgFillRate < 60 ? (
              <span>Low fill rate - market may be illiquid or spread too wide</span>
            ) : (
              <span>Healthy order flow with good execution quality</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};