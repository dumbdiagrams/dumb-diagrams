import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { parseDgm } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram, invariantTier } from "../packages/runtime/dist/render/index.js";
import { repoRoot, routingDiagrams } from "./lib/example-manifest.mjs";

const root = repoRoot();
const expected = JSON.parse(readFileSync(new URL("../examples/routing-warnings.json", import.meta.url), "utf8"));
const hardFailures = [];
const actual = routingDiagrams().flatMap(({ file, baselineName }) => {
  const compiled = compileDiagram(parseDgm(readFileSync(file, "utf8")));
  if (!compiled.ok) {
    throw new Error(`${relative(root, file)} cannot be compiled while checking the routing baseline.`);
  }
  const warnings = [];
  for (const failure of compiled.invariantFailures) {
    if (invariantTier(failure.code) === "hard") {
      hardFailures.push(`${baselineName}: ${failure.code}: ${failure.message}`);
      continue;
    }
    warnings.push({
      file: baselineName,
      code: failure.code,
      message: failure.message,
    });
  }
  return warnings;
}).sort(compareWarnings);

const baselinedHard = expected.warnings.filter((warning) => invariantTier(warning.code) === "hard");
if (hardFailures.length || baselinedHard.length) {
  console.error("Hard routing invariants cannot be baselined.");
  for (const failure of hardFailures) console.error(`  ${failure}`);
  for (const warning of baselinedHard) {
    console.error(`  ${warning.file}: ${warning.code}: ${warning.message}`);
  }
  process.exitCode = 1;
} else {
  const normalizedExpected = [...expected.warnings].sort(compareWarnings);
  const missingReviews = normalizedExpected.filter((warning) =>
    !expected.reviews?.some((review) => warningKey(review) === warningKey(warning)),
  );
  if (missingReviews.length) {
    console.error("Every baselined routing warning needs a reviews[] note.");
    for (const warning of missingReviews) {
      console.error(`  ${warning.file}: ${warning.code}: ${warning.message}`);
    }
    process.exitCode = 1;
  } else if (JSON.stringify(actual) !== JSON.stringify(normalizedExpected)) {
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
}

function warningKey(warning) {
  return `${warning.file}\0${warning.code}\0${warning.message}`;
}

function compareWarnings(left, right) {
  return warningKey(left).localeCompare(warningKey(right));
}
