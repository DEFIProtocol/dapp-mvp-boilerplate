'use client';

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight, LineChart as LineChartIcon } from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

type StoryPage = {
  title: string;
  description: string;
  series: Array<{
    key: keyof SimulationMetrics;
    label: string;
    color: string;
    asCurrency?: boolean;
  }>;
};

interface Props {
  metrics: SimulationMetrics[];
  currentStep: number;
}

const STORY_PAGES: StoryPage[] = [
  {
    title: 'Treasury Trajectory',
    description: 'Protocol treasury balance and cumulative protocol revenue through the run.',
    series: [
      { key: 'protocolTreasuryBalance', label: 'Treasury Balance', color: '#60a5fa', asCurrency: true },
      { key: 'protocolRevenue', label: 'Protocol Revenue', color: '#a78bfa', asCurrency: true },
    ],
  },
  {
    title: 'Insurance vs Bad Debt',
    description: 'Insurance fund resilience and bad debt accumulation over step progression.',
    series: [
      { key: 'insuranceBalance', label: 'Insurance Balance', color: '#22c55e', asCurrency: true },
      { key: 'badDebt', label: 'Bad Debt', color: '#ef4444', asCurrency: true },
    ],
  },
  {
    title: 'Insurance Flows',
    description: 'Step-by-step insurance inflows and outflows to show net pressure over time.',
    series: [
      { key: 'insuranceFundInflow', label: 'Insurance Inflow', color: '#34d399', asCurrency: true },
      { key: 'insuranceFundOutflow', label: 'Insurance Outflow', color: '#f97316', asCurrency: true },
    ],
  },
  {
    title: 'ADL Deficit Resolution',
    description: 'How ADL requested, covered, and remaining deficit evolve as stress unfolds.',
    series: [
      { key: 'adlRequestedNotional', label: 'ADL Requested', color: '#f59e0b', asCurrency: true },
      { key: 'adlCoveredNotional', label: 'ADL Covered', color: '#14b8a6', asCurrency: true },
      { key: 'adlRemainingDeficit', label: 'ADL Remaining Deficit', color: '#ef4444', asCurrency: true },
      { key: 'badDebt', label: 'Bad Debt', color: '#eab308', asCurrency: true },
    ],
  },
  {
    title: 'ADL Event Intensity',
    description: 'Per-step ADL triggers and proactive ADL activity over the simulation timeline.',
    series: [
      { key: 'stepAdlEvents', label: 'ADL Events (Step)', color: '#38bdf8' },
      { key: 'stepProactiveAdlEvents', label: 'Proactive ADL (Step)', color: '#c084fc' },
      { key: 'adlEvents', label: 'ADL Events (Cumulative)', color: '#0ea5e9' },
      { key: 'proactiveAdlEvents', label: 'Proactive ADL (Cumulative)', color: '#8b5cf6' },
    ],
  },
  {
    title: 'Recovery Timeline',
    description: 'How insurance, treasury, and residual deficits stabilize after peak stress.',
    series: [
      { key: 'insuranceBalance', label: 'Insurance Balance', color: '#22c55e', asCurrency: true },
      { key: 'protocolTreasuryBalance', label: 'Treasury Balance', color: '#60a5fa', asCurrency: true },
      { key: 'badDebt', label: 'Bad Debt', color: '#ef4444', asCurrency: true },
      { key: 'adlRemainingDeficit', label: 'ADL Remaining Deficit', color: '#f97316', asCurrency: true },
    ],
  },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatValue = (value: number, asCurrency?: boolean) => {
  if (!Number.isFinite(value)) return '0';
  if (asCurrency) return currencyFormatter.format(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const SimulationStoryChartsPanel: React.FC<Props> = ({ metrics, currentStep }) => {
  const [pageIndex, setPageIndex] = useState(0);
  const safePageIndex = Math.min(Math.max(pageIndex, 0), STORY_PAGES.length - 1);
  const page = STORY_PAGES[safePageIndex];
  const maxStep = Math.max(metrics.length - 1, 0);
  const safeStep = Math.min(Math.max(currentStep, 0), maxStep);

  const currentMetric = metrics[safeStep];
  const finalMetric = metrics[maxStep];

  const adlSummary = useMemo(() => {
    if (!finalMetric) {
      return {
        requested: 0,
        covered: 0,
        remaining: 0,
        finalBadDebt: 0,
        coverageRate: 0,
        coveredShareOfBadDebt: 0,
      };
    }

    const requested = Math.max(finalMetric.adlRequestedNotional, 0);
    const covered = Math.max(finalMetric.adlCoveredNotional, 0);
    const remaining = Math.max(finalMetric.adlRemainingDeficit, 0);
    const finalBadDebt = Math.max(finalMetric.badDebt, 0);
    const coverageRate = requested > 0 ? (covered / requested) * 100 : 0;
    const coveredShareOfBadDebt = finalBadDebt > 0 ? (covered / finalBadDebt) * 100 : 0;

    return {
      requested,
      covered,
      remaining,
      finalBadDebt,
      coverageRate,
      coveredShareOfBadDebt,
    };
  }, [finalMetric]);

  const recoverySummary = useMemo(() => {
    if (metrics.length === 0) {
      return {
        peakBadDebt: 0,
        peakBadDebtStep: 0,
        halfRecoveryStep: null as number | null,
        finalBadDebt: 0,
      };
    }

    let peakBadDebt = 0;
    let peakBadDebtStep = 0;
    for (const metric of metrics) {
      if (metric.badDebt > peakBadDebt) {
        peakBadDebt = metric.badDebt;
        peakBadDebtStep = metric.step;
      }
    }

    const halfTarget = peakBadDebt * 0.5;
    const halfRecovery = metrics.find(
      (metric) => metric.step >= peakBadDebtStep && metric.badDebt <= halfTarget,
    );

    return {
      peakBadDebt,
      peakBadDebtStep,
      halfRecoveryStep: halfRecovery?.step ?? null,
      finalBadDebt: metrics[metrics.length - 1]?.badDebt ?? 0,
    };
  }, [metrics]);

  const chartData = useMemo(
    () => metrics.map((metric) => ({ ...metric, step: metric.step })),
    [metrics],
  );

  const hasData = chartData.length > 0;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center space-x-2">
          <LineChartIcon className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-white">Simulation Story Charts</h3>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={safePageIndex === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/80 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-mono">
            {safePageIndex + 1}/{STORY_PAGES.length}
          </span>
          <button
            onClick={() => setPageIndex((prev) => Math.min(prev + 1, STORY_PAGES.length - 1))}
            disabled={safePageIndex === STORY_PAGES.length - 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/80 transition"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-base font-semibold text-slate-100">{page.title}</p>
        <p className="text-sm text-slate-400">{page.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">ADL Requested (Total)</p>
          <p className="text-lg font-semibold text-amber-300">{formatValue(adlSummary.requested, true)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">ADL Covered (Total)</p>
          <p className="text-lg font-semibold text-teal-300">{formatValue(adlSummary.covered, true)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">Uncovered After ADL (Total)</p>
          <p className="text-lg font-semibold text-rose-300">{formatValue(adlSummary.remaining, true)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">ADL Coverage Rate</p>
          <p className="text-lg font-semibold text-cyan-300">{adlSummary.coverageRate.toFixed(2)}%</p>
          <p className="text-xs text-slate-500">Covered / Requested</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">Final Bad Debt</p>
          <p className="text-lg font-semibold text-red-300">{formatValue(adlSummary.finalBadDebt, true)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">Covered as Share of Bad Debt</p>
          <p className="text-lg font-semibold text-violet-300">{adlSummary.coveredShareOfBadDebt.toFixed(2)}%</p>
          <p className="text-xs text-slate-500">ADL Covered / Final Bad Debt</p>
        </div>
      </div>

      {currentMetric && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
          Current step {safeStep}: ADL covered {formatValue(currentMetric.adlCoveredNotional, true)}, remaining deficit {formatValue(currentMetric.adlRemainingDeficit, true)}, bad debt {formatValue(currentMetric.badDebt, true)}.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">Peak Bad Debt</p>
          <p className="text-sm font-semibold text-rose-300">{formatValue(recoverySummary.peakBadDebt, true)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">Peak Stress Step</p>
          <p className="text-sm font-semibold text-slate-100">{recoverySummary.peakBadDebtStep}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">50% Debt Recovery Step</p>
          <p className="text-sm font-semibold text-cyan-300">
            {recoverySummary.halfRecoveryStep ?? 'Not reached'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-400">Final Bad Debt</p>
          <p className="text-sm font-semibold text-red-300">{formatValue(recoverySummary.finalBadDebt, true)}</p>
        </div>
      </div>

      {hasData ? (
        <div className="h-[360px] rounded-lg border border-gray-700 bg-gray-900/40 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis
                stroke="#9ca3af"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickFormatter={(value) => {
                  const containsCurrency = page.series.some((series) => series.asCurrency);
                  return containsCurrency ? `$${Number(value).toFixed(0)}` : Number(value).toFixed(0);
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#fff',
                }}
                labelFormatter={(label) => `Step ${label}`}
                formatter={(value: unknown, name: unknown) => {
                  const nameLabel = String(name ?? '');
                  const series = page.series.find((entry) => entry.label === nameLabel);
                  return [formatValue(Number(value), series?.asCurrency), nameLabel];
                }}
              />
              <Legend />
              <ReferenceLine
                x={currentStep}
                stroke="#22d3ee"
                strokeDasharray="4 4"
                label={{ value: 'Current', fill: '#22d3ee', position: 'insideTopRight' }}
              />
              {page.series.map((series) => (
                <Line
                  key={String(series.key)}
                  type="monotone"
                  dataKey={String(series.key)}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[360px] bg-gray-900/40 rounded-lg border border-gray-700 p-3 flex items-center justify-center text-sm text-gray-400">
          No simulation metrics available for story charts.
        </div>
      )}
    </div>
  );
};
