#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { getCatalogEntryByBrowserPath, listAssets } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { compileDiagramResult, renderPortableSvg, type CompiledDiagram } from "@dumb-diagrams/runtime/render";

import { createCliUi } from "./cli-ui.js";
import { errorMessage, parseCliError, type CliError } from "./cli-errors.js";
import { renderInitTemplate } from "./init-templates.js";
import { resolveInitOptions } from "./init-options.js";
import { launchBrowser } from "./platform-launch.js";
import { startStudioServer } from "./studio-server.js";
import { readCliVersion } from "./version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = readCliVersion();
const ui = createCliUi();

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

const CURATED_EXAMPLE_IDS = [
  "aws-high-availability-web-app",
  "aws-data-transfer-hub",
  "bedrock-claims-processing",
  "simple-serverless-web-application",
  "image-thumbnail-pipeline",
  "asynchronous-report-generation",
  "event-driven-order-fulfillment",
  "azure-private-app-service",
  "gcp-streaming-analytics",
  "cloud-agnostic-order-processing",
] as const;
const CURATED_FILE_NAMES = ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"] as const;

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rawArgs] = argv;
  const parsed = parseArgs(rawArgs, command);

  return dispatchCommand(command, parsed).match((code) => code, reportCliError);
}

function dispatchCommand(command: string | undefined, parsed: ParsedArgs): ResultAsync<number, CliError> {
  if (parsed.flags.has("help")) return okAsync(0).andTee(() => printHelp());
  if (parsed.flags.has("version") || command === "--version" || command === "-v") {
    return okAsync(0).andTee(() => console.log(`${ui.heading("DUMB DIAGRAMS")} ${ui.muted(`v${VERSION}`)}`));
  }
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h": return okAsync(0).andTee(() => printHelp());
    case "studio": return cmdStudio(parsed);
    case "init": return cmdInit(parsed);
    case "validate": return cmdValidate(parsed);
    case "format": return cmdFormat(parsed);
    case "render": return cmdRender(parsed);
    default: return errAsync({ code: "unknown-command", command, message: `Unknown command: ${command}` });
  }
}

function printHelp(): void {
  console.log(`${ui.banner()}

${ui.brand()}

${ui.heading("Usage")}
  ${ui.command("dumbdiagrams init")}       Create a project folder for agents
  ${ui.command("dumbdiagrams studio")}     Open the local diagram editor
  ${ui.command("dumbdiagrams validate")}   Validate .dgm source files
  ${ui.command("dumbdiagrams format")}     Canonicalize a .dgm source file
  ${ui.command("dumbdiagrams render")}     Render a .dgm source file to SVG

${ui.heading("Commands")}
  ${ui.command("init")}                    Create a project folder for agents
  ${ui.command("studio")}                  Open the generic local .dgm editor
  ${ui.command("validate <file.dgm>...")}   Validate diagrams (--strict fails on warnings)
  ${ui.command("format <file.dgm>")}        Print canonical .dgm source
  ${ui.command("render <file.dgm>")}        Render deterministic SVG (use -o for a file)

${ui.heading("Quick start")}
  ${ui.command("dumbdiagrams init")}
  ${ui.command("dumbdiagrams validate diagrams/example/diagram.dgm")}
  ${ui.command("dumbdiagrams render diagrams/example/diagram.dgm -o diagram.svg")}
  ${ui.command("dumbdiagrams studio")}

${ui.muted("Tip: dgm is a shorthand alias for dumbdiagrams.")}
`);
}

async function promptProjectName(defaultName: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(
      `  ${ui.command("?")} ${ui.heading("What should we call this project?")} ${ui.muted(`(default: ${defaultName})`)} `,
    );
  } finally {
    readline.close();
  }
}

