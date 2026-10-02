import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { repoRoot, performanceDiagrams } from "./lib/example-manifest.mjs";

const BASELINE_URL = new URL("./performance-baseline.json", import.meta.url);
const COUNTERS = ["scorePathCalls", "routeConflictChecks", "astarExpansions", "repairCandidates"];
const ALLOWED_GROWTH = 1.25;
// Curated fixtures use deterministic counters; isolated stress probes also
// have a generous timeout so a synchronous regression cannot hang this gate.
const STRESS_MAX_ELAPSED_MS = 30_000;
const COMPILATION_LIMITS_TIMEOUT_MS = 10_000;

const [{ createEmptyDocument, validateDocument }, { parseDgm }, { layoutDocument }, { routeEdges }, { getCatalogMap }] = await Promise.all([
  import("../packages/runtime/dist/core/index.js"),
  import("../packages/runtime/dist/dsl/index.js"),
  import("../packages/runtime/dist/layout/index.js"),
  import("../packages/runtime/dist/route/index.js"),
  import("../packages/runtime/dist/catalog/index.js"),
]);

function checkCompilationLimits() {
  const ids = Array.from({ length: 44 }, (_, index) => `node${index}`);
  const source = `dgm 1\ndiagram dense { grammar aws flow lr
    aws.cloud cloud { aws.account account {
      ${ids.map((id) => `cloud-agnostic.actor ${id}`).join("\n")}
    } }
    ${ids.flatMap((id, index) => ids.slice(index + 1).map((target) => `${id} -> ${target}`)).join("\n")}
  }`;
  const dense = parseDgm(source);
  assert.deepEqual(validateDocument(dense, getCatalogMap()).filter((issue) => issue.level === "error"), []);
  const layout = layoutDocument(dense);
  assert.equal(layout.nodes.length, 44);
  assert.equal(new Set(layout.nodes.map((node) => node.id)).size, 44);
  assert.deepEqual(layoutDocument(dense), layout);

  console.log("Compilation limits: dense 44-resource / 946-edge layout verified");
}

if (process.argv.includes("--limits-probe")) {
  checkCompilationLimits();
  process.exit(0);
}

function routingWork(doc) {
  let diagnostics;
  const routes = routeEdges(doc, layoutDocument(doc), { onDiagnostics: (result) => { diagnostics = result; } });
  return { routes, diagnostics };
}

const root = repoRoot();
const failures = [];
const measured = {};
let compilationLimitsFailed = false;
const baseline = JSON.parse(readFileSync(BASELINE_URL, "utf8")).fixtures ?? {};

try {
  process.stdout.write(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--limits-probe"], {
    encoding: "utf8",
    timeout: COMPILATION_LIMITS_TIMEOUT_MS,
  }));
} catch (error) {
  compilationLimitsFailed = true;
  failures.push(`compilation limits: ${error.message}`);
}

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

if (process.argv.includes("--update") && !compilationLimitsFailed) {
  writeFileSync(BASELINE_URL, `${JSON.stringify({ fixtures: measured }, null, 2)}\n`);
  console.log(`Updated ${relative(root, fileURLToPath(BASELINE_URL))}`);
} else if (failures.length) {
  console.error("Routing performance contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
