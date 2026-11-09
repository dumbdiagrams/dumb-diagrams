import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "./index.js";
import * as updates from "./update-notice.js";
import { readCliVersion } from "./version.js";

const version = readCliVersion();
const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

describe("CLI version footer", () => {
  beforeEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    vi.stubEnv("CI", "");
    vi.stubEnv("NO_UPDATE_NOTIFIER", "");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(updates, "checkCliVersion").mockResolvedValue({ status: "latest", latestVersion: version });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (stdoutTty) Object.defineProperty(process.stdout, "isTTY", stdoutTty);
    else Reflect.deleteProperty(process.stdout, "isTTY");
    if (stdinTty) Object.defineProperty(process.stdin, "isTTY", stdinTty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
  });

  const output = () => vi.mocked(console.log).mock.calls.flat().join("\n");

  it.each([[], ["help"], ["--help"], ["-h"], ["init", "--help"], ["render", "--help=true"]])(
    "ends help output with the installed version and confirmed latest status: %j",
    async (...args: string[]) => {
      expect(await runCli(args)).toBe(0);
      const text = output();
      expect(text).toContain(`v${version} · You're on the latest version`);
      expect(text.lastIndexOf("You're on the latest version")).toBeGreaterThan(text.indexOf("Tip:"));
      expect(updates.checkCliVersion).toHaveBeenCalledWith(version);
    },
  );

  it("places the footer after successful project setup and privacy information", async () => {
    const previous = process.cwd();
    const root = mkdtempSync(join(tmpdir(), "dgm-version-footer-"));
    try {
      process.chdir(root);
      expect(await runCli(["init"])).toBe(0);
      const text = output();
      expect(text).toContain("Project ready");
      expect(text.lastIndexOf(`v${version}`)).toBeGreaterThan(text.indexOf("Whichever Studio"));
      expect(text).toContain("You're on the latest version");
    } finally {
      process.chdir(previous);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("suggests an optional update without changing command success", async () => {
    vi.mocked(updates.checkCliVersion).mockResolvedValue({ status: "update-available", latestVersion: "99.0.0" });
    expect(await runCli(["help"])).toBe(0);
    expect(output()).toContain(`v${version} · New version available: v99.0.0`);
    expect(output()).toContain("When convenient, run npm install -g create-dumb-diagrams@latest");
  });

  it("reports an unavailable check honestly and keeps help successful", async () => {
    vi.mocked(updates.checkCliVersion).mockResolvedValue({ status: "unavailable" });
    expect(await runCli(["help"])).toBe(0);
    expect(output()).toContain(`v${version} · Latest version couldn't be checked`);
    expect(output()).not.toContain("You're on the latest version");
  });

  it("isolates unexpected lookup failures from the command result", async () => {
    vi.mocked(updates.checkCliVersion).mockRejectedValue(new Error("lookup failed"));
    expect(await runCli(["help"])).toBe(0);
    expect(output()).toContain("Latest version couldn't be checked");
  });

  it("shows the registry version without suggesting a downgrade for newer local builds", async () => {
    vi.mocked(updates.checkCliVersion).mockResolvedValue({ status: "ahead", latestVersion: "0.0.1" });
    expect(await runCli(["help"])).toBe(0);
    expect(output()).toContain(`v${version} · npm latest: v0.0.1`);
    expect(output()).not.toContain("npm install -g");
  });

  it.each(["CI", "NO_UPDATE_NOTIFIER"])("shows only the installed version when %s disables lookups", async (key) => {
    vi.stubEnv(key, "1");
    expect(await runCli(["help"])).toBe(0);
    expect(output().trimEnd()).toMatch(new RegExp(`version\\s+v${version.replaceAll(".", "\\.")}$`));
    expect(updates.checkCliVersion).not.toHaveBeenCalled();
  });

  it("shows the installed version in redirected help without making a network request", async () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    expect(await runCli(["help"])).toBe(0);
    expect(output()).toContain(`v${version}`);
    expect(updates.checkCliVersion).not.toHaveBeenCalled();
  });

  it("leaves --version output concise and performs no lookup", async () => {
    expect(await runCli(["--version"])).toBe(0);
    expect(vi.mocked(console.log).mock.calls).toHaveLength(1);
    expect(output()).toContain(`v${version}`);
    expect(updates.checkCliVersion).not.toHaveBeenCalled();
  });

  it("does not append a footer to failed commands", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runCli(["init", "unsupported-positionals"])).toBe(1);
    expect(updates.checkCliVersion).not.toHaveBeenCalled();
    expect(output()).not.toContain("version");
  });
});
