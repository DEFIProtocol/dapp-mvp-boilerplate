// components/comparison/ScenarioComparison.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import { 
  GitCompare, 
  Download, 
  Share2, 
  Calendar, 
  TrendingUp,
  Shield,
  DollarSign,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Save,
  Copy,
  CheckCircle,
} from 'lucide-react';
import { SimulationApi } from '../../services/simulationApi';
import type { SimulationData, SimulationRun } from '../../types/simulation';

interface Props {
  onLoadSimulation?: (id: string) => void;
}

interface ComparisonMetric {
  name: string;
  key: keyof SimulationMetrics;
  color: string;
  format: 'currency' | 'percentage' | 'number';
}

interface ScenarioSummary {
  id: string;
  name: string;
  scenario: string;
  seed: number;
  metrics: {
    totalLiquidations: number;
    maxDrawdown: number;
    avgLeverage: number;
    totalRevenue: number;
    insuranceUsage: number;
    maxSolvencyBuffer: number;
    minSolvencyBuffer: number;
    badDebtOccurred: boolean;
  };
}

export const ScenarioComparison: React.FC<Props> = ({ onLoadSimulation }) => {
  const [availableRuns, setAvailableRuns] = useState<SimulationRun[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [runsData, setRunsData] = useState<Map<string, SimulationData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [comparisonMetric, setComparisonMetric] = useState<keyof SimulationMetrics>('price');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const metrics: ComparisonMetric[] = [
    { name: 'Price', key: 'price', color: '#3b82f6', format: 'currency' },
    { name: 'TVL', key: 'tvl', color: '#8b5cf6', format: 'currency' },
    { name: 'Open Interest', key: 'openInterest', color: '#ec4899', format: 'currency' },
    { name: 'Insurance Balance', key: 'insuranceBalance', color: '#10b981', format: 'currency' },
    { name: 'Protocol Revenue', key: 'protocolRevenue', color: '#f59e0b', format: 'currency' },
    { name: 'Bad Debt', key: 'badDebt', color: '#ef4444', format: 'currency' },
    { name: 'Liquidations', key: 'liquidations', color: '#f97316', format: 'number' },
    { name: 'Solvency Buffer', key: 'solvencyBuffer', color: '#06b6d4', format: 'percentage' },
    { name: 'Avg Leverage', key: 'avgLeverage', color: '#a855f7', format: 'number' },
  ];

  useEffect(() => {
    loadAvailableRuns();
  }, []);

  const loadAvailableRuns = async () => {
    try {
      const { runs } = await SimulationApi.getSimulationRuns();
      setAvailableRuns(runs.filter(r => r.hasCompleteJson));
    } catch (error) {
      console.error('Failed to load runs:', error);
    }
  };

  const loadRunData = async (runId: string) => {
    if (runsData.has(runId)) return;
    
    try {
      setIsLoading(true);
      const data = await SimulationApi.getSimulationRun(runId);
      setRunsData(prev => new Map(prev).set(runId, data));
    } catch (error) {
      console.error(`Failed to load run ${runId}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    selectedRuns.forEach(loadRunData);
  }, [selectedRuns]);

  const generateComparisonData = () => {
    const maxSteps = Math.max(
      ...Array.from(runsData.values()).map(d => d.metrics.length)
    );

    const data = [];
    for (let step = 0; step < maxSteps; step++) {
      const point: any = { step };
      runsData.forEach((data, id) => {
        const run = availableRuns.find(r => r.id === id);
        if (step < data.metrics.length) {
          point[`${id}_${comparisonMetric}`] = data.metrics[step][comparisonMetric];
          point[`${id}_name`] = `${run?.scenario || 'Unknown'} (${run?.seed || ''})`;
        }
      });
      data.push(point);
    }
    return data;
  };

  const generateSummaries = (): ScenarioSummary[] => {
    return selectedRuns.map(id => {
      const data = runsData.get(id);
      const run = availableRuns.find(r => r.id === id);
      
      if (!data) return null;

      const metrics = data.metrics;
      const liquidations = data.liquidations;
      
      // Calculate metrics
      const totalLiquidations = liquidations.reduce((sum, l) => sum + l.liquidations, 0);
      const maxDrawdown = calculateMaxDrawdown(metrics.map(m => m.tvl));
      const avgLeverage = metrics.reduce((sum, m) => sum + m.avgLeverage, 0) / metrics.length;
      const totalRevenue = metrics[metrics.length - 1]?.protocolRevenue || 0;
      const insuranceUsage = liquidations.reduce((sum, l) => sum + l.insuranceFundOutflow, 0);
      const solvencyBuffers = metrics.map(m => m.solvencyBuffer);
      
      return {
        id,
        name: `${run?.scenario || 'Unknown'} (${run?.seed || ''})`,
        scenario: run?.scenario || 'Unknown',
        seed: run?.seed || 0,
        totalLiquidations,
        maxDrawdown,
        avgLeverage,
        totalRevenue,
        insuranceUsage,
        maxSolvencyBuffer: Math.max(...solvencyBuffers),
        minSolvencyBuffer: Math.min(...solvencyBuffers),
        badDebtOccurred: metrics.some(m => m.badDebt > 0),
      };
    }).filter(Boolean) as ScenarioSummary[];
  };

  const calculateMaxDrawdown = (values: number[]): number => {
    let maxDrawdown = 0;
    let peak = values[0];
    
    for (const value of values) {
      if (value > peak) peak = value;
      const drawdown = ((peak - value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    return maxDrawdown;
  };

  const formatValue = (value: number, format: string) => {
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value);
      case 'percentage':
        return `${value.toFixed(2)}%`;
      default:
        return value.toLocaleString();
    }
  };

  const exportToCSV = () => {
    const summaries = generateSummaries();
    const headers = ['Scenario', 'Seed', 'Total Liquidations', 'Max Drawdown %', 'Avg Leverage', 'Total Revenue', 'Insurance Usage', 'Min Solvency %', 'Max Solvency %', 'Bad Debt'];
    
    const rows = summaries.map(s => [
      s.scenario,
      s.seed,
      s.totalLiquidations,
      s.maxDrawdown.toFixed(2),
      s.avgLeverage.toFixed(2),
      s.totalRevenue,
      s.insuranceUsage,
      s.minSolvencyBuffer.toFixed(2),
      s.maxSolvencyBuffer.toFixed(2),
      s.badDebtOccurred ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-comparison-${new Date().toISOString()}.csv`;
    a.click();
  };

  const exportToJSON = () => {
    const summaries = generateSummaries();
    const blob = new Blob([JSON.stringify(summaries, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-comparison-${new Date().toISOString()}.json`;
    a.click();
  };

  const copyShareLink = () => {
    const params = new URLSearchParams({
      runs: selectedRuns.join(','),
      metric: comparisonMetric,
    });
    const url = `${window.location.origin}/compare?${params.toString()}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleRun = (runId: string) => {
    setSelectedRuns(prev => 
      prev.includes(runId) 
        ? prev.filter(id => id !== runId)
        : [...prev, runId].slice(0, 4) // Max 4 comparisons
    );
  };

  const comparisonData = generateComparisonData();
  const summaries = generateSummaries();

  return (
    <div className={`bg-gray-800/50 rounded-xl border border-gray-700 ${
      isFullscreen ? 'fixed inset-4 z-50 overflow-auto' : ''
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <GitCompare className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Scenario Comparison</h2>
          {selectedRuns.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
              {selectedRuns.length}/4 selected
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Export Options */}
          <div className="relative group">
            <button className="p-2 hover:bg-gray-700 rounded-lg transition">
              <Download className="w-4 h-4" />
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl hidden group-hover:block">
              <button
                onClick={exportToCSV}
                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm"
              >
                Export as CSV
              </button>
              <button
                onClick={exportToJSON}
                className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm"
              >
                Export as JSON
              </button>
            </div>
          </div>

          {/* Share Button */}
          <button
            onClick={() => setShowShareModal(true)}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-gray-700 rounded-lg transition"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Share Comparison</h3>
            <div className="flex items-center space-x-2 mb-4">
              <input
                type="text"
                value={`${window.location.origin}/compare?runs=${selectedRuns.join(',')}&metric=${comparisonMetric}`}
                readOnly
                className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={copyShareLink}
                className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
              >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full bg-gray-700 py-2 rounded-lg hover:bg-gray-600 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Scenario Selector */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Select Scenarios to Compare</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {availableRuns.slice(0, 8).map((run) => (
            <button
              key={run.id}
              onClick={() => toggleRun(run.id)}
              className={`p-3 rounded-lg border transition ${
                selectedRuns.includes(run.id)
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="text-xs text-gray-400 mb-1">{run.scenario || 'Unknown'}</div>
              <div className="font-mono text-sm">Seed: {run.seed}</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(run.createdAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Metric Selector */}
      {selectedRuns.length > 0 && (
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-400">Comparison Metric:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {metrics.map((metric) => (
              <button
                key={metric.key}
                onClick={() => setComparisonMetric(metric.key)}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  comparisonMetric === metric.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                style={{
                  borderLeft: `3px solid ${metric.color}`,
                }}
              >
                {metric.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Chart */}
      {selectedRuns.length > 0 && (
        <div className="p-4">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="step" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-xl">
                          <p className="text-sm font-medium mb-2">Step {label}</p>
                          {payload.map((entry, idx) => {
                            const metric = metrics.find(m => m.key === comparisonMetric);
                            return (
                              <div key={idx} className="flex justify-between text-xs">
                                <span style={{ color: entry.color }}>{entry.name}:</span>
                                <span className="font-mono ml-4">
                                  {formatValue(entry.value as number, metric?.format || 'number')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                {Array.from(runsData.keys()).map((id, index) => {
                  const run = availableRuns.find(r => r.id === id);
                  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
                  return (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={`${id}_${comparisonMetric}`}
                      name={`${run?.scenario || 'Unknown'} (${run?.seed || ''})`}
                      stroke={colors[index % colors.length]}
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
      )}

      {/* Summary Cards */}
      {summaries.length > 0 && (
        <div className="p-4 border-t border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Scenario Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summaries.map((summary, idx) => (
              <div
                key={summary.id}
                className="bg-gray-900/50 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-medium">{summary.scenario}</div>
                    <div className="text-xs text-gray-500">Seed: {summary.seed}</div>
                  </div>
                  {summary.badDebtOccurred && (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Liquidations:</span>
                    <span className="font-mono text-red-400">{summary.totalLiquidations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Max Drawdown:</span>
                    <span className="font-mono text-orange-400">{summary.maxDrawdown.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Avg Leverage:</span>
                    <span className="font-mono">{summary.avgLeverage.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Revenue:</span>
                    <span className="font-mono text-green-400">
                      ${summary.totalRevenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Insurance Used:</span>
                    <span className="font-mono text-yellow-400">
                      ${summary.insuranceUsage.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Solvency Range:</span>
                    <span className="font-mono">
                      {summary.minSolvencyBuffer.toFixed(1)}% - {summary.maxSolvencyBuffer.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onLoadSimulation?.(summary.id)}
                  className="w-full mt-3 text-xs bg-blue-600/20 text-blue-400 py-2 rounded-lg hover:bg-blue-600/30 transition"
                >
                  Load Scenario
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};