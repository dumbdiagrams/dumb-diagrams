import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const validator = fileURLToPath(new URL("../../scripts/validate-release-ref.mjs", import.meta.url));
const fixtureRoots: string[] = [];

function runGit(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function createFixture(withRemote = true) {
  const root = mkdtempSync(join(tmpdir(), "release-ref-")).toString();
  fixtureRoots.push(root);
  runGit(root, "init", "--quiet", "--initial-branch=main");
  runGit(root, "config", "user.name", "Release Ref Test");
  runGit(root, "config", "user.email", "release-ref@example.test");
  writeFileSync(join(root, "file.txt"), "first\n");
  runGit(root, "add", "file.txt");
  runGit(root, "commit", "--quiet", "-m", "first");
  const firstCommit = runGit(root, "rev-parse", "HEAD");

  if (withRemote) {
    const remote = join(root, "origin.git");
    execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
    runGit(root, "remote", "add", "origin", remote);
    runGit(root, "push", "--quiet", "--set-upstream", "origin", "main");
    runGit(root, "fetch", "--quiet", "origin");
    runGit(root, "remote", "set-head", "origin", "main");
  }
  return { root, firstCommit };
}

function runValidator(root: string, releaseRef: string) {
  try {
    const stdout = execFileSync("node", [validator], {
      cwd: root,
      env: { ...process.env, RELEASE_REF: releaseRef },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
  }
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release ref validation", () => {
  it("accepts an old release tag that is an ancestor of origin's default branch", () => {
    const { root, firstCommit } = createFixture();
    runGit(root, "tag", "v1.2.3", firstCommit);
    writeFileSync(join(root, "file.txt"), "second\n");
    runGit(root, "commit", "--quiet", "-am", "second");
    runGit(root, "push", "--quiet", "origin", "main");
    runGit(root, "fetch", "--quiet", "origin");
    runGit(root, "checkout", "--quiet", "v1.2.3");

    const result = runValidator(root, "v1.2.3");
    expect(result.status).toBe(0);
    expect(result.output).toContain("Validated release ref v1.2.3 on origin/main");
  });

  it("rejects a tag when checked-out HEAD is different", () => {
    const { root } = createFixture();
    runGit(root, "tag", "v1.2.3");
    writeFileSync(join(root, "file.txt"), "second\n");
    runGit(root, "commit", "--quiet", "-am", "second");
    runGit(root, "push", "--quiet", "origin", "main");
    runGit(root, "fetch", "--quiet", "origin");

    expect(runValidator(root, "v1.2.3").output).toContain("does not point to the checked-out HEAD");
  });

  it("rejects a tag commit that is not reachable from origin's default branch", () => {
    const { root } = createFixture();
    runGit(root, "checkout", "--quiet", "--orphan", "unmerged");
    runGit(root, "rm", "--quiet", "-f", "file.txt");
    writeFileSync(join(root, "other.txt"), "unmerged\n");
    runGit(root, "add", "other.txt");
    runGit(root, "commit", "--quiet", "-m", "unmerged");
    runGit(root, "tag", "v1.2.3");

    expect(runValidator(root, "v1.2.3").output).toContain(
      "not reachable from the trusted default branch origin/main",
    );
  });

  it("fails closed when no trusted remote default branch is available", () => {
    const { root } = createFixture(false);
    runGit(root, "tag", "v1.2.3");

    expect(runValidator(root, "v1.2.3").output).toContain("No trusted origin default branch is available");
  });

  it("falls back to origin/main or origin/master when origin/HEAD is missing", () => {
    const mainFixture = createFixture();
    runGit(mainFixture.root, "tag", "v1.2.3");
    runGit(mainFixture.root, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
    expect(runValidator(mainFixture.root, "v1.2.3").output).toContain("Validated release ref v1.2.3 on origin/main");

    const masterFixture = createFixture();
    runGit(masterFixture.root, "tag", "v1.2.3");
    runGit(masterFixture.root, "symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
    runGit(masterFixture.root, "update-ref", "-d", "refs/remotes/origin/main");
    runGit(masterFixture.root, "update-ref", "refs/remotes/origin/master", masterFixture.firstCommit);
    expect(runValidator(masterFixture.root, "v1.2.3").output).toContain(
      "Validated release ref v1.2.3 on origin/master",
    );
  });

  it("rejects malformed and missing release tags", () => {
    const { root } = createFixture();

    expect(runValidator(root, "1.2.3").output).toContain("Expected an exact semver release tag");
    expect(runValidator(root, "v1.2.3").output).toContain("is not an existing commit tag");
  });
});
