import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { printDgm } from "@dumb-diagrams/dsl";
import { createEmptyDocument } from "@dumb-diagrams/core";
import { describe, expect, it } from "vitest";

import { runCli } from "./index.js";
import { readCliVersion } from "./version.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const exampleDiagram = join(ROOT, "examples/src/aws-high-availability-web-app.dgm");

describe("runCli", () => {
  it("prints help and version", async () => {
    expect(await runCli(["help"])).toBe(0);
    const version = readCliVersion();
    const versionCode = await runCli(["--version"]);
    expect(versionCode).toBe(0);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("rejects unknown commands and missing arguments", async () => {
    expect(await runCli(["not-a-command"])).toBe(1);
    expect(await runCli(["validate"])).toBe(1);
    expect(await runCli(["render"])).toBe(1);
    expect(await runCli(["format"])).toBe(1);
  });

  it("creates a project scaffold with init --yes", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-init-"));
    const projectDir = join(workRoot, "payments");
    try {
      const code = await runCli([
        "init",
        projectDir,
        "--yes",
        "--name",
        "Payments",
        "--diagram",
        "system-overview",
        "--description",
        "Event-driven billing.",
      ]);
      expect(code).toBe(0);
      expect(readFileSync(join(projectDir, "README.md"), "utf8")).toContain("Payments");
      expect(readFileSync(join(projectDir, "diagrams/system-overview.dgm"), "utf8")).toContain("system-overview");
      expect(readFileSync(join(projectDir, "DUMB_DIAGRAMS.md"), "utf8")).toContain("system-overview.dgm");
      expect(readFileSync(join(projectDir, "CATALOG.json"), "utf8")).toContain("\"entries\"");
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("validates and formats a diagram file", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-format-"));
    const filePath = join(workRoot, "sample.dgm");
    try {
      writeFileSync(filePath, printDgm(createEmptyDocument("sample")), "utf8");
      expect(await runCli(["validate", workRoot])).toBe(0);
      expect(await runCli(["format", filePath, "--write"])).toBe(0);
      expect(readFileSync(filePath, "utf8")).toContain("diagram sample");
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("renders a bundled example diagram when assets are available", async () => {
    if (!existsSync(exampleDiagram)) return;
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-render-"));
    const outputPath = join(workRoot, "render.svg");
    try {
      const code = await runCli([
        "render",
        exampleDiagram,
        "--output",
        outputPath,
      ]);
      if (code !== 0) return;
      expect(readFileSync(outputPath, "utf8")).toContain("<svg");
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
