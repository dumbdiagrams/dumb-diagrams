import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { repoRoot } from "./lib/example-manifest.mjs";
import { collectSourceManifestFiles } from "./lib/source-manifest.mjs";
import { parseTarballListing } from "./lib/tarball-entries.mjs";

const root = repoRoot();
const artifactsDir = join(root, ".artifacts/packages");
const cliPackageRoot = join(root, "packages/cli");
const cliManifest = JSON.parse(readFileSync(join(cliPackageRoot, "package.json"), "utf8"));
const version = cliManifest.version;
const tarballName = `create-dumb-diagrams-${version}.tgz`;
const requestedArtifact = process.env.DUMB_DIAGRAMS_ARTIFACT;
const installer = process.env.DUMB_DIAGRAMS_SMOKE_INSTALLER ?? "npm";
if (installer !== "npm" && installer !== "pnpm") {
  throw new Error(`Unsupported DUMB_DIAGRAMS_SMOKE_INSTALLER: ${installer}. Expected npm or pnpm.`);
}
const tarballPath = requestedArtifact
  ? isAbsolute(requestedArtifact)
    ? requestedArtifact
    : resolve(root, requestedArtifact)
  : join(artifactsDir, tarballName);
let installedRoot;
const isWindows = process.platform === "win32";
const nodeCommand = process.env.npm_node_execpath || process.execPath;
const pnpmCliPath = isWindows ? process.env.npm_execpath : undefined;
const npmCliPath = isWindows ? join(dirname(nodeCommand), "node_modules/npm/bin/npm-cli.js") : undefined;
if (isWindows && (!pnpmCliPath || !existsSync(pnpmCliPath))) {
  throw new Error("Windows package smoke must run through pnpm so npm_execpath points to the pnpm JavaScript CLI");
}
if (isWindows && installer === "npm" && !existsSync(npmCliPath)) {
  throw new Error(`Could not locate npm's npm-cli.js beside Node at ${npmCliPath}`);
}
// Matches the initialized `.dumbdiagrams/requirements.example.json` and the default preferences.
const smokeSource = `dgm 1
diagram smoke {
  grammar cloud-agnostic
  flow lr

  cloud-agnostic.client client "External client"
  cloud-agnostic.cloud cloud "Cloud" {
    cloud-agnostic.server api "API server"
  }

  client -> api { id request label "request" step 1 }
}
`;

mkdirSync(artifactsDir, { recursive: true });

