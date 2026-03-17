// pages/DummyTraderPnL.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign,
  Activity,
  Award,
  Skull,
  Flame,
  Target,
  BarChart3,
  RefreshCw,
  Download,
  Eye,
  EyeOff,
} from 'lucide-react';

// Types
interface Trader {
  id: string;
  name: string;
  strategy: string;
  color: string;
  riskProfile: 'conservative' | 'moderate' | 'aggressive' | 'degen';
  avatar: string;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: number;
}

interface PnLPoint {
  step: number;
  timestamp: string;
  pnl: number;
  cumulativePnL: number;
  drawdown: number;
  trade?: {
    size: number;
    leverage: number;
    direction: 'long' | 'short';
    entryPrice: number;
    exitPrice: number;
    pnl: number;
  };
}

interface TraderHistory {
  traderId: string;
  data: PnLPoint[];
}

// Generate realistic dummy data
const generateTraderData = (): { traders: Trader[], histories: TraderHistory[] } => {
  const traders: Trader[] = [
    {
      id: 'trader_1',
      name: 'WhaleHunter_ETH',
      strategy: 'Momentum Following',
      color: '#3b82f6',
      riskProfile: 'aggressive',
      avatar: '🐋',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_2',
      name: 'Satoshi_Smiles',
      strategy: 'Mean Reversion',
      color: '#10b981',
      riskProfile: 'conservative',
      avatar: '😊',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_3',
      name: 'Leverage_KING',
      strategy: 'High Risk High Reward',
      color: '#ef4444',
      riskProfile: 'degen',
      avatar: '👑',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_4',
      name: 'DCA_Chad',
      strategy: 'Dollar Cost Average',
      color: '#8b5cf6',
      riskProfile: 'conservative',
      avatar: '💪',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_5',
      name: 'Scalper_Sam',
      strategy: 'High Frequency',
      color: '#f59e0b',
      riskProfile: 'moderate',
      avatar: '⚡',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_6',
      name: 'HODL_Herbert',
      strategy: 'Buy & Hope',
      color: '#ec4899',
      riskProfile: 'conservative',
      avatar: '🧸',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_7',
      name: 'Arbitrage_Alice',
      strategy: 'Cross-Exchange',
      color: '#14b8a6',
      riskProfile: 'moderate',
      avatar: '🔁',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_8',
      name: 'Liquidator_Larry',
      strategy: 'Liquidation Hunting',
      color: '#f97316',
      riskProfile: 'aggressive',
      avatar: '💀',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_9',
      name: 'Grid_Gary',
      strategy: 'Grid Trading',
      color: '#a855f7',
      riskProfile: 'moderate',
      avatar: '📊',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
    {
      id: 'trader_10',
      name: 'Rekt_Randy',
      strategy: 'YOLO',
      color: '#dc2626',
      riskProfile: 'degen',
      avatar: '🤕',
      winRate: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      trades: 0,
    },
  ];

  // Generate 200 steps of data with different patterns
  const steps = 200;
  const histories: TraderHistory[] = traders.map(trader => {
    const data: PnLPoint[] = [];
    let cumulativePnL = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let wins = 0;
    let trades = 0;

    // Different patterns based on trader strategy
    for (let step = 0; step < steps; step++) {
      const timestamp = new Date(Date.now() - (steps - step) * 3600000).toISOString();
      
      // Generate PnL based on trader profile
      let pnlChange = 0;
      let trade = undefined;

      // Each trader has unique behavior
      switch (trader.id) {
        case 'trader_1': // WhaleHunter - Big swings
          pnlChange = (Math.sin(step / 10) * 5000) + (Math.random() * 1000 - 500);
          if (step % 20 === 0) {
            trade = generateTrade(step, 'long', 100000, 5, 2000);
            pnlChange += trade.pnl;
          }
          break;
          
        case 'trader_2': // Satoshi_Smiles - Steady gains
          pnlChange = 200 + (Math.random() * 100 - 50);
          if (step % 15 === 0 && Math.random() > 0.7) {
            trade = generateTrade(step, 'long', 50000, 2, 2000);
            pnlChange += trade.pnl;
          }
          break;
          
        case 'trader_3': // Leverage_KING - Massive swings, often rekt
          pnlChange = (Math.random() * 10000 - 5000) * 2;
          if (step % 5 === 0) {
            trade = generateTrade(step, Math.random() > 0.5 ? 'long' : 'short', 50000, 10, 2000);
            pnlChange += trade.pnl;
          }
          break;
          
        case 'trader_4': // DCA_Chad - Slow and steady
          pnlChange = 50 + (Math.random() * 30);
          break;
          
        case 'trader_5': // Scalper_Sam - Small frequent gains
          pnlChange = (Math.random() * 200 - 50);
          if (step % 3 === 0) {
            trade = generateTrade(step, Math.random() > 0.6 ? 'long' : 'short', 10000, 1, 2000);
            pnlChange += trade.pnl;
          }
          break;
          
        case 'trader_6': // HODL_Herbert - Mostly flat, occasional spikes
          pnlChange = (Math.sin(step / 30) * 1000);
          if (step === 150) { // Big win at step 150
            trade = generateTrade(step, 'long', 200000, 1, 2000);
            pnlChange += 15000;
          }
          break;
          
        case 'trader_7': // Arbitrage_Alice - Small consistent profits
          pnlChange = 100 + (Math.random() * 50);
          break;
          
        case 'trader_8': // Liquidator_Larry - Big gains during crashes
          pnlChange = (Math.random() * 500 - 200);
          if (step > 100 && step < 120) { // During a crash
            pnlChange += 5000;
            trade = generateTrade(step, 'short', 150000, 8, 2000);
          }
          break;
          
        case 'trader_9': // Grid_Gary - Range bound
          pnlChange = Math.sin(step / 5) * 300;
          break;
          
        case 'trader_10': // Rekt_Randy - Usually loses money
          pnlChange = -200 + (Math.random() * 400 - 400);
          if (step % 10 === 0) {
            trade = generateTrade(step, 'long', 100000, 15, 2000);
            pnlChange -= Math.abs(trade.pnl) * 0.8; // Usually loses
          }
          break;
      }

      cumulativePnL += pnlChange;
      
      // Track peak for drawdown calculation
      if (cumulativePnL > peak) {
        peak = cumulativePnL;
      }
      const drawdown = peak > 0 ? ((peak - cumulativePnL) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      
      // Track wins
      if (pnlChange > 0) wins++;
      if (trade) trades++;

      data.push({
        step,
        timestamp,
        pnl: pnlChange,
        cumulativePnL,
        drawdown,
        trade,
      });
    }

    // Update trader stats
    trader.winRate = (wins / steps) * 100;
    trader.totalPnL = cumulativePnL;
    trader.maxDrawdown = maxDrawdown;
    trader.trades = trades;
    
    // Calculate Sharpe ratio (simplified)
    const returns = data.map(d => d.pnl);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length);
    trader.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    return { traderId: trader.id, data };
  });

  return { traders, histories };
};

const generateTrade = (step: number, direction: 'long' | 'short', size: number, leverage: number, basePrice: number) => {
  const entryPrice = basePrice + (Math.random() * 100 - 50);
  const exitPrice = entryPrice * (1 + (Math.random() * 0.1 - 0.05) * (direction === 'long' ? 1 : -1));
  const pnl = direction === 'long' 
    ? (exitPrice - entryPrice) / entryPrice * size * leverage
    : (entryPrice - exitPrice) / entryPrice * size * leverage;
  
  return {
    size,
    leverage,
    direction,
    entryPrice,
    exitPrice,
    pnl,
  };
};

export const DummyTraderPnL: React.FC = () => {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [histories, setHistories] = useState<TraderHistory[]>([]);
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'all' | '50' | '100'>('all');
  const [viewMode, setViewMode] = useState<'cumulative' | 'daily' | 'drawdown'>('cumulative');
  const [showTrades, setShowTrades] = useState(true);
  const [sortBy, setSortBy] = useState<'pnl' | 'winRate' | 'sharpe'>('pnl');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    generateNewData();
  }, []);

  const generateNewData = () => {
    setIsRefreshing(true);
    const { traders: newTraders, histories: newHistories } = generateTraderData();
    
    // Sort traders by PnL
    const sortedTraders = [...newTraders].sort((a, b) => b.totalPnL - a.totalPnL);
    
    setTraders(sortedTraders);
    setHistories(newHistories);
    setSelectedTraders(newTraders.slice(0, 5).map(t => t.id)); // Select top 5 by default
    
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const toggleTrader = (traderId: string) => {
    setSelectedTraders(prev =>
      prev.includes(traderId)
        ? prev.filter(id => id !== traderId)
        : [...prev, traderId]
    );
  };

  const selectAll = () => {
    setSelectedTraders(traders.map(t => t.id));
  };

  const clearAll = () => {
    setSelectedTraders([]);
  };

  const getFilteredData = () => {
    const steps = timeRange === 'all' ? 200 : parseInt(timeRange);
    return histories.map(h => ({
      traderId: h.traderId,
      data: h.data.slice(-steps),
    }));
  };

  const getChartData = () => {
    const filtered = getFilteredData();
    const maxSteps = Math.max(...filtered.map(f => f.data.length));
    
    const chartData = [];
    for (let i = 0; i < maxSteps; i++) {
      const point: any = { step: i };
      filtered.forEach(({ traderId, data }) => {
        if (i < data.length) {
          const trader = traders.find(t => t.id === traderId);
          if (trader && selectedTraders.includes(traderId)) {
            if (viewMode === 'cumulative') {
              point[traderId] = data[i].cumulativePnL;
            } else if (viewMode === 'daily') {
              point[traderId] = data[i].pnl;
            } else {
              point[traderId] = data[i].drawdown;
            }
            
            // Add trade markers if enabled
            if (showTrades && data[i].trade) {
              point[`${traderId}_trade`] = viewMode === 'cumulative' 
                ? data[i].cumulativePnL 
                : data[i].pnl;
            }
          }
        }
      });
      chartData.push(point);
    }
    return chartData;
  };

  const getLeaderboard = () => {
    return [...traders].sort((a, b) => {
      if (sortBy === 'pnl') return b.totalPnL - a.totalPnL;
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      return b.sharpeRatio - a.sharpeRatio;
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl max-w-xs">
          <p className="text-sm font-medium mb-2">Step {label}</p>
          {payload.map((entry: any, idx: number) => {
            const trader = traders.find(t => t.id === entry.dataKey);
            if (!trader) return null;
            
            // Find the actual data point
            const history = histories.find(h => h.traderId === trader.id);
            const point = history?.data[parseInt(label)];
            
            return (
              <div key={idx} className="mb-2 last:mb-0">
                <div className="flex items-center space-x-1 mb-1">
                  <span style={{ color: trader.color }}>{trader.avatar}</span>
                  <span className="text-xs font-medium" style={{ color: trader.color }}>
                    {trader.name}
                  </span>
                </div>
                <div className="text-xs space-y-1 pl-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">PnL:</span>
                    <span className={entry.value > 0 ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(entry.value)}
                    </span>
                  </div>
                  {point?.trade && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Trade:</span>
                        <span className={point.trade.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                          {point.trade.direction.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Size:</span>
                        <span>{formatCurrency(point.trade.size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Leverage:</span>
                        <span>{point.trade.leverage}x</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const chartData = getChartData();
  const leaderboard = getLeaderboard();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Users className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">10 Traders • PnL Over Time</h1>
            <p className="text-sm text-gray-400">Dummy data for visualization testing</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={generateNewData}
            disabled={isRefreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Generate New Data</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        {/* Trader Selection */}
        <div className="lg:col-span-1 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Traders ({selectedTraders.length}/10)</h3>
            <div className="space-x-2">
              <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">
                All
              </button>
              <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-300">
                Clear
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {traders.map(trader => (
              <button
                key={trader.id}
                onClick={() => toggleTrader(trader.id)}
                className={`w-full p-2 rounded-lg border transition ${
                  selectedTraders.includes(trader.id)
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
                style={{ borderLeftColor: trader.color, borderLeftWidth: '3px' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span>{trader.avatar}</span>
                    <span className="text-sm font-medium">{trader.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    trader.riskProfile === 'conservative' ? 'bg-green-500/20 text-green-400' :
                    trader.riskProfile === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                    trader.riskProfile === 'aggressive' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {trader.riskProfile}
                  </span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-gray-400">PnL:</span>
                  <span className={trader.totalPnL > 0 ? 'text-green-400' : 'text-red-400'}>
                    {formatCurrency(trader.totalPnL)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-3 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          {/* Chart controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('cumulative')}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  viewMode === 'cumulative' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Cumulative
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  viewMode === 'daily' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Daily PnL
              </button>
              <button
                onClick={() => setViewMode('drawdown')}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  viewMode === 'drawdown' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Drawdown %
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="bg-gray-700 rounded-lg px-3 py-1 text-sm border border-gray-600"
              >
                <option value="all">All Time</option>
                <option value="100">Last 100 Steps</option>
                <option value="50">Last 50 Steps</option>
              </select>
              
              <button
                onClick={() => setShowTrades(!showTrades)}
                className={`p-2 rounded-lg transition ${
                  showTrades ? 'bg-blue-600' : 'bg-gray-700'
                }`}
                title="Toggle trade markers"
              >
                {showTrades ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Chart */}
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="step" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af"
                  tickFormatter={(value) => 
                    viewMode === 'drawdown' 
                      ? `${value.toFixed(0)}%` 
                      : formatCurrency(value)
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                
                {selectedTraders.map((traderId, index) => {
                  const trader = traders.find(t => t.id === traderId);
                  if (!trader) return null;
                  
                  return (
                    <Line
                      key={traderId}
                      type="monotone"
                      dataKey={traderId}
                      name={trader.name}
                      stroke={trader.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
                
                <Brush dataKey="step" height={30} stroke="#4b5563" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Leaderboard */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center space-x-1">
              <Award className="w-4 h-4 text-yellow-400" />
              <span>Leaderboard</span>
            </h3>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-gray-700 rounded-lg px-2 py-1 text-xs border border-gray-600"
            >
              <option value="pnl">By PnL</option>
              <option value="winRate">By Win Rate</option>
              <option value="sharpe">By Sharpe</option>
            </select>
          </div>
          
          <div className="space-y-2">
            {leaderboard.map((trader, index) => (
              <div
                key={trader.id}
                className="flex items-center justify-between p-2 bg-gray-900/50 rounded-lg"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500 w-5">#{index + 1}</span>
                  <span>{trader.avatar}</span>
                  <span className="text-sm">{trader.name}</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono ${
                    trader.totalPnL > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatCurrency(trader.totalPnL)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {trader.winRate.toFixed(0)}% win
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Best Performer */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Best Performer</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl">{leaderboard[0]?.avatar}</span>
              <div>
                <div className="font-medium">{leaderboard[0]?.name}</div>
                <div className="text-sm text-green-400">
                  {formatCurrency(leaderboard[0]?.totalPnL || 0)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs grid grid-cols-2 gap-1">
              <span className="text-gray-400">Win Rate:</span>
              <span>{leaderboard[0]?.winRate.toFixed(1)}%</span>
              <span className="text-gray-400">Sharpe:</span>
              <span>{leaderboard[0]?.sharpeRatio.toFixed(2)}</span>
            </div>
          </div>

          {/* Worst Performer */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Worst Performer</div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl">{leaderboard[leaderboard.length - 1]?.avatar}</span>
              <div>
                <div className="font-medium">{leaderboard[leaderboard.length - 1]?.name}</div>
                <div className="text-sm text-red-400">
                  {formatCurrency(leaderboard[leaderboard.length - 1]?.totalPnL || 0)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs grid grid-cols-2 gap-1">
              <span className="text-gray-400">Win Rate:</span>
              <span>{leaderboard[leaderboard.length - 1]?.winRate.toFixed(1)}%</span>
              <span className="text-gray-400">Max DD:</span>
              <span>{leaderboard[leaderboard.length - 1]?.maxDrawdown.toFixed(1)}%</span>
            </div>
          </div>

          {/* Risk Distribution */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Risk Distribution</div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-green-400">Conservative</span>
                  <span>{traders.filter(t => t.riskProfile === 'conservative').length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-green-400 h-1 rounded-full"
                    style={{ width: `${(traders.filter(t => t.riskProfile === 'conservative').length / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-yellow-400">Moderate</span>
                  <span>{traders.filter(t => t.riskProfile === 'moderate').length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-yellow-400 h-1 rounded-full"
                    style={{ width: `${(traders.filter(t => t.riskProfile === 'moderate').length / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-orange-400">Aggressive</span>
                  <span>{traders.filter(t => t.riskProfile === 'aggressive').length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-orange-400 h-1 rounded-full"
                    style={{ width: `${(traders.filter(t => t.riskProfile === 'aggressive').length / 10) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-red-400">Degen</span>
                  <span>{traders.filter(t => t.riskProfile === 'degen').length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1">
                  <div 
                    className="bg-red-400 h-1 rounded-full"
                    style={{ width: `${(traders.filter(t => t.riskProfile === 'degen').length / 10) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Trade Activity */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Trade Activity</div>
            <div className="text-2xl font-bold mb-1">
              {traders.reduce((sum, t) => sum + t.trades, 0)}
            </div>
            <div className="text-sm text-gray-400">Total Trades</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Avg per trader:</span>
                <span className="ml-1 font-mono">
                  {(traders.reduce((sum, t) => sum + t.trades, 0) / 10).toFixed(0)}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Win rate avg:</span>
                <span className="ml-1 font-mono">
                  {(traders.reduce((sum, t) => sum + t.winRate, 0) / 10).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Total PnL */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Total PnL (All Traders)</div>
            <div className={`text-2xl font-bold ${
              traders.reduce((sum, t) => sum + t.totalPnL, 0) > 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatCurrency(traders.reduce((sum, t) => sum + t.totalPnL, 0))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Winners:</span>
                <span className="ml-1 text-green-400">
                  {traders.filter(t => t.totalPnL > 0).length}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Losers:</span>
                <span className="ml-1 text-red-400">
                  {traders.filter(t => t.totalPnL < 0).length}
                </span>
              </div>
            </div>
          </div>

          {/* Most Active */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Most Active</div>
            {(() => {
              const mostActive = [...traders].sort((a, b) => b.trades - a.trades)[0];
              return (
                <>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{mostActive?.avatar}</span>
                    <div>
                      <div className="font-medium">{mostActive?.name}</div>
                      <div className="text-sm text-blue-400">{mostActive?.trades} trades</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs">
                    <span className="text-gray-400">Win Rate:</span>
                    <span className="ml-1">{mostActive?.winRate.toFixed(1)}%</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-6 text-center text-xs text-gray-500 border-t border-gray-700 pt-4">
        <p>Dummy data for testing purposes • Each trader has unique strategy and risk profile • Click "Generate New Data" for fresh scenarios</p>
      </div>
    </div>
  );
};