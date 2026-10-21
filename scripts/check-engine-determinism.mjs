#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import { formatParseError, parseDgmResult } from "../packages/runtime/dist/dsl/index.js";
import { compileDiagramResult } from "../packages/runtime/dist/render/index.js";

import { engineDiagrams, repoRoot } from "./lib/example-manifest.mjs";

const ROOT = repoRoot();
const SCRIPT = fileURLToPath(import.meta.url);
const CHILD_TIMEOUT_MS = 30_000;
const CHILD_PROCESSES = [
  { name: "en_US.UTF-8/UTC", locale: "en_US.UTF-8", timeZone: "UTC" },
  { name: "tr_TR.UTF-8/Pacific-Honolulu", locale: "tr_TR.UTF-8", timeZone: "Pacific/Honolulu" },
];
const SYNTHETIC_FIXTURE = {
  id: "synthetic-locale-order",
  baselineName: "<synthetic locale-order>",
  source: `dgm 1
diagram locale_order {
  grammar cloud-agnostic
  flow lr

  cloud-agnostic.actor I "İstanbul I"
  cloud-agnostic.server i "İmage i"
  cloud-agnostic.database sink "Shared sink"
  annotation note "Ångström I/i — Unicode label"

  I -> sink
  i -> sink
}
`,
};

function loadFixtures() {
  const files = engineDiagrams();
  if (!files.length) throw new Error("Engine determinism corpus is empty");
  const fixtures = files.map(({ id, file, baselineName }) => {
    if (!existsSync(file)) throw new Error(`Missing engine fixture ${baselineName}: ${file}`);
    return { id, baselineName, source: readFileSync(file, "utf8") };
  });
  return [...fixtures, SYNTHETIC_FIXTURE];
}

function compileFixture(fixture) {
  const parsed = parseDgmResult(fixture.source);
  if (parsed.isErr()) throw new Error(`${fixture.baselineName}: ${formatParseError(parsed.error)}`);
  const document = structuredClone(parsed.value);
  deepFreeze(document);
  const compiled = compileDiagramResult(document);
  if (compiled.isErr()) {
    throw new Error(`${fixture.baselineName}: ${compiled.error.message}: ${compiled.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  const output = {
    layout: compiled.value.layout,
    svg: compiled.value.svg,
    issues: compiled.value.issues,
    invariantFailures: compiled.value.invariantFailures,
  };
  assertFinite(output, fixture.baselineName);
  return output;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assertFinite(value, label, path = label, seen = new WeakSet()) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains non-finite number ${String(value)}`);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) assertFinite(child, label, `${path}.${key}`, seen);
}

function hash(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}

function hashes(output) {
  return {
    full: hash(output),
    layout: hash(output.layout),
    svg: hash(output.svg),
    issues: hash(output.issues),
    invariantFailures: hash(output.invariantFailures),
  };
}

function changedFields(left, right) {
  return ["layout", "svg", "issues", "invariantFailures"].filter((field) =>
    !isDeepStrictEqual(left[field], right[field]),
  );
}

function childReport(fixtures) {
  const report = {};
  for (const fixture of fixtures) report[fixture.id] = hashes(compileFixture(fixture));
  return report;
}

function runChild() {
  const fixtures = loadFixtures();
  process.stdout.write(JSON.stringify({
    environment: {
      locale: new Intl.Collator().resolvedOptions().locale,
      timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    fixtures: childReport(fixtures),
  }));
}

function runParent() {
  const fixtures = loadFixtures();
  const failures = [];
  const local = new Map();
  for (const fixture of fixtures) {
    try {
      const first = compileFixture(fixture);
      const second = compileFixture(fixture);
      const firstHashes = hashes(first);
      local.set(fixture.id, firstHashes);
      if (!isDeepStrictEqual(first, second)) {
        const secondHashes = hashes(second);
        const fields = changedFields(first, second);
        failures.push(`${fixture.id}: same-process output differs in ${fields.join(", ")}`);
        console.error(`  differing hashes: ${fields.map((field) => `${field}=${secondHashes[field]} (first=${firstHashes[field]})`).join(", ")}`);
      }
    } catch (error) {
      failures.push(`${fixture.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const childReports = [];
  for (const child of CHILD_PROCESSES) {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, "--child"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: child.locale, LANG: child.locale, TZ: child.timeZone },
        timeout: CHILD_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout);
      childReports.push({ ...child, ...parsed });
      const expectedLocale = child.locale.startsWith("tr_") ? "tr-TR" : "en-US";
      if (parsed.environment?.locale !== expectedLocale || parsed.environment?.timeZone !== child.timeZone) {
        failures.push(`${child.name}: effective environment was ${JSON.stringify(parsed.environment)}, expected ${expectedLocale}/${child.timeZone}`);
      }
    } catch (error) {
      failures.push(`${child.name}: child process failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const fixture of fixtures) {
    const baseline = local.get(fixture.id);
    if (!baseline) {
      console.log(`${fixture.id}: invalid`);
      continue;
    }
    const mismatches = [];
    const differingHashes = [];
    for (const child of childReports) {
      const actual = child.fixtures?.[fixture.id];
      if (!actual) {
        mismatches.push(`${child.name}: missing fixture result`);
        continue;
      }
      for (const field of Object.keys(baseline)) {
        if (actual[field] !== baseline[field]) {
          mismatches.push(`${child.name} ${field}`);
          differingHashes.push(`${child.name}.${field}=${actual[field]} (local=${baseline[field]})`);
        }
      }
    }
    if (mismatches.length) failures.push(`${fixture.id}: fresh-process mismatch (${mismatches.join(", ")})`);
    console.log(`${fixture.id}: ${mismatches.length ? "DIFF" : "OK"}`);
    if (mismatches.length) console.log(`  differing hashes: ${differingHashes.join(", ")}`);
  }

  if (failures.length) {
    console.error("Engine determinism check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK engine determinism: ${fixtures.length} fixtures, same-process and fresh-process outputs match`);
}

if (process.argv.includes("--child")) runChild();
else runParent();
