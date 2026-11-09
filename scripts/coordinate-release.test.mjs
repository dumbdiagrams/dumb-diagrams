import assert from "node:assert/strict";
import test from "node:test";

import { coordinateRelease } from "./coordinate-release.mjs";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const repository = { id: 42, full_name: "example/diagrams", default_branch: "main" };

function greenRun(headSha = sha, overrides = {}) {
  return {
    head_sha: headSha,
    head_branch: "main",
    head_repository: { id: repository.id },
    event: "push",
    status: "completed",
    conclusion: "success",
    html_url: "https://github.com/example/diagrams/actions/runs/123",
    ...overrides,
  };
}

function ciEvent(overrides = {}) {
  return {
    repository,
    workflow_run: {
      head_sha: sha,
      head_branch: "main",
      head_repository: { id: repository.id },
      event: "push",
      status: "completed",
      conclusion: "success",
      actor: { login: "AlexJohnSadowski" },
      triggering_actor: { login: "AlexJohnSadowski" },
      ...overrides,
    },
  };
}

function tagEvent(ref = "refs/tags/v1.2.3", overrides = {}) {
  return { repository, ref, deleted: false, ...overrides };
}

function context(eventName, event, overrides = {}) {
  return {
    eventName,
    event,
    actor: "AlexJohnSadowski",
    triggeringActor: "AlexJohnSadowski",
    inputRef: "v1.2.3",
    ...overrides,
  };
}

const registryRelease = {
  name: "create-dumb-diagrams",
  version: "1.2.3",
  dist: { integrity: "sha512-dGVzdA==" },
};

function dependencies({
  tagExists = true,
  tagSha = sha,
  runs = [greenRun()],
  installed = null,
  ancestor = true,
  githubError,
  registryError,
} = {}) {
  const calls = { git: [], github: [], registry: [] };
  const deps = {
    git(args) {
      calls.git.push(args);
      if (args[0] === "show") return JSON.stringify({ version: "1.2.3" });
      if (args[0] === "rev-parse" && tagExists) return tagSha;
      if (args[0] === "rev-parse") throw new Error("tag not found");
      if (args[0] === "merge-base" && !ancestor) throw new Error("not an ancestor");
      return "";
    },
    async github(path, query) {
      calls.github.push({ path, query });
      if (githubError) throw githubError;
      return { workflow_runs: runs };
    },
    async registry(version) {
      calls.registry.push(version);
      if (registryError) throw registryError;
      return installed;
    },
  };
  return { deps, calls };
}

test("tag-first release becomes eligible when successful CI completes", async () => {
  const beforeCi = dependencies({ runs: [] });
  const first = await coordinateRelease(context("push", tagEvent()), beforeCi.deps);
  assert.equal(first.ready, false);

  const afterCi = dependencies();
  const resumed = await coordinateRelease(context("workflow_run", ciEvent()), afterCi.deps);
  assert.deepEqual(
    { ready: resumed.ready, ref: resumed.ref, sha: resumed.sha, version: resumed.version },
    { ready: true, ref: "v1.2.3", sha, version: "1.2.3" },
  );
});

test("CI-first completion waits for the tag event, which then becomes eligible", async () => {
  const beforeTag = dependencies({ tagExists: false });
  const first = await coordinateRelease(context("workflow_run", ciEvent()), beforeTag.deps);
  assert.equal(first.ready, false);

  const afterTag = dependencies();
  const resumed = await coordinateRelease(context("push", tagEvent()), afterTag.deps);
  assert.equal(resumed.ready, true);
  assert.equal(resumed.ref, "v1.2.3");
});

test("CI completion does not qualify when the canonical tag points to another SHA", async () => {
  const { deps } = dependencies({ tagSha: otherSha });
  const result = await coordinateRelease(context("workflow_run", ciEvent()), deps);
  assert.equal(result.ready, false);
});

