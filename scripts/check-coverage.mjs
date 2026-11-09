import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COVERAGE_TARGETS = Object.freeze({
  // Applied to the instrumented source set in vitest.config.ts. Browser
  // orchestration exclusions are explicit there; Playwright coverage is not
  // included in these percentages.
  statements: 60,
  branches: 50,
  functions: 55,
  lines: 60,
});

// These are minimum guardrails with room for coverage to move as code is added.
// Package floors stop a well-covered package from masking a poorly covered one
// globally, without treating small coverage changes as release blockers.
export const PACKAGE_COVERAGE_TARGETS = Object.freeze({
  cli: Object.freeze({ statements: 60, branches: 45, functions: 80, lines: 65 }),
  runtime: Object.freeze({ statements: 80, branches: 70, functions: 85, lines: 82 }),
  // Most editor React components are exercised by Playwright rather than the
  // Node Vitest runner. Keep a deliberately conservative floor while still
  // counting panels and deterministic state seams.
  editor: Object.freeze({ statements: 35, branches: 25, functions: 30, lines: 38 }),
});

export function coverageFailures(totals = {}, targets = COVERAGE_TARGETS, scope = "global") {
  return Object.entries(targets)
    .filter(([metric, floor]) => (totals[metric]?.pct ?? 0) < floor)
    .map(([metric, floor]) => ({
      ...(scope === "global" ? {} : { scope }),
      metric,
      floor,
      pct: Number(totals[metric]?.pct ?? 0),
    }));
}

function packageNameForPath(path) {
  const match = path.match(/(?:^|[/\\])packages[/\\]([^/\\]+)[/\\]src[/\\]/);
  return match?.[1] ?? null;
}

export function summarizePackageCoverage(summary) {
  const totals = Object.fromEntries(
    Object.keys(PACKAGE_COVERAGE_TARGETS).map((name) => [
      name,
      {
        lines: { total: 0, covered: 0 },
        statements: { total: 0, covered: 0 },
        functions: { total: 0, covered: 0 },
        branches: { total: 0, covered: 0 },
      },
    ]),
  );

  for (const [path, file] of Object.entries(summary ?? {})) {
    const packageName = packageNameForPath(path);
    if (!packageName || !totals[packageName]) continue;
    for (const metric of Object.keys(COVERAGE_TARGETS)) {
      const count = file?.[metric];
      if (!count || typeof count.total !== "number" || typeof count.covered !== "number") continue;
      totals[packageName][metric].total += count.total;
      totals[packageName][metric].covered += count.covered;
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([name, metrics]) => [
      name,
      Object.fromEntries(
        Object.entries(metrics).map(([metric, count]) => [
          metric,
          {
            ...count,
            pct: count.total > 0 ? (count.covered / count.total) * 100 : 0,
          },
        ]),
      ),
    ]),
  );
}

export function coveragePolicyFailures(summary) {
  const failures = coverageFailures(summary?.total, COVERAGE_TARGETS).map((failure) => ({
    ...failure,
    scope: "global",
  }));
  const packageTotals = summarizePackageCoverage(summary);
  for (const [name, targets] of Object.entries(PACKAGE_COVERAGE_TARGETS)) {
    const packageFailures = coverageFailures(packageTotals[name], targets, `package:${name}`);
    if (packageFailures.length) failures.push(...packageFailures);
  }
  return failures;
}

function main() {
  const summaryPath = resolve(".artifacts/coverage/coverage-summary.json");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const misses = coveragePolicyFailures(summary);

  if (!misses.length) {
    console.log("Coverage meets required release targets.");
    return;
  }

  console.error("Coverage is below required release targets:");
  for (const { scope, metric, floor, pct } of misses) {
    const label = `${scope ?? "global"} ${metric}`;
    console.error(`- ${label}: ${pct.toFixed(2)}% (target ${floor}%)`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
