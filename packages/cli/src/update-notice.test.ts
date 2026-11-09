import { afterEach, describe, expect, it, vi } from "vitest";

import { checkCliVersion } from "./update-notice.js";

const registryUrl = "https://registry.npmjs.org/create-dumb-diagrams";

function mockLatest(latest: unknown, response: Partial<Response> = {}) {
  const json = vi.fn().mockResolvedValue({ "dist-tags": { latest } });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, json };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkCliVersion", () => {
  it("reports latest when installed and registry versions are equal", async () => {
    mockLatest("1.2.3");

    await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "latest", latestVersion: "1.2.3" });
  });

  it("reports an available update when the registry version is newer", async () => {
    const { fetchMock } = mockLatest("1.3.0");

    await expect(checkCliVersion("1.2.3")).resolves.toEqual({
      status: "update-available",
      latestVersion: "1.3.0",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      registryUrl,
      expect.objectContaining({ headers: { Accept: "application/vnd.npm.install-v1+json" } }),
    );
  });

  it("reports ahead when the installed version is newer than the registry", async () => {
    mockLatest("1.2.3");

    await expect(checkCliVersion("1.2.4")).resolves.toEqual({ status: "ahead", latestVersion: "1.2.3" });
  });

  it("orders a stable release after a prerelease", async () => {
    mockLatest("2.0.0");

    await expect(checkCliVersion("2.0.0-rc.1")).resolves.toEqual({
      status: "update-available",
      latestVersion: "2.0.0",
    });
  });

  it("compares numeric prerelease identifiers numerically", async () => {
    mockLatest("2.0.0-alpha.10");

    await expect(checkCliVersion("2.0.0-alpha.2")).resolves.toEqual({
      status: "update-available",
      latestVersion: "2.0.0-alpha.10",
    });
  });

  it("ignores build metadata when comparing versions", async () => {
    mockLatest("1.2.3+registry.5");

    await expect(checkCliVersion("1.2.3+installed.1")).resolves.toEqual({
      status: "latest",
      latestVersion: "1.2.3+registry.5",
    });
  });

  it.each(["1.02.3", "1.2.3-alpha.01", "not-a-version"])(
    "returns unavailable and does not fetch when installed version %s is invalid",
    async (installedVersion) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(checkCliVersion(installedVersion)).resolves.toEqual({ status: "unavailable" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["1.02.3", "1.2.3-alpha.01", "not-a-version"])(
    "returns unavailable for invalid registry version %s",
    async (latest) => {
      mockLatest(latest);

      await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "unavailable" });
    },
  );

  it("returns unavailable on an HTTP failure", async () => {
    mockLatest("1.3.0", { ok: false });

    await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the response is invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON")) }),
    );

    await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "unavailable" });
  });

  it.each([{}, { "dist-tags": {} }, { "dist-tags": { latest: 42 } }])(
    "returns unavailable when latest metadata is missing or malformed",
    async (payload) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(payload) }));

      await expect(checkCliVersion("1.2.3")).resolves.toEqual({ status: "unavailable" });
    },
  );
});
