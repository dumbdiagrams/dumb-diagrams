import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

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

  it("creates a timestamped project folder with agent guidance and portable examples", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-init-"));
    const previous = process.cwd();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      process.chdir(workRoot);
      expect(await runCli(["init"])).toBe(0);
      const projectEntries = readdirSync(workRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
      expect(projectEntries).toHaveLength(1);
      expect(projectEntries[0]!.name).toMatch(/^dumb-diagrams-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
      const projectRoot = resolve(process.cwd(), projectEntries[0]!.name);
      const output = log.mock.calls.flat().join("\n");
      expect(output).toContain(`name     ${projectEntries[0]!.name}`);
      expect(output).toContain(`folder   ${projectRoot}`);
      expect(existsSync(join(workRoot, "AGENTS.md"))).toBe(false);
      expect(readFileSync(join(projectRoot, "AGENTS.md"), "utf8")).toContain(".dumbdiagrams/instructions.md");
      expect(readFileSync(join(projectRoot, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
      expect(readFileSync(join(projectRoot, "GEMINI.md"), "utf8")).toBe("@./AGENTS.md\n");
      const diagramsReadme = readFileSync(join(projectRoot, "diagrams/README.md"), "utf8");
      expect(diagramsReadme).toContain("diagrams/<descriptive-slug>/");
      expect(diagramsReadme).toContain("diagram.dgm");
      expect(diagramsReadme).toContain("architecture-brief.md");
      expect(diagramsReadme).toContain("## Brief template");
      expect(diagramsReadme).toContain("## Goal");
      expect(diagramsReadme).toContain("## Explicit requirements");
      expect(diagramsReadme).toContain("## Relationships and containment");
      expect(diagramsReadme).toContain("## Inferred decisions and exclusions");
      expect(readFileSync(join(projectRoot, "AGENTS.md"), "utf8")).toContain("diagrams/");
      const instructions = readFileSync(join(projectRoot, ".dumbdiagrams/instructions.md"), "utf8");
      expect(instructions).toContain("Explicit user decisions");
      expect(instructions).toContain("architecture-brief.md");
      expect(instructions).toContain("same change");
      expect(instructions).toContain("chain-of-thought");
      expect(instructions).toContain("no provider signal");
      expect(instructions).toContain("stop and ask the user");
      expect(instructions).toContain("single-provider");
      expect(readFileSync(join(projectRoot, ".dumbdiagrams/architecture.md"), "utf8")).toContain(
        "cloud-agnostic` (Experimental)",
      );
      const dgmGuide = readFileSync(join(projectRoot, ".dumbdiagrams/dgm.md"), "utf8");
      for (const grammar of ["aws", "azure", "gcp", "cloud-agnostic"]) {
        expect(dgmGuide).toContain(grammar);
      }
      expect(dgmGuide).toContain("Use `flow lr` for primary sequential pipelines");
      expect(dgmGuide).toContain("Stack vertically only parallel or same-level");
      expect(dgmGuide).toContain("use `flow tb` only when requested");
      for (const [provider, marker] of [
        ["aws", "First-class"],
        ["azure", "Experimental"],
        ["gcp", "Experimental"],
        ["cloud-agnostic", "Experimental"],
      ] as const) {
        const guide = readFileSync(join(projectRoot, `.dumbdiagrams/providers/${provider}.md`), "utf8");
        const heading = provider === "aws" ? "AWS" : provider === "azure" ? "Azure" : provider === "gcp" ? "GCP" : "Cloud-agnostic";
        expect(guide).toContain(`# ${heading} conventions`);
        expect(guide).toContain(marker);
        if (provider !== "aws") expect(guide).toMatch(/current AWS\s+layout/);
      }
      const catalog = readFileSync(join(projectRoot, ".dumbdiagrams/catalog.json"), "utf8");
      expect(catalog).toContain("\"entries\"");
      expect(catalog).toContain("\"type\": \"cloud-agnostic.boundary\"");
      const generatedPilot = join(projectRoot, ".dumbdiagrams/examples/simple-serverless-web-application");
      const sourcePilot = join(ROOT, "examples/curated/simple-serverless-web-application");
      for (const file of ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"]) {
        expect(readFileSync(join(generatedPilot, file), "utf8")).toBe(readFileSync(join(sourcePilot, file), "utf8"));
      }
      expect(existsSync(join(projectRoot, "README.md"))).toBe(false);
    } finally {
      log.mockRestore();
      process.chdir(previous);
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
