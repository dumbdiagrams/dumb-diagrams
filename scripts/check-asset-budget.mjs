import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const ASSET_BUDGETS = Object.freeze({
  branding: Object.freeze({
    "packages/editor/public/logo_dumbdiagrams.png": Object.freeze({ maxBytes: 8_192, width: 128, height: 77 }),
    "packages/editor/public/favicon.png": Object.freeze({ maxBytes: 4_096, width: 48, height: 48 }),
  }),
  // Built byte counts are deterministic. These ceilings leave modest room for
  // intentional growth while forcing large payload changes through review.
  editor: Object.freeze({ jsBytes: 5_500_000, cssBytes: 160_000, largestJsBytes: 2_250_000 }),
  preparedDistributionBytes: 45_000_000,
  tarballBytes: 16_000_000,
});

export function assetBudgetFailures(measurements, budgets = ASSET_BUDGETS) {
  const failures = [];
  for (const [path, budget] of Object.entries(budgets.branding ?? {})) {
    const asset = measurements?.branding?.[path];
    if (!asset) {
      failures.push(`${path}: file is missing`);
      continue;
    }
    if (!asset.readablePng) failures.push(`${path}: file is not a readable PNG`);
    if (asset.size > budget.maxBytes)
      failures.push(`${path}: ${asset.size} bytes exceeds the ${budget.maxBytes}-byte budget`);
    if (asset.width !== budget.width || asset.height !== budget.height) {
      failures.push(`${path}: expected ${budget.width}x${budget.height}, found ${asset.width}x${asset.height}`);
    }
  }
  const editor = measurements?.editor;
  if (!editor) failures.push("packages/editor/dist: built editor distribution is missing");
  else {
    if (editor.jsBytes > budgets.editor.jsBytes)
      failures.push(
        `packages/editor/dist: ${editor.jsBytes} JavaScript bytes exceed the ${budgets.editor.jsBytes}-byte budget`,
      );
    if (editor.cssBytes > budgets.editor.cssBytes)
      failures.push(
        `packages/editor/dist: ${editor.cssBytes} CSS bytes exceed the ${budgets.editor.cssBytes}-byte budget`,
      );
    if (editor.largestJsBytes > budgets.editor.largestJsBytes)
      failures.push(
        `packages/editor/dist: largest JavaScript chunk (${editor.largestJsBytes} bytes) exceeds the ${budgets.editor.largestJsBytes}-byte budget`,
      );
  }
  if (measurements?.preparedDistributionBytes == null)
    failures.push("packages/cli/dist: prepared distribution is missing");
  else if (measurements.preparedDistributionBytes > budgets.preparedDistributionBytes)
    failures.push(
      `packages/cli/dist: ${measurements.preparedDistributionBytes} bytes exceed the ${budgets.preparedDistributionBytes}-byte budget`,
    );
  // The tarball exists only after smoke:package has packed it; when present it is gated.
  if (measurements?.tarballBytes != null && measurements.tarballBytes > budgets.tarballBytes)
    failures.push(`npm tarball: ${measurements.tarballBytes} bytes exceed the ${budgets.tarballBytes}-byte budget`);
  return failures;
}

export function measureAssetBudgets(root = ROOT) {
  const branding = {};
  for (const path of Object.keys(ASSET_BUDGETS.branding)) {
    const absolute = join(root, path);
    try {
      const bytes = readFileSync(absolute);
      const readablePng =
        bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a;
      branding[path] = {
        size: statSync(absolute).size,
        readablePng,
        width: readablePng ? bytes.readUInt32BE(16) : undefined,
        height: readablePng ? bytes.readUInt32BE(20) : undefined,
      };
    } catch {
      // The policy formatter reports a stable missing-file failure.
    }
  }
  const editorFiles = filesUnder(join(root, "packages/editor/dist"));
  const jsFiles = editorFiles.filter((path) => path.endsWith(".js"));
  const cssFiles = editorFiles.filter((path) => path.endsWith(".css"));
  const editor = editorFiles.length
    ? {
        jsBytes: sum(jsFiles),
        cssBytes: sum(cssFiles),
        largestJsBytes: Math.max(0, ...jsFiles.map((path) => statSync(path).size)),
      }
    : null;
  const preparedPath = join(root, "packages/cli/dist");
  const preparedDistributionBytes = directoryBytes(preparedPath);
  let tarballBytes;
  try {
    const version = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8")).version;
    tarballBytes = statSync(join(root, ".artifacts/packages", `create-dumb-diagrams-${version}.tgz`)).size;
  } catch {
    // Packing happens after this check in the release workflow.
  }
  return { branding, editor, preparedDistributionBytes: preparedDistributionBytes || null, tarballBytes };
}

function filesUnder(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
    });
  } catch {
    return [];
  }
}

function directoryBytes(directory) {
  return filesUnder(directory).reduce((total, path) => total + statSync(path).size, 0);
}

function sum(paths) {
  return paths.reduce((total, path) => total + statSync(path).size, 0);
}

function main() {
  const failures = assetBudgetFailures(measureAssetBudgets());
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    const measured = measureAssetBudgets();
    console.log(
      `Asset budgets pass (editor JS ${measured.editor.jsBytes} bytes, prepared distribution ${measured.preparedDistributionBytes} bytes${measured.tarballBytes == null ? "" : `, tarball ${measured.tarballBytes} bytes`})`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
