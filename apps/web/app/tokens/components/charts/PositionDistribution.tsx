// components/charts/PositionDistribution.tsx
import React, { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { Users, TrendingUp, TrendingDown, Target } from 'lucide-react';
import type { Position } from '../../types/simulation';

interface Props {
  positions?: Position[];
}

interface LeverageBucket {
  range: string;
  count: number;
  totalSize: number;
  color: string;
}

interface PnLDataPoint {
  trader: string;
  pnl: number;
  leverage: number;
  size: number;
  isProfitable: boolean;
}

export const PositionDistribution: React.FC<Props> = ({ positions = [] }) => {
  const [view, setView] = useState<'leverage' | 'pnl' | 'scatter'>('leverage');

  const leverageDistribution = useMemo(() => {
    const buckets: LeverageBucket[] = [
      { range: '1-3x', count: 0, totalSize: 0, color: '#10b981' },
      { range: '3-5x', count: 0, totalSize: 0, color: '#3b82f6' },
      { range: '5-10x', count: 0, totalSize: 0, color: '#8b5cf6' },
      { range: '10-15x', count: 0, totalSize: 0, color: '#f59e0b' },
      { range: '15-20x', count: 0, totalSize: 0, color: '#ef4444' },
    ];

    positions.forEach(pos => {
      const lev = pos.leverage;
      if (lev <= 3) {
        buckets[0].count++;
        buckets[0].totalSize += pos.size;
      } else if (lev <= 5) {
        buckets[1].count++;
        buckets[1].totalSize += pos.size;
      } else if (lev <= 10) {
        buckets[2].count++;
        buckets[2].totalSize += pos.size;
      } else if (lev <= 15) {
        buckets[3].count++;
        buckets[3].totalSize += pos.size;
      } else {
        buckets[4].count++;
        buckets[4].totalSize += pos.size;
      }
    });

    return buckets;
  }, [positions]);

  const pnlData = useMemo(() => {
    return positions
      .map(pos => ({
        trader: pos.trader.slice(0, 6) + '...' + pos.trader.slice(-4),
        pnl: pos.pnl,
        leverage: pos.leverage,
        size: pos.size,
        isProfitable: pos.pnl > 0,
        pnlPercent: parseFloat(pos.pnlPercent),
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [positions]);

  const scatterData = useMemo(() => {
    return positions.map(pos => ({
      x: pos.leverage,
      y: pos.size / 1000, // Scale for visualization
      z: Math.abs(pos.pnl) / 100,
      name: pos.trader.slice(0, 6) + '...',
      pnl: pos.pnl,
      isProfitable: pos.pnl > 0,
    }));
  }, [positions]);

  const totalLongs = positions.filter(p => p.pnl > 0).length;
  const totalShorts = positions.filter(p => p.pnl < 0).length;
  const avgLeverage = positions.reduce((sum, p) => sum + p.leverage, 0) / positions.length || 0;
  const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-sm font-medium mb-2">{data.trader || data.name}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Leverage:</span>
              <span className="font-mono">{data.leverage?.toFixed(2) || data.x?.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Size:</span>
              <span className="font-mono">${(data.size || data.y * 1000).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">PnL:</span>
              <span className={`font-mono ${data.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${Math.abs(data.pnl || 0).toLocaleString()} {data.pnl > 0 ? '▲' : '▼'}
              </span>
            </div>
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
          <Target className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Position Distribution</h3>
        </div>
        
        {/* View Toggle */}
        <div className="flex bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setView('leverage')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'leverage' ? 'bg-purple-600 text-white' : 'text-gray-300'
            }`}
          >
            Leverage
          </button>
          <button
            onClick={() => setView('pnl')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'pnl' ? 'bg-purple-600 text-white' : 'text-gray-300'
            }`}
          >
            PnL
          </button>
          <button
            onClick={() => setView('scatter')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'scatter' ? 'bg-purple-600 text-white' : 'text-gray-300'
            }`}
          >
            Scatter
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-xs text-gray-400">Total Positions</div>
          <div className="text-lg font-bold">{positions.length}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-xs text-gray-400">Avg Leverage</div>
          <div className="text-lg font-bold">{avgLeverage.toFixed(2)}x</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-xs text-gray-400">Winning</div>
          <div className="text-lg font-bold text-green-400">{totalLongs}</div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="text-xs text-gray-400">Total PnL</div>
          <div className={`text-lg font-bold ${totalPnL > 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${Math.abs(totalPnL).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'leverage' ? (
            <BarChart data={leverageDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="range" stroke="#9ca3af" />
              <YAxis yAxisId="left" stroke="#9ca3af" />
              <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar yAxisId="left" dataKey="count" name="Position Count" fill="#8b5cf6" />
              <Bar yAxisId="right" dataKey="totalSize" name="Total Size ($)" fill="#3b82f6" />
            </BarChart>
          ) : view === 'pnl' ? (
            <BarChart data={pnlData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" />
              <YAxis type="category" dataKey="trader" stroke="#9ca3af" width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pnl" name="PnL">
                {pnlData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Leverage" 
                unit="x" 
                stroke="#9ca3af"
                domain={[0, 'auto']}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Size" 
                unit="k" 
                stroke="#9ca3af"
              />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Scatter 
                name="Positions" 
                data={scatterData} 
                fill="#8884d8"
                shape="circle"
              >
                {scatterData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isProfitable ? '#10b981' : '#ef4444'} />
                ))}
              </Scatter>
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {view === 'leverage' && (
        <div className="flex flex-wrap gap-3 mt-3 text-xs">
          {leverageDistribution.map((bucket, idx) => (
            <div key={idx} className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bucket.color }} />
              <span className="text-gray-400">{bucket.range}:</span>
              <span className="text-white">{bucket.count} pos</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};