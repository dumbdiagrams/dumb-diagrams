import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  it("rejects unknown commands and invalid command arguments", async () => {
    expect(await runCli(["not-a-command"])).toBe(1);
    expect(await runCli(["legacy-command"])).toBe(1);
    expect(await runCli(["init", "nested-repository"])).toBe(1);
    await expect(runCli(["studio", "diagram.dgm"])).rejects.toThrow(/does not accept/);
    expect(await runCli(["validate"])).toBe(1);
  });

  it("validates a complete diagram before Studio handoff", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-validate-"));
    const validPath = join(workRoot, "valid.dgm");
    const invalidPath = join(workRoot, "invalid.dgm");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      writeFileSync(validPath, `diagram valid {\n  grammar gcp\n  cloud-agnostic.boundary external "External" {}\n}\n`);
      writeFileSync(invalidPath, `diagram invalid {\n  grammar gcp\n  unknown.service nope "Nope"\n}\n`);

      expect(await runCli(["validate", validPath])).toBe(0);
      expect(log.mock.calls.flat().join("\n")).toContain("Valid diagram");
      expect(await runCli(["validate", invalidPath])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("unknown-type");
    } finally {
      log.mockRestore();
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("formats canonical source and supports check/write semantics", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-format-"));
    const sourcePath = join(workRoot, "diagram.dgm");
    const source = `diagram format-me {\n  grammar aws\n  aws.cloud cloud "Cloud" {}\n}\n`;
    writeFileSync(sourcePath, source);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["format", "--check", sourcePath])).toBe(1);
      expect(await runCli(["format", "--write", sourcePath])).toBe(0);
      const canonical = readFileSync(sourcePath, "utf8");
      expect(canonical).toContain("diagram format-me {");
      expect(await runCli(["format", "--check", sourcePath])).toBe(0);
    } finally {
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("renders deterministic SVG and does not create output for invalid input", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-render-"));
    const validPath = join(workRoot, "valid.dgm");
    const invalidPath = join(workRoot, "invalid.dgm");
    const firstPath = join(workRoot, "first.svg");
    const secondPath = join(workRoot, "second.svg");
    const invalidOutput = join(workRoot, "should-not-exist.svg");
    const source = `diagram render-me {\n  grammar aws\n  aws.cloud cloud "Cloud" {}\n}\n`;
    writeFileSync(validPath, source);
    writeFileSync(invalidPath, "diagram broken { grammar aws");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["render", validPath, "--output", firstPath])).toBe(0);
      expect(await runCli(["render", validPath, "--output", secondPath])).toBe(0);
      expect(readFileSync(firstPath, "utf8")).toBe(readFileSync(secondPath, "utf8"));
      expect(readFileSync(firstPath, "utf8")).toContain("<svg");
      expect(await runCli(["render", invalidPath, "--output", invalidOutput])).toBe(1);
      expect(existsSync(invalidOutput)).toBe(false);
    } finally {
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("reports provider mismatches before rendering", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-provider-"));
    const sourcePath = join(workRoot, "mismatch.dgm");
    const outputPath = join(workRoot, "mismatch.svg");
    writeFileSync(sourcePath, `diagram mismatch {\n  grammar aws\n  azure.subscription subscription "Azure" {}\n}\n`);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["validate", sourcePath])).toBe(1);
      expect(await runCli(["render", sourcePath, "-o", outputPath])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("provider-mismatch");
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
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
      expect(instructions).toContain("dumbdiagrams validate <path-to-diagram.dgm>");
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
      expect(dgmGuide).toContain("Separate the primary request/data path from IAM, Monitoring, Logging, and");
      expect(dgmGuide).toContain("support boundary and connect them with dashed peer/support edges");
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
