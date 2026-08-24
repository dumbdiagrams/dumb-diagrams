#!/usr/bin/env node

import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createAsyncDocsFixture,
  createEmptyDocument,
  createTransferHubFixture,
  hasErrors,
  validateDocument,
} from "@dumb-diagrams/core";
import { getCatalogEntryByBrowserPath, getCatalogMap } from "@dumb-diagrams/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/dsl";
import { compileDiagram, renderPortableSvg } from "@dumb-diagrams/render";

import { resolveStudioEditorRoot, startStudioServer } from "./studio-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.0.0";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

interface CheckResult {
  file: string;
  ok: boolean;
  messages: string[];
}

const PROJECT_EXAMPLE_FILES = [
  "aws-high-availability-web-app.dgm",
  "aws-data-transfer-hub.dgm",
  "bedrock-claims-processing.dgm",
] as const;

const BOOLEAN_FLAGS = new Set(["help", "version", "no-open", "write", "open-editor", "open"]);

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rawArgs] = argv;
  const parsed = parseArgs(rawArgs);

  if (parsed.flags.has("help")) {
    printHelp();
    return 0;
  }
  if (parsed.flags.has("version") || command === "--version" || command === "-v") {
    console.log(`dumbdiagrams ${VERSION}`);
    return 0;
  }

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    case "studio":
    case "open":
      await cmdStudio(parsed);
      return 0;
    case "dev":
      await cmdStudio(parsed, true);
      return 0;
    case "render":
      return await cmdRender(parsed);
    case "validate":
    case "check":
      return cmdCheck(parsed);
    case "format":
    case "fmt":
      return cmdFormat(parsed);
    case "init":
      return cmdInit(parsed);
    case "fixtures":
      return await cmdFixtures(parsed);
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run `dumbdiagrams help` to see available commands.");
      return 1;
  }
}

function printHelp(): void {
  console.log(`Dumb Diagrams — local, source-first diagram studio

Usage:
  dumbdiagrams <command> [options]

Commands:
  studio [file.dgm]       Open the local Studio for a diagram file
  render <file.dgm>       Render a diagram to SVG
  validate <path>         Validate one file or every .dgm file in a directory
  format <file.dgm>       Print canonical source, or use --write to update it
  init [directory]        Create a small agent-ready diagram project
  fixtures <name>         Render a bundled fixture (async-docs | transfer-hub)

Studio options:
  --port <number>         Port to listen on (default: 4788)
  --host <address>        Bind address (default: 127.0.0.1)
  --no-open               Start the server without opening a browser

Init options:
  --open-editor           Open the project in Cursor, VS Code, or another editor
  --editor <command>      Use a specific editor command (for example: cursor or code)

Render options:
  --output <file.svg>     Output path (default: output.svg)

Examples:
  npx dumbdiagrams@latest init diagrams
  npx dumbdiagrams@latest init diagrams --open-editor
  npx dumbdiagrams@latest init diagrams --editor cursor
  cd diagrams
  npx dumbdiagrams@latest studio architecture.dgm
  dumbdiagrams init diagrams
  dumbdiagrams studio diagrams/architecture.dgm
  dumbdiagrams validate diagrams
  dumbdiagrams render diagrams/architecture.dgm --output architecture.svg
`);
}

async function cmdStudio(args: ParsedArgs, legacyDevSyntax = false): Promise<void> {
  const input = args.positionals[0] ?? "diagram.dgm";
  const legacyPort = legacyDevSyntax && args.positionals[1] && /^\d+$/.test(args.positionals[1])
    ? Number(args.positionals[1])
    : undefined;
  const port = flagNumber(args, "port", legacyPort ?? 4788);
  const host = flagString(args, "host", "127.0.0.1");
  const handle = await startStudioServer({
    filePath: resolve(process.cwd(), input),
    host,
    port,
  });

  console.log(`Dumb Diagrams Studio`);
  console.log(`  ${handle.url}`);
  console.log(`  file  ${handle.filePath}`);
  console.log(`  edit  the .dgm directly from Cursor, Codex, Claude, or your editor`);
  console.log(`  stop  Ctrl+C`);

  if (!hasFlag(args, "no-open")) openBrowser(handle.url);
  await waitForShutdown(handle.server);
}

