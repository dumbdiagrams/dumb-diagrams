import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram, invariantTier } from "../packages/runtime/dist/render/index.js";
import { repoRoot, routingDiagrams } from "./lib/example-manifest.mjs";
import {
  hardRoutingWarnings,
  routingReviewFailures,
  routingWarningDelta,
  routingWarningKey,
} from "./lib/routing-review-policy.mjs";

const root = repoRoot();
const expected = JSON.parse(readFileSync(new URL("../examples/routing-warnings.json", import.meta.url), "utf8"));
const hardFailures = [];
const actual = routingDiagrams()
  .flatMap(({ file, baselineName }) => {
    const parsed = parseDgmResult(readFileSync(file, "utf8"));
    if (parsed.isErr()) {
      hardFailures.push(`${baselineName}: parse failed: ${formatParseError(parsed.error)}`);
      return [];
    }
    const compiled = compileDiagram(parsed.value);
    if (!compiled.ok) {
      hardFailures.push(`${relative(root, file)} cannot be compiled while checking the routing baseline.`);
      return [];
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
  })
  .sort(compareWarnings);

const baselinedHard = hardRoutingWarnings(expected.warnings, invariantTier);
if (hardFailures.length || baselinedHard.length) {
  console.error("Hard routing invariants cannot be baselined.");
  for (const failure of hardFailures) console.error(`  ${failure}`);
  for (const warning of baselinedHard) {
    console.error(`  ${warning.file}: ${warning.code}: ${warning.message}`);
  }
  process.exitCode = 1;
} else {
  const normalizedExpected = [...expected.warnings].sort(compareWarnings);
  const reviewFailures = routingReviewFailures(normalizedExpected, expected.reviews);
  if (reviewFailures.length) {
    console.error("Every baselined routing warning needs a reviewed status and a non-empty decision.");
    for (const { warning, reason } of reviewFailures) {
      console.error(`  ${warning.file}: ${warning.code}: ${warning.message} (${reason})`);
    }
    process.exitCode = 1;
  } else if (JSON.stringify(actual) !== JSON.stringify(normalizedExpected)) {
    const { added, removed } = routingWarningDelta(actual, normalizedExpected);
    console.error("Routing warning baseline changed.");
    for (const warning of added) console.error(`  + ${warning.file}: ${warning.code}: ${warning.message}`);
    for (const warning of removed) console.error(`  - ${warning.file}: ${warning.code}: ${warning.message}`);
    console.error(
      "Fix the regression, or deliberately update examples/routing-warnings.json after reviewing the rendered diagrams.",
    );
    process.exitCode = 1;
  } else {
    console.log(`OK routing baseline: ${actual.length} reviewed warning${actual.length === 1 ? "" : "s"}`);
  }
}

function compareWarnings(left, right) {
  return routingWarningKey(left).localeCompare(routingWarningKey(right));
}
