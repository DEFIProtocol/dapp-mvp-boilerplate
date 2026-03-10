import * as fs from 'fs';
import * as path from 'path';

import { formatUnits } from 'ethers';

import type { PositionDetail, ProtocolMetrics } from './metrics.ts';

export interface SimulationLog {
  config: {
    scenario: string;
    seed: number;
    startTime: string;
    agentCount: number;
  };
  metrics: ProtocolMetrics[];
  positions: Record<number, PositionDetail[]>;
  liquidations: any[];
  summary: any;
}

export class SimulationLogger {
  private logDir: string;
  private logs: SimulationLog;
  private simulationId: string;
  private baseDir: string;

  constructor(simulationId: string, baseDir: string = './simulation-results') {
    this.simulationId = simulationId;
    this.baseDir = baseDir;
    this.logDir = path.join(baseDir, simulationId);
    this.ensureDirectoryExists();

    this.logs = {
      config: {
        scenario: '',
        seed: 0,
        startTime: new Date().toISOString(),
        agentCount: 0,
      },
      metrics: [],
      positions: {},
      liquidations: [],
      summary: {},
    };
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  setConfig(config: { scenario: string; seed: number; agentCount: number }): void {
    this.logs.config = {
      ...config,
      startTime: this.logs.config.startTime,
    };
  }

  logMetrics(step: number, metrics: ProtocolMetrics): void {
    this.logs.metrics.push(metrics);
    this.appendToCsv(step, metrics);
  }

  logPositions(step: number, positions: PositionDetail[]): void {
    this.logs.positions[step] = positions;
    if (step % 200 === 0) {
      this.savePositionsSnapshot(step, positions);
    }
  }

  logLiquidation(trader: string, size: bigint, insuranceUsed: bigint): void {
    this.logs.liquidations.push({
      step: this.logs.metrics.length,
      trader,
      size: size.toString(),
      insuranceUsed: insuranceUsed.toString(),
      timestamp: Date.now(),
    });

    console.log(
      `\x1b[31mLIQUIDATION trader=${trader.substring(0, 8)} size=${formatUnits(size, 6)} insurance=${formatUnits(insuranceUsed, 6)}\x1b[0m`
    );
  }

  private appendToCsv(step: number, metrics: ProtocolMetrics): void {
    const csvPath = path.join(this.logDir, 'metrics.csv');
    const isNew = !fs.existsSync(csvPath);

    const line = [
      step,
      metrics.price.toFixed(2),
      formatUnits(metrics.openInterest, 6),
      formatUnits(metrics.tvl, 6),
      formatUnits(metrics.insuranceBalance, 6),
      formatUnits(metrics.badDebt, 6),
      formatUnits(metrics.protocolRevenue, 6),
      formatUnits(metrics.makerFeesCollected, 6),
      formatUnits(metrics.takerFeesCollected, 6),
      formatUnits(metrics.fundingFeesTransferred, 6),
      formatUnits(metrics.insuranceFundInflow, 6),
      formatUnits(metrics.insuranceFundOutflow, 6),
      formatUnits(metrics.liquidationInsuranceInflow, 6),
      metrics.liquidationCount,
      metrics.liquidatorOrders,
      formatUnits(metrics.liquidatorRewardsPaid, 6),
      formatUnits(metrics.liquidationPenaltyCollected, 6),
      formatUnits(metrics.marginReturnedFromLiquidation, 6),
      metrics.positionsAtRisk,
      metrics.tradeCount,
      metrics.uniqueTraders,
      metrics.openOrders,
      metrics.newOrders,
      metrics.filledOrders,
      metrics.cancelledOrders,
      metrics.liquidationsPer100Orders.toFixed(3),
      metrics.averageLeverage.toFixed(2),
      metrics.longShortRatio.toFixed(3),
      metrics.spreadBps.toFixed(2),
      metrics.slippageBps.toFixed(2),
      metrics.priceImpactBps.toFixed(2),
      metrics.isInsolvent ? 1 : 0,
    ].join(',');

    if (isNew) {
      const header = [
        'step',
        'price',
        'openInterest',
        'tvl',
        'insuranceBalance',
        'badDebt',
        'protocolRevenue',
        'makerFeesCollected',
        'takerFeesCollected',
        'fundingFeesTransferred',
        'insuranceFundInflow',
        'insuranceFundOutflow',
        'liquidationInsuranceInflow',
        'liquidations',
        'liquidatorOrders',
        'liquidatorRewardsPaid',
        'liquidationPenaltyCollected',
        'marginReturnedFromLiquidation',
        'positionsAtRisk',
        'trades',
        'uniqueTraders',
        'openOrders',
        'newOrders',
        'filledOrders',
        'cancelledOrders',
        'liquidationsPer100Orders',
        'avgLeverage',
        'longShortRatio',
        'spreadBps',
        'slippageBps',
        'priceImpactBps',
        'isInsolvent',
      ].join(',');
      fs.writeFileSync(csvPath, header + '\n' + line + '\n');
      return;
    }

    fs.appendFileSync(csvPath, line + '\n');
  }

  private savePositionsSnapshot(step: number, positions: PositionDetail[]): void {
    const snapshotPath = path.join(this.logDir, `positions_step_${step}.json`);

    const formatted = positions.map((p) => ({
      trader: p.trader,
      size: formatUnits(p.size, 6),
      collateral: formatUnits(p.collateral, 6),
      leverage: p.leverage.toFixed(2),
      entryPrice: p.entryPrice.toFixed(2),
      markPrice: p.markPrice.toFixed(2),
      pnl: formatUnits(p.pnl, 6),
      pnlPercent: p.pnlPercent.toFixed(2) + '%',
      health: p.health.toFixed(2),
      isLiquidatable: p.isLiquidatable,
    }));

    fs.writeFileSync(snapshotPath, JSON.stringify(formatted, null, 2));
  }

  saveFinalLog(summary: any): void {
    this.logs.summary = summary;

    const logPath = path.join(this.logDir, 'simulation_complete.json');
    fs.writeFileSync(
      logPath,
      JSON.stringify(
        this.logs,
        (_key, value) => {
          if (typeof value === 'bigint') return value.toString();
          return value;
        },
        2
      )
    );

    const summaryPath = path.join(this.logDir, 'summary.txt');
    fs.writeFileSync(summaryPath, this.formatSummaryText(summary));

    this.saveLiquidatorActivityTable();

    console.log(`\nResults saved to: ${this.logDir}`);
  }

  private formatSummaryText(summary: any): string {
    return [
      'SIMULATION SUMMARY',
      '==================',
      '',
      `Scenario: ${this.logs.config.scenario}`,
      `Seed: ${this.logs.config.seed}`,
      `Duration: ${summary.duration} steps`,
      `Start Time: ${this.logs.config.startTime}`,
      '',
      'MARKET',
      `Price Change: ${summary.priceChange}`,
      `Open Interest: $${summary.openInterest.start} -> $${summary.openInterest.end} (${summary.openInterest.change})`,
      `TVL: $${summary.tvl.start} -> $${summary.tvl.end}`,
      '',
      'INSURANCE & SOLVENCY',
      `Insurance Start: $${summary.insuranceFund.start}`,
      `Insurance End: $${summary.insuranceFund.end}`,
      `Max Drawdown: $${summary.insuranceFund.maxDrawdown} (${summary.insuranceFund.maxDrawdownPercent})`,
      `Insurance Used: $${summary.liquidations.insuranceUsed}`,
      `Liquidations / 100 orders: ${summary.liquidations.per100Orders}`,
      `Average Leverage: ${summary.health.avgLeverage}x`,
      `Insolvent Steps: ${summary.health.insolventSteps}`,
      '',
      'EXECUTION QUALITY',
      `Orders Placed: ${summary.trading.ordersPlaced}`,
      `Order Fill Rate: ${summary.trading.fillRatePercent}%`,
      `Final Open Orders: ${summary.trading.finalOpenOrders}`,
      `Avg Spread (bps): ${summary.marketQuality.avgSpreadBps}`,
      `Avg Slippage (bps): ${summary.marketQuality.avgSlippageBps}`,
      `Avg Price Impact (bps): ${summary.marketQuality.avgPriceImpactBps}`,
      '',
      'REVENUE',
      `Protocol Fees: $${summary.revenue.protocolFees}`,
      `Maker Fees: $${summary.revenue.makerFees}`,
      `Taker Fees: $${summary.revenue.takerFees}`,
      '',
      'FUNDING',
      `Funding Transferred: $${summary.funding.transferred}`,
      '',
      'LIQUIDATOR FLOW',
      `Liquidator Orders: ${summary.liquidator.orders}`,
      `Liquidator Rewards Paid: $${summary.liquidator.rewardsPaid}`,
      `Liquidation Penalty Collected: $${summary.liquidator.penaltyCollected}`,
      `Margin Returned: $${summary.liquidator.marginReturned}`,
      `Insurance Used: $${summary.liquidator.insuranceUsed}`,
      '',
      'INSURANCE FLOW',
      `Insurance Inflow: $${summary.insuranceFlow.inflow}`,
      `Insurance Outflow: $${summary.insuranceFlow.outflow}`,
      '',
    ].join('\n');
  }

  private saveLiquidatorActivityTable(): void {
    const outputPath = path.join(this.logDir, 'liquidator_activity.csv');
    const header = [
      'step',
      'liquidatorOrders',
      'liquidations',
      'liquidatorRewardsPaid',
      'liquidationPenaltyCollected',
      'marginReturnedFromLiquidation',
      'insuranceFundOutflow',
    ].join(',');

    const lines = this.logs.metrics.map((m, idx) => [
      idx,
      m.liquidatorOrders,
      m.liquidationCount,
      formatUnits(m.liquidatorRewardsPaid, 6),
      formatUnits(m.liquidationPenaltyCollected, 6),
      formatUnits(m.marginReturnedFromLiquidation, 6),
      formatUnits(m.insuranceFundOutflow, 6),
    ].join(','));

    fs.writeFileSync(outputPath, header + '\n' + lines.join('\n') + '\n');
  }

  logStep(step: number, totalSteps: number, metrics: ProtocolMetrics, elapsedMs: number): void {
    const progress = ((step / Math.max(totalSteps, 1)) * 100).toFixed(1);
    const perSecond = elapsedMs > 0 ? (step / (elapsedMs / 1000)).toFixed(0) : '?';

    process.stdout.write(
      `\rStep ${step.toString().padStart(6)} [${progress.padStart(6)}%] | ` +
      `Price $${metrics.price.toFixed(2).padStart(8)} | ` +
      `OI $${(Number(metrics.openInterest) / 1e6).toFixed(1)}M | ` +
      `Liq ${metrics.liquidationCount.toString().padStart(3)} | ` +
      `IF $${(Number(metrics.insuranceBalance) / 1e6).toFixed(1)}M | ` +
      `BD $${(Number(metrics.badDebt) / 1e6).toFixed(2)}M | ` +
      `${perSecond} steps/s`
    );
  }
}
