import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";

import { parseCliError } from "./cli-errors.js";
import { runCli } from "./index.js";
import { readCliVersion } from "./version.js";

const ROOT = resolve(import.meta.dirname, "../../..");

function writeRequirementsForDiagram(path: string, source: string): void {
  const parsed = parseDgmResult(source);
  if (parsed.isErr()) throw new Error(parsed.error.message);
  const doc = parsed.value;
  const basis = { kind: "inferred", text: "Test fixture" };
  const requirements = {
    version: 1,
    grammar: doc.grammar,
    components: [
      ...doc.groups.map((group) => ({
        id: group.id,
        kind: "group",
        ...(group.type ? { type: group.type } : {}),
        basis,
      })),
      ...doc.resources.map((resource) => ({ id: resource.id, kind: "resource", type: resource.type, basis })),
    ],
    relationships: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.kind ? { kind: edge.kind } : {}),
      basis,
    })),
    counts: [],
    placement: [],
  };
  const name = path.split(/[\\/]/).pop() ?? path;
  const companion = name === "diagram.dgm" ? "requirements.json" : `${name.replace(/\.dgm$/i, "")}.requirements.json`;
  writeFileSync(join(dirname(path), companion), JSON.stringify(requirements));
}

describe("runCli", () => {
  it("prints help and version", async () => {
    expect(await runCli(["help"])).toBe(0);
    const version = readCliVersion();
    const versionCode = await runCli(["--version"]);
    expect(versionCode).toBe(0);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns one for unknown commands and invalid command arguments", async () => {
    expect(await runCli(["not-a-command"])).toBe(1);
    expect(await runCli(["legacy-command"])).toBe(1);
    expect(await runCli(["init", "nested-repository"])).toBe(1);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["studio", "diagram.dgm"])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("studio does not accept file paths");
    } finally {
      error.mockRestore();
    }
    expect(await runCli(["validate"])).toBe(1);
  });

  it("maps input and parse failures to actionable terminal messages", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["validate", "missing.dgm"])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("Unable to read diagram: missing.dgm");

      const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-parse-"));
      try {
        const sourcePath = join(workRoot, "broken.dgm");
        writeFileSync(sourcePath, "diagram broken { grammar aws");
        expect(await runCli(["validate", sourcePath])).toBe(1);
        expect(error.mock.calls.flat().join("\n")).toContain("parse-failed");
      } finally {
        rmSync(workRoot, { recursive: true, force: true });
      }
    } finally {
      error.mockRestore();
    }
  });

  it("preserves the runtime parse code for oversized and malformed sources", () => {
    const oversized = parseDgmResult("x".repeat(DIAGRAM_LIMITS.sourceBytes + 1));
    const malformed = parseDgmResult("diagram broken { grammar aws");
    expect(oversized.isErr()).toBe(true);
    expect(malformed.isErr()).toBe(true);
    if (oversized.isErr() && malformed.isErr()) {
      expect(parseCliError("large.dgm", oversized.error)).toMatchObject({
        code: "parse-failed",
        parseCode: "source-too-large",
        message: "Diagram exceeds the 1 MiB source limit",
      });
      expect(parseCliError("broken.dgm", malformed.error)).toMatchObject({
        code: "parse-failed",
        parseCode: "invalid-syntax",
        message: "Unterminated block; expected }",
      });
    }
  });

  it("validates a complete diagram before Studio handoff", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-validate-"));
    const validPath = join(workRoot, "valid.dgm");
    const invalidPath = join(workRoot, "invalid.dgm");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const validSource = `diagram valid {\n  grammar gcp\n  cloud-agnostic.boundary external "External" {}\n}\n`;
      const invalidSource = `diagram invalid {\n  grammar gcp\n  unknown.service nope "Nope"\n}\n`;
      writeFileSync(validPath, validSource);
      writeRequirementsForDiagram(validPath, validSource);
      writeFileSync(invalidPath, invalidSource);
      writeFileSync(
        join(workRoot, "invalid.requirements.json"),
        JSON.stringify({
          version: 1,
          grammar: "gcp",
          components: [
            { id: "nope", kind: "resource", type: "unknown.service", basis: { kind: "explicit", text: "fixture" } },
          ],
          relationships: [],
          counts: [],
          placement: [],
        }),
      );

      expect(await runCli(["validate", validPath])).toBe(0);
      expect(log.mock.calls.flat().join("\n")).toContain("Validated");
      expect(await runCli(["validate", invalidPath])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("unknown-type");
    } finally {
      log.mockRestore();
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("validates several files, prints path-prefixed warnings and positions, and fails warnings under --strict", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-validate-many-"));
    const clean = join(workRoot, "clean.dgm");
    const warned = join(workRoot, "warned.dgm");
    const broken = join(workRoot, "broken.dgm");
    writeFileSync(clean, `diagram clean {\n  grammar gcp\n  cloud-agnostic.boundary external "External"\n}\n`);
    writeFileSync(
      warned,
      `diagram warned {\n  grammar aws\n  aws.cloud cloud "Cloud" {\n    aws.region region "Region" {\n      aws.vpc vpc "VPC" {\n        aws.dynamodb table "Table"\n      }\n    }\n  }\n}\n`,
    );
    writeFileSync(broken, `diagram broken {\n  grammar aws\n  flow sideways\n}\n`);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const previous = process.cwd();
    process.chdir(workRoot);
    try {
      writeRequirementsForDiagram(clean, readFileSync(clean, "utf8"));
      writeRequirementsForDiagram(warned, readFileSync(warned, "utf8"));
      writeFileSync(
        join(workRoot, "broken.requirements.json"),
        readFileSync(join(workRoot, "clean.requirements.json"), "utf8"),
      );
      expect(await runCli(["validate", "clean.dgm", "warned.dgm"])).toBe(1);
      expect(log.mock.calls.flat().join("\n")).toContain("Validated: clean.dgm");
      expect(error.mock.calls.flat().join("\n")).toContain(
        "warned.dgm: validity (table): managed-service-in-network: aws.dynamodb (table) is a managed service; draw it outside the VPC",
      );

      expect(await runCli(["validate", "--strict", "clean.dgm"])).toBe(0);
      expect(await runCli(["validate", "--strict", "clean.dgm", "warned.dgm"])).toBe(1);

      error.mockClear();
      log.mockClear();
      expect(await runCli(["validate", "broken.dgm", "clean.dgm"])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain(
        'broken.dgm: validity: parse-failed: 3:8: Invalid flow "sideways"',
      );
      expect(log.mock.calls.flat().join("\n")).toContain("Validated: clean.dgm");

      expect(await runCli(["validate", "--json", "clean.dgm"])).toBe(0);
    } finally {
      process.chdir(previous);
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

  it("preserves a pre-existing atomic-write temp file and reports a typed write failure", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-format-temp-"));
    const sourcePath = join(workRoot, "diagram.dgm");
    const temporaryPath = `${sourcePath}.tmp-${process.pid}`;
    const source = `diagram format-me {\n grammar aws\n aws.cloud cloud "Cloud" {}\n}\n`;
    const temporaryContents = "keep this temporary file";
    writeFileSync(sourcePath, source);
    writeFileSync(temporaryPath, temporaryContents);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["format", "--write", sourcePath])).toBe(1);
      expect(readFileSync(sourcePath, "utf8")).toBe(source);
      expect(readFileSync(temporaryPath, "utf8")).toBe(temporaryContents);
      expect(error.mock.calls.flat().join("\n")).toContain("Unable to write formatted diagram");
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
    writeRequirementsForDiagram(sourcePath, readFileSync(sourcePath, "utf8"));
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

  it("supports an explicit companion, rejects stdin without one, and emits only structured JSON", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-requirements-args-"));
    const diagram = join(workRoot, "custom-name.dgm");
    const contract = join(workRoot, "contract.json");
    const source = `diagram custom {\n  grammar gcp\n  cloud-agnostic.boundary external "External" {}\n}\n`;
    writeFileSync(diagram, source);
    writeRequirementsForDiagram(diagram, source);
    writeFileSync(contract, readFileSync(join(workRoot, "custom-name.requirements.json"), "utf8"));
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runCli(["validate", "--requirements", contract, diagram, "other.dgm"])).toBe(1);
      expect(await runCli(["validate", "-"])).toBe(1);
      expect(error.mock.calls.flat().join("\n")).toContain("stdin requires --requirements");

      error.mockClear();
      expect(await runCli(["validate", "--json", "--requirements", contract, diagram])).toBe(0);
      const json = JSON.parse(output.mock.calls.map((call) => String(call[0])).join(""));
      expect(json.files[0]).toMatchObject({
        diagram: expect.stringContaining("custom-name.dgm"),
        requirements: expect.stringContaining("contract.json"),
      });
      expect(json.files[0].completeness.status).toBe("pass");
      expect(error).not.toHaveBeenCalled();

      output.mockClear();
      expect(await runCli(["validate", "--json", "-", "--requirements", contract], { stdin: source })).toBe(0);
      const stdinJson = JSON.parse(output.mock.calls.map((call) => String(call[0])).join(""));
      expect(stdinJson.files[0]).toMatchObject({
        diagram: "<stdin>",
        requirements: expect.stringContaining("contract.json"),
        validity: { status: "pass" },
        completeness: { status: "pass" },
      });
    } finally {
      output.mockRestore();
      error.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("reports missing, malformed, and incomplete contracts independently from source validity", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-requirements-errors-"));
    const diagram = join(workRoot, "diagram.dgm");
    const source = `diagram checked {\n  grammar gcp\n  cloud-agnostic.boundary external "External" {}\n}\n`;
    writeFileSync(diagram, source);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await runCli(["validate", "--json", diagram])).toBe(1);
      let report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.files[0].validity.status).toBe("pass");
      expect(report.files[0].completeness.issues[0].code).toBe("requirements-missing");

      const companion = join(workRoot, "requirements.json");
      writeFileSync(companion, "{");
      output.mockClear();
      expect(await runCli(["validate", "--json", diagram])).toBe(1);
      report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.files[0].completeness.issues[0]).toMatchObject({ code: "invalid-json", path: "$" });

      writeFileSync(
        companion,
        JSON.stringify({
          version: 1,
          grammar: "gcp",
          components: [{ id: "required", kind: "group", basis: { kind: "explicit", text: "Fixture" } }],
          relationships: [],
          counts: [],
          placement: [],
        }),
      );
      output.mockClear();
      expect(await runCli(["validate", "--json", diagram])).toBe(1);
      report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.files[0].validity.status).toBe("pass");
      expect(report.files[0].completeness.issues[0]).toMatchObject({
        code: "missing-component",
        requirementId: "required",
      });
      expect(report.files[0].routing.status).toBe("pass");
      output.mockClear();
      expect(await runCli(["validate", "--strict", "--json", diagram])).toBe(1);
      report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.files[0]).toMatchObject({
        validity: { status: "pass" },
        completeness: { status: "fail" },
        routing: { status: "pass" },
      });
    } finally {
      output.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("reports reversed relationship endpoints and kind mismatches by requirement ID", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-requirements-edges-"));
    const diagram = join(workRoot, "linked.dgm");
    const source = `diagram linked {\n  grammar cloud-agnostic\n  cloud-agnostic.client client "Client"\n  cloud-agnostic.server api "API"\n  client -> api { id request kind flow }\n}\n`;
    writeFileSync(diagram, source);
    writeRequirementsForDiagram(diagram, source);
    const path = join(workRoot, "linked.requirements.json");
    const contract = JSON.parse(readFileSync(path, "utf8"));
    contract.relationships = [
      { id: "request", source: "api", target: "client", kind: "fail", basis: { kind: "explicit", text: "Fixture" } },
    ];
    writeFileSync(path, JSON.stringify(contract));
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await runCli(["validate", "--json", diagram])).toBe(1);
      const report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.files[0].validity.status).toBe("pass");
      expect(report.files[0].completeness.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "relationship-endpoints-mismatch", requirementId: "request" }),
          expect.objectContaining({ code: "relationship-kind-mismatch", requirementId: "request" }),
        ]),
      );
      expect(report.files[0].routing.status).toBe("pass");
    } finally {
      output.mockRestore();
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("keeps a complete diagram with an authored label collision successful unless strict", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-strict-routing-"));
    const diagram = join(workRoot, "diagram.dgm");
    const source = `diagram strict-routing { grammar cloud-agnostic flow lr
      cloud-agnostic.client client cloud-agnostic.server api
      client -> api { id request label "Request" }
    } view default { route request { label 0 top } }`;
    writeFileSync(diagram, source);
    writeRequirementsForDiagram(diagram, source);
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await runCli(["validate", "--json", diagram])).toBe(0);
      let report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.ok).toBe(true);
      expect(report.files[0]).toMatchObject({
        validity: { status: "pass" },
        completeness: { status: "pass" },
        routing: { status: "warnings" },
      });
      expect(report.files[0].routing.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "edge-label-node-collision" })]),
      );

      output.mockClear();
      expect(await runCli(["validate", "--strict", "--json", diagram])).toBe(1);
      report = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(report.ok).toBe(false);
      expect(report.files[0].routing.status).toBe("warnings");
    } finally {
      output.mockRestore();
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
      expect(instructions).toContain("dumbdiagrams validate --strict <path-to-diagram.dgm>");
      expect(instructions).toContain("unless\nthe user explicitly requests vertical/top-to-bottom flow");
      expect(instructions).toContain("preserve its orientation unless the user");
      expect(instructions).toContain("adjusting saved positions, ports, or manual routes");
      expect(readFileSync(join(projectRoot, ".dumbdiagrams/architecture.md"), "utf8")).toContain(
        "cloud-agnostic` (Experimental)",
      );
      expect(existsSync(join(projectRoot, ".dumbdiagrams/requirements.md"))).toBe(true);
      expect(
        JSON.parse(readFileSync(join(projectRoot, ".dumbdiagrams/requirements.schema.json"), "utf8")),
      ).toHaveProperty("$schema");
      expect(
        JSON.parse(readFileSync(join(projectRoot, ".dumbdiagrams/requirements.example.json"), "utf8")),
      ).toHaveProperty("components");
      expect(JSON.parse(readFileSync(join(projectRoot, ".dumbdiagrams/preferences.json"), "utf8"))).toEqual({
        numberedSteps: true,
      });
      const dgmGuide = readFileSync(join(projectRoot, ".dumbdiagrams/dgm.md"), "utf8");
      for (const grammar of ["aws", "azure", "gcp", "cloud-agnostic"]) {
        expect(dgmGuide).toContain(grammar);
      }
      expect(dgmGuide).toContain("Default every new diagram to horizontal left-to-right layout (`flow lr`)");
      expect(dgmGuide).toContain("primary sequential pipelines and order causally sequential children");
      expect(dgmGuide).toContain("Stack vertically only");
      expect(dgmGuide).toContain("use `flow tb` only when requested explicitly by the user");
      expect(dgmGuide).toContain("including inside nested boundaries");
      expect(dgmGuide).toContain("Separate the primary request/data path from IAM, Monitoring, Logging, and");
      expect(dgmGuide).toContain("support boundary and connect them with dashed peer/support edges");
      for (const [provider, marker] of [
        ["aws", "First-class"],
        ["azure", "Experimental"],
        ["gcp", "Experimental"],
        ["cloud-agnostic", "Experimental"],
      ] as const) {
        const guide = readFileSync(join(projectRoot, `.dumbdiagrams/providers/${provider}.md`), "utf8");
        const heading =
          provider === "aws" ? "AWS" : provider === "azure" ? "Azure" : provider === "gcp" ? "GCP" : "Cloud-agnostic";
        expect(guide).toContain(`# ${heading} conventions`);
        expect(guide).toContain(marker);
        if (provider !== "aws") expect(guide).toMatch(/current AWS\s+layout/);
      }
      const catalog = readFileSync(join(projectRoot, ".dumbdiagrams/catalog.json"), "utf8");
      expect(catalog).toContain('"entries"');
      expect(catalog).toContain('"type": "cloud-agnostic.boundary"');
      const generatedPilot = join(projectRoot, ".dumbdiagrams/examples/simple-serverless-web-application");
      const sourcePilot = join(ROOT, "examples/curated/simple-serverless-web-application");
      for (const file of [
        "user-prompt.md",
        "architecture-brief.md",
        "reference-spec.md",
        "diagram.dgm",
        "requirements.json",
      ]) {
        expect(readFileSync(join(generatedPilot, file), "utf8")).toBe(readFileSync(join(sourcePilot, file), "utf8"));
      }
      for (const id of ["azure-private-app-service", "gcp-streaming-analytics", "cloud-agnostic-order-processing"]) {
        expect(readFileSync(join(projectRoot, `.dumbdiagrams/examples/${id}/diagram.dgm`), "utf8")).toBe(
          readFileSync(join(ROOT, `examples/curated/${id}/diagram.dgm`), "utf8"),
        );
      }
      for (const id of [
        "aws-review-medium-iot-telemetry",
        "azure-review-medium-async-orders",
        "gcp-review-simple-api",
      ]) {
        const generated = join(projectRoot, `.dumbdiagrams/examples/${id}/requirements.json`);
        expect(readFileSync(generated, "utf8")).toBe(
          readFileSync(join(ROOT, `examples/curated/${id}/requirements.json`), "utf8"),
        );
      }
      expect(existsSync(join(projectRoot, "README.md"))).toBe(false);
    } finally {
      log.mockRestore();
      process.chdir(previous);
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