function cmdStudio(args: ParsedArgs): ResultAsync<number, CliError> {
  const argumentResult = requireNoArguments(args, "studio");
  if (argumentResult.isErr()) return errAsync(argumentResult.error);
  const testPort = Number(process.env.DUMBDIAGRAMS_STUDIO_PORT);
  return ResultAsync.fromPromise(
    startStudioServer({
      port: Number.isInteger(testPort) && testPort >= 0 && testPort <= 65535 ? testPort : undefined,
    }),
    (cause): CliError => ({ code: "studio-start-failed", message: errorMessage(cause), cause }),
  ).andThen((handle) => {
    console.log(`\n${ui.brand()}\n`);
    console.log(ui.heading("Studio is ready"));
    console.log(ui.info("local", ui.command(handle.url)));
    console.log(ui.info("file", "Use Open to choose any .dgm file on disk"));
    console.log(ui.info("stop", "Ctrl+C"));
    if (process.env.DUMBDIAGRAMS_STUDIO_NO_OPEN !== "1") launchBrowser(handle.url);
    return ResultAsync.fromPromise(
      waitForShutdown(handle.server),
      (cause): CliError => ({ code: "studio-start-failed", message: errorMessage(cause), cause }),
    ).map(() => 0);
  });
}

function cmdValidate(args: ParsedArgs): ResultAsync<number, CliError> {
  if (!args.positionals.length || [...args.flags.keys()].some((flag) => flag !== "strict")) {
    return errAsync(invalidArguments("validate expects one or more .dgm file paths (or - for stdin), with optional --strict.", "validate"));
  }
  const strict = args.flags.has("strict");
  let failed = false;
  for (const input of args.positionals) {
    const checked = readSourceResult(input)
      .andThen((source) => parseSourceResult(source, input))
      .andThen((doc) => compileSourceResult(doc, input));
    if (checked.isErr()) {
      reportCliError(checked.error);
      failed = true;
      continue;
    }
    const { issues, invariantFailures } = checked.value.result;
    const path = displayInputForInput(input);
    const warnings = [
      ...issues.map((issue) => issueLine(path, issue.code, issue.id, issue.message)),
      ...invariantFailures.map((failure) => issueLine(path, failure.code, failure.elementIds.join(", "), failure.message)),
    ];
    for (const warning of warnings) console.error(ui.warning(warning));
    if (strict && warnings.length) {
      console.error(ui.error(`Warnings fail --strict: ${path}`));
      failed = true;
    } else {
      console.log(ui.success(`Valid diagram: ${path}`));
    }
  }
  return okAsync(failed ? 1 : 0);
}

function issueLine(path: string, code: string, id: string | undefined, message: string): string {
  return `${path}: ${code}${id ? ` (${id})` : ""}: ${message}`;
}

function cmdFormat(args: ParsedArgs): ResultAsync<number, CliError> {
  const allowed = new Set(["check", "write", "stdout"]);
  if (args.positionals.length !== 1 || [...args.flags.keys()].some((flag) => !allowed.has(flag))) {
    return errAsync(invalidArguments("format expects one .dgm file path (or - for stdin), with optional --check, --write, or --stdout.", "format"));
  }
  const input = args.positionals[0]!;
  if (input === "-" && args.flags.has("write")) {
    return errAsync(invalidArguments("format --write requires a file path; stdin cannot be overwritten.", "format"));
  }
  if (args.flags.has("check") && args.flags.has("write")) {
    return errAsync(invalidArguments("format --check and --write cannot be used together.", "format"));
  }
  if (args.flags.has("stdout") && args.flags.has("write")) {
    return errAsync(invalidArguments("format --stdout and --write cannot be used together.", "format"));
  }

  const filePath = input === "-" ? undefined : resolve(process.cwd(), input);
  return toAsync(readSourceResult(input)).andThen((source) =>
    toAsync(parseSourceResult(source, input)).andThen((doc) =>
      toAsync(compileSourceResult(doc, input)).andThen(() => {
        const formatted = formatResult(doc, input);
        if (formatted.isErr()) return errAsync(formatted.error);
        if (args.flags.has("check")) {
          if (source !== formatted.value) {
            return errAsync<number, CliError>({ code: "format-failed", message: `Needs formatting: ${displayInput(filePath)}`, input });
          }
          console.error(ui.success(`Already formatted: ${displayInput(filePath)}`));
          return okAsync(0);
        }
        if (args.flags.has("write")) {
          const written = writeOutputResult(filePath!, formatted.value, "format");
          if (written.isErr()) return errAsync(written.error);
          console.error(ui.success(`Formatted: ${displayInput(filePath)}`));
          return okAsync(0);
        }
        try {
          process.stdout.write(formatted.value);
        } catch (cause) {
          return errAsync<number, CliError>({ code: "output-write-failed", message: errorMessage(cause), output: "stdout", cause });
        }
        return okAsync(0);
      }),
    ),
  );
}

