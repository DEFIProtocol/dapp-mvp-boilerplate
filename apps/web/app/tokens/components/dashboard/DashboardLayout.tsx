// components/dashboard/DashboardLayout.tsx
import React, { useState, useEffect } from 'react';
import { SystemHealthOverview } from './SystemHealthOverview';
import { RiskMetricsPanel } from './RiskMetricsPanel';
import { ProtocolEconomics } from './ProtocolEconomics';
import { TraderActivityHub } from './TraderActivityHub';
import { TimelineController } from '../simulation/TimelineController';
import { ScenarioSelector } from '../simulation/ScenarioSelector';
import { SimulationApi } from '../../services/simulationApi';
import type { SimulationData } from '../../types/simulation';

export const DashboardLayout: React.FC = () => {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLatestSimulation();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && simulationData) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          const next = prev + 1;
          if (next >= (simulationData.metrics?.length || 0) - 1) {
            setIsPlaying(false);
            return prev;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, simulationData]);

  const loadLatestSimulation = async () => {
    try {
      setIsLoading(true);
      const data = await SimulationApi.getLatestSimulation();
      setSimulationData(data);
      setCurrentStep(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load simulation');
    } finally {
      setIsLoading(false);
    }
  };

  const currentMetrics = simulationData?.metrics?.[currentStep];
  const currentLiquidations = simulationData?.liquidations?.[currentStep];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-white mt-4 text-lg">Loading simulation data...</p>
        </div>
      </div>
    );
  }

  if (error || !simulationData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-8 max-w-lg">
          <h2 className="text-red-500 text-2xl font-bold mb-4">Error Loading Dashboard</h2>
          <p className="text-gray-300">{error || 'No simulation data available'}</p>
          <button 
            onClick={loadLatestSimulation}
            className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Protocol Simulator
              </h1>
              <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${currentMetrics?.isInsolvent ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-sm text-gray-400">
                  {currentMetrics?.isInsolvent ? 'Insolvent' : 'Healthy'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ScenarioSelector 
                currentScenario={simulationData.config.scenario}
                onSelectScenario={(scenario) => {
                  // Load selected scenario
                }}
              />
              <div className="text-sm bg-gray-800 px-4 py-2 rounded-lg">
                <span className="text-gray-400">Step:</span>
                <span className="ml-2 font-mono text-blue-400">
                  {currentStep}/{simulationData.metrics.length - 1}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI Row */}
        <SystemHealthOverview metrics={currentMetrics} />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RiskMetricsPanel 
            metrics={currentMetrics}
            historicalMetrics={simulationData.metrics.slice(0, currentStep + 1)}
          />
          <ProtocolEconomics 
            metrics={currentMetrics}
            liquidations={currentLiquidations}
          />
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TraderActivityHub 
              metrics={currentMetrics}
              positions={simulationData.positions}
            />
          </div>
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Quick Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Open Orders:</span>
                <span className="font-mono">{currentMetrics?.openOrders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unique Traders:</span>
                <span className="font-mono">{currentMetrics?.uniqueTraders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Leverage:</span>
                <span className="font-mono">{currentMetrics?.avgLeverage.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Long/Short:</span>
                <span className="font-mono">{currentMetrics?.longShortRatio.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Controller */}
        <TimelineController
          totalSteps={simulationData.metrics.length}
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          speed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          bookmarks={simulationData.liquidations
            ?.filter(l => l.liquidations > 0)
            .map(l => l.step) || []}
        />
      </main>
    </div>
  );
};