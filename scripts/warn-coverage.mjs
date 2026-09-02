import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COVERAGE_TARGETS = Object.freeze({
  statements: 70,
  branches: 70,
  functions: 75,
  lines: 70,
});

export function coverageFailures(totals) {
  return Object.entries(COVERAGE_TARGETS)
    .filter(([metric, floor]) => (totals[metric]?.pct ?? 0) < floor)
    .map(([metric, floor]) => ({
      metric,
      floor,
      pct: Number(totals[metric]?.pct ?? 0),
    }));
}

function main() {
  const summaryPath = resolve(".artifacts/coverage/coverage-summary.json");
  const totals = JSON.parse(readFileSync(summaryPath, "utf8")).total;
  const misses = coverageFailures(totals);

  if (!misses.length) {
    console.log("Coverage meets required release targets.");
    return;
  }

  console.error("Coverage is below required release targets:");
  for (const { metric, floor, pct } of misses) {
    console.error(`- ${metric}: ${pct.toFixed(2)}% (target ${floor}%)`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
