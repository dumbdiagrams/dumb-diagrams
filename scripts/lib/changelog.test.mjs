import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  collectReleaseCommits,
  findPreviousReleaseTag,
  generateReleaseNotes,
  prepareChangelog,
  releaseHasNotes,
  renderReleaseNotes,
} from "./changelog.mjs";

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function temporaryRepository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "dumb-diagrams-changelog-"));
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Changelog Test"]);
  git(["config", "user.email", "changelog-test@example.invalid"]);
  let commitNumber = 0;
  const commit = (subject, body = "") => {
    commitNumber += 1;
    writeFileSync(join(cwd, `commit-${commitNumber}.txt`), `${subject}\n${body}\n`);
    git(["add", "."]);
    git(["commit", "-m", subject, ...(body ? ["-m", body] : [])]);
    return git(["rev-parse", "HEAD"]);
  };
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return { cwd, git, commit };
}

test("findPreviousReleaseTag selects the highest reachable stable version below the target", (t) => {
  const { cwd, git, commit } = temporaryRepository(t);
  commit("chore: initial commit");
  git(["tag", "v1.2.0"]);
  commit("feat: add release notes");
  git(["tag", "v1.9.0"]);
  commit("fix: stabilize release");
  git(["tag", "v1.10.0-rc.1"]);
  git(["tag", "not-a-version"]);

  git(["checkout", "--orphan", "unreachable"]);
  commit("feat: unreachable release");
  git(["tag", "v1.99.0"]);
  git(["checkout", "main"]);

  assert.equal(findPreviousReleaseTag({ cwd, version: "2.0.0" }), "v1.9.0");
  assert.equal(findPreviousReleaseTag({ cwd, version: "1.2.0" }), undefined);
});

test("collectReleaseCommits returns commit details in the range and excludes merge commits", (t) => {
  const { cwd, git, commit } = temporaryRepository(t);
  commit("chore: initial commit");
  git(["tag", "v1.0.0"]);
  git(["checkout", "-b", "feature"]);
  commit("fix: repair branch behavior", "Keep the branch path intact.");
  git(["checkout", "main"]);
  commit("feat: add main behavior");
  git(["merge", "--no-ff", "feature", "-m", "Merge feature branch"]);

  const commits = collectReleaseCommits({ cwd, from: "v1.0.0", to: "HEAD" });
  assert.deepEqual(commits.map(({ subject }) => subject).sort(), [
    "feat: add main behavior",
    "fix: repair branch behavior",
  ]);
  const fix = commits.find(({ subject }) => subject.startsWith("fix:"));
  assert.equal(fix?.body, "Keep the branch path intact.");
  assert.match(fix?.hash ?? "", /^[a-f0-9]{40}$/);
});

