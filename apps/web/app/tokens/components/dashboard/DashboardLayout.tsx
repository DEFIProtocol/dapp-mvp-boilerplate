'use client';

// components/dashboard/DashboardLayout.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import { SystemHealthOverview } from './SystemHealthOverview';
import { RiskMetricsPanel } from './RiskMetricsPanel';
import { ProtocolEconomics } from './ProtocolEconomics';
import { TraderReplayPositionsPanel } from './TraderReplayPositionsPanel';
import { TokenPricePanel } from './TokenPricePanel';
import { SimulationPerpetualOrderCard } from './SimulationPerpetualOrderCard';
import { TimelineController } from '../simulation/TimelineController';
import { ScenarioSelector } from '../simulation/ScenarioSelector';
import { ExportModal } from '../export/ExportModal';
import { SimulationApi } from '../services/simulationApi';
import type { SimulationData } from '../../types/simulation';

export const DashboardLayout: React.FC = () => {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('ETH');

  const chartRefs = {
    liquidationMap: useRef<HTMLDivElement>(null),
    positionDist: useRef<HTMLDivElement>(null),
    orderFlow: useRef<HTMLDivElement>(null),
    pnlAnalysis: useRef<HTMLDivElement>(null),
  };

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

  const loadScenarioSimulation = async (selectedScenario: string) => {
    try {
      setIsLoading(true);
      const { runs } = await SimulationApi.getSimulationRuns();
      const matchingRun = runs.find(
        (run) => run.id === selectedScenario || run.scenario === selectedScenario,
      );

      if (matchingRun?.id) {
        const data = await SimulationApi.getSimulationRun(matchingRun.id);
        setSimulationData(data);
      } else {
        const latest = await SimulationApi.getLatestSimulation();
        setSimulationData({
          ...latest,
          config: {
            ...latest.config,
            scenario: selectedScenario,
          },
        });
      }

      setCurrentStep(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load selected scenario');
    } finally {
      setIsLoading(false);
    }
  };

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

  const data = simulationData;
  const currentMetrics = data.metrics[currentStep];
  const currentLiquidations = data.liquidations[currentStep];
  const totalOrders = data.metrics.reduce((sum, metric) => sum + metric.newOrders, 0);
  const totalLiquidations = data.liquidations.reduce((sum, step) => sum + step.liquidations, 0);
  const runLiquidationRate = totalOrders > 0 ? (totalLiquidations / totalOrders) * 100 : 0;
  const runAverageLeverage = data.metrics.length > 0
    ? data.metrics.reduce((sum, metric) => sum + metric.avgLeverage, 0) / data.metrics.length
    : 0;
  const currentMarkPrice = currentMetrics?.price || 0;

  const handleShare = async () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('step', String(currentStep));
    shareUrl.searchParams.set('scenario', data.config.scenario || 'normal');

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
    } catch (copyError) {
      console.error('Failed to copy share URL:', copyError);
    }
  };

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
                onSelectScenario={loadScenarioSimulation}
              />
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition"
                  title="Export Data"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 hover:bg-gray-700 rounded-lg transition"
                  title="Copy Share URL"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
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
      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col space-y-6">
          {/* Row 1: Two column layout - Left 40% / Right 60% */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Column - 40% width */}
            <div className="w-full lg:w-2/5">
              <div className="flex flex-col space-y-6">
                {/* Token Price Panel */}
                <div ref={chartRefs.liquidationMap}>
                  <TokenPricePanel
                    metrics={simulationData.metrics}
                    currentStep={currentStep}
                    selectedSymbol={selectedSymbol}
                    onSymbolChange={setSelectedSymbol}
                  />
                </div>
                
                {/* Risk Metrics Panel */}
                <div ref={chartRefs.positionDist}>
                  <RiskMetricsPanel 
                    metrics={currentMetrics}
                    historicalMetrics={simulationData.metrics.slice(0, currentStep + 1)}
                  />
                </div>
              </div>
            </div>
            
            {/* Right Column - 60% width */}
            <div className="w-full lg:w-3/5">
              <ProtocolEconomics 
                metrics={currentMetrics}
                liquidations={currentLiquidations}
              />
            </div>
          </div>

          {/* Row 2: System Health Overview - Full Width */}
          <div className="w-full">
            <SystemHealthOverview metrics={currentMetrics} />
          </div>

          {/* Row 3: Perpetual Order Card - Full Width */}
          <div className="w-full" ref={chartRefs.orderFlow}>
            <SimulationPerpetualOrderCard
              symbol={selectedSymbol}
              currentPrice={currentMarkPrice}
              currentStep={currentStep}
            />
          </div>

          {/* Row 4: Trader Replay Positions - Full Width */}
          <div className="w-full" ref={chartRefs.pnlAnalysis}>
            <TraderReplayPositionsPanel
              positionsByStep={simulationData.positionsByStep}
              metrics={simulationData.metrics}
              currentStep={currentStep}
            />
          </div>

          {/* Timeline Controller - Full Width */}
          <div className="w-full">
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
          </div>
        </div>
      </main>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        data={simulationData}
        chartRefs={chartRefs}
      />
    </div>
  );
};