if (!requestedArtifact) {
  execCommand("pnpm", ["--dir", cliPackageRoot, "pack", "--pack-destination", artifactsDir], {
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
  "package/dist/templates/project/.dumbdiagrams/requirements.md",
  "package/dist/templates/project/.dumbdiagrams/requirements.schema.json",
  "package/dist/templates/project/.dumbdiagrams/requirements.example.json",
  "package/dist/templates/project/README.md",
  "package/dist/templates/project/preferences.json",
  "package/dist/templates/project/.dumbdiagrams/preferences.schema.json",
  "package/dist/templates/project/.dumbdiagrams/providers/aws.md",
  "package/dist/templates/project/.dumbdiagrams/providers/azure.md",
  "package/dist/templates/project/.dumbdiagrams/providers/gcp.md",
  "package/dist/templates/project/.dumbdiagrams/providers/cloud-agnostic.md",
  "package/dist/templates/project/diagrams/README.md",
  "package/dist/source/CORRESPONDING_SOURCE.md",
  "package/dist/source/packages/cli/src/index.ts",
  "package/dist/source/packages/editor/src/main.tsx",
  "package/dist/source/packages/runtime/src/core/types.ts",
  "package/dist/source/assets/catalog/sources.lock.json",
  "package/dist/source/assets/catalog/sources/cloud-agnostic/server.svg",
  "package/dist/source/examples/prompts/aws-medium-image-thumbnail-pipeline.md",
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

const expectedSourceEntries = new Set([
  ...collectSourceManifestFiles(root).map((path) => `package/dist/source/${path}`),
  "package/dist/source/CORRESPONDING_SOURCE.md",
  "package/dist/source/registry.npmrc",
]);
const sourceEntries = new Set(
  entries.filter((entry) => entry.startsWith("package/dist/source/") && !entry.endsWith("/")),
);
for (const path of expectedSourceEntries) {
  if (!sourceEntries.has(path)) throw new Error(`Tarball missing corresponding-source path: ${path}`);
}
for (const path of sourceEntries) {
  if (!expectedSourceEntries.has(path))
    throw new Error(`Tarball includes undeclared corresponding-source path: ${path}`);
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

timed("Rebuild and verify corresponding source", () => verifyCorrespondingSource(tarballPath));

const workRoot = mkdtempSync(join(artifactsDir, "smoke-"));
const projectDir = join(workRoot, "smoke-project");
try {
  mkdirSync(projectDir);
  timed(`Install packed CLI with ${installer}`, () => installPackedCli(tarballPath, join(workRoot, "installed")));

  const helpOut = runInstalledCliCapture(["help"], "dumbdiagrams");
  if (!helpOut.includes("studio")) {
    throw new Error("help output missing studio command");
  }

  const versionOut = runInstalledCliCapture(["--version"], "dumbdiagrams");
  if (!versionOut.includes(version)) {
    throw new Error(`--version output missing ${version}: ${versionOut}`);
  }

  const dgmOut = runInstalledCliCapture(["--version"], "dgm");
  if (!dgmOut.includes(version)) {
    throw new Error(`dgm --version output missing ${version}: ${dgmOut}`);
  }

  // Smoke tests must never pause for the interactive project-name prompt,
  // even when the script itself is run from a terminal.
  if (runInstalledCli(["init"], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams init failed");
  }
  const generatedProjects = readdirSync(projectDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && /^dumb-diagrams-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(entry.name),
  );
  if (generatedProjects.length !== 1) {
    throw new Error(`init should create one timestamped project folder, found ${generatedProjects.length}`);
  }
  const initializedProject = join(projectDir, generatedProjects[0].name);
  for (const generated of [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "README.md",
    "preferences.json",
    "diagrams/README.md",
    ".dumbdiagrams/instructions.md",
    ".dumbdiagrams/requirements.md",
    ".dumbdiagrams/requirements.schema.json",
    ".dumbdiagrams/requirements.example.json",
    ".dumbdiagrams/preferences.schema.json",
    ".dumbdiagrams/providers/aws.md",
    ".dumbdiagrams/providers/azure.md",
    ".dumbdiagrams/providers/gcp.md",
    ".dumbdiagrams/providers/cloud-agnostic.md",
  ]) {
    if (!existsSync(join(initializedProject, generated))) throw new Error(`init did not create ${generated}`);
  }
  if (existsSync(join(initializedProject, ".dumbdiagrams/examples"))) throw new Error("init must not bundle examples");

  const smokeDir = join(initializedProject, "diagrams/smoke");
  mkdirSync(smokeDir, { recursive: true });
  const smokeDiagram = join(smokeDir, "diagram.dgm");
  writeFileSync(smokeDiagram, smokeSource);
  copyFileSync(
    join(initializedProject, ".dumbdiagrams/requirements.example.json"),
    join(smokeDir, "requirements.json"),
  );
  const preferencesFile = join(initializedProject, "preferences.json");
  const defaultPreferences = readFileSync(preferencesFile, "utf8");
  writeFileSync(preferencesFile, `${JSON.stringify({ resourceLabels: false })}\n`);
  const iconsOnly = JSON.parse(
    spawnSync(nodeCommand, [installedBin("dumbdiagrams"), "validate", "--json", smokeDiagram], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_yes: "true" },
    }).stdout,
  );
  if (iconsOnly.ok || iconsOnly.files[0]?.preferences.status !== "fail") {
    throw new Error("packed CLI did not enforce the project preferences.json");
  }
  writeFileSync(preferencesFile, defaultPreferences);
  if (runInstalledCli(["validate", smokeDiagram], "dumbdiagrams", projectDir) !== 0) {
    throw new Error("packed dumbdiagrams validate failed");
  }
  const validation = JSON.parse(runInstalledCliCapture(["validate", "--json", smokeDiagram]));
  if (!validation.ok || validation.files[0]?.completeness.status !== "pass") {
    throw new Error("packed CLI did not verify the initialized requirements contract");
  }
  const incomplete = join(workRoot, "incomplete.dgm");
  copyFileSync(smokeDiagram, incomplete);
  if (runInstalledCli(["validate", incomplete], "dumbdiagrams", projectDir) === 0) {
    throw new Error("packed CLI accepted a diagram without its requirements contract");
  }
  const formatCopy = join(workRoot, "packed-format.dgm");
  copyFileSync(smokeDiagram, formatCopy);
  if (
    runInstalledCli(["format", "--write", formatCopy], "dumbdiagrams", projectDir) !== 0 ||
    runInstalledCli(["format", "--check", formatCopy], "dumbdiagrams", projectDir) !== 0
  ) {
    throw new Error("packed dumbdiagrams format failed");
  }
  const firstSvg = join(workRoot, "packed-first.svg");
  const secondSvg = join(workRoot, "packed-second.svg");
  if (
    runInstalledCli(["render", smokeDiagram, "--output", firstSvg], "dumbdiagrams", projectDir) !== 0 ||
    runInstalledCli(["render", smokeDiagram, "--output", secondSvg], "dumbdiagrams", projectDir) !== 0
  ) {
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
  return parseTarballListing(listing);
}

function commandInvocation(command, args) {
  if (!isWindows) return { command, args };
  const cliPath = command === "pnpm" ? pnpmCliPath : npmCliPath;
  return { command: nodeCommand, args: [cliPath, ...args] };
}

function execCommand(command, args, options) {
  const invocation = commandInvocation(command, args);
  return execFileSync(invocation.command, invocation.args, options);
}

function timed(label, action) {
  const start = performance.now();
  console.log(`Package smoke: ${label}`);
  const result = action();
  console.log(`Package smoke: ${label} completed in ${((performance.now() - start) / 1000).toFixed(1)}s`);
  return result;
}

function verifyCorrespondingSource(tarballPath) {
  const extracted = mkdtempSync(join(artifactsDir, "source-"));
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
      ["check:results"],
      [
        "exec",
        "vitest",
        "run",
        "packages/editor/src/editor-model.test.ts",
        "tests/integration/source-manifest.test.ts",
      ],
      ["check:performance"],
      ["exec", "playwright", "test", "--project=chromium", "--list"],
    ];
    for (const args of commands) {
      execCommand("pnpm", args, { cwd: sourceRoot, stdio: "inherit" });
    }
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

// Install the tarball once: every `npx --package=<tgz>` call re-extracts the
// whole package, which took ~5 minutes per call on Windows runners.
function installPackedCli(tarballPath, prefix) {
  mkdirSync(prefix);
  writeFileSync(join(prefix, "package.json"), `${JSON.stringify({ private: true })}\n`);
  // Linux/release smoke keeps npm consumer-install coverage. Windows CI uses
  // pnpm to reuse the workspace store instead of npm's slow tarball install.
  const args =
    installer === "pnpm"
      ? ["--dir", prefix, "--ignore-workspace", "add", "--prod", "--no-lockfile", "--prefer-offline", tarballPath]
      : ["install", "--no-audit", "--no-fund", "--prefix", prefix, tarballPath];
  execCommand(installer, args, {
    // Preserve npm's existing project configuration (including its registry).
    cwd: installer === "pnpm" ? prefix : root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  installedRoot = join(prefix, "node_modules", cliManifest.name);
}

function installedBin(bin) {
  const manifest = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
  if (!manifest.bin?.[bin]) throw new Error(`Installed package does not declare the ${bin} binary`);
  return join(installedRoot, manifest.bin[bin]);
}

function runInstalledCli(args, bin = "dumbdiagrams", cwd = root) {
  try {
    execFileSync(nodeCommand, [installedBin(bin), ...args], {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_yes: "true" },
    });
    return 0;
  } catch (error) {
    const code = error.status;
    return typeof code === "number" ? code : 1;
  }
}

function runInstalledCliCapture(args, bin = "dumbdiagrams") {
  return execFileSync(nodeCommand, [installedBin(bin), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_yes: "true" },
  });
}
