#!/usr/bin/env node

// Hard fixtures may not lose flow readability; easy and medium fixtures must
// render byte-identically. `--update` rewrites the reviewed baseline.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagramResult } from "../packages/runtime/dist/render/index.js";

import { repoRoot } from "./lib/example-manifest.mjs";

const ROOT = join(repoRoot(), "tests/fixtures/readability");
const BASELINE = join(ROOT, "baseline.json");
const update = process.argv.includes("--update");

function compile(dir, name) {
  const parsed = parseDgmResult(readFileSync(join(ROOT, dir, name), "utf8"));
  if (parsed.isErr()) throw new Error(`${dir}/${name}: ${formatParseError(parsed.error)}`);
  const compiled = compileDiagramResult(parsed.value);
  if (compiled.isErr()) throw new Error(`${dir}/${name}: ${compiled.error.message}`);
  return compiled.value;
}

const files = (dir) =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith(".dgm"))
    .sort();
const current = { hard: {}, stable: {} };
for (const name of files("hard")) {
  const { readability: r } = compile("hard", name);
  current.hard[name] = {
    backward: r.backwardEdges.length,
    backtracking: r.backtrackingEdges.length,
    crossings: r.crossings,
    bends: r.bends,
  };
}
for (const name of files("stable"))
  current.stable[name] = createHash("sha256").update(compile("stable", name).svg).digest("hex");

const score = (m) => m.backward + m.backtracking;
const total = (key) => Object.values(current.hard).reduce((sum, m) => sum + m[key], 0);
console.log("hard fixture                                          back track cross bends");
for (const [name, m] of Object.entries(current.hard))
  console.log(
    `${name.padEnd(52)} ${String(m.backward).padStart(5)} ${String(m.backtracking).padStart(5)} ${String(m.crossings).padStart(5)} ${String(m.bends).padStart(5)}`,
  );
console.log(
  `${"total".padEnd(52)} ${String(total("backward")).padStart(5)} ${String(total("backtracking")).padStart(5)} ${String(total("crossings")).padStart(5)} ${String(total("bends")).padStart(5)}`,
);

if (update) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`Updated ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const failures = [];
for (const [name, m] of Object.entries(current.hard)) {
  const before = baseline.hard[name];
  if (!before) failures.push(`hard/${name}: missing from baseline`);
  else if (score(m) > score(before) || m.crossings > before.crossings)
    failures.push(
      `hard/${name}: backward+backtracking ${score(before)} -> ${score(m)}, crossings ${before.crossings} -> ${m.crossings}`,
    );
}
for (const [name, hash] of Object.entries(current.stable))
  if (baseline.stable[name] !== hash) failures.push(`stable/${name}: rendered SVG changed`);
for (const name of [...Object.keys(baseline.hard), ...Object.keys(baseline.stable)])
  if (!(name in current.hard) && !(name in current.stable)) failures.push(`${name}: fixture removed`);

if (failures.length) {
  console.error(`\nReadability check failed:\n${failures.map((line) => `  ${line}`).join("\n")}`);
  process.exit(1);
}
console.log(`\nReadability check passed: ${files("hard").length} hard, ${files("stable").length} stable fixtures.`);
