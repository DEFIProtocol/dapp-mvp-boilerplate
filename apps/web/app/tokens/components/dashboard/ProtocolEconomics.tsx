// components/dashboard/ProtocolEconomics.tsx
import React, { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Shield,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  PiggyBank,
  Receipt,
  Scale,
  AlertCircle,
  Activity,
} from 'lucide-react';
import type { SimulationMetrics, LiquidationActivity } from '../../types/simulation';

interface Props {
  metrics?: SimulationMetrics;
  liquidations?: LiquidationActivity;
}

interface RevenueStream {
  name: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  delta: number;
}

interface FlowData {
  source: string;
  target: string;
  value: number;
}

export const ProtocolEconomics: React.FC<Props> = ({ metrics, liquidations }) => {
  const [view, setView] = useState<'overview' | 'flows' | 'distribution' | 'projection'>('overview');
  const [timeframe, setTimeframe] = useState<'1d' | '7d' | '30d' | 'all'>('all');

  if (!metrics) return null;

  // Calculate key metrics
  const totalRevenue = metrics.protocolRevenue;
  const totalFees = metrics.makerFeesCollected + metrics.takerFeesCollected;
  const fundingFees = metrics.fundingFeesTransferred;
  const insuranceBalance = metrics.insuranceBalance;
  const insuranceInflow = metrics.insuranceFundInflow;
  const insuranceOutflow = metrics.insuranceFundOutflow;
  const treasuryBalance = metrics.protocolTreasuryBalance;
  
  // Revenue streams for pie chart
  const revenueStreams: RevenueStream[] = [
    {
      name: 'Maker Fees',
      value: metrics.makerFeesCollected,
      color: '#3b82f6',
      icon: <Receipt className="w-4 h-4" />,
      delta: metrics.makerFeesCollected * 0.1,
    },
    {
      name: 'Taker Fees',
      value: metrics.takerFeesCollected,
      color: '#8b5cf6',
      icon: <Activity className="w-4 h-4" />,
      delta: metrics.takerFeesCollected * 0.15,
    },
    {
      name: 'Funding Payments',
      value: Math.abs(metrics.fundingFeesTransferred),
      color: '#ec4899',
      icon: <TrendingUp className="w-4 h-4" />,
      delta: metrics.fundingFeesTransferred * 0.05,
    },
    {
      name: 'Liquidation Penalties',
      value: liquidations?.liquidationPenaltyCollected || 0,
      color: '#f59e0b',
      icon: <AlertCircle className="w-4 h-4" />,
      delta: (liquidations?.liquidationPenaltyCollected || 0) * 0.2,
    },
  ];

  // Fund flows for Sankey diagram
  const flowData: FlowData[] = [
    { source: 'Traders', target: 'Maker Fees', value: metrics.makerFeesCollected },
    { source: 'Traders', target: 'Taker Fees', value: metrics.takerFeesCollected },
    { source: 'Traders', target: 'Funding Payments', value: Math.abs(metrics.fundingFeesTransferred) },
    { source: 'Liquidations', target: 'Insurance Fund', value: metrics.liquidationInsuranceInflow },
    { source: 'Insurance Fund', target: 'Bad Debt', value: metrics.badDebt },
    { source: 'Insurance Fund', target: 'Liquidators', value: liquidations?.liquidatorRewardsPaid || 0 },
    { source: 'Maker Fees', target: 'Treasury', value: metrics.makerFeesCollected * 0.7 },
    { source: 'Taker Fees', target: 'Treasury', value: metrics.takerFeesCollected * 0.7 },
    { source: 'Funding Payments', target: 'Treasury', value: Math.abs(metrics.fundingFeesTransferred) * 0.5 },
    { source: 'Treasury', target: 'Revenue', value: metrics.protocolRevenue },
  ];

  // Distribution data
  const distributionData = [
    { name: 'Insurance Fund', value: insuranceBalance, color: '#10b981' },
    { name: 'Treasury', value: treasuryBalance, color: '#3b82f6' },
    { name: 'Available for Withdrawal', value: metrics.sumAvailableCollateral, color: '#8b5cf6' },
    { name: 'Reserved Margin', value: metrics.sumReservedMargin, color: '#f59e0b' },
  ];

  // Historical projections (simulated)
  const projectionData = [
    { month: 'Jan', revenue: 125000, fees: 85000, insurance: 50000 },
    { month: 'Feb', revenue: 150000, fees: 95000, insurance: 52000 },
    { month: 'Mar', revenue: 180000, fees: 110000, insurance: 48000 },
    { month: 'Apr', revenue: 165000, fees: 105000, insurance: 55000 },
    { month: 'May', revenue: 210000, fees: 135000, insurance: 60000 },
    { month: 'Jun', revenue: totalRevenue, fees: totalFees, insurance: insuranceBalance },
  ];

  // Calculate health metrics
  const runway = treasuryBalance / (totalFees / 30); // Days of runway based on monthly fees
  const profitMargin = totalRevenue > 0 ? (totalRevenue / totalFees) * 100 : 0;
  const insuranceCoverage = metrics.openInterest > 0 ? (insuranceBalance / metrics.openInterest) * 100 : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompact = (value: number) => {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-sm font-medium mb-2">{payload[0].name}</p>
          {payload.map((entry: any, idx: number) => (
            <div key={idx} className="flex justify-between text-xs">
              <span style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-mono ml-4">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <DollarSign className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold">Protocol Economics</h3>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Toggle */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setView('overview')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                view === 'overview' ? 'bg-green-600 text-white' : 'text-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('flows')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                view === 'flows' ? 'bg-green-600 text-white' : 'text-gray-300'
              }`}
            >
              Flows
            </button>
            <button
              onClick={() => setView('distribution')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                view === 'distribution' ? 'bg-green-600 text-white' : 'text-gray-300'
              }`}
            >
              Distribution
            </button>
            <button
              onClick={() => setView('projection')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                view === 'projection' ? 'bg-green-600 text-white' : 'text-gray-300'
              }`}
            >
              Projection
            </button>
          </div>

          {/* Timeframe Filter (for projections) */}
          {view === 'projection' && (
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="bg-gray-700 rounded-lg px-3 py-1 text-sm border border-gray-600"
            >
              <option value="1d">1 Day</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="all">All Time</option>
            </select>
          )}
        </div>
      </div>

      {/* Key Economic Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Total Revenue</span>
            <TrendingUp className="w-3 h-3 text-green-400" />
          </div>
          <div className="text-lg font-bold text-green-400">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            +{formatCurrency(metrics.protocolRevenueDelta)} this step
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Insurance Fund</span>
            <Shield className="w-3 h-3 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-blue-400">
            {formatCurrency(insuranceBalance)}
          </div>
          <div className="flex items-center space-x-2 text-xs mt-1">
            <span className="text-green-400">+{formatCurrency(insuranceInflow)}</span>
            <span className="text-gray-500">/</span>
            <span className="text-red-400">-{formatCurrency(insuranceOutflow)}</span>
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Treasury</span>
            <Database className="w-3 h-3 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-purple-400">
            {formatCurrency(treasuryBalance)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {runway.toFixed(1)} days runway
          </div>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Bad Debt</span>
            <AlertCircle className="w-3 h-3 text-red-400" />
          </div>
          <div className="text-lg font-bold text-red-400">
            {formatCurrency(metrics.badDebt)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {metrics.badDebtDelta > 0 ? '+' : ''}{formatCurrency(metrics.badDebtDelta)} this step
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'overview' && (
            <PieChart>
              <Pie
                data={revenueStreams.filter(s => s.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#4b5563' }}
              >
                {revenueStreams.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          )}

          {view === 'flows' && (
            <AreaChart data={[
              { name: 'Inflow', value: insuranceInflow },
              { name: 'Outflow', value: insuranceOutflow },
              { name: 'Net', value: insuranceInflow - insuranceOutflow },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
            </AreaChart>
          )}

          {view === 'distribution' && (
            <BarChart data={distributionData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" stroke="#9ca3af" width={100} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value">
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          )}

          {view === 'projection' && (
            <LineChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="fees" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="insurance" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Revenue Streams Breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Revenue Streams</h4>
        {revenueStreams.map((stream, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <div className="p-1 rounded" style={{ backgroundColor: `${stream.color}20` }}>
                {stream.icon}
              </div>
              <span>{stream.name}</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="font-mono">{formatCurrency(stream.value)}</span>
              <span className={`text-xs flex items-center ${
                stream.delta > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {stream.delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {formatCompact(Math.abs(stream.delta))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Health Metrics */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-gray-400">Profit Margin</span>
            <div className="flex items-center space-x-1 mt-1">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-green-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, profitMargin)}%` }}
                />
              </div>
              <span className="font-mono">{profitMargin.toFixed(1)}%</span>
            </div>
          </div>
          
          <div>
            <span className="text-gray-400">Insurance Coverage</span>
            <div className="flex items-center space-x-1 mt-1">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-blue-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, insuranceCoverage)}%` }}
                />
              </div>
              <span className="font-mono">{insuranceCoverage.toFixed(1)}%</span>
            </div>
          </div>
          
          <div>
            <span className="text-gray-400">Runway (days)</span>
            <div className="flex items-center space-x-1 mt-1">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-purple-400 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (runway / 90) * 100)}%` }}
                />
              </div>
              <span className="font-mono">{runway.toFixed(0)}d</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning if bad debt exists */}
      {metrics.badDebt > 0 && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">
              Bad debt detected: {formatCurrency(metrics.badDebt)}. Insurance fund may be at risk.
            </span>
          </div>
        </div>
      )}

      {/* Insurance Fund Activity */}
      {liquidations && liquidations.insuranceFundOutflow > 0 && (
        <div className="mt-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-yellow-400">
              Insurance fund deployed: {formatCurrency(liquidations.insuranceFundOutflow)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};