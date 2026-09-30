#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { loadCuratedBaseline, repoRoot } from "./lib/example-manifest.mjs";

const root = repoRoot();
const baseline = loadCuratedBaseline();
const failures = [];

if (baseline.version !== 1) failures.push(`unsupported baseline version: ${baseline.version}`);
const entries = Object.entries(baseline.curated ?? {});
const actualIds = new Set(entries.map(([id]) => id));

for (const [id, entry] of entries) {
  checkFile(id, "diagram", entry.diagram, entry.diagramSha256, ["examples/curated"]);
  checkFile(id, "reference spec", entry.referenceSpec, entry.referenceSpecSha256, ["examples/curated"]);
  if (entry.architectureBrief) {
    checkFile(id, "architecture brief", entry.architectureBrief, entry.architectureBriefSha256, ["examples/curated"]);
  }
  if (entry.userPrompt) {
    checkFile(id, "user prompt", entry.userPrompt, entry.userPromptSha256, ["examples/curated"]);
  }
}

const discoveredIds = new Set();
for (const directory of readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })) {
  if (directory.isDirectory()) discoveredIds.add(directory.name);
}
for (const id of discoveredIds) if (!actualIds.has(id)) failures.push(`uninventoried curated example: ${id}`);

if (failures.length) {
  console.error("Curated example baseline failed.");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("Update hashes only after reviewing intentional source/spec changes.");
  process.exitCode = 1;
} else {
  console.log(`OK curated baseline: ${entries.length} diagram/reference pairs`);
}

function checkFile(id, role, path, expectedHash, allowedRoots) {
  const absolute = safePath(path, allowedRoots);
  if (!absolute) return;
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    failures.push(`${id} ${role} missing: ${path}`);
    return;
  }
  const actualHash = createHash("sha256").update(readFileSync(absolute)).digest("hex");
  if (actualHash !== expectedHash) {
    failures.push(`${id} ${role} drifted: ${path}; expected ${expectedHash}, got ${actualHash}`);
  }
}

function safePath(path, allowedRoots) {
  if (typeof path !== "string") {
    failures.push("baseline path is missing or not a string");
    return undefined;
  }
  const absolute = resolve(root, path);
  const allowed = allowedRoots.some((allowedRoot) => {
    const base = resolve(root, allowedRoot);
    return absolute === base || absolute.startsWith(`${base}${sep}`);
  });
  if (!allowed || relative(root, absolute).startsWith("..")) {
    failures.push(`baseline path outside allowed roots: ${path}`);
    return undefined;
  }
  return absolute;
}
