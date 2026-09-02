import { describe, expect, it } from "vitest";

import {
  COVERAGE_TARGETS,
  coverageFailures,
} from "../../scripts/warn-coverage.mjs";

describe("coverage release policy", () => {
  it("accepts metrics exactly at every required floor", () => {
    const totals = Object.fromEntries(
      Object.entries(COVERAGE_TARGETS).map(([metric, pct]) => [metric, { pct }]),
    );

    expect(coverageFailures(totals)).toEqual([]);
  });

  it("reports every metric below its floor", () => {
    const totals = Object.fromEntries(
      Object.entries(COVERAGE_TARGETS).map(([metric, floor]) => [
        metric,
        { pct: floor - 0.01 },
      ]),
    );

    expect(coverageFailures(totals)).toEqual(
      Object.entries(COVERAGE_TARGETS).map(([metric, floor]) => ({
        metric,
        floor,
        pct: floor - 0.01,
      })),
    );
  });

  it("treats a missing metric as a failed floor", () => {
    expect(coverageFailures({ statements: { pct: COVERAGE_TARGETS.statements } })).toContainEqual({
      metric: "branches",
      floor: COVERAGE_TARGETS.branches,
      pct: 0,
    });
  });
});
