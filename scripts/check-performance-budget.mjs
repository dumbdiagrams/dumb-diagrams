import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { repoRoot, performanceDiagrams } from "./lib/example-manifest.mjs";

const BASELINE_URL = new URL("./performance-baseline.json", import.meta.url);
const COUNTERS = ["scorePathCalls", "routeConflictChecks", "astarExpansions", "repairCandidates"];
const ALLOWED_GROWTH = 1.25;
// The only wall-clock limit: deterministic counters cover the curated fixtures.
const STRESS_MAX_ELAPSED_MS = 30_000;

const [{ createEmptyDocument }, { parseDgm }, { layoutDocument }, { routeEdges }] = await Promise.all([
  import("../packages/runtime/dist/core/index.js"),
  import("../packages/runtime/dist/dsl/index.js"),
  import("../packages/runtime/dist/layout/index.js"),
  import("../packages/runtime/dist/route/index.js"),
]);

function routingWork(doc) {
  let diagnostics;
  const routes = routeEdges(doc, layoutDocument(doc), { onDiagnostics: (result) => { diagnostics = result; } });
  return { routes, diagnostics };
}

const root = repoRoot();
const failures = [];
const measured = {};
const baseline = JSON.parse(readFileSync(BASELINE_URL, "utf8")).fixtures ?? {};

for (const path of performanceDiagrams()) {
  const key = relative(root, path);
  const doc = parseDgm(readFileSync(path, "utf8"));
  const { routes, diagnostics } = routingWork(doc);
  measured[key] = Object.fromEntries(COUNTERS.map((counter) => [counter, diagnostics[counter]]));
  if (routes.length !== doc.edges.length) failures.push(`${key}: route count mismatch`);
  if (diagnostics.exhausted) failures.push(`${key}: default routing work budget exhausted`);
  const expected = baseline[key];
  if (!expected) {
    failures.push(`${key}: missing baseline; run with --update`);
    continue;
  }
  for (const counter of COUNTERS) {
    const limit = Math.ceil(expected[counter] * ALLOWED_GROWTH);
    if (diagnostics[counter] > limit) failures.push(`${key}: ${counter} ${diagnostics[counter]} exceeds ${limit} (baseline ${expected[counter]})`);
  }
  console.log(`${key.padEnd(70)} ${COUNTERS.map((counter) => `${counter}=${diagnostics[counter]}`).join(" ")}`);
}

const doc = createEmptyDocument("routing-budget-stress");
doc.flow = "lr";
doc.resources = Array.from({ length: 500 }, (_, index) => ({ id: `resource${index}`, type: "cloud-agnostic.actor", label: { service: `Resource ${index}` }, role: "primary", props: {} }));
doc.edges = Array.from({ length: 499 }, (_, index) => ({ id: `edge${index}`, source: "resource0", target: `resource${index + 1}`, style: "solid", kind: "flow" }));
const start = performance.now();
const first = routingWork(doc);
const elapsedMs = performance.now() - start;
const second = routingWork(doc);
if (first.routes.length !== doc.edges.length || !first.diagnostics.exhausted) {
  failures.push("synthetic fan-out: default routing budget did not retain every route and report bounded exhaustion");
} else if (JSON.stringify(first.diagnostics) !== JSON.stringify(second.diagnostics)) {
  failures.push("synthetic fan-out: routing diagnostics are nondeterministic");
}
if (elapsedMs > STRESS_MAX_ELAPSED_MS) failures.push(`synthetic fan-out: ${elapsedMs.toFixed(0)} ms exceeds ${STRESS_MAX_ELAPSED_MS} ms`);
console.log(`synthetic fan-out 500 resources / 499 edges: ${elapsedMs.toFixed(0)} ms, bounded fallback verified`);

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE_URL, `${JSON.stringify({ fixtures: measured }, null, 2)}\n`);
  console.log(`Updated ${relative(root, fileURLToPath(BASELINE_URL))}`);
} else if (failures.length) {
  console.error("Routing performance contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
