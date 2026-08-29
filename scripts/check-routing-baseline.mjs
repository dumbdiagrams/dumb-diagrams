import { readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = join(root, "examples/routing-warnings.json");
const expected = JSON.parse(readFileSync(baselinePath, "utf8"));
const curatedBaseline = JSON.parse(readFileSync(join(root, "examples/curated-baseline.json"), "utf8"));
const diagramFiles = [
  ...Object.entries(curatedBaseline.curated).map(([id, entry]) => ({
    file: resolve(root, entry.diagram),
    baselineName: `${id}.dgm`,
  })),
  { file: join(root, "examples/diagrams/async-docs.dgm") },
  { file: join(root, "examples/diagrams/transfer-hub.dgm") },
];
const actual = diagramFiles.flatMap(({ file, baselineName }) => {
  const compiled = compileDiagram(parseDgm(readFileSync(file, "utf8")));
  if (!compiled.ok) {
    throw new Error(`${relative(root, file)} cannot be compiled while checking the routing baseline.`);
  }
  return compiled.invariantFailures.map((failure) => ({
    file: baselineName ?? basename(file),
    code: failure.code,
    message: failure.message,
  }));
}).sort(compareWarnings);

const normalizedExpected = [...expected.warnings].sort(compareWarnings);
if (JSON.stringify(actual) !== JSON.stringify(normalizedExpected)) {
  const expectedKeys = new Set(normalizedExpected.map(warningKey));
  const actualKeys = new Set(actual.map(warningKey));
  const added = actual.filter((warning) => !expectedKeys.has(warningKey(warning)));
  const removed = normalizedExpected.filter((warning) => !actualKeys.has(warningKey(warning)));
  console.error("Routing warning baseline changed.");
  for (const warning of added) console.error(`  + ${warning.file}: ${warning.code}: ${warning.message}`);
  for (const warning of removed) console.error(`  - ${warning.file}: ${warning.code}: ${warning.message}`);
  console.error("Fix the regression, or deliberately update examples/routing-warnings.json after reviewing the rendered diagrams.");
  process.exitCode = 1;
} else {
  console.log(`OK routing baseline: ${actual.length} reviewed warning${actual.length === 1 ? "" : "s"}`);
}

function warningKey(warning) {
  return `${warning.file}\0${warning.code}\0${warning.message}`;
}

function compareWarnings(left, right) {
  return warningKey(left).localeCompare(warningKey(right));
}
