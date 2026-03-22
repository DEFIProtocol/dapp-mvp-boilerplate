import React, { useMemo, useState } from 'react';
import type { SimulationDiagnostics } from '../../types/simulation';

interface Props {
  diagnostics: SimulationDiagnostics | null;
  currentStep: number;
  isLoading?: boolean;
  error?: string | null;
}

const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const eventTypeClass = (eventType: string) => {
  if (eventType === 'filled') return 'bg-green-500/20 text-green-300 border-green-500/40';
  if (eventType === 'failed') return 'bg-red-500/20 text-red-300 border-red-500/40';
  if (eventType === 'cancelled') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
  if (eventType === 'liquidation') return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
  return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
};

const sideClass = (side: string) => (side === 'long' ? 'text-green-300' : side === 'short' ? 'text-red-300' : 'text-gray-300');

export const SimulationDiagnosticsPanel: React.FC<Props> = ({
  diagnostics,
  currentStep,
  isLoading = false,
  error = null,
}) => {
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | 'intent' | 'filled' | 'failed' | 'cancelled' | 'liquidation'>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | string>('all');
  const [maxRows, setMaxRows] = useState(50);

  const availableEventTypes = useMemo(() => {
    if (!diagnostics) return [];
    return Array.from(new Set(diagnostics.executionLedger.map((event) => event.eventType))).sort();
  }, [diagnostics]);

  const availableAgents = useMemo(() => {
    if (!diagnostics) return [];
    return Array.from(new Set(diagnostics.executionLedger.map((event) => event.agentType))).sort();
  }, [diagnostics]);

  const displayedStep = diagnostics?.meta.step ?? currentStep;

  const currentStepEvents = useMemo(() => {
    if (!diagnostics) return [];
    const stepEvents = diagnostics.executionLedger.filter((event) => event.step === displayedStep);
    const byEventType = eventTypeFilter === 'all'
      ? stepEvents
      : stepEvents.filter((event) => event.eventType === eventTypeFilter);

    const filtered = agentFilter === 'all'
      ? byEventType
      : byEventType.filter((event) => event.agentType === agentFilter);

    return filtered.slice(0, maxRows);
  }, [diagnostics, displayedStep, eventTypeFilter, agentFilter, maxRows]);

  const currentStepSummary = useMemo(() => {
    const summary = {
      intents: 0,
      filled: 0,
      failed: 0,
      cancelled: 0,
      liquidations: 0,
    };

    for (const event of currentStepEvents) {
      if (event.eventType === 'intent') summary.intents += 1;
      if (event.eventType === 'filled') summary.filled += 1;
      if (event.eventType === 'failed') summary.failed += 1;
      if (event.eventType === 'cancelled') summary.cancelled += 1;
      if (event.eventType === 'liquidation') summary.liquidations += 1;
    }

    const actionable = summary.filled + summary.failed + summary.cancelled;
    const fillRate = actionable > 0 ? (summary.filled / actionable) * 100 : 0;

    return {
      ...summary,
      fillRate,
      actionable,
    };
  }, [currentStepEvents]);

  const stepNarrative = useMemo(() => {
    if (currentStepEvents.length === 0) {
      return 'No execution events were recorded for this step.';
    }

    let longCount = 0;
    let shortCount = 0;
    const agentCounts = new Map<string, number>();

    for (const event of currentStepEvents) {
      if (event.side === 'long') longCount += 1;
      if (event.side === 'short') shortCount += 1;
      agentCounts.set(event.agentType, (agentCounts.get(event.agentType) ?? 0) + 1);
    }

    const dominantAgent = Array.from(agentCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed agents';
    const sideBalance =
      longCount === shortCount
        ? 'balanced long/short intent mix'
        : longCount > shortCount
          ? 'long-heavy intent mix'
          : 'short-heavy intent mix';

    if (currentStepSummary.actionable === 0) {
      return `Activity led by ${dominantAgent} with a ${sideBalance}, but no actionable fills/cancels/failures yet.`;
    }

    if (currentStepSummary.fillRate >= 70) {
      return `High conversion this step (${currentStepSummary.fillRate.toFixed(1)}% fill rate) led by ${dominantAgent} with a ${sideBalance}.`;
    }

    if (currentStepSummary.cancelled > currentStepSummary.filled) {
      return `Cancellation pressure dominates (${currentStepSummary.cancelled} cancelled vs ${currentStepSummary.filled} filled), led by ${dominantAgent} and a ${sideBalance}.`;
    }

    if (currentStepSummary.failed > currentStepSummary.filled) {
      return `Execution friction is elevated (${currentStepSummary.failed} failed vs ${currentStepSummary.filled} filled), with ${dominantAgent} most active.`;
    }

    return `Mixed execution this step (${currentStepSummary.filled} fills, ${currentStepSummary.cancelled} cancels, ${currentStepSummary.failed} failures) with ${dominantAgent} most active.`;
  }, [currentStepEvents, currentStepSummary]);

  if (isLoading && !diagnostics) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <div className="text-sm text-gray-400">Loading diagnostics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-red-500/40">
        <h3 className="text-lg font-semibold mb-2">Protocol Event Log</h3>
        <div className="text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!diagnostics) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h3 className="text-lg font-semibold mb-2">Protocol Event Log</h3>
        <div className="text-sm text-gray-400">No diagnostics available for this run.</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h3 className="text-lg font-semibold">Protocol Event Log</h3>
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <span>Run {diagnostics.runId} · Showing {diagnostics.meta.returnedEvents} / {diagnostics.meta.totalEvents} events</span>
          {isLoading && <span className="text-cyan-300">Refreshing…</span>}
          {displayedStep !== currentStep && (
            <span className="text-yellow-300">Showing last active step {displayedStep}</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold">Current Step Events (Step {displayedStep})</h4>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-gray-400">Event Type</label>
            <select
              value={eventTypeFilter}
              onChange={(event) => setEventTypeFilter(event.target.value as 'all' | 'intent' | 'filled' | 'failed' | 'cancelled' | 'liquidation')}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
            >
              <option value="all">all</option>
              {availableEventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>{eventType}</option>
              ))}
            </select>

            <label className="text-gray-400">Agent</label>
            <select
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
            >
              <option value="all">all</option>
              {availableAgents.map((agentType) => (
                <option key={agentType} value={agentType}>{agentType}</option>
              ))}
            </select>

            <label className="text-gray-400">Rows</label>
            <select
              value={maxRows}
              onChange={(event) => setMaxRows(Number(event.target.value))}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Intents</div>
            <div className="text-sm font-semibold">{currentStepSummary.intents}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Filled</div>
            <div className="text-sm font-semibold text-green-300">{currentStepSummary.filled}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Cancelled</div>
            <div className="text-sm font-semibold text-yellow-300">{currentStepSummary.cancelled}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Failed</div>
            <div className="text-sm font-semibold text-red-300">{currentStepSummary.failed}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Liquidations</div>
            <div className="text-sm font-semibold text-orange-300">{currentStepSummary.liquidations}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700 rounded p-2">
            <div className="text-[11px] text-gray-400">Step Fill Rate</div>
            <div className="text-sm font-semibold">{currentStepSummary.fillRate.toFixed(1)}%</div>
          </div>
        </div>

        <div className="text-[11px] text-gray-400 mb-2">
          Higher cancellation with low fills usually means side imbalance (e.g., too many long intents vs short intents) rather than a frontend bug.
        </div>

        <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/30 rounded p-2 mb-2">
          {stepNarrative}
        </div>

        <table className="min-w-full text-xs md:text-sm">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">Agent</th>
              <th className="py-2 text-left">Account</th>
              <th className="py-2 text-left">Counterparty</th>
              <th className="py-2 text-right">Side</th>
              <th className="py-2 text-right">Exposure</th>
              <th className="py-2 text-right">Lev</th>
              <th className="py-2 text-right">Reason</th>
            </tr>
          </thead>
          <tbody>
            {currentStepEvents.length === 0 ? (
              <tr>
                <td className="py-3 text-gray-400" colSpan={8}>No execution events for this step.</td>
              </tr>
            ) : (
              currentStepEvents.map((event, index) => (
                <tr key={`${event.trader}-${event.eventType}-${index}`} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded border text-[11px] ${eventTypeClass(event.eventType)}`}>
                      {event.eventType}
                    </span>
                  </td>
                  <td className="py-2">{event.agentType}</td>
                  <td className="py-2 font-mono">{formatAddress(event.trader)}</td>
                  <td className="py-2 font-mono">{event.counterparty ? formatAddress(event.counterparty) : '-'}</td>
                  <td className={`py-2 text-right uppercase ${sideClass(event.side)}`}>{event.side}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(event.exposure)}</td>
                  <td className="py-2 text-right">{event.leverage.toFixed(2)}x</td>
                  <td className="py-2 text-right text-gray-300">{event.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <h4 className="text-sm font-semibold mb-2">Agent Activity Summary</h4>
        <table className="min-w-full text-xs md:text-sm">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="py-2 text-left">Agent</th>
              <th className="py-2 text-right">Intents</th>
              <th className="py-2 text-right">Filled</th>
              <th className="py-2 text-right">Failed</th>
              <th className="py-2 text-right">Cancelled</th>
              <th className="py-2 text-right">Liquidations</th>
              <th className="py-2 text-right">Fill Rate</th>
              <th className="py-2 text-right">Intent Notional</th>
              <th className="py-2 text-right">Filled Notional</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.agentActivity
              .filter((agent) => agentFilter === 'all' || agent.agentType === agentFilter)
              .map((agent) => (
              <tr key={agent.agentType} className="border-b border-gray-700/40">
                <td className="py-2">{agent.agentType}</td>
                <td className="py-2 text-right">{agent.intents}</td>
                <td className="py-2 text-right">{agent.filled}</td>
                <td className="py-2 text-right">{agent.failed}</td>
                <td className="py-2 text-right">{agent.cancelled}</td>
                <td className="py-2 text-right">{agent.liquidations}</td>
                <td className="py-2 text-right">{agent.fillRatePercent.toFixed(2)}%</td>
                <td className="py-2 text-right font-mono">{formatCurrency(agent.intentNotional)}</td>
                <td className="py-2 text-right font-mono">{formatCurrency(agent.filledNotional)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};