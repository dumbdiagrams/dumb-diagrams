#!/usr/bin/env node

import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createAsyncDocsFixture,
  createEmptyDocument,
  createTransferHubFixture,
  hasErrors,
  validateDocument,
} from "@dumb-diagrams/runtime/core";
import { getCatalogEntryByBrowserPath, getCatalogMap, listAssets } from "@dumb-diagrams/runtime/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram, renderPortableSvg } from "@dumb-diagrams/runtime/render";

import { createCliUi } from "./cli-ui.js";
import { renderInitTemplate } from "./init-templates.js";
import { displayNameForDirectory, resolveInitOptions } from "./init-options.js";
import { resolveStudioEditorRoot, startStudioServer } from "./studio-server.js";
import { readCliVersion } from "./version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = readCliVersion();
const ui = createCliUi();

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

interface CheckResult {
  file: string;
  ok: boolean;
  messages: string[];
}

const PROJECT_REFERENCE_FILES = [
  "aws-high-availability-web-app.dgm",
  "aws-data-transfer-hub.dgm",
  "bedrock-claims-processing.dgm",
  "prompts/aws-high-availability-web-app.md",
  "prompts/aws-data-transfer-hub.md",
  "prompts/bedrock-claims-processing.md",
] as const;

const BOOLEAN_FLAGS = new Set(["help", "version", "no-open", "write", "open-editor", "open", "yes"]);

const FIXTURES: Record<string, () => ReturnType<typeof createAsyncDocsFixture>> = {
  "async-docs": createAsyncDocsFixture,
  "transfer-hub": createTransferHubFixture,
};

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rawArgs] = argv;
  const parsed = parseArgs(rawArgs);

  if (parsed.flags.has("help")) {
    printHelp();
    return 0;
  }
  if (parsed.flags.has("version") || command === "--version" || command === "-v") {
    console.log(`${ui.heading("DUMB DIAGRAMS")} ${ui.muted(`v${VERSION}`)}`);
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
    case "render":
      return await cmdRender(parsed);
    case "validate":
    case "check":
      return cmdCheck(parsed);
    case "format":
    case "fmt":
      return cmdFormat(parsed);
    case "init":
      return await cmdInit(parsed);
    case "fixtures":
      return await cmdFixtures(parsed);
    default:
      console.error(ui.error(`Unknown command: ${command}`));
      console.error(ui.muted(`  Run ${ui.command("dumbdiagrams help")} to see available commands.`));
      return 1;
  }
}

function printHelp(): void {
  console.log(`${ui.banner()}

${ui.brand()}

${ui.heading("Usage")}
  ${ui.command("dumbdiagrams <command> [options]")}

${ui.heading("Commands")}
  ${ui.command("studio [file-or-folder]")} Open Studio for a diagram or project folder
  ${ui.command("render <file.dgm>")}       Render a diagram to SVG
  ${ui.command("validate <path>")}         Validate one file or every .dgm in a directory
  ${ui.command("format <file.dgm>")}       Print canonical source; add --write to update it
  ${ui.command("init [directory]")}        Create an agent-ready diagram project
  ${ui.command("fixtures <name>")}         Render a bundled fixture

${ui.heading("Studio options")}
  --port <number>         Port to listen on (default: 4788)
  --host <address>        Bind address (default: 127.0.0.1)
  --no-open               Start the server without opening a browser

${ui.heading("Init options")}
  --name <name>           Project display name; also names the default folder
  --directory <path>      Output folder (alternative to the positional argument)
  --diagram <name>        Starter diagram filename (default: architecture)
  --description <text>    Short project description for the generated README
  --open-editor           Open the project in Cursor, VS Code, or another editor
  --editor <command>      Use a specific editor command (for example: cursor)
  --yes                   Skip prompts and use timestamped defaults

${ui.heading("Render options")}
  --output <file.svg>     Output path (default: output.svg)

${ui.heading("Quick start")}
  ${ui.command("npx dumbdiagrams@latest init")}
  ${ui.command("npx dumbdiagrams@latest init --name payments-platform --diagram system-overview")}
  ${ui.command("cd payments-platform")}
  ${ui.command("npx dumbdiagrams@latest studio diagrams")}

${ui.muted("Tip: run dumbdiagrams help whenever you need this command reference.")}
`);
}