test("renderReleaseNotes categorizes conventional commits and retains short references", () => {
  const notes = renderReleaseNotes(
    [
      { hash: "abcdef0123456789", subject: "feat: add export", body: "" },
      { hash: "bcdef0123456789a", subject: "fix(cli): handle empty input", body: "" },
      { hash: "cdef0123456789ab", subject: "perf: speed up routing", body: "" },
      { hash: "def0123456789abc", subject: "docs: explain releases", body: "" },
      { hash: "ef0123456789abcd", subject: "test: cover registry outage", body: "" },
      { hash: "f0123456789abcde", subject: "refactor: simplify parser", body: "" },
      { hash: "0123456789abcdef", subject: "ci: verify package", body: "" },
    ],
    { repositoryUrl: "https://github.com/example/diagrams" },
  );

  assert.match(notes, /(?:^|\n)#{1,4} Added\b/);
  assert.match(notes, /(?:^|\n)#{1,4} Fixed\b/);
  assert.match(notes, /(?:^|\n)#{1,4} Changed\b/);
  assert.match(notes, /(?:^|\n)#{1,4} Documentation\b/);
  assert.match(notes, /(?:^|\n)#{1,4} Tests\b/);
  assert.match(notes, /add export/);
  assert.match(notes, /handle empty input/);
  assert.match(notes, /speed up routing/);
  assert.match(notes, /explain releases/);
  assert.match(notes, /cover registry outage/);
  assert.match(notes, /abcdef0/);
  assert.match(notes, /https:\/\/github\.com\/example\/diagrams\/commit\/abcdef0123456789/);
});

test("renderReleaseNotes puts breaking changes in their own group", () => {
  const notes = renderReleaseNotes([
    { hash: "a".repeat(40), subject: "feat!: replace config shape", body: "" },
    {
      hash: "b".repeat(40),
      subject: "refactor: remove deprecated option",
      body: "BREAKING CHANGE: The old option is no longer accepted.",
    },
    { hash: "c".repeat(40), subject: "chore(release)!: bump workspace versions", body: "" },
  ]);

  assert.match(notes, /(?:^|\n)#{1,4} Breaking Changes\b/);
  assert.match(notes, /replace config shape/);
  assert.match(notes, /old option is no longer accepted/);
  assert.match(notes, /bump workspace versions/);
});

test("renderReleaseNotes filters release bookkeeping but keeps meaningful and nonconventional work", () => {
  const notes = renderReleaseNotes([
    { hash: "a".repeat(40), subject: "chore(release): prepare 1.2.3", body: "" },
    { hash: "b".repeat(40), subject: "chore(release): bump workspace versions", body: "" },
    { hash: "c".repeat(40), subject: "chore(release): automate artifact signing", body: "" },
    { hash: "d".repeat(40), subject: "Update the getting started guide", body: "" },
  ]);

  assert.doesNotMatch(notes, /prepare 1\.2\.3/);
  assert.doesNotMatch(notes, /bump workspace versions/);
  assert.match(notes, /automate artifact signing/);
  assert.match(notes, /Update the getting started guide/);
});

test("prepareChangelog moves handwritten Unreleased notes and preserves history", () => {
  const original = `# Changelog

## [Unreleased]

Human authored release note.

## [0.2.0] - 2026-01-01

Old release remains untouched.
`;
  const prepared = prepareChangelog(original, {
    version: "0.3.0",
    date: "2026-11-09",
    notes: "#### Added\n\n- Generated commit summary.",
  });

  assert.ok(prepared.indexOf("## [Unreleased]") < prepared.indexOf("## [0.3.0] - 2026-11-09"));
  assert.ok(prepared.indexOf("## [0.3.0] - 2026-11-09") < prepared.indexOf("## [0.2.0] - 2026-01-01"));
  assert.match(prepared, /Human authored release note\./);
  assert.match(prepared, /### Commit history\n\n#### Added\n\n- Generated commit summary\./);
  assert.match(prepared, /Old release remains untouched\./);
});

test("prepareChangelog emits generated history without an empty manual section", () => {
  const prepared = prepareChangelog("# Changelog\n\n## [Unreleased]\n", {
    version: "0.3.0",
    date: "2026-11-09",
    notes: "#### Fixed\n\n- Corrected a regression.",
  });

  assert.match(prepared, /## \[0\.3\.0\] - 2026-11-09/);
  assert.match(prepared, /#### Fixed/);
  assert.doesNotMatch(prepared, /### Manual release notes/);
});

test("prepareChangelog rejects a duplicate version section", () => {
  const original = "# Changelog\n\n## [Unreleased]\n\n## [0.3.0] - 2026-11-01\n\nExisting.\n";

  assert.throws(
    () => prepareChangelog(original, { version: "0.3.0", date: "2026-11-09", notes: "" }),
    /already (?:exists|contains)|duplicate/i,
  );
});

test("prepareChangelog rejects a release with no meaningful manual or generated notes", () => {
  assert.throws(
    () =>
      prepareChangelog("# Changelog\n\n## [Unreleased]\n\n### Added\n\n<!-- draft -->\n", {
        version: "0.3.0",
        date: "2026-11-09",
        notes: "",
      }),
    /No changes to document/,
  );
});

test("releaseHasNotes ignores headings, whitespace, and HTML comments", () => {
  assert.equal(
    releaseHasNotes("# Changelog\n\n## [Unreleased]\n\n### Added\n\n<!-- draft note -->\n", "Unreleased"),
    false,
  );
  assert.equal(releaseHasNotes("## [1.2.3] - 2026-11-09\n\n### Fixed\n\n<!-- generated later -->\n", "1.2.3"), false);
  assert.equal(releaseHasNotes("## [1.2.3] - 2026-11-09\n\nA useful note.\n", "1.2.3"), true);
});

function temporaryVersionFixture(t, changelog) {
  const cwd = mkdtempSync(join(tmpdir(), "dumb-diagrams-version-check-"));
  const packageRoot = join(cwd, "packages", "cli");
  const scriptRoot = join(cwd, "scripts");
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(join(scriptRoot, "lib"), { recursive: true });
  mkdirSync(join(cwd, "docs"), { recursive: true });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ license: "AGPL-3.0-only" }));
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "create-dumb-diagrams", version: "0.3.0", license: "AGPL-3.0-only" }),
  );
  writeFileSync(join(cwd, "CHANGELOG.md"), changelog);
  writeFileSync(join(cwd, "docs", "RELEASE.md"), "Release tag v0.3.0\n");
  cpSync(join(scriptsDir, "check-versions.mjs"), join(scriptRoot, "check-versions.mjs"));
  cpSync(join(scriptsDir, "lib", "changelog.mjs"), join(scriptRoot, "lib", "changelog.mjs"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return { cwd, script: join(scriptRoot, "check-versions.mjs") };
}

test("check-versions rejects a current release section that has only headings and comments", (t) => {
  const { cwd, script } = temporaryVersionFixture(
    t,
    "# Changelog\n\n## [0.3.0] - 2026-11-09\n\n### Added\n\n<!-- notes pending -->\n",
  );

  assert.throws(
    () => execFileSync("node", [script], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    (error) => error.status === 1 && error.stderr.toString().includes("needs release notes"),
  );
});

test("check-versions accepts a current release section with actual notes", (t) => {
  const { cwd, script } = temporaryVersionFixture(
    t,
    "# Changelog\n\n## [0.3.0] - 2026-11-09\n\n### Added\n\n- Add a new feature.\n",
  );

  const output = execFileSync("node", [script], { cwd, encoding: "utf8" });
  assert.match(output, /OK 1 workspace packages at 0\.3\.0/);
});

test("generateReleaseNotes uses the prior stable tag and returns its commit range", (t) => {
  const { cwd, git, commit } = temporaryRepository(t);
  commit("chore: initial commit");
  git(["tag", "v1.0.0"]);
  commit("feat: add export", "Export SVG to a file.");
  const target = commit("fix: repair export", "Preserve the output directory.");
  git(["tag", "v1.1.0-rc.1"]);

  const generated = generateReleaseNotes({ cwd, version: "1.1.0", to: target });
  assert.equal(generated.from, "v1.0.0");
  assert.deepEqual(
    generated.commits.map(({ subject }) => subject),
    ["fix: repair export", "feat: add export"],
  );
  assert.match(generated.notes, /add export/);
  assert.match(generated.notes, /repair export/);
});

test("generateReleaseNotes includes all reachable commits for the first release", (t) => {
  const { cwd, commit } = temporaryRepository(t);
  commit("docs: document first release");

  const generated = generateReleaseNotes({ cwd, version: "0.1.0", to: "HEAD" });
  assert.equal(generated.from, undefined);
  assert.equal(generated.commits.length, 1);
  assert.match(generated.notes, /document first release/);
});