test("workflow_run ignores untrusted actors, fork runs, PR runs, wrong branches, and failures", async (t) => {
  const cases = [
    ["wrong actor", ciEvent(), { actor: "someone-else" }],
    ["wrong triggering actor", ciEvent(), { triggeringActor: "someone-else" }],
    ["fork", ciEvent({ head_repository: { id: 99 } }), {}],
    ["PR", ciEvent({ event: "pull_request" }), {}],
    ["wrong branch", ciEvent({ head_branch: "feature" }), {}],
    ["failed CI", ciEvent({ conclusion: "failure" }), {}],
    ["wrong CI actor", ciEvent({ actor: { login: "someone-else" } }), {}],
    ["wrong CI triggering actor", ciEvent({ triggering_actor: { login: "someone-else" } }), {}],
  ];

  for (const [name, event, overrides] of cases) {
    await t.test(name, async () => {
      const { deps } = dependencies();
      const result = await coordinateRelease(context("workflow_run", event, overrides), deps);
      assert.equal(result.ready, false);
    });
  }
});

test("a release tag must match the manifest version", async () => {
  const { deps } = dependencies();
  await assert.rejects(
    coordinateRelease(context("push", tagEvent("refs/tags/v1.2.4")), deps),
    /does not match the CLI package version/,
  );
});

test("an invalid release tag is rejected", async () => {
  const { deps } = dependencies();
  await assert.rejects(
    coordinateRelease(context("push", tagEvent("refs/tags/v01.2.3")), deps),
    /exact stable SemVer release tag is required/,
  );
});

test("tag deletion events are ignored", async () => {
  const { deps, calls } = dependencies();
  const result = await coordinateRelease(context("push", tagEvent("refs/tags/v1.2.3", { deleted: true })), deps);
  assert.equal(result.ready, false);
  assert.equal(calls.git.length, 0);
});

test("release commit must be an ancestor of the trusted default branch", async () => {
  const { deps } = dependencies({ ancestor: false });
  await assert.rejects(coordinateRelease(context("push", tagEvent()), deps), /not an ancestor/);
});

test("a successful CI run for another SHA does not qualify", async () => {
  const { deps } = dependencies({ runs: [greenRun(otherSha)] });
  const result = await coordinateRelease(context("push", tagEvent()), deps);
  assert.equal(result.ready, false);
});

test("successful CI query results must match branch, event, repository, status, and conclusion", async (t) => {
  const cases = [
    ["wrong branch", greenRun(sha, { head_branch: "feature" })],
    ["wrong event", greenRun(sha, { event: "pull_request" })],
    ["wrong repository", greenRun(sha, { head_repository: { id: 99 } })],
    ["in-progress status", greenRun(sha, { status: "in_progress" })],
    ["failed conclusion", greenRun(sha, { conclusion: "failure" })],
  ];

  for (const [name, run] of cases) {
    await t.test(name, async () => {
      const { deps } = dependencies({ runs: [run] });
      const result = await coordinateRelease(context("push", tagEvent()), deps);
      assert.equal(result.ready, false);
    });
  }
});

test("GitHub API failures fail closed", async () => {
  const { deps } = dependencies({ githubError: new Error("API unavailable") });
  await assert.rejects(coordinateRelease(context("push", tagEvent()), deps), /API unavailable/);
});

test("automatic events skip an existing npm version while manual dispatch can recover", async () => {
  const automatic = dependencies({ installed: registryRelease });
  const skipped = await coordinateRelease(context("push", tagEvent()), automatic.deps);
  assert.equal(skipped.ready, false);
  assert.deepEqual(automatic.calls.registry, ["1.2.3"]);

  const manual = dependencies({ installed: registryRelease });
  const ready = await coordinateRelease(
    context("workflow_dispatch", { repository }, { inputRef: "v1.2.3" }),
    manual.deps,
  );
  assert.equal(ready.ready, true);
  assert.deepEqual(manual.calls.registry, []);
});

test("malformed npm metadata fails closed", async () => {
  const { deps } = dependencies({ installed: { name: "some-other-package", version: "1.2.3" } });
  await assert.rejects(coordinateRelease(context("push", tagEvent()), deps));
});

test("npm registry failures fail closed", async () => {
  const { deps } = dependencies({ registryError: new Error("registry unavailable") });
  await assert.rejects(coordinateRelease(context("push", tagEvent()), deps), /registry unavailable/);
});
