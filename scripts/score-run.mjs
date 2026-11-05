#!/usr/bin/env node

// Score a model run against the reviewed prompt references.
//
//   node scripts/score-run.mjs <run-dir> [--model <name>] [--reasoning <level>] [--json <out.json>]
//
// <run-dir> is an initialized project (bundles in diagrams/<prompt-id>/) or a
// folder of bundles such as examples/approved/<run>/. Exit code 1 when any
// bundle misses its reference, preferences, self-written contract, or validity.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { getCatalogMap } from "../packages/runtime/dist/catalog/index.js";
import { validateDocument } from "../packages/runtime/dist/core/index.js";
import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagramResult, invariantTier } from "../packages/runtime/dist/render/index.js";
import {
  checkPreferences,
  checkRequirements,
  DEFAULT_PREFERENCES,
  parsePreferences,
  parseRequirements,
} from "../packages/runtime/dist/requirements/index.js";

import { loadReference, matchReference } from "./lib/reference-contract.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { model: { type: "string" }, reasoning: { type: "string" }, json: { type: "string" } },
});
if (positionals.length !== 1) {
  console.error(
    "usage: node scripts/score-run.mjs <run-dir> [--model <name>] [--reasoning <level>] [--json <out.json>]",
  );
  process.exit(2);
}
const runDir = resolve(positionals[0]);
const bundleRoot = existsSync(join(runDir, "diagrams")) ? join(runDir, "diagrams") : runDir;
const preferencesFile = join(runDir, ".dumbdiagrams/preferences.json");
const project = existsSync(preferencesFile)
  ? parsePreferences(readFileSync(preferencesFile, "utf8")).unwrapOr(DEFAULT_PREFERENCES)
  : DEFAULT_PREFERENCES;

const bundles = readdirSync(bundleRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(bundleRoot, entry.name, "diagram.dgm")))
  .map((entry) => entry.name)
  .sort();
if (!bundles.length) {
  console.error(`No diagram bundles found under ${bundleRoot}`);
  process.exit(2);
}

const results = bundles.map((id) => scoreBundle(id, join(bundleRoot, id)));
const generatedBy = [...new Set(results.map((result) => result.generatedBy).filter(Boolean))];
const summary = {
  run: runDir,
  model: values.model ?? null,
  reasoning: values.reasoning ?? null,
  selfReported: generatedBy,
  preferences: project,
  bundles: results.length,
  referencePass: results.filter((result) => result.reference?.failures.length === 0).length,
  preferencesPass: results.filter((result) => result.preferences.length === 0).length,
  contractPass: results.filter((result) => result.contract.status === "pass").length,
  routingClean: results.filter((result) => result.routing && !result.routing.hard && !result.routing.soft).length,
  results,
};

console.log(
  `Run ${runDir}\nModel ${summary.model ?? "-"} / ${summary.reasoning ?? "-"}; self-reported ${generatedBy.join(", ") || "-"}\n`,
);
console.log(
  `${"bundle".padEnd(44)} ${"reference".padStart(9)} ${"prefs".padStart(5)} ${"self".padStart(4)} ${"hard".padStart(4)} ${"soft".padStart(4)} ${"cross".padStart(5)} ${"back".padStart(4)} ${"track".padStart(5)}`,
);
for (const result of results) {
  const ref = result.reference ? `${result.reference.satisfied}/${result.reference.total}` : "-";
  const routing = result.routing ?? {};
  console.log(
    `${result.id.padEnd(44)} ${ref.padStart(9)} ${String(result.preferences.length).padStart(5)} ${result.contract.status.padStart(4)} ${String(routing.hard ?? "-").padStart(4)} ${String(routing.soft ?? "-").padStart(4)} ${String(routing.crossings ?? "-").padStart(5)} ${String(routing.backward ?? "-").padStart(4)} ${String(routing.backtracking ?? "-").padStart(5)}`,
  );
}
console.log(
  `\nReference ${summary.referencePass}/${results.length}, preferences ${summary.preferencesPass}/${results.length}, self contract ${summary.contractPass}/${results.length}, routing clean ${summary.routingClean}/${results.length}`,
);
for (const result of results) {
  const notes = [
    ...result.validity.map((note) => `validity: ${note}`),
    ...(result.reference?.failures ?? ["no reference for this prompt"]).map((note) => `reference: ${note}`),
    ...result.preferences.map((note) => `preferences: ${note}`),
    ...result.contract.issues.map((note) => `self contract: ${note}`),
  ];
  if (notes.length) console.log(`\n${result.id}\n${notes.map((note) => `  ${note}`).join("\n")}`);
}
if (values.json) writeFileSync(resolve(values.json), `${JSON.stringify(summary, null, 2)}\n`);

const failed = results.some(
  (result) =>
    result.validity.length ||
    result.preferences.length ||
    result.contract.status !== "pass" ||
    result.reference?.failures.length !== 0,
);
process.exit(failed ? 1 : 0);

function scoreBundle(id, dir) {
  const result = { id, validity: [], preferences: [], contract: { status: "missing", issues: [] } };
  const parsed = parseDgmResult(readFileSync(join(dir, "diagram.dgm"), "utf8"));
  if (parsed.isErr()) return { ...result, validity: [formatParseError(parsed.error)] };
  const doc = parsed.value;
  result.validity = validateDocument(doc, getCatalogMap())
    .filter((issue) => issue.level === "error")
    .map((issue) => `${issue.code}: ${issue.message}`);

  let override;
  const requirementsFile = join(dir, "requirements.json");
  if (existsSync(requirementsFile)) {
    const contract = parseRequirements(readFileSync(requirementsFile, "utf8"));
    if (contract.isErr())
      result.contract = { status: "invalid", issues: contract.error.issues.map((issue) => issue.message) };
    else {
      override = contract.value.preferences;
      const { model, reasoning } = contract.value.generatedBy ?? {};
      if (model) result.generatedBy = reasoning ? `${model} (${reasoning})` : model;
      const issues = checkRequirements(doc, contract.value).map((issue) => `${issue.code}: ${issue.message}`);
      result.contract = { status: issues.length ? "fail" : "pass", issues };
    }
  }
  result.preferences = checkPreferences(doc, { ...project, ...override }).map(
    (issue) => `${issue.code}: ${issue.message}`,
  );

  const reference = loadReference(id);
  result.reference = reference ? matchReference(doc, reference) : undefined;

  if (!result.validity.length) {
    const compiled = compileDiagramResult(doc);
    if (compiled.isOk()) {
      const { invariantFailures, readability } = compiled.value;
      result.routing = {
        hard: invariantFailures.filter((failure) => invariantTier(failure.code) === "hard").length,
        soft: invariantFailures.filter((failure) => invariantTier(failure.code) === "soft").length,
        crossings: readability.crossings,
        detours: invariantFailures.filter((failure) => failure.code === "edge-detour").length,
        backward: readability.backwardEdges.length,
        backtracking: readability.backtrackingEdges.length,
      };
    }
  }
  return result;
}
