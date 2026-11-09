import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return typeof output === "string" ? output.trim() : "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--push")) {
  fail("Usage: pnpm release:tag [--push]");
}
const push = args[0] === "--push";

const branch = git(["branch", "--show-current"]);
if (branch !== "main") fail("Create release tags from main after its CI passes.");
if (git(["status", "--porcelain"])) fail("Commit or remove working tree changes before tagging a release.");

git(["fetch", "origin", "--tags"], { stdio: "inherit" });

let head = git(["rev-parse", "HEAD"]);
const originMain = git(["rev-parse", "refs/remotes/origin/main"]);
try {
  git(["merge-base", "--is-ancestor", head, originMain]);
} catch {
  fail("Local main has diverged from origin/main. Resolve it before tagging a release.");
}
if (head !== originMain) {
  git(["merge", "--ff-only", "origin/main"], { stdio: "inherit" });
  head = git(["rev-parse", "HEAD"]);
}

const version = JSON.parse(readFileSync("packages/cli/package.json", "utf8")).version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "")) {
  fail(`Expected a stable SemVer package version, got ${version ?? "<missing>"}.`);
}

execFileSync(process.execPath, ["scripts/check-versions.mjs"], { stdio: "inherit" });

const tag = `v${version}`;
const existingTag = git(["tag", "--list", tag]);
if (existingTag) {
  const taggedCommit = git(["rev-parse", `${tag}^{commit}`]);
  if (taggedCommit !== head) {
    fail(`${tag} already points to another commit. Remove an unpublished failed tag before retrying.`);
  }
  if (!push) fail(`${tag} already exists on this commit. Use pnpm release:tag --push to push it.`);
} else {
  git(["tag", "-a", tag, "-m", `Release ${tag}`]);
}

if (push) {
  git(["push", "origin", tag], { stdio: "inherit" });
  console.log(`Pushed ${tag}; GitHub Actions will run the npm release workflow.`);
} else {
  console.log(`Created ${tag} on ${head}. Push it with: git push origin ${tag}`);
}
