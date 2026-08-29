#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = resolve(root, "examples/curated-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const expectedIds = new Set([
  "simple-serverless-web-application",
  "aws-high-availability-web-app",
  "aws-data-transfer-hub",
  "bedrock-claims-processing",
  "image-thumbnail-pipeline",
  "asynchronous-report-generation",
  "event-driven-order-fulfillment",
  "azure-private-app-service",
]);
const failures = [];

if (baseline.version !== 1) failures.push(`unsupported baseline version: ${baseline.version}`);
const entries = Object.entries(baseline.curated ?? {});
const actualIds = new Set(entries.map(([id]) => id));
for (const id of expectedIds) if (!actualIds.has(id)) failures.push(`missing curated id: ${id}`);
for (const id of actualIds) if (!expectedIds.has(id)) failures.push(`unexpected curated id: ${id}`);

for (const [id, entry] of entries) {
  checkFile(id, "diagram", entry.diagram, entry.diagramSha256, ["examples/diagrams", "examples/curated"]);
  checkFile(id, "reference spec", entry.referenceSpec, entry.referenceSpecSha256, ["examples/prompts", "examples/curated"]);
}

for (const mirror of baseline.compatibilityMirrors ?? []) {
  const canonical = safePath(mirror.canonical, ["examples/curated"]);
  const compatibility = safePath(mirror.mirror, ["examples/diagrams", "examples/prompts"]);
  if (!canonical || !compatibility) continue;
  if (!existsSync(canonical) || !existsSync(compatibility)) {
    failures.push(`compatibility mirror file missing: ${mirror.canonical} or ${mirror.mirror}`);
    continue;
  }
  if (!readFileSync(canonical).equals(readFileSync(compatibility))) {
    failures.push(`compatibility mirror drifted: ${mirror.mirror} differs from ${mirror.canonical}`);
  }
}

const routingPath = safePath(baseline.routingBaseline, ["examples"]);
if (routingPath && !existsSync(routingPath)) failures.push(`routing baseline missing: ${baseline.routingBaseline}`);

const discoveredIds = new Set();
for (const file of readdirSync(resolve(root, "examples/diagrams"))) {
  if (!file.endsWith(".dgm") || ["async-docs.dgm", "transfer-hub.dgm"].includes(file)) continue;
  discoveredIds.add(file.replace(/\.dgm$/, ""));
}
for (const file of readdirSync(resolve(root, "examples/prompts"))) {
  if (file.endsWith(".md")) discoveredIds.add(file.replace(/\.md$/, ""));
}
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
  console.log(`OK curated baseline: ${entries.length} diagram/reference pairs and ${(baseline.compatibilityMirrors ?? []).length} compatibility mirrors`);
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
