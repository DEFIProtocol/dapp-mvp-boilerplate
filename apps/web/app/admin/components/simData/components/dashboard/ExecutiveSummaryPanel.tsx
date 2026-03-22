import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics?: SimulationMetrics;
  scenario: string;
  currentStep: number;
  totalSteps: number;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const ExecutiveSummaryPanel: React.FC<Props> = ({ metrics, scenario, currentStep, totalSteps }) => {
  if (!metrics) return null;

  const adlCoverage = metrics.adlRequestedNotional > 0
    ? (metrics.adlCoveredNotional / metrics.adlRequestedNotional) * 100
    : 0;

  const status = metrics.isInsolvent
    ? {
        label: 'Protocol Insolvent',
        icon: ShieldAlert,
        classes: 'text-red-300 bg-red-500/10 border-red-500/40',
      }
    : metrics.solvencyBuffer <= 10
      ? {
          label: 'At-Risk Regime',
          icon: AlertTriangle,
          classes: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/40',
        }
      : {
          label: 'Resilient Regime',
          icon: CheckCircle2,
          classes: 'text-green-300 bg-green-500/10 border-green-500/40',
        };

  const StatusIcon = status.icon;

  return (
    <section className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Executive Summary</h2>
          <p className="text-sm text-slate-400">
            Scenario: {scenario} · Step {currentStep}/{Math.max(totalSteps - 1, 0)}
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${status.classes}`}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-sm font-semibold">{status.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-3">
          <p className="text-xs text-slate-400">Solvency Buffer</p>
          <p className="text-lg font-semibold text-cyan-300">{metrics.solvencyBuffer.toFixed(2)}%</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-3">
          <p className="text-xs text-slate-400">Insurance Balance</p>
          <p className="text-lg font-semibold text-emerald-300">{currency.format(metrics.insuranceBalance)}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-3">
          <p className="text-xs text-slate-400">Bad Debt</p>
          <p className="text-lg font-semibold text-rose-300">{currency.format(metrics.badDebt)}</p>
        </div>
        <div className="bg-gray-900/50 rounded-lg border border-gray-700 p-3">
          <p className="text-xs text-slate-400">ADL Coverage</p>
          <p className="text-lg font-semibold text-violet-300">{adlCoverage.toFixed(2)}%</p>
        </div>
      </div>
    </section>
  );
};
