import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";

const EXAMPLES = [
  "async-docs.dgm",
  "bedrock-claims-processing.dgm",
  "transfer-hub.dgm",
  "aws-data-transfer-hub.dgm",
  "aws-high-availability-web-app.dgm",
];
const ITERATIONS = 5;
const PER_DIAGRAM_BUDGET_MS = 250;
const failures = [];

for (const filename of EXAMPLES) {
  const path = resolve("examples/diagrams", filename);
  const doc = parseDgm(readFileSync(path, "utf8"));
  compileDiagram(doc);
  const samples = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const start = performance.now();
    const result = compileDiagram(doc);
    samples.push(performance.now() - start);
    if (!result.ok) throw new Error(`${filename} failed to compile during the performance check.`);
  }
  samples.sort((left, right) => left - right);
  const median = samples[Math.floor(samples.length / 2)];
  const outcome = median <= PER_DIAGRAM_BUDGET_MS ? "ok" : "over budget";
  console.log(`${outcome.padEnd(11)} ${basename(path).padEnd(40)} ${median.toFixed(1)} ms median`);
  if (median > PER_DIAGRAM_BUDGET_MS) failures.push(`${filename}: ${median.toFixed(1)} ms`);
}

if (failures.length) {
  console.error(`\nCompilation performance exceeded the ${PER_DIAGRAM_BUDGET_MS} ms CI budget:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
