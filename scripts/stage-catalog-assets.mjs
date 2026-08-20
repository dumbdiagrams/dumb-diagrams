#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = join(ROOT, "packages/catalog/src/generated/manifest.json");
const publicRoot = join(ROOT, "packages/editor/public");
const assetRoot = join(publicRoot, "catalog-icons");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

rmSync(assetRoot, { recursive: true, force: true });
mkdirSync(assetRoot, { recursive: true });

for (const asset of manifest.assetFiles) {
  const source = join(ROOT, asset.sourcePath);
  const destination = join(ROOT, "packages/editor/public", asset.browserPath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  const digest = createHash("sha256").update(readFileSync(destination)).digest("hex");
  if (digest !== asset.sha256) throw new Error(`Staged asset hash mismatch: ${asset.browserPath}`);
}

// Keep the generated manifest beside the staged assets for static-server tests
// and diagnostics. It contains no machine-specific paths.
writeFileSync(
  join(publicRoot, "catalog-manifest.json"),
  `${JSON.stringify({ schemaVersion: manifest.schemaVersion, generationVersion: manifest.generationVersion, assetFiles: manifest.assetFiles }, null, 2)}\n`,
);

console.log(`Staged ${manifest.assetFiles.length} catalog SVGs in ${relative(ROOT, assetRoot)}`);
