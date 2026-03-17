import React, { useMemo, useState } from 'react';
import type {
  Position,
  SimulationMetrics,
  SyntheticPositionInput,
  SyntheticPositionSnapshot,
} from '../../types/simulation';

interface Props {
  positionsByStep?: Record<number, Position[]>;
  metrics: SimulationMetrics[];
  currentStep: number;
}

type TraderReplayRow = {
  trader: string;
  current?: Position;
  entry?: Position;
  peakPnl: number;
  troughPnl: number;
  status: 'open' | 'liquidatable' | 'liquidated' | 'closed' | 'inactive';
};

const ASSUMED_MAINTENANCE_MARGIN = 0.05;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatCompactTrader = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const TraderReplayPositionsPanel: React.FC<Props> = ({
  positionsByStep,
  metrics,
  currentStep,
}) => {
  const [customDirection, setCustomDirection] = useState<'buy' | 'sell'>('buy');
  const [customSize, setCustomSize] = useState('10000');
  const [customLeverage, setCustomLeverage] = useState('10');
  const [customEntry, setCustomEntry] = useState('');
  const [syntheticPosition, setSyntheticPosition] = useState<SyntheticPositionInput | null>(null);

  const stepKeys = useMemo(() => {
    if (!positionsByStep) return [];
    return Object.keys(positionsByStep)
      .map((step) => Number(step))
      .filter((step) => Number.isFinite(step))
      .sort((left, right) => left - right);
  }, [positionsByStep]);

  const firstStep = stepKeys[0] ?? 0;
  const currentMark = metrics[currentStep]?.price ?? 0;

  const positionsMapByStep = useMemo(() => {
    const map: Record<number, Map<string, Position>> = {};

    for (const step of stepKeys) {
      const positions = positionsByStep?.[step] || [];
      map[step] = new Map(positions.map((position) => [position.trader, position]));
    }

    return map;
  }, [positionsByStep, stepKeys]);

  const fixedTraders = useMemo(() => {
    const initialPositions = positionsByStep?.[firstStep] || [];
    return initialPositions.slice(0, 10).map((position) => position.trader);
  }, [positionsByStep, firstStep]);

  const replayRows = useMemo<TraderReplayRow[]>(() => {
    return fixedTraders.map((trader) => {
      const entry = positionsMapByStep[firstStep]?.get(trader);
      const current = positionsMapByStep[currentStep]?.get(trader);
      let peakPnl = Number.NEGATIVE_INFINITY;
      let troughPnl = Number.POSITIVE_INFINITY;
      let hasHistory = false;
      let everLiquidatable = false;

      for (const step of stepKeys) {
        if (step > currentStep) break;
        const position = positionsMapByStep[step]?.get(trader);
        if (!position) continue;
        hasHistory = true;
        peakPnl = Math.max(peakPnl, position.pnl);
        troughPnl = Math.min(troughPnl, position.pnl);
        if (position.isLiquidatable) {
          everLiquidatable = true;
        }
      }

      let status: TraderReplayRow['status'] = 'inactive';
      if (current?.isLiquidatable) status = 'liquidatable';
      else if (current) status = 'open';
      else if (hasHistory && everLiquidatable) status = 'liquidated';
      else if (hasHistory) status = 'closed';

      return {
        trader,
        current,
        entry,
        peakPnl: peakPnl === Number.NEGATIVE_INFINITY ? 0 : peakPnl,
        troughPnl: troughPnl === Number.POSITIVE_INFINITY ? 0 : troughPnl,
        status,
      };
    });
  }, [fixedTraders, positionsMapByStep, firstStep, currentStep, stepKeys]);

  const syntheticSnapshots = useMemo<SyntheticPositionSnapshot[]>(() => {
    if (!syntheticPosition || metrics.length === 0) return [];

    const directionMultiplier = syntheticPosition.direction === 'buy' ? 1 : -1;
    const quantity = syntheticPosition.entryPrice > 0
      ? syntheticPosition.size / syntheticPosition.entryPrice
      : 0;

    const liqPrice = syntheticPosition.direction === 'buy'
      ? syntheticPosition.entryPrice * (1 + ASSUMED_MAINTENANCE_MARGIN - 1 / syntheticPosition.leverage)
      : syntheticPosition.entryPrice * (1 - ASSUMED_MAINTENANCE_MARGIN + 1 / syntheticPosition.leverage);

    return metrics.slice(0, currentStep + 1).map((metric, step) => {
      const markPrice = metric.price;
      const pnl = directionMultiplier * quantity * (markPrice - syntheticPosition.entryPrice);
      const pnlPercent = syntheticPosition.size > 0 ? (pnl / syntheticPosition.size) * 100 : 0;
      const liquidated = syntheticPosition.direction === 'buy'
        ? markPrice <= liqPrice
        : markPrice >= liqPrice;

      return {
        step,
        markPrice,
        pnl,
        pnlPercent,
        liqPrice,
        liquidated,
      };
    });
  }, [syntheticPosition, metrics, currentStep]);

  const currentSynthetic = syntheticSnapshots[currentStep];
  const syntheticLiquidationStep = syntheticSnapshots.find((snapshot) => snapshot.liquidated)?.step;

  const onAddSyntheticPosition = () => {
    const size = Number(customSize);
    const leverage = Number(customLeverage);
    const entryPrice = Number(customEntry || currentMark);

    if (!Number.isFinite(size) || !Number.isFinite(leverage) || !Number.isFinite(entryPrice)) return;
    if (size <= 0 || leverage <= 1 || entryPrice <= 0) return;

    setSyntheticPosition({
      direction: customDirection,
      size,
      leverage,
      entryPrice,
    });
  };

  const statusBadgeClass = (status: TraderReplayRow['status']) => {
    if (status === 'open') return 'bg-green-500/20 text-green-300';
    if (status === 'liquidatable') return 'bg-red-500/20 text-red-300';
    if (status === 'liquidated') return 'bg-red-600/30 text-red-200';
    if (status === 'closed') return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-gray-600/30 text-gray-300';
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h3 className="text-lg font-semibold">Trader Positions Replay (Fixed 10)</h3>
        <div className="text-xs text-gray-400">
          Step {currentStep} of {Math.max(metrics.length - 1, 0)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs md:text-sm">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="py-2 text-left">Trader</th>
              <th className="py-2 text-right">Size</th>
              <th className="py-2 text-right">Lev</th>
              <th className="py-2 text-right">Entry</th>
              <th className="py-2 text-right">Mark</th>
              <th className="py-2 text-right">PnL</th>
              <th className="py-2 text-right">PnL %</th>
              <th className="py-2 text-right">Health</th>
              <th className="py-2 text-right">Peak/Trough</th>
              <th className="py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {replayRows.map((row) => {
              const pnlValue = row.current?.pnl ?? 0;
              const pnlClass = pnlValue >= 0 ? 'text-green-300' : 'text-red-300';
              return (
                <tr key={row.trader} className="border-b border-gray-700/40">
                  <td className="py-2 font-mono">{formatCompactTrader(row.trader)}</td>
                  <td className="py-2 text-right">{row.current ? formatCurrency(row.current.size) : '-'}</td>
                  <td className="py-2 text-right">{row.current ? `${row.current.leverage.toFixed(2)}x` : '-'}</td>
                  <td className="py-2 text-right">{row.current ? formatCurrency(row.current.entryPrice) : '-'}</td>
                  <td className="py-2 text-right">{row.current ? formatCurrency(row.current.markPrice) : '-'}</td>
                  <td className={`py-2 text-right font-mono ${pnlClass}`}>
                    {row.current ? formatCurrency(row.current.pnl) : '-'}
                  </td>
                  <td className={`py-2 text-right ${pnlClass}`}>
                    {row.current?.pnlPercent ?? '-'}
                  </td>
                  <td className="py-2 text-right">{row.current ? row.current.health.toFixed(2) : '-'}</td>
                  <td className="py-2 text-right font-mono">
                    {formatCurrency(row.peakPnl)} / {formatCurrency(row.troughPnl)}
                  </td>
                  <td className="py-2 text-right">
                    <span className={`px-2 py-1 rounded ${statusBadgeClass(row.status)}`}>
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}

            {syntheticPosition && currentSynthetic && (
              <tr className="border-b border-blue-500/40 bg-blue-500/5">
                <td className="py-2 font-mono text-blue-300">SYNTHETIC</td>
                <td className="py-2 text-right">{formatCurrency(syntheticPosition.size)}</td>
                <td className="py-2 text-right">{syntheticPosition.leverage.toFixed(2)}x</td>
                <td className="py-2 text-right">{formatCurrency(syntheticPosition.entryPrice)}</td>
                <td className="py-2 text-right">{formatCurrency(currentSynthetic.markPrice)}</td>
                <td className={`py-2 text-right font-mono ${currentSynthetic.pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatCurrency(currentSynthetic.pnl)}
                </td>
                <td className={`py-2 text-right ${currentSynthetic.pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {currentSynthetic.pnlPercent.toFixed(2)}%
                </td>
                <td className="py-2 text-right">-</td>
                <td className="py-2 text-right font-mono">Liq @ {formatCurrency(currentSynthetic.liqPrice)}</td>
                <td className="py-2 text-right">
                  <span className={`px-2 py-1 rounded ${currentSynthetic.liquidated ? 'bg-red-600/30 text-red-200' : 'bg-blue-500/20 text-blue-200'}`}>
                    {currentSynthetic.liquidated ? 'LIQUIDATED' : 'OPEN'}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-700 pt-3 space-y-3">
        <h4 className="text-sm font-semibold">What-if Position (UI Only)</h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <select
            value={customDirection}
            onChange={(event) => setCustomDirection(event.target.value as 'buy' | 'sell')}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-2"
          >
            <option value="buy">Market Buy</option>
            <option value="sell">Market Sell</option>
          </select>
          <input
            value={customSize}
            onChange={(event) => setCustomSize(event.target.value)}
            placeholder="Size (USD notional)"
            className="bg-gray-900 border border-gray-700 rounded px-2 py-2"
          />
          <input
            value={customLeverage}
            onChange={(event) => setCustomLeverage(event.target.value)}
            placeholder="Leverage"
            className="bg-gray-900 border border-gray-700 rounded px-2 py-2"
          />
          <input
            value={customEntry}
            onChange={(event) => setCustomEntry(event.target.value)}
            placeholder={`Entry (default ${currentMark.toFixed(2)})`}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-2"
          />
          <button
            onClick={onAddSyntheticPosition}
            className="bg-blue-600 hover:bg-blue-700 rounded px-3 py-2 transition"
          >
            Add Position
          </button>
        </div>

        {syntheticPosition && currentSynthetic && (
          <div className="text-xs text-gray-300 space-y-1">
            <div>
              Synthetic {syntheticPosition.direction.toUpperCase()} at {formatCurrency(syntheticPosition.entryPrice)} ·
              Liq price {formatCurrency(currentSynthetic.liqPrice)} (assumes {(ASSUMED_MAINTENANCE_MARGIN * 100).toFixed(0)}% maint. margin)
            </div>
            <div>
              {syntheticLiquidationStep !== undefined
                ? `Liquidated at step ${syntheticLiquidationStep}`
                : 'No liquidation through current replay range'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};