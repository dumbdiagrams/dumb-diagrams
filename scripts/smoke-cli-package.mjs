import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { awsCuratedIds, repoRoot } from "./lib/example-manifest.mjs";

const root = repoRoot();
const artifactsDir = join(root, ".artifacts/packages");
const cliPackageRoot = join(root, "packages/cli");
const cliManifest = JSON.parse(readFileSync(join(cliPackageRoot, "package.json"), "utf8"));
const version = cliManifest.version;
const tarballName = `create-dumb-diagrams-${version}.tgz`;
const requestedArtifact = process.env.DUMB_DIAGRAMS_ARTIFACT;
const tarballPath = requestedArtifact
  ? (isAbsolute(requestedArtifact) ? requestedArtifact : resolve(root, requestedArtifact))
  : join(artifactsDir, tarballName);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const curatedExampleIds = awsCuratedIds();
const curatedExampleFiles = ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"];

mkdirSync(artifactsDir, { recursive: true });

if (!requestedArtifact) {
  execFileSync(pnpmCommand, ["--dir", cliPackageRoot, "pack", "--pack-destination", artifactsDir], {
    cwd: root,
    stdio: "inherit",
  });
}

if (!existsSync(tarballPath)) {
  throw new Error(`Expected ${requestedArtifact ? "release artifact" : "tarball"} at ${tarballPath}`);
}

const entries = listTarballEntries(tarballPath);
if (entries.includes("package/dist/create.js")) {
  throw new Error("Tarball must not ship the obsolete create CLI entrypoint");
}
const required = [
  "package/dist/index.js",
  "package/dist/studio/index.html",
  "package/dist/templates/project/AGENTS.md",
  "package/dist/templates/project/CLAUDE.md",
  "package/dist/templates/project/GEMINI.md",
  "package/dist/templates/project/.dumbdiagrams/instructions.md",
  "package/dist/templates/project/.dumbdiagrams/providers/aws.md",
  "package/dist/templates/project/.dumbdiagrams/providers/azure.md",
  "package/dist/templates/project/.dumbdiagrams/providers/gcp.md",
  "package/dist/templates/project/.dumbdiagrams/providers/cloud-agnostic.md",
  "package/dist/templates/project/diagrams/README.md",
  "package/dist/templates/examples/README.md",
  ...curatedExampleIds.flatMap((id) => curatedExampleFiles.map((file) => `package/dist/templates/examples/${id}/${file}`)),
  "package/dist/source/CORRESPONDING_SOURCE.md",
  "package/dist/source/packages/cli/src/index.ts",
  "package/dist/source/packages/editor/src/main.tsx",
  "package/dist/source/packages/runtime/src/core/types.ts",
  "package/dist/source/assets/catalog/sources.lock.json",
  "package/dist/source/assets/catalog/sources/cloud-agnostic/server.svg",
  "package/dist/source/examples/curated/aws-high-availability-web-app/diagram.dgm",
  "package/dist/source/examples/curated/simple-serverless-web-application/diagram.dgm",
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
  mkdirSync(projectDir);

  const helpOut = runNpxCapture(tarballPath, ["help"], "dumbdiagrams");
  if (!helpOut.includes("studio")) {
    throw new Error("help output missing studio command");
  }

  const versionOut = runNpxCapture(tarballPath, ["--version"], "dumbdiagrams");
  if (!versionOut.includes(version)) {
    throw new Error(`--version output missing ${version}: ${versionOut}`);
  }

  const dgmOut = runNpxCapture(tarballPath, ["--version"], "dgm");
  if (!dgmOut.includes(version)) {
    throw new Error(`dgm --version output missing ${version}: ${dgmOut}`);
  }

  // Smoke tests must never pause for the interactive project-name prompt,
  // even when the script itself is run from a terminal.
  if (runNpx(tarballPath, ["init"], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams init failed");
  }
  const generatedProjects = readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^dumb-diagrams-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(entry.name));
  if (generatedProjects.length !== 1) {
    throw new Error(`init should create one timestamped project folder, found ${generatedProjects.length}`);
  }
  const initializedProject = join(projectDir, generatedProjects[0].name);
  for (const generated of [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "diagrams/README.md",
    ".dumbdiagrams/instructions.md",
    ".dumbdiagrams/providers/aws.md",
    ".dumbdiagrams/providers/azure.md",
    ".dumbdiagrams/providers/gcp.md",
    ".dumbdiagrams/providers/cloud-agnostic.md",
    ...curatedExampleIds.flatMap((id) => curatedExampleFiles.map((file) => `.dumbdiagrams/examples/${id}/${file}`)),
  ]) {
    if (!existsSync(join(initializedProject, generated))) throw new Error(`init did not create ${generated}`);
  }

  const smokeDiagram = join(initializedProject, ".dumbdiagrams/examples/simple-serverless-web-application/diagram.dgm");
  if (runNpx(tarballPath, ["validate", smokeDiagram], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams validate failed");
  }
  const formatCopy = join(workRoot, "packed-format.dgm");
  copyFileSync(smokeDiagram, formatCopy);
  if (runNpx(tarballPath, ["format", "--write", formatCopy], "dumbdiagrams", projectDir) !== 0 ||
      runNpx(tarballPath, ["format", "--check", formatCopy], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams format failed");
  }
  const firstSvg = join(workRoot, "packed-first.svg");
  const secondSvg = join(workRoot, "packed-second.svg");
  if (runNpx(tarballPath, ["render", smokeDiagram, "--output", firstSvg], "dumbdiagrams", projectDir) !== 0 ||
      runNpx(tarballPath, ["render", smokeDiagram, "--output", secondSvg], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams render failed");
  }
  if (readFileSync(firstSvg, "utf8") !== readFileSync(secondSvg, "utf8")) {
    throw new Error("packed dumbdiagrams render is not deterministic");
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

function runNpx(tarballPath, args, bin = "dumbdiagrams", cwd = root) {
  try {
    execFileSync(
      npxCommand,
      ["--yes", `--package=${tarballPath}`, bin, ...args],
      { cwd, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, npm_config_yes: "true" } },
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
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, npm_config_yes: "true" } },
  );
}
