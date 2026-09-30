import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { repoRoot, performanceDiagrams } from "./lib/example-manifest.mjs";

export const PERFORMANCE_BASELINE_SCHEMA_VERSION = 1;

// Wall-clock measurements are inherently noisy. The checked-in fixture
// ceilings are deliberately generous absolute limits, while the baseline
// median remains useful for spotting a large-but-still-under-limit regression.
export const PERFORMANCE_POLICY = Object.freeze({
  minimumMedianCeilingMs: 250,
  minimumP95CeilingMs: 500,
  fallbackMedianFactor: 8,
  fallbackP95Factor: 10,
  stressMaxElapsedMs: 30_000,
});

export function performanceCeilings(baseline = {}) {
  if (!Number.isFinite(baseline.medianMs) || baseline.medianMs < 0) return null;
  if ((baseline.maxMedianMs !== undefined && !Number.isFinite(baseline.maxMedianMs)) ||
      (baseline.maxP95Ms !== undefined && !Number.isFinite(baseline.maxP95Ms))) return null;
  const medianMs = Number.isFinite(baseline.maxMedianMs)
    ? baseline.maxMedianMs
    : Math.max(PERFORMANCE_POLICY.minimumMedianCeilingMs, baseline.medianMs * PERFORMANCE_POLICY.fallbackMedianFactor);
  const p95Ms = Number.isFinite(baseline.maxP95Ms)
    ? baseline.maxP95Ms
    : Math.max(PERFORMANCE_POLICY.minimumP95CeilingMs, baseline.medianMs * PERFORMANCE_POLICY.fallbackP95Factor);
  if (medianMs < 0 || p95Ms < 0 || p95Ms < medianMs) return null;
  return { medianMs, p95Ms };
}

export function performanceBaselineFailures(baselines, keys = []) {
  const failures = [];
  if (!baselines || baselines.schemaVersion !== PERFORMANCE_BASELINE_SCHEMA_VERSION) {
    failures.push({ metric: "baseline-schema", reason: "unsupported schema version" });
  }
  if (!baselines?.fixtures || typeof baselines.fixtures !== "object") {
    failures.push({ metric: "baseline-schema", reason: "fixtures must be an object" });
    return failures;
  }
  for (const key of keys) {
    const baseline = baselines.fixtures[key];
    if (!baseline) {
      failures.push({ key, metric: "baseline", reason: "missing" });
      continue;
    }
    if (!performanceCeilings(baseline)) failures.push({ key, metric: "baseline", reason: "invalid ceilings" });
  }
  return failures;
}

export function performanceFailures(measurement, baseline) {
  const key = measurement?.key ?? "fixture";
  if (!baseline) return [{ key, metric: "baseline", reason: "missing" }];
  const ceilings = performanceCeilings(baseline);
  if (!ceilings) return [{ key, metric: "baseline", reason: "invalid ceilings" }];
  const failures = [];
  for (const [metric, limit] of [["medianMs", ceilings.medianMs], ["p95Ms", ceilings.p95Ms]]) {
    const actual = measurement?.[metric];
    if (!Number.isFinite(actual)) failures.push({ key, metric, actual: 0, limit, reason: "missing measurement" });
    else if (actual > limit) failures.push({ key, metric, actual, limit, reason: "exceeded" });
  }
  return failures;
}

export function stressPerformanceFailures(result) {
  if (!Number.isFinite(result?.elapsedMs) || result.elapsedMs > PERFORMANCE_POLICY.stressMaxElapsedMs) {
    return [{ metric: "stress.elapsedMs", actual: result?.elapsedMs ?? 0, limit: PERFORMANCE_POLICY.stressMaxElapsedMs }];
  }
  return [];
}