function cmdRender(args: ParsedArgs): ResultAsync<number, CliError> {
  const allowed = new Set(["output", "o", "stdout", "format"]);
  if (args.positionals.length !== 1 || [...args.flags.keys()].some((flag) => !allowed.has(flag))) {
    return errAsync(invalidArguments("render expects one .dgm file path (or - for stdin), with optional --output/-o and --format svg.", "render"));
  }
  const input = args.positionals[0]!;
  const outputValue = args.flags.get("output") ?? args.flags.get("o");
  if (outputValue !== undefined && typeof outputValue !== "string") {
    return errAsync(invalidArguments("render --output/-o requires a destination path.", "render"));
  }
  const outputPath = typeof outputValue === "string" && outputValue !== "-" ? resolve(process.cwd(), outputValue) : undefined;
  if (args.flags.has("stdout") && outputPath) {
    return errAsync(invalidArguments("render --stdout and --output cannot be used together.", "render"));
  }
  const format = args.flags.get("format");
  if (format !== undefined && format !== "svg") {
    return errAsync(invalidArguments(`Unsupported render format ${String(format)}; only svg is supported.`, "render"));
  }

  return toAsync(readSourceResult(input))
    .andThen((source) => toAsync(parseSourceResult(source, input)))
    .andThen((doc) => toAsync(compileSourceResult(doc, input)))
    .andThen(({ doc, result }) => ResultAsync.fromPromise(
      renderPortableSvg(doc, result.layout, { loadCatalogSvg }),
      (cause): CliError => cause instanceof CatalogAssetError
        ? { code: "catalog-asset-failed", message: errorMessage(cause), asset: cause.asset, cause }
        : { code: "render-failed", message: errorMessage(cause), input, cause },
    ))
    .andThen((svg) => {
      if (outputPath) {
        const written = writeOutputResult(outputPath, svg, "render");
        if (written.isErr()) return errAsync(written.error);
        console.error(ui.success(`Rendered SVG: ${relativeForLog(outputPath)}`));
      } else {
        try {
          process.stdout.write(svg);
        } catch (cause) {
          return errAsync<number, CliError>({ code: "output-write-failed", message: errorMessage(cause), output: "stdout", cause });
        }
      }
      return okAsync(0);
    });
}

function readDiagramSource(input: string): string {
  return input === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(process.cwd(), input), "utf8");
}

function toAsync<T>(result: Result<T, CliError>): ResultAsync<T, CliError> {
  return result.isOk() ? okAsync(result.value) : errAsync(result.error);
}

function readSourceResult(input: string): Result<string, CliError> {
  try {
    return ok(readDiagramSource(input));
  } catch (cause) {
    return err({ code: "input-read-failed", message: errorMessage(cause), input, cause });
  }
}

function parseSourceResult(source: string, input: string): Result<DiagramDocument, CliError> {
  const result = parseDgmResult(source);
  return result.isOk()
    ? ok(result.value)
    : err(parseCliError(input, result.error));
}

function compileSourceResult(
  doc: DiagramDocument,
  input: string,
): Result<{ doc: DiagramDocument; result: CompiledDiagram }, CliError> {
  const result = compileDiagramResult(doc);
  if (result.isErr()) {
    return err({ code: "validation-failed", message: "Diagram failed validation", input, issues: result.error.issues });
  }
  return ok({ doc, result: result.value });
}

function formatResult(doc: DiagramDocument, input: string): Result<string, CliError> {
  try {
    return ok(printDgm(doc));
  } catch (cause) {
    return err({ code: "format-failed", message: errorMessage(cause), input, cause });
  }
}

function displayInput(filePath: string | undefined): string {
  return filePath ? relativeForLog(filePath) : "<stdin>";
}

function writeOutputAtomically(outputPath: string, contents: string): void {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write error; cleanup is best effort.
    }
    throw error;
  }
}

function writeOutputResult(outputPath: string, contents: string, operation: "format" | "render"): Result<void, CliError> {
  try {
    writeOutputAtomically(outputPath, contents);
    return ok(undefined);
  } catch (cause) {
    return err({
      code: operation === "format" ? "format-write-failed" : "output-write-failed",
      message: errorMessage(cause),
      output: outputPath,
      cause,
    });
  }
}

