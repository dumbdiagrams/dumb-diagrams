import { describe, expect, it } from "vitest";

import {
  PERFORMANCE_BASELINE_SCHEMA_VERSION,
  PERFORMANCE_POLICY,
  performanceBaselineFailures,
  performanceCeilings,
  performanceFailures,
  stressPerformanceFailures,
} from "../../scripts/check-performance-budget.mjs";

const baseline = { medianMs: 10, maxMedianMs: 100, maxP95Ms: 200 };

describe("performance budget policy", () => {
  it("accepts measurements inside checked-in absolute ceilings", () => {
    expect(performanceFailures({ key: "fixture", medianMs: 100, p95Ms: 200 }, baseline)).toEqual([]);
    expect(performanceCeilings(baseline)).toEqual({ medianMs: 100, p95Ms: 200 });
  });

  it("reports each exceeded measurement and missing baseline", () => {
    expect(performanceFailures({ key: "fixture", medianMs: 101, p95Ms: 201 }, baseline)).toEqual([
      { key: "fixture", metric: "medianMs", actual: 101, limit: 100, reason: "exceeded" },
      { key: "fixture", metric: "p95Ms", actual: 201, limit: 200, reason: "exceeded" },
    ]);
    expect(performanceFailures({ key: "missing", medianMs: 1, p95Ms: 1 }, undefined)).toEqual([
      { key: "missing", metric: "baseline", reason: "missing" },
    ]);
  });

  it("rejects missing or malformed checked-in fixture data", () => {
    expect(performanceBaselineFailures({ schemaVersion: PERFORMANCE_BASELINE_SCHEMA_VERSION, fixtures: {} }, ["fixture"])).toEqual([
      { key: "fixture", metric: "baseline", reason: "missing" },
    ]);
    expect(performanceBaselineFailures({ schemaVersion: 99, fixtures: { fixture: baseline } }, ["fixture"])).toContainEqual({
      metric: "baseline-schema",
      reason: "unsupported schema version",
    });
    expect(performanceCeilings({ medianMs: 10, maxMedianMs: 200, maxP95Ms: 100 })).toBeNull();
    expect(performanceCeilings({ medianMs: 10, maxMedianMs: "200" })).toBeNull();
  });

  it("keeps the synthetic stress check bounded without a machine-tight limit", () => {
    expect(stressPerformanceFailures({ elapsedMs: PERFORMANCE_POLICY.stressMaxElapsedMs })).toEqual([]);
    expect(stressPerformanceFailures({ elapsedMs: PERFORMANCE_POLICY.stressMaxElapsedMs + 1 })).toEqual([
      {
        metric: "stress.elapsedMs",
        actual: PERFORMANCE_POLICY.stressMaxElapsedMs + 1,
        limit: PERFORMANCE_POLICY.stressMaxElapsedMs,
      },
    ]);
  });
});
