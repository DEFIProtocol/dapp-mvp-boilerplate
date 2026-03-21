import React, { useMemo } from 'react';
import type { SimulationRun } from '../../types/simulation';

interface Props {
  runs: SimulationRun[];
  currentRunId: string | null;
  currentScenario: string;
  onSelectScenario: (scenario: string) => void;
}

const formatDate = (dateInput?: string) => {
  if (!dateInput) return 'Unknown';
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) return dateInput;
  return parsed.toLocaleString();
};

export const ScenarioComparisonPanel: React.FC<Props> = ({
  runs,
  currentRunId,
  currentScenario,
  onSelectScenario,
}) => {
  const rows = useMemo(() => {
    const dedupedByScenario = new Map<string, SimulationRun>();

    for (const run of runs) {
      const scenario = run.scenario || 'normal';
      const existing = dedupedByScenario.get(scenario);
      if (!existing) {
        dedupedByScenario.set(scenario, run);
        continue;
      }

      const existingAt = new Date(existing.createdAt || 0).getTime();
      const incomingAt = new Date(run.createdAt || 0).getTime();
      if (incomingAt > existingAt) {
        dedupedByScenario.set(scenario, run);
      }
    }

    return Array.from(dedupedByScenario.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8);
  }, [runs]);

  return (
    <section className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold">Scenario Comparison</h3>
          <p className="text-sm text-slate-400">Latest run per scenario for quick selection.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">No scenario runs available yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400 border-b border-gray-700">
              <tr>
                <th className="py-2 text-left">Scenario</th>
                <th className="py-2 text-left">Run ID</th>
                <th className="py-2 text-left">Created</th>
                <th className="py-2 text-right">Steps</th>
                <th className="py-2 text-right">Status</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => {
                const scenario = run.scenario || 'normal';
                const isSelected = run.id === currentRunId || scenario === currentScenario;
                return (
                  <tr key={run.id} className="border-b border-gray-700/40">
                    <td className="py-2 font-medium">{scenario}</td>
                    <td className="py-2 font-mono text-xs text-slate-300">{run.id}</td>
                    <td className="py-2 text-slate-300">{formatDate(run.createdAt)}</td>
                    <td className="py-2 text-right">{run.metricCount ?? '-'}</td>
                    <td className="py-2 text-right">
                      <span className={`px-2 py-0.5 rounded border text-xs ${
                        isSelected
                          ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/40'
                          : 'text-slate-300 bg-slate-700/50 border-slate-600'
                      }`}>
                        {isSelected ? 'Active' : 'Available'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => onSelectScenario(scenario)}
                        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 border border-slate-600 text-xs"
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
