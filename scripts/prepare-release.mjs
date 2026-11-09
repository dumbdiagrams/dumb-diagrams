import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateReleaseNotes, prepareChangelog } from "./lib/changelog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const packagesRoot = join(root, "packages");
const version = process.argv[2];
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

if (process.argv.length !== 3 || !versionPattern.test(version ?? "")) {
  fail("Usage: pnpm release:prepare <major.minor.patch>");
}

if (git(["status", "--porcelain"])) fail("Start release preparation from a clean working tree.");
const branch = git(["branch", "--show-current"]);
if (branch !== "main") fail("Run release preparation from main; the command creates the release branch.");

run("git", ["fetch", "origin", "--tags"]);
const head = git(["rev-parse", "HEAD"]);
const originMain = git(["rev-parse", "refs/remotes/origin/main"]);
try {
  git(["merge-base", "--is-ancestor", head, originMain]);
} catch {
  fail("Local main has diverged from origin/main. Update it before preparing a release.");
}
if (head !== originMain) run("git", ["merge", "--ff-only", "origin/main"]);

run(process.execPath, ["scripts/check-versions.mjs"]);

const cliManifestPath = join(packagesRoot, "cli/package.json");
const currentVersion = JSON.parse(readFileSync(cliManifestPath, "utf8")).version;
if (compareVersions(version, currentVersion) <= 0) {
  fail(`New version ${version} must be greater than current version ${currentVersion}.`);
}

const changelogPath = join(root, "CHANGELOG.md");
let changelog = readFileSync(changelogPath, "utf8");
if (new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m").test(changelog)) {
  fail(`CHANGELOG.md already contains a ${version} section.`);
}

const date = new Date().toISOString().slice(0, 10);
const generated = generateReleaseNotes({ cwd: root, version });
changelog = prepareChangelog(changelog, { version, date, notes: generated.notes });
console.log(`Generated changelog from ${generated.from ?? "the start of repository history"} to HEAD.`);

const releasePath = join(root, "docs/RELEASE.md");
const releaseDocs = readFileSync(releasePath, "utf8");
const currentVersionPattern = /^The current workspace version is `[^`]+` \(release tag `v[^`]+`\)\.$/m;
if (!currentVersionPattern.test(releaseDocs)) fail("Could not find the current version line in docs/RELEASE.md.");
const updatedReleaseDocs = releaseDocs.replace(
  currentVersionPattern,
  `The current workspace version is \`${version}\` (release tag \`v${version}\`).`,
);

const packageManifests = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesRoot, entry.name, "package.json"))
  .filter(existsSync);

const releaseBranch = `chore/release-${version}`;
if (git(["branch", "--list", releaseBranch]) || git(["branch", "--remotes", "--list", `origin/${releaseBranch}`])) {
  fail(`Branch ${releaseBranch} already exists.`);
}
run("git", ["switch", "-c", releaseBranch]);

for (const filename of packageManifests) {
  const manifest = JSON.parse(readFileSync(filename, "utf8"));
  manifest.version = version;
  writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`);
}
writeFileSync(changelogPath, changelog);
writeFileSync(releasePath, updatedReleaseDocs);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
run(pnpm, ["install", "--lockfile-only", "--ignore-scripts"]);
run(process.execPath, ["scripts/check-versions.mjs"]);

console.log(`Prepared ${version} on ${releaseBranch}. Review the generated CHANGELOG.md notes before opening the PR.`);
