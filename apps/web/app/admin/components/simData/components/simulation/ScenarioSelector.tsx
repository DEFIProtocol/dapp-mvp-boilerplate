import React from 'react';

interface Props {
  currentScenario: string;
  onSelectScenario: (scenario: string) => void;
}

const SCENARIOS: { id: string; label: string }[] = [
  { id: 'normal', label: 'Normal Market' },
  { id: 'bullRun', label: 'Bull Run' },
  { id: 'bearMarket', label: 'Bear Market' },
  { id: 'volatilityShock', label: 'Volatility Shock' },
  { id: 'blackSwan', label: 'Black Swan (Random)' },
  { id: 'blackSwanDown', label: 'Black Swan Crash (Down)' },
  { id: 'blackSwanUp', label: 'Black Swan Melt-up (Up)' },
  { id: 'liquidityCrisis', label: 'Liquidity Crisis' },
  { id: 'liquidationCascade', label: 'Liquidation Cascade' },
  { id: 'oracleFailure', label: 'Oracle Failure' },
];

export const ScenarioSelector: React.FC<Props> = ({ currentScenario, onSelectScenario }) => {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-400">Scenario</span>
      <select
        value={currentScenario}
        onChange={(event) => onSelectScenario(event.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm"
      >
        {SCENARIOS.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.label}
          </option>
        ))}
      </select>
    </div>
  );
};