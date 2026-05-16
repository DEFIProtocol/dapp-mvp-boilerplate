import { expect } from "chai";
import { evaluateAdlInvariantFailures } from "../../scripts/simulator/analytics/adlInvariants.js";

describe("Stress - ADL invariant evaluator", function () {
  it("passes when coverage/composition/step containment are valid", function () {
    const failures = evaluateAdlInvariantFailures({
      step: 100,
      cumulativeRequested: 1_000n,
      cumulativeCovered: 600n,
      cumulativeRemaining: 400n,
      cumulativeProactive: 5,
      cumulativeProactiveSoft: 2,
      cumulativeProactiveHard: 3,
    });

    expect(failures).to.deep.equal([]);
  });

  it("flags coverage mismatch when requested does not equal covered plus remaining", function () {
    const failures = evaluateAdlInvariantFailures({
      step: 101,
      cumulativeRequested: 1_000n,
      cumulativeCovered: 550n,
      cumulativeRemaining: 400n,
      cumulativeProactive: 3,
      cumulativeProactiveSoft: 1,
      cumulativeProactiveHard: 2,
    });

    expect(failures.some((entry) => entry.startsWith("coverage-mismatch"))).to.equal(true);
  });

  it("flags proactive composition mismatch", function () {
    const failures = evaluateAdlInvariantFailures({
      step: 102,
      cumulativeRequested: 1_000n,
      cumulativeCovered: 500n,
      cumulativeRemaining: 500n,
      cumulativeProactive: 6,
      cumulativeProactiveSoft: 2,
      cumulativeProactiveHard: 3,
    });

    expect(failures.some((entry) => entry.startsWith("proactive-mismatch"))).to.equal(true);
  });

  it("allows proactive events without requiring same-step ADL executions", function () {
    const failures = evaluateAdlInvariantFailures({
      step: 103,
      cumulativeRequested: 1_000n,
      cumulativeCovered: 800n,
      cumulativeRemaining: 200n,
      cumulativeProactive: 4,
      cumulativeProactiveSoft: 2,
      cumulativeProactiveHard: 2,
    });

    expect(failures).to.deep.equal([]);
  });
});
