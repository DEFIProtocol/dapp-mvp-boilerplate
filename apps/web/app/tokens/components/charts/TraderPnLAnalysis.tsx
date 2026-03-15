// components/charts/TraderPnLAnalysis.tsx
import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Skull } from 'lucide-react';
import type { Position, LiquidationActivity } from '../../types/simulation';

interface Props {
  positions: Position[];
  liquidations: LiquidationActivity[];
  metrics: SimulationMetrics[];
}

interface PnLBucket {
  range: string;
  count: number;
  totalPnL: number;
  color: string;
}

interface SurvivorData {
  step: number;
  activeTraders: number;
  liquidatedTraders: number;
  survivalRate: number;
}

export const TraderPnLAnalysis: React.FC<Props> = ({ positions, liquidations, metrics }) => {
  const [view, setView] = useState<'distribution' | 'survival' | 'whales'>('distribution');

  const pnlDistribution = useMemo(() => {
    const buckets: PnLBucket[] = [
      { range: 'Loss > $10k', count: 0, totalPnL: 0, color: '#7f1d1d' },
      { range: 'Loss $5-10k', count: 0, totalPnL: 0, color: '#b91c1c' },
      { range: 'Loss $1-5k', count: 0, totalPnL: 0, color: '#ef4444' },
      { range: 'Loss < $1k', count: 0, totalPnL: 0, color: '#fca5a5' },
      { range: 'Profit < $1k', count: 0, totalPnL: 0, color: '#86efac' },
      { range: 'Profit $1-5k', count: 0, totalPnL: 0, color: '#22c55e' },
      { range: 'Profit $5-10k', count: 0, totalPnL: 0, color: '#15803d' },
      { range: 'Profit > $10k', count: 0, totalPnL: 0, color: '#14532d' },
    ];

    positions.forEach(pos => {
      const pnl = pos.pnl;
      if (pnl < -10000) {
        buckets[0].count++;
        buckets[0].totalPnL += pnl;
      } else if (pnl < -5000) {
        buckets[1].count++;
        buckets[1].totalPnL += pnl;
      } else if (pnl < -1000) {
        buckets[2].count++;
        buckets[2].totalPnL += pnl;
      } else if (pnl < 0) {
        buckets[3].count++;
        buckets[3].totalPnL += pnl;
      } else if (pnl < 1000) {
        buckets[4].count++;
        buckets[4].totalPnL += pnl;
      } else if (pnl < 5000) {
        buckets[5].count++;
        buckets[5].totalPnL += pnl;
      } else if (pnl < 10000) {
        buckets[6].count++;
        buckets[6].totalPnL += pnl;
      } else {
        buckets[7].count++;
        buckets[7].totalPnL += pnl;
      }
    });

    return buckets;
  }, [positions]);

  const survivalData = useMemo(() => {
    const cumulativeLiquidations: number[] = [];
    let total = 0;
    
    liquidations.forEach(l => {
      total += l.liquidations;
      cumulativeLiquidations.push(total);
    });

    const totalTraders = positions.length + total;
    
    return metrics.map((m, idx) => ({
      step: m.step,
      activeTraders: positions.length,
      liquidatedTraders: cumulativeLiquidations[idx] || 0,
      survivalRate: totalTraders > 0 
        ? ((totalTraders - (cumulativeLiquidations[idx] || 0)) / totalTraders) * 100 
        : 100,
    }));
  }, [positions, liquidations, metrics]);

  const whaleData = useMemo(() => {
    return positions
      .filter(p => Math.abs(p.pnl) > 5000 || p.size > 50000)
      .map(p => ({
        name: p.trader.slice(0, 6) + '...',
        pnl: p.pnl,
        size: p.size / 1000,
        leverage: p.leverage,
        isProfitable: p.pnl > 0,
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 10);
  }, [positions]);

  const stats = useMemo(() => {
    const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
    const profitableTraders = positions.filter(p => p.pnl > 0).length;
    const totalLiquidations = liquidations.reduce((sum, l) => sum + l.liquidations, 0);
    
    return {
      totalPnL,
      avgPnL: totalPnL / positions.length,
      profitableTraders,
      profitablePercent: (profitableTraders / positions.length) * 100,
      totalLiquidations,
      largestWinner: Math.max(...positions.map(p => p.pnl)),
      largestLoser: Math.min(...positions.map(p => p.pnl)),
    };
  }, [positions, liquidations]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-sm font-medium mb-2">
            {data.range || data.name || `Step ${data.step}`}
          </p>
          <div className="space-y-1 text-xs">
            {data.count !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-400">Traders:</span>
                <span className="font-mono">{data.count}</span>
              </div>
            )}
            {data.totalPnL !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-400">Total PnL:</span>
                <span className={`font-mono ${data.totalPnL > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${Math.abs(data.totalPnL).toLocaleString()}
                </span>
              </div>
            )}
            {data.survivalRate !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-400">Survival Rate:</span>
                <span className="font-mono">{data.survivalRate.toFixed(1)}%</span>
              </div>
            )}
            {data.pnl !== undefined && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">PnL:</span>
                  <span className={`font-mono ${data.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${Math.abs(data.pnl).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Size:</span>
                  <span className="font-mono">${(data.size * 1000).toLocaleString()}</span>
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
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold">Trader PnL Analysis</h3>
        </div>
        
        <div className="flex bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setView('distribution')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'distribution' ? 'bg-emerald-600 text-white' : 'text-gray-300'
            }`}
          >
            Distribution
          </button>
          <button
            onClick={() => setView('survival')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'survival' ? 'bg-emerald-600 text-white' : 'text-gray-300'
            }`}
          >
            Survival
          </button>
          <button
            onClick={() => setView('whales')}
            className={`px-3 py-1 text-sm rounded-md transition ${
              view === 'whales' ? 'bg-emerald-600 text-white' : 'text-gray-300'
            }`}
          >
            Whales
          </button>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400">Total PnL</div>
          <div className={`text-lg font-bold ${stats.totalPnL > 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${Math.abs(stats.totalPnL).toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400">Profitable</div>
          <div className="text-lg font-bold text-green-400">
            {stats.profitablePercent.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400">Liquidations</div>
          <div className="text-lg font-bold text-red-400">
            {stats.totalLiquidations}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400">Largest Win</div>
          <div className="text-lg font-bold text-green-400">
            ${Math.abs(stats.largestWinner).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'distribution' ? (
            <BarChart data={pnlDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" />
              <YAxis type="category" dataKey="range" stroke="#9ca3af" width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Number of Traders">
                {pnlDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          ) : view === 'survival' ? (
            <LineChart data={survivalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" domain={[0, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="survivalRate" 
                stroke="#10b981" 
                strokeWidth={3}
                dot={false}
                name="Survival Rate %"
              />
              <Line 
                type="monotone" 
                dataKey="activeTraders" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
                name="Active Traders"
              />
            </LineChart>
          ) : (
            <BarChart data={whaleData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" stroke="#9ca3af" width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pnl" name="PnL">
                {whaleData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="flex items-center space-x-1 text-green-400 mb-1">
            <TrendingUp className="w-3 h-3" />
            <span>Top Winner</span>
          </div>
          <div className="text-white font-mono">
            ${Math.max(...positions.map(p => p.pnl), 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-2">
          <div className="flex items-center space-x-1 text-red-400 mb-1">
            <TrendingDown className="w-3 h-3" />
            <span>Top Loser</span>
          </div>
          <div className="text-white font-mono">
            ${Math.abs(Math.min(...positions.map(p => p.pnl), 0)).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};