async function promptProjectName(defaultName: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(
      `  ${ui.command("?")} ${ui.heading("What will your project be called?")} ${ui.muted(`(${defaultName})`)} `,
    );
  } finally {
    readline.close();
  }
}

async function cmdStudio(args: ParsedArgs): Promise<void> {
  const input = args.positionals[0] ?? "diagrams/architecture.dgm";
  const port = flagNumber(args, "port", 4788);
  const host = flagString(args, "host", "127.0.0.1");
  const handle = await startStudioServer({
    filePath: resolveStudioInput(input),
    host,
    port,
  });

  console.log(`\n${ui.brand()}\n`);
  console.log(ui.heading("Studio is ready"));
  console.log(ui.info("local", ui.command(handle.url)));
  console.log(ui.info("file", handle.filePath));
  console.log(ui.info("edit", "changes save directly to the .dgm source"));
  console.log(ui.info("stop", "Ctrl+C"));

  if (!hasFlag(args, "no-open")) openBrowser(handle.url);
  await waitForShutdown(handle.server);
}

async function cmdRender(args: ParsedArgs): Promise<number> {
  const input = args.positionals[0];
  if (!input) {
    console.error(ui.error("render requires a .dgm file path"));
    return 1;
  }
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
  console.log(ui.success(`Rendered ${relativeForLog(outputPath)}`));
  return 0;
}

function cmdCheck(args: ParsedArgs): number {
  const target = args.positionals[0];
  if (!target) {
    console.error(ui.error("validate requires a .dgm file or directory path"));
    return 1;
  }
  const root = resolve(process.cwd(), target);
  if (!existsAsFileOrDirectory(root)) {
    console.error(ui.error(`Path not found: ${target}`));
    return 1;
  }

  const files = collectDgmFiles(root);
  if (!files.length) {
    console.error(ui.error(`No .dgm files found at ${target}`));
    return 1;
  }

  const results: CheckResult[] = files.map((file) => checkFile(file));
  for (const result of results) {
    const label = relativeForLog(result.file);
    if (result.ok) {
      console.log(ui.success(label));
      for (const message of result.messages) console.warn(ui.warning(message));
    } else {
      console.error(ui.error(label));
      for (const message of result.messages) console.error(`    ${message}`);
    }
  }
  const failures = results.filter((result) => !result.ok).length;
  console.log(ui.summary(`${results.length - failures} valid · ${failures} failed`));
  return failures ? 1 : 0;
}

function cmdFormat(args: ParsedArgs): number {
  const input = args.positionals[0];
  if (!input) {
    console.error(ui.error("format requires a .dgm file"));
    return 1;
  }
  const filePath = resolve(process.cwd(), input);
  try {
    const formatted = printDgm(parseDgm(readFileSync(filePath, "utf8")));
    if (hasFlag(args, "write")) {
      writeFileSync(filePath, formatted, "utf8");
      console.log(ui.success(`Formatted ${relativeForLog(filePath)}`));
    } else {
      process.stdout.write(formatted);
    }
    return 0;
  } catch (error) {
    console.error(ui.error(`Cannot format ${input}: ${error instanceof Error ? error.message : "invalid source"}`));
    return 1;
  }
}

