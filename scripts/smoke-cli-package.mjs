import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactsDir = join(root, ".artifacts");
const cliPackageRoot = join(root, "packages/cli");
const cliManifest = JSON.parse(readFileSync(join(cliPackageRoot, "package.json"), "utf8"));
const version = cliManifest.version;
const tarballName = `dumbdiagrams-${version}.tgz`;
const tarballPath = join(artifactsDir, tarballName);

mkdirSync(artifactsDir, { recursive: true });

execFileSync("pnpm", ["--dir", cliPackageRoot, "pack", "--pack-destination", artifactsDir], {
  cwd: root,
  stdio: "inherit",
});

if (!existsSync(tarballPath)) {
  throw new Error(`Expected tarball at ${tarballPath}`);
}

const entries = listTarballEntries(tarballPath);
const required = [
  "package/dist/index.js",
  "package/dist/studio/index.html",
  "package/dist/templates/project/DUMB_DIAGRAMS.md",
  "package/dist/templates/examples/README.md",
  "package/dist/templates/examples/aws-high-availability-web-app.dgm",
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
  for (const pattern of forbiddenPatterns) {
    if (entry.includes(pattern)) {
      throw new Error(`Tarball should not include ${pattern}: ${entry}`);
    }
  }
}

const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-smoke-"));
const projectDir = join(workRoot, "smoke-project");
try {
  runNpx(tarballPath, ["init", projectDir, "--yes", "--name", "Smoke Test"]);
  const diagramPath = join(projectDir, "diagrams", "architecture.dgm");
  if (!existsSync(diagramPath)) {
    throw new Error("init did not create starter diagram");
  }

  const validateCode = runNpx(tarballPath, ["validate", join(projectDir, "diagrams")]);
  if (validateCode !== 0) {
    throw new Error(`validate failed with exit code ${validateCode}`);
  }

  const outputSvg = join(workRoot, "output.svg");
  const renderCode = runNpx(tarballPath, [
    "render",
    diagramPath,
    "--output",
    outputSvg,
  ]);
  if (renderCode !== 0) {
    throw new Error(`render failed with exit code ${renderCode}`);
  }
  if (!existsSync(outputSvg)) {
    throw new Error("render did not create output.svg");
  }

  const helpOut = runNpxCapture(tarballPath, ["help"]);
  if (!helpOut.includes("studio")) {
    throw new Error("help output missing studio command");
  }

  const versionOut = runNpxCapture(tarballPath, ["--version"]);
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

function runNpx(tarballPath, args, bin = "dumbdiagrams") {
  try {
    execFileSync(
      "npx",
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
    "npx",
    ["--yes", `--package=${tarballPath}`, bin, ...args],
    { cwd: root, encoding: "utf8", env: { ...process.env, npm_config_yes: "true" } },
  );
}
