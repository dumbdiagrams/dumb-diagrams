import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";

import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram } from "../packages/runtime/dist/render/index.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const diagramsRoot = join(root, "examples/diagrams");
const baselinePath = join(root, "examples/routing-warnings.json");
const expected = JSON.parse(readFileSync(baselinePath, "utf8"));
const actual = collectDgmFiles(diagramsRoot).flatMap((file) => {
  const compiled = compileDiagram(parseDgm(readFileSync(file, "utf8")));
  if (!compiled.ok) {
    throw new Error(`${relative(root, file)} cannot be compiled while checking the routing baseline.`);
  }
  return compiled.invariantFailures.map((failure) => ({
    file: relative(diagramsRoot, file).replaceAll("\\", "/"),
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

function collectDgmFiles(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory()
        ? collectDgmFiles(path)
        : path.endsWith(".dgm") ? [path] : [];
    })
    .sort();
}

function warningKey(warning) {
  return `${warning.file}\0${warning.code}\0${warning.message}`;
}

function compareWarnings(left, right) {
  return warningKey(left).localeCompare(warningKey(right));
}