function loadCatalogSvg(browserPath: string): Promise<string> {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  if (!entry) return Promise.reject(new CatalogAssetError(`Catalog icon is not registered: ${browserPath}`, browserPath));
  const candidates = [
    resolve(__dirname, "..", "..", "..", entry.icon.sourcePath),
    resolve(__dirname, "source", entry.icon.sourcePath),
    resolve(__dirname, "studio", browserPath),
  ];
  const filePath = candidates.find((candidate) => existsAsFileOrDirectory(candidate));
  if (!filePath) {
    return Promise.reject(new CatalogAssetError(`Catalog icon asset is unavailable for ${browserPath}`, browserPath));
  }
  try {
    return Promise.resolve(readFileSync(filePath, "utf8"));
  } catch (cause) {
    return Promise.reject(new CatalogAssetError(errorMessage(cause), browserPath));
  }
}

class CatalogAssetError extends Error {
  constructor(message: string, readonly asset: string) {
    super(message);
    this.name = "CatalogAssetError";
  }
}

function cmdInit(args: ParsedArgs): ResultAsync<number, CliError> {
  console.log(`${ui.banner()}\n\n${ui.brand()}\n`);
  return ResultAsync.fromPromise(
    resolveInitOptions(args, {
      interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      askProjectName: promptProjectName,
    }),
    (cause): CliError => ({ code: "invalid-arguments", message: errorMessage(cause), command: "init", cause }),
  ).andThen((options) => ResultAsync.fromPromise(
    createInitProject(options),
    (cause): CliError => ({ code: "init-failed", message: errorMessage(cause), cause }),
  ));
}

async function createInitProject(options: Awaited<ReturnType<typeof resolveInitOptions>>): Promise<number> {

  const projectRoot = resolve(process.cwd(), options.projectDirectory);
  const projectName = options.projectName;
  const knowledgeRoot = join(projectRoot, ".dumbdiagrams");
  const agentsPath = join(projectRoot, "AGENTS.md");
  const claudePath = join(projectRoot, "CLAUDE.md");
  const geminiPath = join(projectRoot, "GEMINI.md");
  const examplesRoot = join(knowledgeRoot, "examples");

  mkdirSync(projectRoot, { recursive: true });
  console.log(ui.heading("Creating project"));
  console.log(ui.info("name", projectName));
  console.log(ui.info("folder", projectRoot));
  console.log("");

  const templateVars = { projectName };
  const agentPointer = renderInitTemplate("AGENTS.md", templateVars);
  const catalogReference = createCatalogReference();
  const catalogMarkdownPath = join(knowledgeRoot, "catalog.md");
  const catalogJsonPath = join(knowledgeRoot, "catalog.json");
  const knowledgeFiles = [
    ".dumbdiagrams/instructions.md",
    ".dumbdiagrams/architecture.md",
    ".dumbdiagrams/dgm.md",
    ".dumbdiagrams/providers/aws.md",
    ".dumbdiagrams/providers/azure.md",
    ".dumbdiagrams/providers/gcp.md",
    ".dumbdiagrams/providers/cloud-agnostic.md",
  ];

  const files = [
    ...knowledgeFiles.map((name) => [join(projectRoot, name), renderInitTemplate(name, templateVars)] as const),
    [join(projectRoot, "diagrams/README.md"), renderInitTemplate("diagrams/README.md", templateVars)],
    [agentsPath, agentPointer],
    [claudePath, renderInitTemplate("CLAUDE.md", templateVars)],
    [geminiPath, renderInitTemplate("GEMINI.md", templateVars)],
    [catalogMarkdownPath, catalogReference.markdown],
    [catalogJsonPath, catalogReference.json],
  ] as const;
  let created = 0;
  for (const [filePath, contents] of files) {
    if (existsAsFileOrDirectory(filePath)) {
      console.log(ui.skip(`Skipped ${relativeForLog(filePath)} (already exists)`));
      continue;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, "utf8");
    console.log(ui.success(`Created ${relativeForLog(filePath)}`));
    created++;
  }
  created += copyBundledExamples(examplesRoot);

  console.log(ui.summary(created ? "Project ready" : "Project already prepared"));
  console.log(ui.info("next", ui.command(`cd ${relativeForLog(projectRoot)} && dumbdiagrams studio`)));
  return 0;
}