async function cmdInit(args: ParsedArgs): Promise<number> {
  console.log(`${ui.banner()}\n\n${ui.brand()}\n`);
  let options: Awaited<ReturnType<typeof resolveInitOptions>>;
  try {
    options = await resolveInitOptions(args, {
      interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      askProjectName: promptProjectName,
    });
  } catch (error) {
    console.error(ui.error(error instanceof Error ? error.message : "Invalid init options."));
    return 1;
  }

  const { projectDirectory, diagramName, description } = options;
  const projectRoot = resolve(process.cwd(), projectDirectory);
  mkdirSync(projectRoot, { recursive: true });
  const projectName = options.projectName ?? displayNameForDirectory(projectRoot);
  const diagramsRoot = join(projectRoot, "diagrams");
  const diagramFile = `${diagramName}.dgm`;
  const diagramPath = join(diagramsRoot, diagramFile);
  const diagramsReadmePath = join(diagramsRoot, "README.md");
  const instructionsPath = join(projectRoot, "DUMB_DIAGRAMS.md");
  const agentsPath = join(projectRoot, "AGENTS.md");
  const claudePath = join(projectRoot, "CLAUDE.md");
  const readmePath = join(projectRoot, "README.md");
  const examplesRoot = join(projectRoot, "examples");
  mkdirSync(diagramsRoot, { recursive: true });
  const starterDocument = createEmptyDocument(diagramName);
  starterDocument.title = displayNameForDirectory(diagramName);
  const diagramSource = printDgm(starterDocument);
  console.log(ui.heading("Creating project"));
  console.log(ui.info("name", projectName));
  console.log(ui.info("folder", projectRoot));
  console.log(ui.info("diagram", `diagrams/${diagramFile}`));
  console.log("");
  const templateVars = { projectName, diagramFile, description };
  const diagramsReadme = renderInitTemplate("diagrams-readme.md", templateVars);
  const instructions = renderInitTemplate("DUMB_DIAGRAMS.md", templateVars);
  const agentPointer = renderInitTemplate("AGENTS.md", templateVars);
  const readme = renderInitTemplate("README.md", templateVars);

  const catalogReference = createCatalogReference();
  const catalogMarkdownPath = join(projectRoot, "CATALOG.md");
  const catalogJsonPath = join(projectRoot, "CATALOG.json");

  const files = [
    [diagramsReadmePath, diagramsReadme],
    [diagramPath, diagramSource],
    [instructionsPath, instructions],
    [agentsPath, agentPointer],
    [claudePath, renderInitTemplate("CLAUDE.md", templateVars)],
    [readmePath, readme],
    [catalogMarkdownPath, catalogReference.markdown],
    [catalogJsonPath, catalogReference.json],
  ] as const;
  let created = 0;
  for (const [filePath, contents] of files) {
    if (existsAsFileOrDirectory(filePath)) {
      console.log(ui.skip(`Skipped ${relativeForLog(filePath)} (already exists)`));
      continue;
    }
    writeFileSync(filePath, contents, "utf8");
    console.log(ui.success(`Created ${relativeForLog(filePath)}`));
    created++;
  }
  created += copyProjectExamples(projectRoot, examplesRoot);

  const requestedEditor = flagString(args, "editor", "");
  if (hasFlag(args, "open-editor") || hasFlag(args, "open") || requestedEditor) {
    openProjectEditor(projectRoot, requestedEditor);
  }

  console.log(ui.summary(created ? "Project ready" : "Project already exists"));
  console.log(ui.info("next", ui.command(`npx dumbdiagrams@latest studio ${relativeForLog(diagramsRoot)}`)));
  return 0;
}

