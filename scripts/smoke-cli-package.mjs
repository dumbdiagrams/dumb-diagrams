import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactsDir = join(root, ".artifacts/packages");
const cliPackageRoot = join(root, "packages/cli");
const cliManifest = JSON.parse(readFileSync(join(cliPackageRoot, "package.json"), "utf8"));
const version = cliManifest.version;
const tarballName = `create-dumb-diagrams-${version}.tgz`;
const tarballPath = join(artifactsDir, tarballName);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

mkdirSync(artifactsDir, { recursive: true });

execFileSync(pnpmCommand, ["--dir", cliPackageRoot, "pack", "--pack-destination", artifactsDir], {
  cwd: root,
  stdio: "inherit",
});

if (!existsSync(tarballPath)) {
  throw new Error(`Expected tarball at ${tarballPath}`);
}

const entries = listTarballEntries(tarballPath);
const required = [
  "package/dist/index.js",
  "package/dist/create.js",
  "package/dist/studio/index.html",
  "package/dist/templates/project/AGENTS.md",
  "package/dist/templates/project/CLAUDE.md",
  "package/dist/templates/project/GEMINI.md",
  "package/dist/templates/project/.dumbdiagrams/instructions.md",
  "package/dist/templates/examples/README.md",
  "package/dist/templates/examples/aws-high-availability-web-app.dgm",
  "package/dist/templates/examples/simple-serverless-web-application/user-prompt.md",
  "package/dist/templates/examples/simple-serverless-web-application/architecture-brief.md",
  "package/dist/templates/examples/simple-serverless-web-application/reference-spec.md",
  "package/dist/templates/examples/simple-serverless-web-application/diagram.dgm",
  "package/dist/source/CORRESPONDING_SOURCE.md",
  "package/dist/source/packages/cli/src/index.ts",
  "package/dist/source/packages/editor/src/main.tsx",
  "package/dist/source/packages/runtime/src/core/types.ts",
  "package/dist/source/assets/catalog/sources.lock.json",
  "package/dist/source/assets/catalog/sources/cloud-agnostic/server.svg",
  "package/dist/source/examples/diagrams/aws-high-availability-web-app.dgm",
  "package/dist/source/examples/pilots/simple-serverless-web-application/diagram.dgm",
  "package/dist/source/examples/curated-baseline.json",
  "package/dist/source/examples/routing-warnings.json",
  "package/dist/source/registry.npmrc",
  "package/dist/source/scripts/prepare-cli-package.mjs",
  "package/LICENSE",
  "package/ICON-NOTICES.md",
];
for (const path of required) {
  if (!entries.includes(path)) {
    throw new Error(`Tarball missing required path: ${path}`);
  }
}

const forbiddenPatterns = [".test.js", ".test.d.ts", ".map", "studio-server"];
for (const entry of entries) {
  if (entry.startsWith("package/dist/source/")) continue;
  for (const pattern of forbiddenPatterns) {
    if (entry.includes(pattern)) {
      throw new Error(`Tarball should not include ${pattern}: ${entry}`);
    }
  }
}

verifyCorrespondingSource(tarballPath);