async function cmdRender(args: ParsedArgs): Promise<number> {
  const input = args.positionals[0];
  const output = flagString(args, "output", args.positionals[1] ?? "output.svg");
  const doc = loadDocument(input);
  const result = compileDiagram(doc);
  if (!result.ok) {
    printIssues("Validation errors", result.issues);
    return 1;
  }
  if (result.invariantFailures.length) {
    printIssues("Routing notes", result.invariantFailures, "warn");
  }
  const outputPath = resolve(process.cwd(), output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, await renderPortableSvg(doc, result.layout!, { loadCatalogSvg }), "utf8");
  console.log(`Rendered ${relativeForLog(outputPath)}`);
  return 0;
}

function cmdCheck(args: ParsedArgs): number {
  const target = args.positionals[0] ?? "examples/src";
  const root = resolve(process.cwd(), target);
  if (!existsAsFileOrDirectory(root)) {
    console.error(`Path not found: ${target}`);
    return 1;
  }

  const files = collectDgmFiles(root);
  if (!files.length) {
    console.error(`No .dgm files found at ${target}`);
    return 1;
  }

  const results: CheckResult[] = files.map((file) => checkFile(file));
  for (const result of results) {
    const label = relativeForLog(result.file);
    if (result.ok) {
      console.log(`OK   ${label}`);
      for (const message of result.messages) console.warn(`     ${message}`);
    } else {
      console.error(`FAIL ${label}`);
      for (const message of result.messages) console.error(`     ${message}`);
    }
  }
  const failures = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failures} valid · ${failures} failed`);
  return failures ? 1 : 0;
}

function cmdFormat(args: ParsedArgs): number {
  const input = args.positionals[0];
  if (!input) {
    console.error("format requires a .dgm file");
    return 1;
  }
  const filePath = resolve(process.cwd(), input);
  try {
    const formatted = printDgm(parseDgm(readFileSync(filePath, "utf8")));
    if (hasFlag(args, "write")) {
      writeFileSync(filePath, formatted, "utf8");
      console.log(`Formatted ${relativeForLog(filePath)}`);
    } else {
      process.stdout.write(formatted);
    }
    return 0;
  } catch (error) {
    console.error(`Cannot format ${input}: ${error instanceof Error ? error.message : "invalid source"}`);
    return 1;
  }
}

function cmdInit(args: ParsedArgs): number {
  const projectRoot = resolve(process.cwd(), args.positionals[0] ?? ".");
  mkdirSync(projectRoot, { recursive: true });
  const projectName = basenameForProject(projectRoot);
  const diagramPath = join(projectRoot, "architecture.dgm");
  const instructionsPath = join(projectRoot, "DUMB_DIAGRAMS.md");
  const agentsPath = join(projectRoot, "AGENTS.md");
  const claudePath = join(projectRoot, "CLAUDE.md");
  const readmePath = join(projectRoot, "README.md");
  const examplesRoot = join(projectRoot, "examples");
  const diagramSource = printDgm(createEmptyDocument("architecture"));
  const instructions = [
    "# Dumb Diagrams project",
    "",
    "This directory is a local, source-first diagram project. The `*.dgm` file is the",
    "source of truth. Dumb Diagrams Studio is only a visual editor for that source.",
    "",
    "## Agent workflow",
    "",
    "1. Read `examples/README.md` and inspect the closest `examples/*.dgm` reference before creating a new diagram.",
    "2. Edit `architecture.dgm` directly when creating or changing the diagram.",
    "3. Run `npx dumbdiagrams@latest validate architecture.dgm`.",
    "4. Run `npx dumbdiagrams@latest studio architecture.dgm` to inspect and refine it visually.",
    "5. Render a review artifact with `npx dumbdiagrams@latest render architecture.dgm --output architecture.svg`.",
    "",
    "Keep stable ids for resources, groups, and edges. Preserve the document's view",
    "and layout information when making semantic changes so manual placement survives.",
    "Use the example files as style references: copy their explicit hierarchy, labels,",
    "numbered stages, edge direction hints, and routing constraints without copying",
    "their architecture unless the requested diagram needs it.",
    "",
  ].join("\n");
  const agentPointer = "# Diagram project instructions\n\nRead `DUMB_DIAGRAMS.md` and the closest reference in `examples/` before creating or editing any `.dgm` files.\n";
  const readme = [
    `# ${projectName}`,
    "",
    "A local Dumb Diagrams project. The `.dgm` file is the source of truth and",
    "the `examples/` directory contains style references for coding agents.",
    "",
    "Open the visual editor with:",
    "",
    "```bash",
    "npx dumbdiagrams@latest studio architecture.dgm",
    "```",
    "",
    "Ask your coding agent to read `DUMB_DIAGRAMS.md`, then inspect the closest",
    "example before creating or editing `architecture.dgm`.",
    "",
  ].join("\n");

  const files = [
    [diagramPath, diagramSource],
    [instructionsPath, instructions],
    [agentsPath, agentPointer],
    [claudePath, agentPointer],
    [readmePath, readme],
  ] as const;
  let created = 0;
  for (const [filePath, contents] of files) {
    if (existsAsFileOrDirectory(filePath)) {
      console.log(`Skipped ${relativeForLog(filePath)} (already exists)`);
      continue;
    }
    writeFileSync(filePath, contents, "utf8");
    console.log(`Created ${relativeForLog(filePath)}`);
    created++;
  }
  created += copyProjectExamples(projectRoot, examplesRoot);

  const requestedEditor = flagString(args, "editor", "");
  if (hasFlag(args, "open-editor") || hasFlag(args, "open") || requestedEditor) {
    openProjectEditor(projectRoot, requestedEditor);
  }

  console.log(`\n${created ? "Project ready" : "Project already exists"}.`);
  console.log(`Next: npx dumbdiagrams@latest studio ${relativeForLog(diagramPath)}`);
  return 0;
}

function copyProjectExamples(projectRoot: string, examplesRoot: string): number {
  mkdirSync(examplesRoot, { recursive: true });
  const files = ["README.md", ...PROJECT_EXAMPLE_FILES];
  let created = 0;

  for (const fileName of files) {
    const sourcePath = resolveProjectExample(fileName);
    if (!sourcePath) {
      console.warn(`Warning: bundled example not found: ${fileName}`);
      continue;
    }
    const targetPath = join(examplesRoot, fileName);
    if (existsAsFileOrDirectory(targetPath)) {
      console.log(`Skipped ${relativeForLog(targetPath)} (already exists)`);
      continue;
    }
    copyFileSync(sourcePath, targetPath);
    console.log(`Created ${relativeForLog(targetPath)}`);
    created++;
  }

  return created;
}

function resolveProjectExample(fileName: string): string | undefined {
  const candidates = [
    resolve(__dirname, "templates", "examples", fileName),
    resolve(__dirname, "..", "templates", "examples", fileName),
    resolve(__dirname, "..", "..", "..", "examples", "src", fileName),
  ];
  return candidates.find((candidate) => existsAsFileOrDirectory(candidate));
}

async function cmdFixtures(args: ParsedArgs): Promise<number> {
  const name = args.positionals[0] ?? "async-docs";
  const fixtures: Record<string, () => ReturnType<typeof createAsyncDocsFixture>> = {
    "async-docs": createAsyncDocsFixture,
    "transfer-hub": createTransferHubFixture,
  };
  const fixture = fixtures[name];
  if (!fixture) {
    console.error(`Unknown fixture: ${name}. Choose async-docs or transfer-hub.`);
    return 1;
  }
  const doc = fixture();
  const result = compileDiagram(doc);
  if (!result.ok) {
    printIssues("Fixture errors", result.issues);
    return 1;
  }
  const output = resolve(process.cwd(), flagString(args, "output", `fixtures/golden/${name}.svg`));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await renderPortableSvg(doc, result.layout!, { loadCatalogSvg }), "utf8");
  console.log(`Rendered ${relativeForLog(output)}`);
  return 0;
}

function checkFile(filePath: string): CheckResult {
  try {
    const doc = parseDgm(readFileSync(filePath, "utf8"));
    const issues = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false });
    if (hasErrors(issues)) {
      return { file: filePath, ok: false, messages: issues.map((issue) => issue.message) };
    }
    const result = compileDiagram(doc);
    if (!result.ok) {
      return { file: filePath, ok: false, messages: result.issues.map((issue) => issue.message) };
    }
    const routingNotes = result.invariantFailures
      .filter((failure) => failure.code !== "edge-label-collision")
      .map((failure) => failure.message);
    const collisions = result.invariantFailures
      .filter((failure) => failure.code === "edge-label-collision")
      .map((failure) => failure.message);
    return {
      file: filePath,
      ok: collisions.length === 0,
      messages: collisions.length ? collisions : routingNotes,
    };
  } catch (error) {
    return {
      file: filePath,
      ok: false,
      messages: [error instanceof Error ? error.message : "Unable to read source."],
    };
  }
}

function loadDocument(input?: string) {
  if (!input) return createAsyncDocsFixture();
  const fixtures: Record<string, () => ReturnType<typeof createAsyncDocsFixture>> = {
    "async-docs": createAsyncDocsFixture,
    "transfer-hub": createTransferHubFixture,
  };
  if (fixtures[input]) return fixtures[input]!();
  return parseDgm(readFileSync(resolve(process.cwd(), input), "utf8"));
}

function collectDgmFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return target.toLowerCase().endsWith(".dgm") ? [target] : [];
  const files: string[] = [];
  for (const entry of readdirSync(target)) {
    const child = join(target, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) files.push(...collectDgmFiles(child));
    else if (child.toLowerCase().endsWith(".dgm")) files.push(child);
  }
  return files.sort();
}

function loadCatalogSvg(browserPath: string): Promise<string> {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  if (!entry) return Promise.reject(new Error(`Unknown catalog asset ${browserPath}`));
  const stagedPath = resolve(resolveStudioEditorRoot(), entry.icon.browserPath);
  if (existsAsFileOrDirectory(stagedPath)) {
    return Promise.resolve(readFileSync(stagedPath, "utf8"));
  }
  return Promise.resolve(readFileSync(resolve(__dirname, "../../..", entry.icon.sourcePath), "utf8"));
}

function printIssues(
  heading: string,
  issues: Array<{ message: string }>,
  level: "error" | "warn" = "error",
): void {
  const write = level === "warn" ? console.warn : console.error;
  write(`${heading}:`);
  for (const issue of issues) write(`  ${issue.message}`);
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("-")) {
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
    if (next && !next.startsWith("-") && !BOOLEAN_FLAGS.has(withoutDashes)) {
      flags.set(withoutDashes, next);
      index += 1;
    } else {
      flags.set(withoutDashes, true);
    }
  }
  return { positionals, flags };
}

function flagString(args: ParsedArgs, name: string, fallback: string): string {
  const value = args.flags.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function flagNumber(args: ParsedArgs, name: string, fallback: number): number {
  const value = Number(flagString(args, name, String(fallback)));
  return Number.isInteger(value) && value >= 0 && value <= 65535 ? value : fallback;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name);
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

function basenameForProject(path: string): string {
  const value = basename(path) || "diagram-project";
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function openProjectEditor(projectRoot: string, requestedEditor: string): void {
  const candidates = requestedEditor ? [requestedEditor] : ["cursor", "code", "codium", "windsurf", "zed"];

  const tryEditor = (index: number): void => {
    const command = candidates[index];
    if (!command) {
      console.warn("Could not find a supported editor command. Open the project manually with `cursor .` or `code .`.");
      return;
    }

    const child = spawn(command, [projectRoot], { detached: true, stdio: "ignore" });
    child.once("spawn", () => {
      child.unref();
      console.log(`Opened project in ${command}: ${relativeForLog(projectRoot)}`);
    });
    child.once("error", () => tryEditor(index + 1));
  };

  tryEditor(0);
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
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
