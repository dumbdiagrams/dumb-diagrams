import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Advisory only. Missing a floor prints a warning and still exits 0.
const TARGETS = {
  statements: 70,
  branches: 70,
  functions: 75,
  lines: 70,
};

const summaryPath = resolve(".artifacts/coverage/coverage-summary.json");
const totals = JSON.parse(readFileSync(summaryPath, "utf8")).total;
const misses = Object.entries(TARGETS).filter(([metric, floor]) => (totals[metric]?.pct ?? 0) < floor);

if (!misses.length) {
  console.log("Coverage meets advisory targets.");
  process.exit(0);
}

console.warn("Coverage is below advisory targets (not a release blocker):");
for (const [metric, floor] of misses) {
  const pct = Number(totals[metric]?.pct ?? 0).toFixed(2);
  console.warn(`- ${metric}: ${pct}% (target ${floor}%)`);
}
