import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyNpmRelease } from "./verify-npm-release.mjs";

const metadata = { name: "create-dumb-diagrams", version: "0.1.0", dist: { integrity: "sha512-abc=" } };
function harness(responses, overrides = {}) {
  let elapsed = 0;
  let calls = 0;
  const logs = [];
  return {
    options: {
      packageName: metadata.name,
      version: metadata.version,
      integrity: metadata.dist.integrity,
      now: () => elapsed,
      sleep: async (ms) => {
        elapsed += ms;
      },
      fetchImpl: async (url, options) => {
        assert.equal(url, "https://registry.npmjs.org/create-dumb-diagrams/0.1.0");
        assert.equal(options.headers["Cache-Control"], "no-cache");
        const response = responses[Math.min(calls++, responses.length - 1)];
        if (response instanceof Error) throw response;
        return { ok: response === 200, status: response, json: async () => metadata };
      },
      log: (message) => logs.push(message),
      ...overrides,
    },
    calls: () => calls,
    elapsed: () => elapsed,
    logs,
  };
}

test("waits through propagation beyond the old two-minute window", async () => {
  const h = harness([...Array(10).fill(404), 200]);
  await verifyNpmRelease(h.options);
  assert.equal(h.elapsed(), 150_000);
  assert.equal(h.calls(), 11);
  assert.match(h.logs.at(-1), /exact artifact integrity/);
});

test("retries network errors, rate limiting and registry outages", async () => {
  const h = harness([new Error("connection reset"), 429, 503, 200]);
  await verifyNpmRelease(h.options);
  assert.equal(h.calls(), 4);
});

test("fails immediately on integrity mismatch", async () => {
  const h = harness([200], { integrity: "sha512-other=" });
  await assert.rejects(verifyNpmRelease(h.options), /artifact mismatch/);
  assert.equal(h.calls(), 1);
});

test("fails immediately on non-retryable registry errors", async () => {
  const h = harness([403]);
  await assert.rejects(verifyNpmRelease(h.options), /HTTP 403/);
  assert.equal(h.calls(), 1);
});

test("bounds waiting and reports a verification-only recovery command", async () => {
  const h = harness([404], { timeoutMs: 31_000 });
  await assert.rejects(verifyNpmRelease(h.options), /Do not republish.*EXPECTED_INTEGRITY=sha512-abc=/);
  assert.equal(h.elapsed(), 31_000);
  assert.equal(h.calls(), 3);
});
