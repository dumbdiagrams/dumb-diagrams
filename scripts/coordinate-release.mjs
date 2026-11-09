import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const releaseTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const commitSha = /^[a-f0-9]{40}$/;
const publisher = "AlexJohnSadowski";

// All event paths converge here; no credentials or code from a PR are used.
export async function coordinateRelease(context, { git, github, registry }) {
  const { eventName, event, actor, triggeringActor, inputRef } = context;
  const repository = event.repository;
  const defaultBranch = repository.default_branch;
  const skip = (reason) => ({ ready: false, reason });
  if (actor !== publisher || triggeringActor !== publisher) return skip("Untrusted release actor.");

  let tag;
  let sha;
  if (eventName === "workflow_run") {
    const run = event.workflow_run;
    if (
      run?.event !== "push" ||
      run.head_branch !== defaultBranch ||
      run.head_repository?.id !== repository.id ||
      run.conclusion !== "success" ||
      run.actor?.login !== publisher ||
      run.triggering_actor?.login !== publisher
    )
      return skip("Only successful trusted default-branch push CI can resume a release.");
    sha = run.head_sha;
    if (!commitSha.test(sha ?? "")) throw new Error("Invalid CI commit SHA.");
    const manifest = JSON.parse(git(["show", `${sha}:packages/cli/package.json`]));
    tag = `v${manifest.version}`;
    if (!releaseTag.test(tag)) return skip("CI commit has no stable release version.");
    let taggedSha;
    try {
      taggedSha = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
    } catch {
      return skip(`${tag} has not been pushed; its tag event will check eligibility.`);
    }
    if (taggedSha !== sha) return skip(`${tag} belongs to another commit; this is not its release CI run.`);
  } else if (eventName === "push" || eventName === "workflow_dispatch") {
    if (eventName === "push" && (event.deleted || !event.ref?.startsWith("refs/tags/"))) {
      return skip("This is not a release tag creation.");
    }
    tag = eventName === "push" ? event.ref.slice("refs/tags/".length) : inputRef;
    if (!releaseTag.test(tag ?? "")) throw new Error("An exact stable SemVer release tag is required.");
    sha = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
    if (!commitSha.test(sha)) throw new Error("Invalid release commit SHA.");
    const manifest = JSON.parse(git(["show", `${sha}:packages/cli/package.json`]));
    if (tag !== `v${manifest.version}`) throw new Error("Release tag does not match the CLI package version.");
  } else {
    return skip("Unsupported release event.");
  }

  // A green PR run or fork run cannot authorize a release.
  git(["merge-base", "--is-ancestor", sha, `refs/remotes/origin/${defaultBranch}`]);
  const { workflow_runs: runs = [] } = await github(`repos/${repository.full_name}/actions/workflows/ci.yml/runs`, {
    branch: defaultBranch,
    event: "push",
    head_sha: sha,
    status: "success",
    per_page: "100",
  });
  const green = runs.find(
    (run) =>
      run.head_sha === sha &&
      run.head_branch === defaultBranch &&
      run.event === "push" &&
      run.head_repository?.id === repository.id &&
      run.status === "completed" &&
      run.conclusion === "success",
  );
  if (!green) return skip(`CI for ${tag} at ${sha} is not successful yet; CI completion will check eligibility again.`);

  // Release workflows are serialized through publication and registry verification.
  // Automatic duplicate events can therefore finish without another approval.
  if (eventName !== "workflow_dispatch") {
    const existing = await registry(tag.slice(1));
    if (existing) {
      if (
        existing.name !== "create-dumb-diagrams" ||
        existing.version !== tag.slice(1) ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(existing.dist?.integrity ?? "")
      ) {
        throw new Error(`Invalid npm registry metadata for ${tag}; refusing to skip release verification.`);
      }
      return skip(`${tag} already exists on npm. Use manual dispatch to verify or recover a previous publication.`);
    }
  }
  return {
    ready: true,
    ref: tag,
    sha,
    version: tag.slice(1),
    reason: `Eligible release ${tag}; successful CI: ${green.html_url}`,
  };
}

async function requestJson(url, headers = {}, allowNotFound = false) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) throw new Error(`Release API returned HTTP ${response.status} for ${url}`);
  return response.json();
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const result = await coordinateRelease(
    {
      eventName: process.env.GITHUB_EVENT_NAME,
      event,
      actor: process.env.GITHUB_ACTOR,
      triggeringActor: process.env.GITHUB_TRIGGERING_ACTOR,
      inputRef: process.env.INPUT_RELEASE_REF,
    },
    {
      git: (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
      github: (path, query) => {
        const url = new URL(path, `${process.env.GITHUB_API_URL.replace(/\/+$/, "")}/`);
        url.search = new URLSearchParams(query).toString();
        return requestJson(url, {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        });
      },
      registry: (version) =>
        requestJson(
          `https://registry.npmjs.org/create-dumb-diagrams/${version}`,
          { "Cache-Control": "no-cache", Accept: "application/json" },
          true,
        ),
    },
  );
  console.log(result.reason);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.reason}\n`);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `ready=${result.ready}\n` +
      (result.ready ? `ref=${result.ref}\nsha=${result.sha}\nversion=${result.version}\n` : ""),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