const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-smoke-"));
const projectDir = join(workRoot, "smoke-project");
try {
  runNpx(tarballPath, [projectDir, "--yes", "--name", "Smoke Test"], "create-dumb-diagrams");
  const diagramPath = join(projectDir, "diagrams", "architecture.dgm");
  if (!existsSync(diagramPath)) {
    throw new Error("init did not create starter diagram");
  }
  for (const generated of [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".dumbdiagrams/instructions.md",
    ".dumbdiagrams/examples/simple-serverless-web-application/user-prompt.md",
    ".dumbdiagrams/examples/simple-serverless-web-application/architecture-brief.md",
    ".dumbdiagrams/examples/simple-serverless-web-application/reference-spec.md",
    ".dumbdiagrams/examples/simple-serverless-web-application/diagram.dgm",
  ]) {
    if (!existsSync(join(projectDir, generated))) throw new Error(`init did not create ${generated}`);
  }
  if (existsSync(join(projectDir, "DUMB_DIAGRAMS.md"))) {
    throw new Error("init created obsolete DUMB_DIAGRAMS.md");
  }

  const validateCode = runNpx(tarballPath, ["validate", join(projectDir, "diagrams")], "create-dumb-diagrams");
  if (validateCode !== 0) {
    throw new Error(`validate failed with exit code ${validateCode}`);
  }

  const outputSvg = join(workRoot, "output.svg");
  const renderCode = runNpx(tarballPath, [
    "render",
    diagramPath,
    "--output",
    outputSvg,
  ], "create-dumb-diagrams");
  if (renderCode !== 0) {
    throw new Error(`render failed with exit code ${renderCode}`);
  }
  if (!existsSync(outputSvg)) {
    throw new Error("render did not create output.svg");
  }

  const formatted = runNpxCapture(tarballPath, ["format", diagramPath], "create-dumb-diagrams");
  if (!formatted.startsWith("diagram ")) {
    throw new Error("format did not print canonical .dgm source");
  }

  const invalidPath = join(projectDir, "diagrams", "invalid.dgm");
  writeFileSync(invalidPath, "this is not a diagram\n", "utf8");
  console.log("Expecting validate to reject invalid.dgm (non-zero exit is success):");
  const invalidCode = runNpx(tarballPath, ["validate", invalidPath], "create-dumb-diagrams");
  if (invalidCode === 0) {
    throw new Error("validate accepted invalid source");
  }
  console.log(`OK validate rejected invalid source (exit ${invalidCode})`);

  const helpOut = runNpxCapture(tarballPath, ["help"], "create-dumb-diagrams");
  if (!helpOut.includes("studio")) {
    throw new Error("help output missing studio command");
  }

  const versionOut = runNpxCapture(tarballPath, ["--version"], "create-dumb-diagrams");
  if (!versionOut.includes(version)) {
    throw new Error(`--version output missing ${version}: ${versionOut}`);
  }

  const dgmOut = runNpxCapture(tarballPath, ["--version"], "dgm");
  if (!dgmOut.includes(version)) {
    throw new Error(`dgm --version output missing ${version}: ${dgmOut}`);
  }

  console.log(`OK package smoke passed for ${tarballName}`);
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}

function listTarballEntries(tarballPath) {
  const listing = execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" });
  return listing.trim().split("\n").filter(Boolean);
}

function verifyCorrespondingSource(tarballPath) {
  const extracted = mkdtempSync(join(tmpdir(), "dumbdiagrams-source-"));
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", extracted]);
    const packageRoot = join(extracted, "package");
    const sourceRoot = join(packageRoot, "dist/source");
    const registryConfig = join(sourceRoot, "registry.npmrc");
    if (!existsSync(registryConfig)) {
      throw new Error("Corresponding source is missing registry.npmrc");
    }
    // Package managers resolve dependencies before running the root
    // preinstall hook, so the hook cannot protect a clean build from an
    // unrelated user-level registry. Restore the bundled public-registry
    // configuration before invoking pnpm.
    copyFileSync(registryConfig, join(sourceRoot, ".npmrc"));
    const commands = [
      ["install", "--frozen-lockfile"],
      ["build"],
    ];
    for (const args of commands) {
      execFileSync(pnpmCommand, args, { cwd: sourceRoot, stdio: "inherit" });
    }
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

function runNpx(tarballPath, args, bin = "dumbdiagrams") {
  try {
    execFileSync(
      npxCommand,
      ["--yes", `--package=${tarballPath}`, bin, ...args],
      { cwd: root, stdio: "inherit", env: { ...process.env, npm_config_yes: "true" } },
    );
    return 0;
  } catch (error) {
    const code = error.status;
    return typeof code === "number" ? code : 1;
  }
}

function runNpxCapture(tarballPath, args, bin = "dumbdiagrams") {
  return execFileSync(
    npxCommand,
    ["--yes", `--package=${tarballPath}`, bin, ...args],
    { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_yes: "true" } },
  );
}
