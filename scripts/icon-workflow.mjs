#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LOCK_PATH = join(ROOT, "icon-sources.lock.json");
const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
const provider = process.argv[2];

function sourceFor(name) {
  const source = lock.sources.find((item) => item.provider === name);
  if (!source) throw new Error(`Unknown provider: ${name}`);
  return source;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) out.push(...walk(file));
    else out.push(file);
  }
  return out;
}

function validateSvg(file, maxBytes = 2 * 1024 * 1024) {
  const bytes = readFileSync(file);
  if (bytes.length > maxBytes) throw new Error(`SVG exceeds decompression limit: ${file}`);
  const text = bytes.toString("utf8");
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) {
    throw new Error(`SVG root is malformed: ${file}`);
  }
  if (/<(?:script|foreignObject)\b|\bon[a-z]+\s*=|javascript:/i.test(text)) {
    throw new Error(`SVG contains unsafe content: ${file}`);
  }
  if (!/\bviewBox\s*=|\bwidth\s*=/.test(text)) {
    throw new Error(`SVG has no viewBox or width: ${file}`);
  }
}

function validateTree(root, expected, maxFiles = 10000) {
  const files = walk(root).filter((file) => file.toLowerCase().endsWith(".svg"));
  if (files.length > maxFiles) throw new Error(`Archive contains too many SVG files: ${files.length}`);
  for (const file of files) validateSvg(file);
  for (const name of expected) {
    if (!existsSync(join(root, name))) throw new Error(`Archive is missing expected directory: ${name}`);
  }
  return files;
}

function safeZipEntries(archive) {
  const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const name of names) {
    const normalized = name.replaceAll("\\", "/");
    if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
      throw new Error(`Zip-slip path rejected: ${name}`);
    }
  }
  return names;
}

function extractZip(archive, destination) {
  const names = safeZipEntries(archive);
  const listing = execFileSync("unzip", ["-l", archive], { encoding: "utf8" });
  const sizeMatch = listing.match(/\s([0-9]+)\s+files?$/m);
  if (sizeMatch && Number(sizeMatch[1]) > 20000) throw new Error("Archive file-count limit exceeded");
  execFileSync("unzip", ["-q", archive, "-d", destination]);
  return names;
}

function findDirectory(root, name) {
  const candidates = walk(root).filter((file) => basename(file) === name);
  const exact = candidates.find((file) => statSync(file).isDirectory());
  return exact;
}

function replaceDirectory(target, prepared) {
  mkdirSync(dirname(target), { recursive: true });
  const backup = `${target}.previous-${process.pid}`;
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, backup);
  try {
    renameSync(prepared, target);
  } catch (error) {
    if (existsSync(backup) && !existsSync(target)) renameSync(backup, target);
    throw error;
  }
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
}

async function check() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "packages/catalog/src/generated/manifest.json"), "utf8"));
  const counts = new Map();
  for (const item of manifest.entries) {
    if (item.assetKind !== "resource") continue;
    counts.set(item.provider, (counts.get(item.provider) ?? 0) + 1);
  }
  let failed = false;
  for (const source of lock.sources) {
    const count = counts.get(source.provider) ?? 0;
    const okCount = count >= source.minimumCanonicalCount;
    console.log(`${source.provider}: ${count} canonical resources (minimum ${source.minimumCanonicalCount}) ${okCount ? "ok" : "FAIL"}`);
    if (!okCount) failed = true;
  }
  for (const asset of manifest.assetFiles) {
    const file = join(ROOT, asset.sourcePath);
    if (!existsSync(file)) {
      console.error(`missing asset: ${asset.sourcePath}`);
      failed = true;
      continue;
    }
    try {
      validateSvg(file);
    } catch (error) {
      console.error(error.message);
      failed = true;
    }
    if (sha256File(file) !== asset.sha256) {
      console.error(`hash drift: ${asset.sourcePath}`);
      failed = true;
    }
  }
  for (const source of lock.sources) {
    console.log(`${source.provider}: archive ${source.sha256 === "local-curated-assets" ? "local source tree" : "locked; download only during icons:update"}`);
  }
  if (failed) process.exitCode = 1;
}

async function update(name, acceptTerms) {
  if (!name || !acceptTerms) {
    throw new Error("Usage: icons:update --provider <aws|azure|gcp|cloud-agnostic> --accept-terms");
  }
  const source = sourceFor(name);
  if (!source.archiveUrl) throw new Error(`${name} has no archive URL; update its pinned source through the reviewed local workflow`);
  const temp = mkdtempSync(join(tmpdir(), "dumb-diagrams-icons-"));
  const archive = join(temp, `${name}.zip`);
  try {
    const response = await fetch(source.archiveUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 512 * 1024 * 1024) throw new Error("Archive download exceeds 512MB limit");
    if (sha256Bytes(bytes) !== source.sha256) throw new Error(`Archive hash mismatch for ${name}`);
    writeFileSync(archive, bytes);
    const extracted = join(temp, "extracted");
    mkdirSync(extracted);
    extractZip(archive, extracted);
    const root = join(extracted, readdirSync(extracted)[0] ?? "");
    const expected = source.expectedStructure;
    const validationRoot = existsSync(join(root, expected[0])) ? root : extracted;
    validateTree(validationRoot, expected);

    const prepared = join(temp, "prepared");
    mkdirSync(prepared);
    if (name === "aws") {
      for (const folder of ["Architecture-Service-Icons_07312026", "Architecture-Group-Icons_07312026", "Resource-Icons_07312026"]) {
        const found = findDirectory(validationRoot, folder);
        if (found) cpSync(found, join(prepared, folder), { recursive: true });
      }
      replaceDirectory(join(ROOT, "aws-icons"), prepared);
    } else if (name === "azure") {
      const found = findDirectory(validationRoot, "Icons");
      if (!found) throw new Error("Azure archive does not contain Icons/");
      cpSync(found, join(prepared, "Icons"), { recursive: true });
      replaceDirectory(join(ROOT, "azure-icons"), prepared);
    } else if (name === "gcp") {
      for (const folder of ["Unique Icons", "Category Icons"]) {
        const found = findDirectory(validationRoot, folder);
        if (!found) throw new Error(`GCP archive does not contain ${folder}/`);
        cpSync(found, join(prepared, folder), { recursive: true });
      }
      replaceDirectory(join(ROOT, "gcp-icons"), prepared);
    }
    console.log(`Updated ${name} from the pinned ${source.releaseLabel} archive`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const command = process.argv[2];
if (command === "check") await check();
else if (command === "update") {
  const args = process.argv.slice(3);
  const name = args[args.indexOf("--provider") + 1];
  await update(name, args.includes("--accept-terms"));
} else if (command === "build") {
  execFileSync(process.execPath, [join(ROOT, "scripts/generate-catalog.mjs")], { stdio: "inherit" });
  execFileSync(process.execPath, [join(ROOT, "scripts/stage-catalog-assets.mjs")], { stdio: "inherit" });
} else {
  console.error("Usage: node scripts/icon-workflow.mjs <check|build|update>");
  process.exitCode = 1;
}
