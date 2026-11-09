import { execFileSync } from "node:child_process";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function compareVersions(a, b) {
  const left = a.split(".").map(BigInt);
  const right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export function findPreviousReleaseTag({ cwd, version, to = "HEAD" }) {
  if (!stableVersion.test(version ?? "")) throw new Error("Expected a stable release version.");
  return git(cwd, ["tag", "--merged", to, "--list", "v*"])
    .trim()
    .split("\n")
    .filter((tag) => stableVersion.test(tag.slice(1)) && compareVersions(tag.slice(1), version) < 0)
    .sort((a, b) => compareVersions(b.slice(1), a.slice(1)))[0];
}

export function collectReleaseCommits({ cwd, from, to = "HEAD" }) {
  const fields = git(cwd, ["log", "--no-merges", "--format=%H%x00%s%x00%b%x00", from ? `${from}..${to}` : to]).split(
    "\0",
  );
  const commits = [];
  for (let i = 0; i + 2 < fields.length; i += 3) {
    commits.push({ hash: fields[i].trim(), subject: fields[i + 1].trim(), body: fields[i + 2].trim() });
  }
  return commits;
}

export function renderReleaseNotes(commits, { repositoryUrl } = {}) {
  const groups = new Map([
    ["Breaking Changes", []],
    ["Added", []],
    ["Changed", []],
    ["Fixed", []],
    ["Documentation", []],
    ["Tests", []],
  ]);
  const categories = new Map([
    ["feat", "Added"],
    ["fix", "Fixed"],
    ["docs", "Documentation"],
    ["test", "Tests"],
  ]);
  for (const { hash, subject, body = "" } of commits) {
    const match = /^([a-z][a-z0-9-]*)(?:\(([^)]+)\))?(!)?:\s+(.+)$/.exec(subject);
    const [, type, scope, bang, description] = match ?? [];
    const breaking = /^BREAKING[ -]CHANGES?:\s*(.*)$/m.exec(body);
    if (
      !bang &&
      !breaking &&
      type === "chore" &&
      scope === "release" &&
      /^(?:bump\s+(?:(?:workspace|package)\s+)?versions?\b|(?:bump(?: to)?|prepare(?: release)?|release)\s+v?\d+\.\d+\.\d+\b)/i.test(
        description,
      )
    )
      continue;
    const group = bang || breaking ? "Breaking Changes" : (categories.get(type) ?? "Changed");
    const summary = match ? `${scope ? `**${scope}:** ` : ""}${description}` : subject;
    const detail = breaking?.[1] ? ` — ${breaking[1]}` : "";
    const reference = repositoryUrl
      ? `[${hash.slice(0, 7)}](${repositoryUrl.replace(/\/$/, "")}/commit/${hash})`
      : hash.slice(0, 7);
    groups.get(group).push(`- ${summary}${detail} (${reference})`);
  }
  return [...groups]
    .filter(([, entries]) => entries.length)
    .map(([heading, entries]) => `### ${heading}\n\n${entries.join("\n")}`)
    .join("\n\n");
}

export function generateReleaseNotes({ cwd, version, to = "HEAD" }) {
  const from = findPreviousReleaseTag({ cwd, version, to });
  const commits = collectReleaseCommits({ cwd, from, to });
  let repositoryUrl;
  try {
    const remote = git(cwd, ["remote", "get-url", "origin"]).trim();
    const url = new URL(remote.replace(/^git@([^:]+):/, "https://$1/"));
    if (["https:", "http:", "ssh:"].includes(url.protocol)) {
      repositoryUrl = `https://${url.host}${url.pathname.replace(/\.git$/, "").replace(/\/$/, "")}`;
    }
  } catch {
    // Offline/local repositories can still generate notes with commit hashes.
  }
  return { notes: renderReleaseNotes(commits, { repositoryUrl }), from, commits };
}

function section(changelog, version) {
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\][^\n]*$/gm)];
  const index = headings.findIndex((match) => match[1] === version);
  if (index < 0) return undefined;
  const heading = headings[index];
  return {
    start: heading.index,
    contentStart: heading.index + heading[0].length,
    end: headings[index + 1]?.index ?? changelog.length,
  };
}

export function releaseHasNotes(changelog, version) {
  const release = section(changelog, version);
  if (!release) return false;
  return Boolean(
    changelog
      .slice(release.contentStart, release.end)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^#{1,6}[^\n]*$/gm, "")
      .replace(/^[\s*+-]*$/gm, "")
      .trim(),
  );
}

export function prepareChangelog(changelog, { version, date, notes }) {
  if (!stableVersion.test(version ?? "")) throw new Error("Expected a stable release version.");
  if (section(changelog, version)) throw new Error(`CHANGELOG.md already contains a ${version} section.`);
  const unreleased = section(changelog, "Unreleased");
  const firstRelease = changelog.search(/^## \[/m);
  if (!unreleased && firstRelease < 0) throw new Error("CHANGELOG.md needs a release heading before preparation.");
  const manual = unreleased ? changelog.slice(unreleased.contentStart, unreleased.end).trim() : "";
  const generated = manual && notes ? `### Commit history\n\n${notes.replace(/^### /gm, "#### ")}` : notes;
  const content = [manual, generated].filter(Boolean).join("\n\n");
  const start = unreleased?.start ?? firstRelease;
  const historyStart = unreleased?.end ?? firstRelease;
  const result = `${changelog.slice(0, start).trimEnd()}\n\n## [Unreleased]\n\n## [${version}] - ${date}\n\n${content}\n\n${changelog.slice(historyStart).trimStart()}`;
  if (!releaseHasNotes(result, version)) throw new Error("No changes to document since the previous release tag.");
  return result;
}
