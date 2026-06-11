export interface AdlInvariantInput {
  step: number;
  cumulativeRequested: bigint;
  cumulativeCovered: bigint;
  cumulativeRemaining: bigint;
  cumulativeProactive: number;
  cumulativeProactiveSoft: number;
  cumulativeProactiveHard: number;
}

export function evaluateAdlInvariantFailures(input: AdlInvariantInput): string[] {
  const failures: string[] = [];
  const {
    cumulativeRequested,
    cumulativeCovered,
    cumulativeRemaining,
    cumulativeProactive,
    cumulativeProactiveSoft,
    cumulativeProactiveHard,
  } = input;

  const accounted = cumulativeCovered + cumulativeRemaining;
  if (cumulativeRequested !== accounted) {
    failures.push(
      `coverage-mismatch requested=${cumulativeRequested} covered=${cumulativeCovered} remaining=${cumulativeRemaining}`,
    );
  }

  if (cumulativeProactiveSoft + cumulativeProactiveHard !== cumulativeProactive) {
    failures.push(
      `proactive-mismatch total=${cumulativeProactive} soft=${cumulativeProactiveSoft} hard=${cumulativeProactiveHard}`,
    );
  }

  return failures;
}
