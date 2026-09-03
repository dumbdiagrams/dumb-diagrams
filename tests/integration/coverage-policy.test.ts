import { describe, expect, it } from "vitest";

import {
  COVERAGE_TARGETS,
  PACKAGE_COVERAGE_TARGETS,
  coverageFailures,
  coveragePolicyFailures,
  summarizePackageCoverage,
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

  it("names the global scope in policy failures", () => {
    const failures = coveragePolicyFailures({ total: { statements: { pct: 0 } } });
    expect(failures[0]).toMatchObject({ scope: "global", metric: "statements" });
  });

  it("aggregates source files into independently enforced package totals", () => {
    const summary = {
      total: Object.fromEntries(Object.keys(COVERAGE_TARGETS).map((metric) => [metric, { pct: 100 }])),
      "/repo/packages/cli/src/index.ts": {
        statements: { total: 10, covered: 8 },
        branches: { total: 4, covered: 2 },
        functions: { total: 2, covered: 2 },
        lines: { total: 10, covered: 8 },
      },
      "/repo/packages/runtime/src/index.ts": {
        statements: { total: 10, covered: 10 },
        branches: { total: 4, covered: 4 },
        functions: { total: 2, covered: 2 },
        lines: { total: 10, covered: 10 },
      },
      "/repo/packages/editor/src/index.ts": {
        statements: { total: 10, covered: 10 },
        branches: { total: 4, covered: 4 },
        functions: { total: 2, covered: 2 },
        lines: { total: 10, covered: 10 },
      },
    };

    expect(summarizePackageCoverage(summary).cli.statements.pct).toBe(80);
    expect(coveragePolicyFailures(summary)).toContainEqual({
      scope: "package:cli",
      metric: "branches",
      floor: PACKAGE_COVERAGE_TARGETS.cli.branches,
      pct: 50,
    });
  });

  it("fails when a package has no measured source data", () => {
    const totals = Object.fromEntries(Object.keys(COVERAGE_TARGETS).map((metric) => [metric, { pct: 100 }]));
    const failures = coveragePolicyFailures({ total: totals });
    expect(failures.filter(({ scope }) => scope === "package:runtime")).toHaveLength(4);
  });
});
