// margin-drain-debugger.ts

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';

interface MarginSnapshot {
  timestamp: number;
  context: string;
  marginBalance: bigint;
  positions: any[];
  pendingOrders: any[];
  reservedMargin: bigint;
}

interface DrainEvent {
  fromContext: string;
  toContext: string;
  drainAmount: string;
  timeDiff: number;
  blockNumber?: bigint;
  txHash?: `0x${string}`;
}

class MarginDrainDebugger {
  private snapshots: MarginSnapshot[] = [];
  private drainEvents: DrainEvent[] = [];
  private isMonitoring: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private publicClient: ReturnType<typeof createPublicClient>,
    private walletClient: ReturnType<typeof createWalletClient>,
    private marginVaultAddress: `0x${string}`,
    private logger: Console = console
  ) {}

  /**
   * Start monitoring margin vault with snapshots every X seconds
   */
  startMonitoring(intervalSeconds: number = 5, context: string = "monitoring") {
    if (this.isMonitoring) {
      this.logger.warn("Monitoring already active");
      return;
    }
    
    this.isMonitoring = true;
    this.logger.info(`🔍 Started margin monitoring every ${intervalSeconds}s`);
    
    this.monitorInterval = setInterval(async () => {
      await this.takeSnapshot(`${context} - ${new Date().toISOString()}`);
      await this.analyzeDrain();
    }, intervalSeconds * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.isMonitoring = false;
      this.logger.info("🛑 Stopped margin monitoring");
    }
  }

  /**
   * Take a snapshot of current margin state
   */
  async takeSnapshot(context: string): Promise<MarginSnapshot> {
    try {
      const marginBalance = await this.getMarginVaultBalance();
      const positions = await this.getAllPositions();
      const pendingOrders = await this.getPendingOrders();
      const reservedMargin = await this.calculateReservedMargin();

      const snapshot: MarginSnapshot = {
        timestamp: Date.now(),
        context,
        marginBalance,
        positions,
        pendingOrders,
        reservedMargin
      };

      this.snapshots.push(snapshot);
      
      // Log significant changes
      if (this.snapshots.length > 1) {
        const prev = this.snapshots[this.snapshots.length - 2];
        const diff = marginBalance - prev.marginBalance;
        
        if (diff < 0n) {
          this.logger.warn(`⚠️  Margin decreased by ${formatEther(-diff)} ETH`);
        }
      }

      this.logger.debug(`📸 Snapshot taken: ${context} - Balance: ${formatEther(marginBalance)} ETH`);
      
      return snapshot;
    } catch (error) {
      this.logger.error("Failed to take snapshot:", error);
      throw error;
    }
  }

  /**
   * Analyze snapshots for drain events
   */
  analyzeDrain(): DrainEvent[] {
    const drains: DrainEvent[] = [];

    for (let i = 1; i < this.snapshots.length; i++) {
      const prev = this.snapshots[i - 1];
      const curr = this.snapshots[i];
      
      const diff = curr.marginBalance - prev.marginBalance;
      
      // Significant drain detected (more than 0.001 ETH)
      if (diff < -parseEther("0.001")) {
        const drainEvent: DrainEvent = {
          fromContext: prev.context,
          toContext: curr.context,
          drainAmount: formatEther(-diff),
          timeDiff: (curr.timestamp - prev.timestamp) / 1000
        };
        
        this.drainEvents.push(drainEvent);
        drains.push(drainEvent);
        
        this.logger.error(`🚨 DRAIN DETECTED: ${drainEvent.drainAmount} ETH lost`);
        this.logger.error(`   From: ${drainEvent.fromContext}`);
        this.logger.error(`   To: ${drainEvent.toContext}`);
        this.logger.error(`   Time: ${drainEvent.timeDiff}s`);
      }
    }

    return drains;
  }

  /**
   * Run diagnostic tests to find common drain issues
   */
  async runDiagnostics(): Promise<string[]> {
    const issues: string[] = [];
    
    this.logger.info("🔧 Running margin drain diagnostics...");

    // Test 1: Check for ghost orders (reserved margin not in vault)
    try {
      const reserved = await this.calculateReservedMargin();
      const vaultBalance = await this.getMarginVaultBalance();
      
      if (reserved > vaultBalance) {
        issues.push(`GHOST ORDERS: Reserved ${formatEther(reserved)} ETH but vault has ${formatEther(vaultBalance)} ETH`);
      }
    } catch (error) {
      issues.push(`Failed to check ghost orders: ${error}`);
    }

    // Test 2: Check for stuck liquidation positions
    try {
      const positions = await this.getAllPositions();
      const stuckPositions = positions.filter(p => 
        p.status === 'liquidated' && 
        p.marginLocked > 0n &&
        !p.hasExitOrder
      );
      
      for (const pos of stuckPositions) {
        issues.push(`STUCK LIQUIDATION: Position ${pos.id} liquidated but ${formatEther(pos.marginLocked)} ETH still locked with no exit order`);
      }
    } catch (error) {
      issues.push(`Failed to check stuck positions: ${error}`);
    }

    // Test 3: Check for fee accumulation issues
    try {
      const feeCollector = await this.getFeeCollector();
      const feeBalance = await this.publicClient.getBalance({ address: feeCollector });
      
      if (feeBalance > parseEther("0.1")) {
        issues.push(`HIGH FEES: Fee collector has ${formatEther(feeBalance)} ETH - check if fees are being deducted correctly`);
      }
    } catch (error) {
      issues.push(`Failed to check fees: ${error}`);
    }

    // Test 4: Monitor rapid changes
    const rapidChanges = await this.checkRapidChanges();
    issues.push(...rapidChanges);

    return issues;
  }

  /**
   * Check for rapid margin changes
   */
  private async checkRapidChanges(): Promise<string[]> {
    const issues: string[] = [];
    const balances: bigint[] = [];
    
    for (let i = 0; i < 5; i++) {
      balances.push(await this.getMarginVaultBalance());
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const first = balances[0];
    const last = balances[balances.length - 1];
    const totalChange = last - first;
    
    if (totalChange < -parseEther("0.01")) {
      issues.push(`RAPID DRAIN: Lost ${formatEther(-totalChange)} ETH in 5 seconds`);
    }
    
    // Check for oscillations
    let decreases = 0;
    for (let i = 1; i < balances.length; i++) {
      if (balances[i] < balances[i-1]) decreases++;
    }
    
    if (decreases >= 4) {
      issues.push(`CONSISTENT DRAIN: Balance decreased in ${decreases}/4 checks`);
    }
    
    return issues;
  }

  /**
   * Trace where margin is going
   */
  async traceMarginFlow(txHash?: `0x${string}`): Promise<void> {
    this.logger.info("🔍 Tracing margin flow...");
    
    const traces: any[] = [];
    
    if (txHash) {
      // Trace specific transaction
      const tx = await this.publicClient.getTransaction({ hash: txHash });
      const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
      
      traces.push({
        hash: txHash,
        from: tx.from,
        to: tx.to,
        value: formatEther(tx.value),
        gasUsed: receipt.gasUsed.toString()
      });
      
      // Check if margin vault was involved
      if (tx.to?.toLowerCase() === this.marginVaultAddress.toLowerCase()) {
        this.logger.info(`💰 Margin vault transaction detected`);
        this.logger.info(`   Value: ${formatEther(tx.value)} ETH`);
        this.logger.info(`   Gas: ${receipt.gasUsed}`);
      }
    } else {
      // Trace recent transactions involving margin vault
      const logs = await this.publicClient.getLogs({
        address: this.marginVaultAddress,
        fromBlock: 'latest',
        toBlock: 'latest'
      });
      
      for (const log of logs) {
        traces.push({
          block: log.blockNumber,
          txHash: log.transactionHash,
          data: log.data
        });
      }
    }
    
    this.logger.table(traces);
  }

  /**
   * Wrap any function to monitor margin changes
   */
  monitorOperation<T extends (...args: any[]) => Promise<any>>(
    operationName: string,
    fn: T
  ): T {
    return (async (...args: Parameters<T>) => {
      const before = await this.getMarginVaultBalance();
      this.logger.info(`▶️ Starting operation: ${operationName}`);
      this.logger.debug(`   Before: ${formatEther(before)} ETH`);
      
      try {
        const result = await fn(...args);
        
        const after = await this.getMarginVaultBalance();
        const diff = after - before;
        
        if (diff < 0n) {
          this.logger.warn(`   ⚠️  Operation drained ${formatEther(-diff)} ETH`);
        } else {
          this.logger.info(`   ✅ Operation changed margin by ${formatEther(diff)} ETH`);
        }
        
        await this.takeSnapshot(`After ${operationName}`);
        
        return result;
      } catch (error) {
        const after = await this.getMarginVaultBalance();
        const diff = after - before;
        
        this.logger.error(`❌ Operation failed, margin changed by ${formatEther(diff)} ETH`);
        throw error;
      }
    }) as T;
  }

  /**
   * Create a comprehensive report
   */
  async generateReport(): Promise<string> {
    const report: string[] = [];
    
    report.push("=".repeat(60));
    report.push("MARGIN DRAIN DIAGNOSTIC REPORT");
    report.push("=".repeat(60));
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push("");
    
    // Current state
    const currentBalance = await this.getMarginVaultBalance();
    report.push(`📊 Current Margin Vault Balance: ${formatEther(currentBalance)} ETH`);
    
    // Drain summary
    if (this.drainEvents.length > 0) {
      report.push("");
      report.push("🚨 DRAIN EVENTS DETECTED:");
      this.drainEvents.forEach((drain, i) => {
        report.push(`  ${i + 1}. Lost ${drain.drainAmount} ETH in ${drain.timeDiff}s`);
        report.push(`     From: ${drain.fromContext}`);
        report.push(`     To: ${drain.toContext}`);
      });
    }
    
    // Issues found
    const issues = await this.runDiagnostics();
    if (issues.length > 0) {
      report.push("");
      report.push("⚠️  ISSUES FOUND:");
      issues.forEach(issue => report.push(`  • ${issue}`));
    } else {
      report.push("");
      report.push("✅ No issues detected");
    }
    
    // Recommendations
    report.push("");
    report.push("💡 RECOMMENDATIONS:");
    if (issues.length > 0) {
      report.push("  1. Check liquidation logic - ensure orders are created");
      report.push("  2. Verify fee calculations and destinations");
      report.push("  3. Look for ghost orders not properly cleared");
      report.push("  4. Monitor cross-margin interactions");
    } else {
      report.push("  No specific recommendations - consider running stress tests");
    }
    
    report.push("=".repeat(60));
    
    return report.join("\n");
  }

  // Mock implementations - replace with actual contract calls
  private async getMarginVaultBalance(): Promise<bigint> {
    // TODO: Replace with actual contract call
    return await this.publicClient.getBalance({ address: this.marginVaultAddress });
  }

  private async getAllPositions(): Promise<any[]> {
    // TODO: Replace with actual contract call to get positions
    return [];
  }

  private async getPendingOrders(): Promise<any[]> {
    // TODO: Replace with actual contract call to get orders
    return [];
  }

  private async calculateReservedMargin(): Promise<bigint> {
    // TODO: Replace with actual calculation
    const orders = await this.getPendingOrders();
    return orders.reduce((total, order) => total + (order.marginRequired || 0n), 0n);
  }

  private async getFeeCollector(): Promise<`0x${string}`> {
    // TODO: Replace with actual fee collector address
    return "0x0000000000000000000000000000000000000000";
  }
}

// Usage example
async function main() {
  // Setup clients
  const publicClient = createPublicClient({
    transport: http('YOUR_RPC_URL')
  });
  
  const walletClient = createWalletClient({
    transport: http('YOUR_RPC_URL')
  });

  // Initialize debugger
  const drainDebugger = new MarginDrainDebugger(
    publicClient,
    walletClient,
    '0xYourMarginVaultAddress' // Replace with actual vault address
  );

  // Start monitoring
  drainDebugger.startMonitoring(5, "main loop");

  // Run diagnostics
  const issues = await drainDebugger.runDiagnostics();
  console.log("Issues found:", issues);

  // Wrap suspect operations
  const safeLiquidate = drainDebugger.monitorOperation('liquidatePosition', async (positionId: string) => {
    // Your liquidation logic here
    console.log(`Liquidating ${positionId}`);
  });

  // Generate report after some time
  setTimeout(async () => {
    drainDebugger.stopMonitoring();
    const report = await drainDebugger.generateReport();
    console.log(report);
  }, 60000); // Run for 1 minute
}

// Export for use in other files
export { MarginDrainDebugger, type MarginSnapshot, type DrainEvent };