import React from 'react';
import type { SimulationMetrics } from '../../types/simulation';

interface Props {
  metrics?: SimulationMetrics;
  historicalMetrics: SimulationMetrics[];
  currentStep: number;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const percent = (value: number) => `${value.toFixed(2)}%`;

export const ProtocolPerformancePanel: React.FC<Props> = ({ metrics, historicalMetrics, currentStep }) => {
  if (!metrics) return null;

  const startMetric = historicalMetrics[0] ?? metrics;
  const netInsuranceFlow = metrics.insuranceFundInflow - metrics.insuranceFundOutflow;
  const adlCoverage = metrics.adlRequestedNotional > 0
    ? (metrics.adlCoveredNotional / metrics.adlRequestedNotional) * 100
    : 0;
  const badDebtVsInsurance = metrics.insuranceBalance > 0
    ? (metrics.badDebt / metrics.insuranceBalance) * 100
    : 0;
  const protocolRevenueGain = metrics.protocolRevenue - startMetric.protocolRevenue;

  const adjustmentSignals = [
    {
      label: 'Insurance Flow Pressure',
      value: currency.format(netInsuranceFlow),
      guidance:
        netInsuranceFlow >= 0
          ? 'Inflow >= outflow; insurance is stable for this step.'
          : 'Outflow > inflow; consider tighter risk thresholds or leverage caps.',
      status: netInsuranceFlow >= 0 ? 'good' : 'warn',
    },
    {
      label: 'ADL Effectiveness',
      value: percent(adlCoverage),
      guidance:
        adlCoverage >= 80
          ? 'ADL coverage is high in current regime.'
          : 'ADL coverage is low; tune ADL queue refresh or liquidation/insurance policy.',
      status: adlCoverage >= 80 ? 'good' : 'warn',
    },
    {
      label: 'Bad Debt / Insurance',
      value: percent(badDebtVsInsurance),
      guidance:
        badDebtVsInsurance <= 25
          ? 'Debt load remains within insurance capacity.'
          : 'Debt burden is pressuring insurance; review risk and margin settings.',
      status: badDebtVsInsurance <= 25 ? 'good' : 'warn',
    },
    {
      label: 'Protocol Revenue Gain',
      value: currency.format(protocolRevenueGain),
      guidance:
        protocolRevenueGain >= 0
          ? 'Revenue trend is positive over this run window.'
          : 'Revenue trend is negative; inspect fee mix and execution quality.',
      status: protocolRevenueGain >= 0 ? 'good' : 'warn',
    },
  ];

  return (
    <section className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="mb-3">
        <h3 className="text-lg font-semibold">Protocol Performance & Tuning</h3>
        <p className="text-sm text-slate-400">
          Step {currentStep} performance signals to guide risk and economics adjustments.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {adjustmentSignals.map((signal) => (
          <div
            key={signal.label}
            className={`rounded-lg border p-3 ${
              signal.status === 'good'
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-yellow-500/40 bg-yellow-500/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 uppercase tracking-wider">{signal.label}</p>
              <p className="text-lg font-semibold text-slate-100">{signal.value}</p>
            </div>
            <p className="mt-2 text-xs text-slate-300">{signal.guidance}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
