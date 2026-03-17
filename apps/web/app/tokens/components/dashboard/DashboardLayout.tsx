'use client';

// components/dashboard/DashboardLayout.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import { SystemHealthOverview } from './SystemHealthOverview';
import { RiskMetricsPanel } from './RiskMetricsPanel';
import { ProtocolEconomics } from './ProtocolEconomics';
import { TraderReplayPositionsPanel } from './TraderReplayPositionsPanel';
import { SimulationDiagnosticsPanel } from './SimulationDiagnosticsPanel';
import { TokenPricePanel } from './TokenPricePanel';
import { SimulationPerpetualOrderCard } from './SimulationPerpetualOrderCard';
import { TimelineController } from '../simulation/TimelineController';
import { ScenarioSelector } from '../simulation/ScenarioSelector';
import { ExportModal } from '../export/ExportModal';
import { SimulationApi } from '../services/simulationApi';
import type { SimulationData, SimulationDiagnostics } from '../../types/simulation';

export const DashboardLayout: React.FC = () => {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('ETH');
  const [diagnostics, setDiagnostics] = useState<SimulationDiagnostics | null>(null);
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [diagnosticsRunId, setDiagnosticsRunId] = useState<string | null>(null);
  const diagnosticsCacheRef = useRef<Map<string, Map<number, SimulationDiagnostics>>>(new Map());
  const lastVisibleDiagnosticsRef = useRef<SimulationDiagnostics | null>(null);

  const chartRefs = {
    liquidationMap: useRef<HTMLDivElement>(null),
    positionDist: useRef<HTMLDivElement>(null),
    orderFlow: useRef<HTMLDivElement>(null),
    pnlAnalysis: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    loadLatestSimulation();
  }, []);

  const maxStep = Math.max((simulationData?.metrics.length ?? 1) - 1, 0);
  const safeStep = Math.min(Math.max(currentStep, 0), maxStep);

  useEffect(() => {
    if (currentStep !== safeStep) {
      setCurrentStep(safeStep);
    }
  }, [currentStep, safeStep]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && simulationData) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          const next = prev + 1;
          if (next >= maxStep) {
            setIsPlaying(false);
            return maxStep;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, simulationData, maxStep]);

  const loadLatestSimulation = async () => {
    try {
      setIsPlaying(false);
      setIsLoading(true);
      setIsDiagnosticsLoading(true);
      setDiagnosticsError(null);

      const [simulationResult, diagnosticsResult] = await Promise.allSettled([
        SimulationApi.getLatestSimulation(),
        SimulationApi.getLatestSimulationDiagnostics({ limit: 2500 }),
      ]);

      if (simulationResult.status !== 'fulfilled') {
        throw simulationResult.reason;
      }

      const data = simulationResult.value;
      setSimulationData(data);
      setCurrentStep(0);

      if (diagnosticsResult.status === 'fulfilled') {
        setDiagnostics(diagnosticsResult.value);
        lastVisibleDiagnosticsRef.current = diagnosticsResult.value;
        setDiagnosticsRunId(diagnosticsResult.value.runId);
      } else {
        setDiagnostics(null);
        lastVisibleDiagnosticsRef.current = null;
        setDiagnosticsRunId(null);
        setDiagnosticsError('Diagnostics unavailable for latest run');
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load simulation');
    } finally {
      setIsLoading(false);
      setIsDiagnosticsLoading(false);
    }
  };

  const loadScenarioSimulation = async (selectedScenario: string) => {
    try {
      setIsPlaying(false);
      setIsLoading(true);
      setIsDiagnosticsLoading(true);
      setDiagnosticsError(null);

      const { runs } = await SimulationApi.getSimulationRuns();
      const matchingRun = runs.find(
        (run) => run.id === selectedScenario || run.scenario === selectedScenario,
      );

      if (matchingRun?.id) {
        const [simulationResult, diagnosticsResult] = await Promise.allSettled([
          SimulationApi.getSimulationRun(matchingRun.id),
          SimulationApi.getSimulationDiagnostics(matchingRun.id, { limit: 2500 }),
        ]);

        if (simulationResult.status !== 'fulfilled') {
          throw simulationResult.reason;
        }

        const data = simulationResult.value;
        setSimulationData(data);

        if (diagnosticsResult.status === 'fulfilled') {
          setDiagnostics(diagnosticsResult.value);
          lastVisibleDiagnosticsRef.current = diagnosticsResult.value;
          setDiagnosticsRunId(diagnosticsResult.value.runId);
        } else {
          setDiagnostics(null);
          lastVisibleDiagnosticsRef.current = null;
          setDiagnosticsRunId(null);
          setDiagnosticsError(`Diagnostics unavailable for run ${matchingRun.id}`);
        }
      } else {
        const [latestResult, diagnosticsResult] = await Promise.allSettled([
          SimulationApi.getLatestSimulation(),
          SimulationApi.getLatestSimulationDiagnostics({ limit: 2500 }),
        ]);

        if (latestResult.status !== 'fulfilled') {
          throw latestResult.reason;
        }

        const latest = latestResult.value;
        setSimulationData({
          ...latest,
          config: {
            ...latest.config,
            scenario: selectedScenario,
          },
        });

        if (diagnosticsResult.status === 'fulfilled') {
          setDiagnostics(diagnosticsResult.value);
          lastVisibleDiagnosticsRef.current = diagnosticsResult.value;
          setDiagnosticsRunId(diagnosticsResult.value.runId);
        } else {
          setDiagnostics(null);
          lastVisibleDiagnosticsRef.current = null;
          setDiagnosticsRunId(null);
          setDiagnosticsError('Diagnostics unavailable for latest run');
        }
      }

      setCurrentStep(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load selected scenario');
    } finally {
      setIsLoading(false);
      setIsDiagnosticsLoading(false);
    }
  };

  useEffect(() => {
    if (!diagnosticsRunId) return;

    let cancelled = false;

    const loadStepDiagnostics = async () => {
      let runCache = diagnosticsCacheRef.current.get(diagnosticsRunId);
      if (!runCache) {
        runCache = new Map<number, SimulationDiagnostics>();
        diagnosticsCacheRef.current.set(diagnosticsRunId, runCache);
      }

      const cached = runCache.get(safeStep);
      if (cached) {
        if (cached.executionLedger.length > 0 || !lastVisibleDiagnosticsRef.current) {
          setDiagnostics(cached);
          lastVisibleDiagnosticsRef.current = cached;
        } else {
          setDiagnostics(lastVisibleDiagnosticsRef.current);
        }
        setDiagnosticsError(null);
        setIsDiagnosticsLoading(false);
        return;
      }

      try {
        if (!diagnostics) {
          setIsDiagnosticsLoading(true);
        }

        const stepDiagnostics = await SimulationApi.getSimulationDiagnostics(diagnosticsRunId, {
          step: safeStep,
          limit: 500,
        });

        if (cancelled) return;
        runCache.set(safeStep, stepDiagnostics);
        if (stepDiagnostics.executionLedger.length > 0 || !lastVisibleDiagnosticsRef.current) {
          setDiagnostics(stepDiagnostics);
          lastVisibleDiagnosticsRef.current = stepDiagnostics;
        } else {
          setDiagnostics(lastVisibleDiagnosticsRef.current);
        }
        setDiagnosticsError(null);
      } catch (err) {
        if (cancelled) return;
        setDiagnosticsError(err instanceof Error ? err.message : 'Failed to load diagnostics for current step');
      } finally {
        if (!cancelled) setIsDiagnosticsLoading(false);
      }
    };

    void loadStepDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [safeStep, diagnosticsRunId, diagnostics]);

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
  const currentMetrics = data.metrics[safeStep] ?? data.metrics[data.metrics.length - 1];
  const currentLiquidations = data.liquidations[safeStep] ?? data.liquidations[data.liquidations.length - 1];
  const totalOrders = data.metrics.reduce((sum, metric) => sum + metric.newOrders, 0);
  const totalLiquidations = data.liquidations.reduce((sum, step) => sum + step.liquidations, 0);
  const runLiquidationRate = totalOrders > 0 ? (totalLiquidations / totalOrders) * 100 : 0;
  const runAverageLeverage = data.metrics.length > 0
    ? data.metrics.reduce((sum, metric) => sum + metric.avgLeverage, 0) / data.metrics.length
    : 0;
  const currentMarkPrice = currentMetrics?.price || 0;
  const stepOutcomes = simulationData.metrics.map((metric) => {
    const failed = Math.max(metric.newOrders - metric.filledOrders - metric.cancelledOrders, 0);
    return {
      step: metric.step,
      filled: metric.filledOrders,
      cancelled: metric.cancelledOrders,
      failed,
    };
  });

  const handleShare = async () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('step', String(safeStep));
    shareUrl.searchParams.set('scenario', data.config.scenario || 'normal');

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
    } catch (copyError) {
      console.error('Failed to copy share URL:', copyError);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_50%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.12),transparent_40%),linear-gradient(to_bottom,#050816,#0b1220)] text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700/60 bg-slate-900/70 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
                Protocol Simulator
              </h1>
              <div className="flex items-center space-x-2">
                <div className={`h-3 w-3 rounded-full ${currentMetrics?.isInsolvent ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-sm text-slate-300">
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
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/70 hover:bg-slate-700/60 transition"
                  title="Export Data"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/70 hover:bg-slate-700/60 transition"
                  title="Copy Share URL"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
              <div className="text-sm bg-slate-800/60 border border-slate-700/70 px-4 py-2 rounded-lg">
                <span className="text-slate-400">Step:</span>
                <span className="ml-2 font-mono text-cyan-300">
                  {safeStep}/{simulationData.metrics.length - 1}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col space-y-5 md:space-y-6">
          {/* Row 1: Two column layout - Left 40% / Right 60% */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 md:gap-6">
            {/* Left Column - 40% width */}
            <div className="xl:col-span-2">
              <div className="flex flex-col space-y-5 md:space-y-6">
                {/* Token Price Panel */}
                <div ref={chartRefs.liquidationMap}>
                  <TokenPricePanel
                    metrics={simulationData.metrics}
                    currentStep={safeStep}
                    selectedSymbol={selectedSymbol}
                    onSymbolChange={setSelectedSymbol}
                  />
                </div>
                
                {/* Risk Metrics Panel */}
                <div ref={chartRefs.positionDist}>
                  <RiskMetricsPanel 
                    metrics={currentMetrics}
                    historicalMetrics={simulationData.metrics.slice(0, safeStep + 1)}
                  />
                </div>
              </div>
            </div>
            
            {/* Right Column - 60% width */}
            <div className="xl:col-span-3">
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
              currentStep={safeStep}
            />
          </div>

          {/* Row 4: Trader Replay Positions - Full Width */}
          <div className="w-full" ref={chartRefs.pnlAnalysis}>
            <TraderReplayPositionsPanel
              positionsByStep={simulationData.positionsByStep}
              metrics={simulationData.metrics}
              currentStep={safeStep}
            />
          </div>

          <div className="w-full">
            <SimulationDiagnosticsPanel
              diagnostics={diagnostics}
              currentStep={safeStep}
              isLoading={isDiagnosticsLoading}
              error={diagnosticsError}
            />
          </div>

          {/* Timeline Controller - Full Width */}
          <div className="w-full">
            <TimelineController
              totalSteps={simulationData.metrics.length}
              currentStep={safeStep}
              onStepChange={setCurrentStep}
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              speed={playbackSpeed}
              onSpeedChange={setPlaybackSpeed}
              stepOutcomes={stepOutcomes}
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