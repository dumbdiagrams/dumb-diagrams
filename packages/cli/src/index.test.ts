import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "./index.js";
import { readCliVersion } from "./version.js";

const ROOT = resolve(import.meta.dirname, "../../..");

describe("runCli", () => {
  it("prints help and version", async () => {
    expect(await runCli(["help"])).toBe(0);
    const version = readCliVersion();
    const versionCode = await runCli(["--version"]);
    expect(versionCode).toBe(0);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exposes only init and studio commands", async () => {
    expect(await runCli(["not-a-command"])).toBe(1);
    expect(await runCli(["legacy-command"])).toBe(1);
    expect(await runCli(["init", "nested-repository"])).toBe(1);
    await expect(runCli(["studio", "diagram.dgm"])).rejects.toThrow(/does not accept/);
  });

  it("initializes the current repository with agent guidance and portable examples", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-init-"));
    const previous = process.cwd();
    try {
      process.chdir(workRoot);
      expect(await runCli(["init"])).toBe(0);
      expect(readFileSync(join(workRoot, "AGENTS.md"), "utf8")).toContain(".dumbdiagrams/instructions.md");
      expect(readFileSync(join(workRoot, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
      expect(readFileSync(join(workRoot, "GEMINI.md"), "utf8")).toBe("@./AGENTS.md\n");
      const instructions = readFileSync(join(workRoot, ".dumbdiagrams/instructions.md"), "utf8");
      expect(instructions).toContain("Explicit user decisions");
      const catalog = readFileSync(join(workRoot, ".dumbdiagrams/catalog.json"), "utf8");
      expect(catalog).toContain("\"entries\"");
      expect(catalog).toContain("\"type\": \"cloud-agnostic.boundary\"");
      const generatedPilot = join(workRoot, ".dumbdiagrams/examples/simple-serverless-web-application");
      const sourcePilot = join(ROOT, "examples/curated/simple-serverless-web-application");
      for (const file of ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"]) {
        expect(readFileSync(join(generatedPilot, file), "utf8")).toBe(readFileSync(join(sourcePilot, file), "utf8"));
      }
      expect(existsSync(join(workRoot, "README.md"))).toBe(false);
      expect(existsSync(join(workRoot, "diagrams"))).toBe(false);

      writeFileSync(join(workRoot, "AGENTS.md"), "keep me\n", "utf8");
      expect(await runCli(["init"])).toBe(0);
      expect(readFileSync(join(workRoot, "AGENTS.md"), "utf8")).toBe("keep me\n");
    } finally {
      process.chdir(previous);
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
