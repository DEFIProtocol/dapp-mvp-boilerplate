import type { MarginFlowSnapshot, SnapshotDelta } from "./margin-flow-monitor";

export type DrainChannel =
  | "none"
  | "protocol-fee"
  | "insurance-flow"
  | "liquidation-related"
  | "pnl-realization"
  | "unexplained";

export type DrainFinding = {
  trader: string;
  fromLabel: string;
  toLabel: string;
  collateralDelta: bigint;
  reservedMarginDelta: bigint;
  realizedPnlDelta: bigint;
  channel: DrainChannel;
  confidence: "low" | "medium" | "high";
  notes: string;
};

export type DrainAnalysisResult = {
  findings: DrainFinding[];
  systemSignals: {
    protocolFeeIncrease: bigint;
    insuranceIncrease: bigint;
    badDebtIncrease: bigint;
    feePoolIncrease: bigint;
  };
};

export function analyzeDrainDelta(
  before: MarginFlowSnapshot,
  after: MarginFlowSnapshot,
  threshold: bigint
): DrainAnalysisResult {
  const delta = {
    protocolFeeIncrease: positive(after.system.protocolTreasuryBalance - before.system.protocolTreasuryBalance),
    insuranceIncrease:
      positive(after.system.insuranceTreasuryBalance - before.system.insuranceTreasuryBalance) +
      positive(after.system.insuranceFundBalance - before.system.insuranceFundBalance),
    badDebtIncrease: positive(after.system.totalBadDebt - before.system.totalBadDebt),
    feePoolIncrease: positive(after.system.feePool - before.system.feePool),
  };

  const findings: DrainFinding[] = [];

  for (const beforeTrader of before.traders) {
    const afterTrader = after.traders.find((candidate) => candidate.trader === beforeTrader.trader);
    if (!afterTrader) continue;

    const collateralDelta = afterTrader.accountCollateral - beforeTrader.accountCollateral;
    const reservedMarginDelta = afterTrader.reservedMargin - beforeTrader.reservedMargin;
    const realizedPnlDelta = afterTrader.realizedPnl - beforeTrader.realizedPnl;

    if (collateralDelta >= 0n || abs(collateralDelta) < threshold) continue;

    const classification = classifyDrain(collateralDelta, reservedMarginDelta, realizedPnlDelta, delta);
    findings.push({
      trader: beforeTrader.trader,
      fromLabel: before.label,
      toLabel: after.label,
      collateralDelta,
      reservedMarginDelta,
      realizedPnlDelta,
      ...classification,
    });
  }

  return {
    findings,
    systemSignals: delta,
  };
}

function classifyDrain(
  collateralDelta: bigint,
  reservedMarginDelta: bigint,
  realizedPnlDelta: bigint,
  systemSignals: {
    protocolFeeIncrease: bigint;
    insuranceIncrease: bigint;
    badDebtIncrease: bigint;
    feePoolIncrease: bigint;
  }
): Pick<DrainFinding, "channel" | "confidence" | "notes"> {
  const drainAbs = abs(collateralDelta);

  if (systemSignals.protocolFeeIncrease > 0n || systemSignals.feePoolIncrease > 0n) {
    const matched = drainAbs <= systemSignals.protocolFeeIncrease + systemSignals.feePoolIncrease + 10n ** 15n;
    return {
      channel: "protocol-fee",
      confidence: matched ? "high" : "medium",
      notes: "Collateral reduction coincides with fee pool/protocol treasury increase",
    };
  }

  if (systemSignals.insuranceIncrease > 0n) {
    return {
      channel: "insurance-flow",
      confidence: "medium",
      notes: "Collateral reduction overlaps with insurance balance growth",
    };
  }

  if (systemSignals.badDebtIncrease > 0n || (reservedMarginDelta < 0n && realizedPnlDelta < 0n)) {
    return {
      channel: "liquidation-related",
      confidence: "medium",
      notes: "Loss appears during liquidation-like transition (reserved margin release and/or bad debt increase)",
    };
  }

  if (realizedPnlDelta < 0n) {
    return {
      channel: "pnl-realization",
      confidence: "medium",
      notes: "Collateral drop corresponds to negative realized PnL",
    };
  }

  return {
    channel: "unexplained",
    confidence: "low",
    notes: "No matching system-level flow found for this collateral reduction",
  };
}

function positive(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

function abs(value: bigint): bigint {
  return value >= 0n ? value : -value;
}

export function summarizeFindings(deltas: SnapshotDelta[], analyses: DrainAnalysisResult[]): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];

  for (let index = 0; index < analyses.length; index += 1) {
    const analysis = analyses[index];
    const delta = deltas[index];
    for (const finding of analysis.findings) {
      rows.push({
        transition: `${finding.fromLabel} -> ${finding.toLabel}`,
        trader: finding.trader,
        channel: finding.channel,
        confidence: finding.confidence,
        collateralDelta: finding.collateralDelta.toString(),
        reservedDelta: finding.reservedMarginDelta.toString(),
        realizedPnlDelta: finding.realizedPnlDelta.toString(),
        markPriceDelta: delta.markPriceDelta.toString(),
      });
    }
  }

  return rows;
}
