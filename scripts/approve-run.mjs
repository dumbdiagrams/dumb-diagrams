#!/usr/bin/env node

// Replace examples/approved with a reviewed model run and refresh its baselines.
//
//   node scripts/approve-run.mjs <project-dir> --model <name> [--reasoning <level>]
//     [--date YYYY-MM-DD] --decision "<why the routing findings are accepted>"
//
// Run `pnpm score:run <project-dir>` and inspect the diagrams first; this only
// records that review.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagram, invariantTier } from "../packages/runtime/dist/render/index.js";
import { compiledGeometry } from "./lib/compiled-geometry.mjs";
import { repoRoot } from "./lib/example-manifest.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    reasoning: { type: "string" },
    date: { type: "string", default: new Date().toISOString().slice(0, 10) },
    decision: { type: "string" },
  },
});
if (positionals.length !== 1 || !values.model || !values.decision?.trim()) {
  console.error(
    'usage: node scripts/approve-run.mjs <project-dir> --model <name> [--reasoning <level>] [--date YYYY-MM-DD] --decision "<review note>"',
  );
  process.exit(2);
}

const root = repoRoot();
const project = resolve(positionals[0]);
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const run = [values.model, values.reasoning, values.date].filter(Boolean).map(slug).join("-");
const approved = join(root, "examples/approved");
const target = join(approved, run);
const source = existsSync(join(project, "diagrams")) ? join(project, "diagrams") : project;
const bundles = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, "diagram.dgm")))
  .map((entry) => entry.name)
  .sort();
const unknown = bundles.filter((id) => !existsSync(join(root, "examples/prompts", `${id}.md`)));
if (!bundles.length || unknown.length) {
  console.error(bundles.length ? `Bundles without a bank prompt: ${unknown.join(", ")}` : `No bundles in ${source}`);
  process.exit(1);
}

for (const old of existsSync(approved) ? readdirSync(approved) : [])
  rmSync(join(root, "tests/integration/examples/__snapshots__", old), { recursive: true, force: true });
rmSync(approved, { recursive: true, force: true });
const manifestBundles = [];
const warnings = [];
const contracts = {};
for (const id of bundles) {
  const from = join(source, id);
  const to = join(target, id);
  mkdirSync(to, { recursive: true });
  for (const file of ["diagram.dgm", "requirements.json", "architecture-brief.md"])
    if (existsSync(join(from, file))) copyFileSync(join(from, file), join(to, file));
  copyFileSync(join(root, "examples/prompts", `${id}.md`), join(to, "user-prompt.md"));
  const rendered = spawnSync(
    process.execPath,
    [join(root, "packages/cli/dist/index.js"), "render", join(to, "diagram.dgm"), "-o", join(to, "diagram.svg")],
    { encoding: "utf8" },
  );
  if (rendered.status !== 0) throw new Error(`${id}: render failed\n${rendered.stderr}`);

  const parsed = parseDgmResult(readFileSync(join(to, "diagram.dgm"), "utf8"));
  if (parsed.isErr()) throw new Error(`${id}: ${formatParseError(parsed.error)}`);
  const compiled = compileDiagram(parsed.value);
  if (!compiled.ok) throw new Error(`${id}: ${compiled.issues.map((issue) => issue.message).join("; ")}`);
  const soft = compiled.invariantFailures.filter((failure) => invariantTier(failure.code) !== "hard");
  for (const { code, message } of soft) warnings.push({ file: `${run}/${id}.dgm`, code, message });
  const [provider] = ["cloud-agnostic", "aws", "azure", "gcp"].filter((name) => id.startsWith(`${name}-`));
  manifestBundles.push({
    id,
    provider,
    difficulty: id.slice(provider.length + 1).split("-")[0],
    strictPass: compiled.invariantFailures.length === 0,
    routingWarnings: soft.length,
  });
  const { width, height } = compiled.layout;
  // Freeze the reviewed size with slack so later engine changes may still improve it.
  contracts[`${run}/${id}`] = {
    diagram: `examples/approved/${run}/${id}/diagram.dgm`,
    flow: parsed.value.flow,
    minAspectRatio: Math.floor((width / height) * 0.8 * 100) / 100,
    maxAspectRatio: Math.ceil((width / height) * 1.25 * 100) / 100,
    maxWidth: Math.ceil(width * 1.15),
    maxHeight: Math.ceil(height * 1.15),
    geometry: compiledGeometry(compiled.layout),
  };
}

const cliVersion = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8")).version;
const manifest = {
  formatVersion: 1,
  model: values.model,
  ...(values.reasoning ? { reasoning: values.reasoning } : {}),
  generatedOn: values.date,
  cli: `create-dumb-diagrams ${cliVersion}`,
  bundles: manifestBundles,
};
writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const routingPath = join(root, "examples/routing-warnings.json");
const routing = JSON.parse(readFileSync(routingPath, "utf8"));
routing.warnings = warnings;
routing.reviews = warnings.map((warning) => ({ ...warning, status: "reviewed", decision: values.decision }));
writeFileSync(routingPath, `${JSON.stringify(routing, null, 2)}\n`);

const contractsPath = join(root, "examples/layout-contracts.json");
const layoutContracts = JSON.parse(readFileSync(contractsPath, "utf8"));
layoutContracts.examples = contracts;
writeFileSync(contractsPath, `${JSON.stringify(layoutContracts, null, 2)}\n`);

for (const args of [
  ["exec", "vitest", "run", "-u", "tests/integration/examples/approved-layout.test.ts"],
  ["exec", "node", "scripts/check-performance-budget.mjs", "--update"],
]) {
  const step = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
console.log(
  `\nApproved ${bundles.length} bundles as examples/approved/${run} with ${warnings.length} reviewed routing findings.`,
);
console.log("Review the git diff, then run pnpm test and pnpm check:website before committing.");
