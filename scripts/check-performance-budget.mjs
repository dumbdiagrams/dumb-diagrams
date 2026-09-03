import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { performance } from "node:perf_hooks";

import { createEmptyDocument } from "../packages/runtime/dist/core/index.js";
import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";
import { layoutDocument } from "../packages/runtime/dist/layout/index.js";
import { routeEdges } from "../packages/runtime/dist/route/index.js";
import { performanceDiagrams, repoRoot } from "./lib/example-manifest.mjs";

const root = repoRoot();
const ITERATIONS = 7;
const WARMUP_ITERATIONS = 2;
const WALL_CLOCK_REGRESSION_FACTOR = 2;
const baselines = JSON.parse(readFileSync(new URL("./performance-baseline.json", import.meta.url), "utf8"));
const failures = [];

for (const path of performanceDiagrams()) {
  const doc = parseDgm(readFileSync(path, "utf8"));
  let routingDiagnostics;
  const layout = layoutDocument(doc);
  const routes = routeEdges(doc, layout, { onBudgetExhausted: (diagnostics) => { routingDiagnostics = diagnostics; } });
  if (routes.length !== doc.edges.length) {
    failures.push(`${relative(root, path)}: route count mismatch`);
  }
  for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) compileDiagram(doc);
  const samples = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const start = performance.now();
    const result = compileDiagram(doc);
    samples.push(performance.now() - start);
    if (!result.ok) throw new Error(`${path} failed to compile during the performance check.`);
  }
  samples.sort((left, right) => left - right);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)];
  const key = relative(root, path);
  const baseline = baselines.fixtures?.[key];
  if (!baseline) {
    failures.push(`${key}: missing checked-in performance baseline`);
  }
  if (routingDiagnostics?.exhausted) {
    failures.push(`${key}: default routing work budget exhausted`);
  }
  const advisoryLimit = baseline?.medianMs * WALL_CLOCK_REGRESSION_FACTOR;
  const outcome = advisoryLimit === undefined || median <= advisoryLimit ? "ok" : "advisory";
  console.log(`${outcome.padEnd(9)} ${key.padEnd(70)} ${median.toFixed(1)} ms median / ${p95.toFixed(1)} ms p95`);
}

const stressResults = [runFanoutStress(), runFanoutStress()];
if (!stressResults.every((result) =>
  result.routeCount === result.edgeCount &&
  result.exhausted &&
  result.diagnostics?.limits.maxScorePathCalls < 60_000
)) {
  failures.push("synthetic fan-out: default routing budget did not retain every route and report bounded exhaustion");
} else if (JSON.stringify(stressResults[0].diagnostics) !== JSON.stringify(stressResults[1].diagnostics)) {
  failures.push("synthetic fan-out: routing diagnostics are nondeterministic");
}
console.log(`stress     fan-out 500 resources / 499 edges: ${stressResults[0].elapsedMs.toFixed(1)} ms, bounded fallback verified`);

if (failures.length) {
  console.error("Routing performance contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}

function runFanoutStress() {
  const doc = createEmptyDocument("routing-budget-stress");
  doc.flow = "lr";
  doc.resources = Array.from({ length: 500 }, (_, index) => ({
    id: `resource${index}`,
    type: "generic.user",
    label: { service: `Resource ${index}` },
    role: "primary",
    props: {},
  }));
  doc.edges = Array.from({ length: 499 }, (_, index) => ({
    id: `edge${index}`,
    source: "resource0",
    target: `resource${index + 1}`,
    style: "solid",
    kind: "flow",
  }));
  let diagnostics;
  const start = performance.now();
  const routes = routeEdges(doc, layoutDocument(doc), {
    onBudgetExhausted: (result) => { diagnostics = result; },
  });
  return {
    routeCount: routes.length,
    edgeCount: doc.edges.length,
    exhausted: diagnostics?.exhausted === true,
    diagnostics,
    elapsedMs: performance.now() - start,
  };
}