async function main() {
  // Keep policy imports side-effect free so tests can exercise the budget
  // without requiring a prior runtime build. The compiled runtime is needed
  // only when running the actual fixture benchmark.
  const [{ createEmptyDocument }, { parseDgm }, { compileDiagram }, { layoutDocument }, { routeEdges }] = await Promise.all([
    import("../packages/runtime/dist/core/index.js"),
    import("../packages/runtime/dist/dsl/index.js"),
    import("../packages/runtime/dist/render/index.js"),
    import("../packages/runtime/dist/layout/index.js"),
    import("../packages/runtime/dist/route/index.js"),
  ]);
  const root = repoRoot();
  const paths = performanceDiagrams();
  const baselines = JSON.parse(readFileSync(new URL("./performance-baseline.json", import.meta.url), "utf8"));
  const keys = paths.map((path) => relative(root, path));
  const failures = performanceBaselineFailures(baselines, keys).map(formatFailure);

  for (const path of paths) {
    const doc = parseDgm(readFileSync(path, "utf8"));
    let routingDiagnostics;
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout, { onBudgetExhausted: (diagnostics) => { routingDiagnostics = diagnostics; } });
    const key = relative(root, path);
    if (routes.length !== doc.edges.length) failures.push(`${key}: route count mismatch`);
    for (let iteration = 0; iteration < 2; iteration += 1) compileDiagram(doc);
    const samples = [];
    for (let iteration = 0; iteration < 7; iteration += 1) {
      const start = performance.now();
      const result = compileDiagram(doc);
      samples.push(performance.now() - start);
      if (!result.ok) throw new Error(`${path} failed to compile during the performance check.`);
    }
    samples.sort((left, right) => left - right);
    const measurement = {
      key,
      medianMs: samples[Math.floor(samples.length / 2)],
      p95Ms: samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)],
    };
    for (const failure of performanceFailures(measurement, baselines.fixtures?.[key])) failures.push(formatFailure(failure));
    if (routingDiagnostics?.exhausted) failures.push(`${key}: default routing work budget exhausted`);
    const ceiling = performanceCeilings(baselines.fixtures?.[key]);
    const outcome = performanceFailures(measurement, baselines.fixtures?.[key]).length ? "FAIL" : "ok";
    console.log(`${outcome.padEnd(9)} ${key.padEnd(70)} ${measurement.medianMs.toFixed(1)} ms median / ${measurement.p95Ms.toFixed(1)} ms p95` +
      (ceiling ? ` (limits ${ceiling.medianMs}/${ceiling.p95Ms} ms)` : ""));
  }

  const stressResults = [runFanoutStress(createEmptyDocument, layoutDocument, routeEdges), runFanoutStress(createEmptyDocument, layoutDocument, routeEdges)];
  if (!stressResults.every((result) => result.routeCount === result.edgeCount && result.exhausted && result.diagnostics?.limits.maxScorePathCalls < 60_000)) {
    failures.push("synthetic fan-out: default routing budget did not retain every route and report bounded exhaustion");
  } else if (JSON.stringify(stressResults[0].diagnostics) !== JSON.stringify(stressResults[1].diagnostics)) {
    failures.push("synthetic fan-out: routing diagnostics are nondeterministic");
  }
  for (const failure of stressPerformanceFailures(stressResults[0])) failures.push(formatFailure({ ...failure, key: "synthetic fan-out" }));
  console.log(`stress     fan-out 500 resources / 499 edges: ${stressResults[0].elapsedMs.toFixed(1)} ms, bounded fallback verified`);

  if (failures.length) {
    console.error("Routing performance contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

function formatFailure(failure) {
  if (failure.reason === "missing") return `${failure.key}: missing checked-in performance baseline`;
  if (failure.reason === "invalid ceilings") return `${failure.key}: invalid checked-in performance baseline ceilings`;
  if (failure.metric === "baseline-schema") return `performance baseline: ${failure.reason}`;
  if (failure.metric === "stress.elapsedMs") return `${failure.key ?? "stress"}: ${failure.actual.toFixed(1)} ms exceeds ${failure.limit} ms ceiling`;
  return `${failure.key}: ${failure.metric} ${failure.actual.toFixed(1)} ms exceeds ${failure.limit} ms ceiling`;
}

function runFanoutStress(createEmptyDocument, layoutDocument, routeEdges) {
  const doc = createEmptyDocument("routing-budget-stress");
  doc.flow = "lr";
  doc.resources = Array.from({ length: 500 }, (_, index) => ({ id: `resource${index}`, type: "cloud-agnostic.actor", label: { service: `Resource ${index}` }, role: "primary", props: {} }));
  doc.edges = Array.from({ length: 499 }, (_, index) => ({ id: `edge${index}`, source: "resource0", target: `resource${index + 1}`, style: "solid", kind: "flow" }));
  let diagnostics;
  const start = performance.now();
  const routes = routeEdges(doc, layoutDocument(doc), { onBudgetExhausted: (result) => { diagnostics = result; } });
  return { routeCount: routes.length, edgeCount: doc.edges.length, exhausted: diagnostics?.exhausted === true, diagnostics, elapsedMs: performance.now() - start };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