function createCatalogReference(): { markdown: string; json: string } {
  const entries = listAssets("all", { includeAliases: false })
    .sort((left, right) => {
      const provider = left.provider.localeCompare(right.provider);
      if (provider) return provider;
      const kind = left.assetKind.localeCompare(right.assetKind);
      if (kind) return kind;
      const category = left.category.localeCompare(right.category);
      if (category) return category;
      return left.name.localeCompare(right.name) || left.type.localeCompare(right.type);
    });
  const canonicalByIcon = new Map(entries.map((entry) => [entry.icon.sourceId, entry]));
  const legacyAliases = listAssets("all", { includeAliases: true })
    .filter((entry) => !entry.canonical)
    .map((entry) => ({
      alias: entry.type,
      canonicalType: canonicalByIcon.get(entry.icon.sourceId)?.type ?? entry.type,
      name: entry.name,
      provider: entry.provider,
      assetKind: entry.assetKind,
      iconSourceId: entry.icon.sourceId,
    }))
    .sort((left, right) => left.alias.localeCompare(right.alias));

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
    scope: entry.scope,
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
    legacyAliases,
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
    `This project contains ${jsonEntries.length} canonical, browsable catalog entries across ${Object.keys(providerCounts).length} providers.`,
    "The complete machine-readable inventory is in `CATALOG.json`.",
    "",
    "## Icon rules for agents",
    "",
    "- Use the exact `type` value as the first token of a resource or group line.",
    "  Example: `aws.api-gateway gateway \"Public API\"`.",
    "- The quoted label changes display text only; it does not select the icon.",
    "- Use `assetKind: group` entries for cloud/account/region/network/group",
    "  boundaries. Use `assetKind: resource` entries for service/resource nodes.",
    "- Check `allowedParents` before nesting a node. Check `allowRoot` before",
    "  placing it outside a boundary.",
    "- Prefer canonical types. Aliases are listed for recognition, but should not",
    "  be used when a canonical type is available.",
    "- Do not add an `icon` option for normal catalog icons. That option is only",
    "  for explicitly embedded/custom assets.",
    "",
    "Search examples:",
    "",
    "```bash",
    "rg -n \"DynamoDB|aws\\.dynamodb\" CATALOG.md CATALOG.json",
    "rg -n \"API Gateway|aws\\.api-gateway\" CATALOG.md CATALOG.json",
    "```",
    "",
    "## Legacy aliases",
    "",
    "The following legacy aliases are still accepted for compatibility. Prefer",
    "the canonical type on the right when creating new diagrams:",
    "",
    ...legacyAliases.map((entry) => `- \`${entry.alias}\` → \`${entry.canonicalType}\``),
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

  return {
    markdown,
    json: `${JSON.stringify(catalogJson, null, 2)}\n`,
  };
}

function copyProjectExamples(projectRoot: string, examplesRoot: string): number {
  mkdirSync(examplesRoot, { recursive: true });
  const files = ["README.md", ...PROJECT_REFERENCE_FILES];
  let created = 0;

  for (const fileName of files) {
    const sourcePath = resolveProjectExample(fileName);
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

function resolveProjectExample(fileName: string): string | undefined {
  const candidates = [
    resolve(__dirname, "templates", "examples", fileName),
    resolve(__dirname, "..", "templates", "examples", fileName),
    resolve(__dirname, "..", "..", "..", "examples", fileName),
    resolve(__dirname, "..", "..", "..", "examples", "diagrams", fileName),
  ];
  return candidates.find((candidate) => existsAsFileOrDirectory(candidate));
}

async function cmdFixtures(args: ParsedArgs): Promise<number> {
  const name = args.positionals[0] ?? "async-docs";
  const fixture = FIXTURES[name];
  if (!fixture) {
    console.error(ui.error(`Unknown fixture: ${name}. Choose async-docs or transfer-hub.`));
    return 1;
  }
  const doc = fixture();
  const result = compileDiagram(doc);
  if (!result.ok) {
    printIssues("Fixture errors", result.issues);
    return 1;
  }
  const output = resolve(process.cwd(), flagString(args, "output", `.artifacts/golden/${name}.svg`));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, await renderPortableSvg(doc, result.layout!, { loadCatalogSvg }), "utf8");
  console.log(ui.success(`Rendered ${relativeForLog(output)}`));
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

function loadDocument(input: string) {
  if (FIXTURES[input]) return FIXTURES[input]!();
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
  write(level === "warn" ? ui.warning(heading) : ui.error(heading));
  for (const issue of issues) write(`    ${issue.message}`);
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

function resolveStudioInput(input: string): string {
  const target = resolve(process.cwd(), input);
  if (!existsAsFileOrDirectory(target)) {
    return target.toLowerCase().endsWith(".dgm") ? target : join(target, "architecture.dgm");
  }
  if (!statSync(target).isDirectory()) return target;

  const candidates = readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".dgm"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const selected = candidates.find((fileName) => fileName.toLowerCase() === "architecture.dgm")
    ?? candidates[0]
    ?? "architecture.dgm";
  return join(target, selected);
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
      console.warn(ui.warning("Could not find a supported editor command. Open the project manually with `cursor .` or `code .`."));
      return;
    }

    const child = spawn(command, [projectRoot], { detached: true, stdio: "ignore" });
    child.once("spawn", () => {
      child.unref();
      console.log(ui.success(`Opened project in ${command}: ${relativeForLog(projectRoot)}`));
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
    console.error(ui.error(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
