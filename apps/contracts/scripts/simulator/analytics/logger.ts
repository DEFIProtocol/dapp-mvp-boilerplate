// analytics/logger.ts
import * as fs from 'fs';
import * as path from 'path';
import { ProtocolMetrics, PositionDetail } from './metrics.js';
import hre from "hardhat";
const { ethers } = hre;

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
  
  constructor(
    private simulationId: string,
    private baseDir: string = './simulation-results'
  ) {
    this.logDir = path.join(baseDir, simulationId);
    this.ensureDirectoryExists();
    
    this.logs = {
      config: {
        scenario: '',
        seed: 0,
        startTime: new Date().toISOString(),
        agentCount: 0
      },
      metrics: [],
      positions: {},
      liquidations: [],
      summary: {}
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
      startTime: this.logs.config.startTime
    };
  }
  
  logMetrics(step: number, metrics: ProtocolMetrics): void {
    this.logs.metrics.push(metrics);
    
    // Also write to CSV incrementally for large simulations
    this.appendToCsv(step, metrics);
  }
  
  logPositions(step: number, positions: PositionDetail[]): void {
    this.logs.positions[step] = positions;
    
    // Save positions snapshot every 100 steps
    if (step % 100 === 0) {
      this.savePositionsSnapshot(step, positions);
    }
  }
  
  logLiquidation(trader: string, size: bigint, insuranceUsed: bigint): void {
    this.logs.liquidations.push({
      step: this.logs.metrics.length,
      trader,
      size: size.toString(),
      insuranceUsed: insuranceUsed.toString(),
      timestamp: Date.now()
    });
    
    // Also log to console with highlighting
    console.log(`\x1b[31m⚠️  LIQUIDATION: Trader ${trader.substring(0, 8)}... | Size: $${ethers.formatUnits(size, 6)} | Insurance: $${ethers.formatUnits(insuranceUsed, 6)}\x1b[0m`);
  }
  
  private appendToCsv(step: number, metrics: ProtocolMetrics): void {
    const csvPath = path.join(this.logDir, 'metrics.csv');
    const isNew = !fs.existsSync(csvPath);
    
    const line = [
      step,
      metrics.price.toFixed(2),
      ethers.formatUnits(metrics.openInterest, 6),
      ethers.formatUnits(metrics.tvl, 6),
      ethers.formatUnits(metrics.insuranceBalance, 6),
      metrics.liquidationCount,
      metrics.positionsAtRisk,
      metrics.tradeCount,
      (metrics.fundingRate * 100).toFixed(4),
      metrics.longPositions,
      metrics.shortPositions
    ].join(',');
    
    if (isNew) {
      const header = 'step,price,openInterest,tvl,insuranceBalance,liquidations,positionsAtRisk,trades,fundingRate,longPositions,shortPositions\n';
      fs.writeFileSync(csvPath, header + line + '\n');
    } else {
      fs.appendFileSync(csvPath, line + '\n');
    }
  }
  
  private savePositionsSnapshot(step: number, positions: PositionDetail[]): void {
    const snapshotPath = path.join(this.logDir, `positions_step_${step}.json`);
    
    const formatted = positions.map(p => ({
      trader: p.trader,
      size: ethers.formatUnits(p.size, 6),
      collateral: ethers.formatUnits(p.collateral, 6),
      leverage: p.leverage.toFixed(2),
      entryPrice: p.entryPrice.toFixed(2),
      markPrice: p.markPrice.toFixed(2),
      pnl: ethers.formatUnits(p.pnl, 6),
      pnlPercent: p.pnlPercent.toFixed(2) + '%',
      health: p.health.toFixed(2),
      isLiquidatable: p.isLiquidatable
    }));
    
    fs.writeFileSync(snapshotPath, JSON.stringify(formatted, null, 2));
  }
  
  saveFinalLog(summary: any): void {
    this.logs.summary = summary;
    
    // Save complete log
    const logPath = path.join(this.logDir, 'simulation_complete.json');
    fs.writeFileSync(logPath, JSON.stringify(this.logs, (key, value) => {
      // Convert bigints to strings
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2));
    
    // Save summary separately for quick viewing
    const summaryPath = path.join(this.logDir, 'summary.txt');
    const summaryText = this.formatSummaryText(summary);
    fs.writeFileSync(summaryPath, summaryText);
    
    console.log(`\n📁 Results saved to: ${this.logDir}`);
  }
  
  private formatSummaryText(summary: any): string {
    return `
╔══════════════════════════════════════════════════════════════╗
║                    SIMULATION SUMMARY                         ║
╚══════════════════════════════════════════════════════════════╝

Scenario: ${this.logs.config.scenario}
Seed: ${this.logs.config.seed}
Duration: ${summary.duration} steps
Start Time: ${this.logs.config.startTime}

📊 MARKET METRICS
────────────────
Price Change: ${summary.priceChange}
Open Interest: $${summary.openInterest.start} → $${summary.openInterest.end} (${summary.openInterest.change})
TVL: $${summary.tvl.start} → $${summary.tvl.end}

🛡️ INSURANCE FUND
────────────────
Starting Balance: $${summary.insuranceFund.start}
Ending Balance: $${summary.insuranceFund.end}
Peak Balance: $${summary.insuranceFund.peak}
Max Drawdown: $${summary.insuranceFund.maxDrawdown} (${summary.insuranceFund.maxDrawdownPercent})
Total Insurance Used: $${summary.liquidations.insuranceUsed}

💀 LIQUIDATIONS
────────────────
Total Liquidations: ${summary.liquidations.total}
Average Payout: $${summary.liquidations.avgPayout}

📈 TRADING ACTIVITY
────────────────
Total Volume: $${summary.trading.totalVolume}
Average Trades/Step: ${summary.trading.avgTradeCount}

⚕️ PROTOCOL HEALTH
────────────────
Average Leverage: ${summary.health.avgLeverage}x
Max Positions at Risk: ${summary.health.maxPositionsAtRisk}

${
  parseFloat(summary.insuranceFund.maxDrawdownPercent) > 50
    ? '\n⚠️  WARNING: Insurance fund drawdown exceeded 50%!\n'
    : parseFloat(summary.insuranceFund.maxDrawdownPercent) > 30
    ? '\n⚠️  CAUTION: Significant insurance fund drawdown\n'
    : '\n✅ Insurance fund appears healthy\n'
}
`;
  }
  
  // Live logging during simulation
  logStep(step: number, metrics: ProtocolMetrics, elapsedMs: number): void {
    const progress = (step / this.logs.metrics.length * 100).toFixed(1);
    const perSecond = elapsedMs > 0 ? (step / (elapsedMs / 1000)).toFixed(0) : '?';
    
    process.stdout.write(
      `\rStep ${step.toString().padStart(6)} [${progress.padStart(5)}%] | ` +
      `Price: $${metrics.price.toFixed(2).padStart(8)} | ` +
      `OI: $${(Number(metrics.openInterest) / 1e6).toFixed(1)}M | ` +
      `Liq: ${metrics.liquidationCount.toString().padStart(2)} | ` +
      `IF: $${(Number(metrics.insuranceBalance) / 1e6).toFixed(1)}M | ` +
      `${perSecond} steps/s`
    );
  }
}