function createCatalogReference(): { markdown: string; json: string } {
  const entries = listAssets("all")
    .sort((left, right) => {
      const provider = left.provider.localeCompare(right.provider);
      if (provider) return provider;
      const kind = left.assetKind.localeCompare(right.assetKind);
      if (kind) return kind;
      const category = left.category.localeCompare(right.category);
      if (category) return category;
      return left.name.localeCompare(right.name) || left.type.localeCompare(right.type);
    });

  const jsonEntries = entries.map((entry) => ({
    type: entry.type,
    provider: entry.provider,
    assetKind: entry.assetKind,
    groupKind: entry.groupKind,
    name: entry.name,
    serviceName: entry.serviceName,
    aliases: entry.aliases,
    categories: entry.categories,
    allowedParents: entry.allowedParents,
    allowRoot: entry.allowRoot,
    column: entry.column,
    sizeTier: entry.sizeTier,
    specificity: entry.specificity,
    iconSourceId: entry.icon.sourceId,
    iconBrowserPath: entry.icon.browserPath,
  }));

  const providerCounts = entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.provider] = (counts[entry.provider] ?? 0) + 1;
    return counts;
  }, {});
  const catalogJson = {
    schemaVersion: 1,
    description: "Canonical browsable Dumb Diagrams catalog entries. Use type for .dgm icons; labels are separate display text.",
    entryCount: jsonEntries.length,
    providerCounts,
    entries: jsonEntries,
  };

  const sections = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.provider} · ${entry.assetKind === "group" ? "Groups" : "Resources"} · ${entry.category}`;
    const section = sections.get(key) ?? [];
    section.push(entry);
    sections.set(key, section);
  }

  const markdown = [
    "# Dumb Diagrams catalog",
    "",
    `This repository contains ${jsonEntries.length} canonical, browsable catalog entries across ${Object.keys(providerCounts).length} providers.`,
    "The complete machine-readable inventory is in `catalog.json`.",
    "",
    "## Icon rules for agents",
    "",
    "- Use the exact `type` value as the first token of a resource or boundary line.",
    "  Example: `aws.api-gateway gateway \"Public API\"`.",
    "- The quoted label changes display text only; it does not select the icon.",
    "- Use `assetKind: group` entries for cloud/account/region/network/subnet",
    "  boundaries. Use `assetKind: resource` entries for service/resource nodes.",
    "- For a general logical container, use `cloud-agnostic.boundary`.",
    "- Check `allowedParents` before nesting a node. Check `allowRoot` before",
    "  placing it outside a boundary.",
    "- Do not add an `icon` option for normal catalog icons. That option is only",
    "  for explicitly embedded/custom assets.",
    "",
    "Search examples:",
    "",
    "```bash",
    "rg -n \"DynamoDB|aws\\.dynamodb\" .dumbdiagrams/catalog.md .dumbdiagrams/catalog.json",
    "rg -n \"API Gateway|aws\\.api-gateway\" .dumbdiagrams/catalog.md .dumbdiagrams/catalog.json",
    "```",
    "",
    "## Full catalog",
    "",
    ...[...sections.entries()].flatMap(([section, sectionEntries]) => [
      `### ${section}`,
      "",
      ...sectionEntries.map((entry) => {
        const parents = entry.allowedParents.length ? entry.allowedParents.join(", ") : "none";
        const aliases = entry.aliases.filter((alias) => alias !== entry.type);
        const aliasText = aliases.length ? ` · aliases: ${aliases.join(", ")}` : "";
        const groupText = entry.groupKind ? ` · group kind: ${entry.groupKind}` : "";
        return `- \`${entry.type}\` — ${entry.name} · kind: ${entry.assetKind}${groupText} · parents: ${parents}${aliasText}`;
      }),
      "",
    ]),
  ].join("\n");

  return { markdown, json: `${JSON.stringify(catalogJson, null, 2)}\n` };
}

function copyBundledExamples(examplesRoot: string): number {
  mkdirSync(examplesRoot, { recursive: true });
  const files = [
    "README.md",
    ...CURATED_EXAMPLE_IDS.flatMap((id) => CURATED_FILE_NAMES.map((fileName) => `${id}/${fileName}`)),
  ];
  let created = 0;

  for (const fileName of files) {
    const sourcePath = resolveBundledExample(fileName);
    if (!sourcePath) {
      console.warn(ui.warning(`Bundled example not found: ${fileName}`));
      continue;
    }
    const targetPath = join(examplesRoot, fileName);
    mkdirSync(dirname(targetPath), { recursive: true });
    if (existsAsFileOrDirectory(targetPath)) {
      console.log(ui.skip(`Skipped ${relativeForLog(targetPath)} (already exists)`));
      continue;
    }
    copyFileSync(sourcePath, targetPath);
    console.log(ui.success(`Created ${relativeForLog(targetPath)}`));
    created++;
  }
  return created;
}

