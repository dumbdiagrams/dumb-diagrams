#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = join(ROOT, "packages/runtime/src/catalog/generated/manifest.json");
const publicRoot = join(ROOT, "packages/editor/public");
const assetRoot = join(publicRoot, "catalog-icons");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// Build outside the served directory, then swap the complete tree into place.
// This keeps a running Vite server from observing a half-populated catalog and
// turning temporary 404s into permanently broken card previews.
const stagingRoot = mkdtempSync(join(publicRoot, ".catalog-icons-stage-"));
const stagedAssetRoot = join(stagingRoot, "catalog-icons");
mkdirSync(stagedAssetRoot, { recursive: true });

try {
  for (const asset of manifest.assetFiles) {
    const source = join(ROOT, asset.sourcePath);
    const destination = join(stagingRoot, asset.browserPath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
    const digest = createHash("sha256").update(readFileSync(destination)).digest("hex");
    if (digest !== asset.sha256) throw new Error(`Staged asset hash mismatch: ${asset.browserPath}`);
  }

  const previousAssetRoot = join(publicRoot, `.catalog-icons-previous-${process.pid}`);
  if (existsSync(previousAssetRoot)) rmSync(previousAssetRoot, { recursive: true, force: true });
  if (existsSync(assetRoot)) renameSync(assetRoot, previousAssetRoot);
  try {
    renameSync(stagedAssetRoot, assetRoot);
  } catch (error) {
    if (!existsSync(assetRoot) && existsSync(previousAssetRoot)) {
      renameSync(previousAssetRoot, assetRoot);
    }
    throw error;
  }
  if (existsSync(previousAssetRoot)) rmSync(previousAssetRoot, { recursive: true, force: true });

  // Keep the generated manifest beside the staged assets for static-server tests
  // and diagnostics. It contains no machine-specific paths.
  writeFileSync(
    join(publicRoot, "catalog-manifest.json"),
    `${JSON.stringify({ schemaVersion: manifest.schemaVersion, generationVersion: manifest.generationVersion, assetFiles: manifest.assetFiles }, null, 2)}\n`,
  );
} finally {
  if (existsSync(stagingRoot)) rmSync(stagingRoot, { recursive: true, force: true });
}

console.log(`Staged ${manifest.assetFiles.length} catalog SVGs in ${relative(ROOT, assetRoot)}`);