function resolveBundledExample(fileName: string): string | undefined {
  const candidates = [
    resolve(__dirname, "templates", "examples", fileName),
    resolve(__dirname, "..", "templates", "examples", fileName),
    resolve(__dirname, "..", "..", "..", "examples", fileName),
    resolve(__dirname, "..", "..", "..", "examples", "diagrams", fileName),
    resolve(__dirname, "..", "..", "..", "examples", "curated", fileName),
  ];
  return candidates.find((candidate) => existsAsFileOrDirectory(candidate));
}

function invalidArguments(message: string, command: string): CliError {
  return { code: "invalid-arguments", message, command };
}

function requireNoArguments(args: ParsedArgs, command: string): Result<void, CliError> {
  if (args.positionals.length || args.flags.size) {
    return err(invalidArguments(`${command} does not accept file paths, positionals, or options.`, command));
  }
  return ok(undefined);
}

function reportCliError(error: CliError): number {
  switch (error.code) {
    case "unknown-command":
      console.error(ui.error(error.message));
      console.error(ui.muted(`  Run ${ui.command("dumbdiagrams help")} to see available commands.`));
      return 1;
    case "invalid-arguments":
    case "init-failed":
    case "studio-start-failed":
      console.error(ui.error(error.message));
      return 1;
    case "input-read-failed":
      console.error(ui.error(`Unable to read diagram: ${displayInputForInput(error.input)}`));
      console.error(`  ${error.message}`);
      return 1;
    case "parse-failed": {
      const path = displayInputForInput(error.input);
      console.error(ui.error(`Invalid diagram: ${path}`));
      console.error(error.line ? `${path}:${error.line}:${error.column}: ${error.message}` : `${path}: ${error.message}`);
      return 1;
    }
    case "validation-failed":
      console.error(ui.error(`Invalid diagram: ${displayInputForInput(error.input)}`));
      for (const issue of error.issues) {
        console.error(issueLine(displayInputForInput(error.input), issue.code, issue.id, issue.message));
      }
      return 1;
    case "format-failed":
      console.error(ui.error(error.message));
      return 1;
    case "format-write-failed":
      console.error(ui.error(`Unable to write formatted diagram: ${relativeForLog(error.output)}`));
      console.error(`  ${error.message}`);
      return 1;
    case "render-failed":
      console.error(ui.error(`Unable to render diagram: ${displayInputForInput(error.input)}`));
      console.error(`  ${error.message}`);
      return 1;
    case "catalog-asset-failed":
      console.error(ui.error(`Unable to load catalog asset: ${error.asset}`));
      console.error(`  ${error.message}`);
      return 1;
    case "output-write-failed":
      console.error(ui.error(`Unable to write output: ${relativeForLog(error.output)}`));
      console.error(`  ${error.message}`);
      return 1;
  }
}

function displayInputForInput(input: string): string {
  return input === "-" ? "<stdin>" : relativeForLog(resolve(process.cwd(), input));
}

function parseArgs(args: string[], command?: string): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  const valueFlags = command === "render" ? new Set(["output", "o", "format"]) : new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }
    const withoutDashes = argument.replace(/^-+/, "");
    const equals = withoutDashes.indexOf("=");
    if (equals >= 0) {
      flags.set(withoutDashes.slice(0, equals), withoutDashes.slice(equals + 1));
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("-") && valueFlags.has(withoutDashes)) {
      flags.set(withoutDashes, next);
      index += 1;
    } else {
      flags.set(withoutDashes, true);
    }
  }
  return { positionals, flags };
}

function existsAsFileOrDirectory(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function relativeForLog(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath || ".";
}

function waitForShutdown(server: { close(callback?: (error?: Error) => void): void }): Promise<void> {
  return new Promise((resolvePromise) => {
    const close = () => server.close(() => resolvePromise());
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

const entrypoint = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entrypoint === realpathSync(fileURLToPath(import.meta.url))) {
  runCli(process.argv.slice(2)).then((code) => {
    if (code) process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(ui.error(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
