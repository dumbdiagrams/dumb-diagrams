#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getCatalogEntryByBrowserPath, listAssets } from "@dumb-diagrams/runtime/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram, renderPortableSvg } from "@dumb-diagrams/runtime/render";

import { createCliUi } from "./cli-ui.js";
import { renderInitTemplate } from "./init-templates.js";
import { resolveInitOptions } from "./init-options.js";
import { browserLaunchCommand } from "./platform-launch.js";
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
] as const;
const CURATED_FILE_NAMES = ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"] as const;

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rawArgs] = argv;
  const parsed = parseArgs(rawArgs, command);

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
      await cmdStudio(parsed);
      return 0;
    case "init":
      return await cmdInit(parsed);
    case "validate":
      return cmdValidate(parsed);
    case "format":
      return cmdFormat(parsed);
    case "render":
      return await cmdRender(parsed);
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
  ${ui.command("dumbdiagrams init")}       Create a project folder for agents
  ${ui.command("dumbdiagrams studio")}     Open the local diagram editor
  ${ui.command("dumbdiagrams validate")}   Validate a .dgm source file
  ${ui.command("dumbdiagrams format")}     Canonicalize a .dgm source file
  ${ui.command("dumbdiagrams render")}     Render a .dgm source file to SVG

${ui.heading("Commands")}
  ${ui.command("init")}                    Create a project folder for agents
  ${ui.command("studio")}                  Open the generic local .dgm editor
  ${ui.command("validate <file.dgm>")}      Parse and fully validate a diagram
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

async function cmdStudio(args: ParsedArgs): Promise<void> {
  rejectArguments(args, "studio");
  const testPort = Number(process.env.DUMBDIAGRAMS_STUDIO_PORT);
  const handle = await startStudioServer({
    port: Number.isInteger(testPort) && testPort >= 0 && testPort <= 65535 ? testPort : undefined,
  });

  console.log(`\n${ui.brand()}\n`);
  console.log(ui.heading("Studio is ready"));
  console.log(ui.info("local", ui.command(handle.url)));
  console.log(ui.info("file", "Use Open to choose any .dgm file on disk"));
  console.log(ui.info("stop", "Ctrl+C"));

  if (process.env.DUMBDIAGRAMS_STUDIO_NO_OPEN !== "1") openBrowser(handle.url);
  await waitForShutdown(handle.server);
}

function cmdValidate(args: ParsedArgs): number {
  if (args.positionals.length !== 1 || args.flags.size) {
    console.error(ui.error("validate expects exactly one .dgm file path (or - for stdin) and no options."));
    return 1;
  }
  const input = args.positionals[0]!;
  const filePath = input === "-" ? undefined : resolve(process.cwd(), input);
  try {
    const source = readDiagramSource(input);
    const result = compileDiagram(parseDgm(source));
    if (!result.ok) {
      console.error(ui.error(`Invalid diagram: ${displayInput(filePath)}`));
      for (const issue of result.issues) {
        console.error(`  ${issue.code}${issue.id ? ` (${issue.id})` : ""}: ${issue.message}`);
      }
      return 1;
    }
    console.log(ui.success(`Valid diagram: ${displayInput(filePath)}`));
    return 0;
  } catch (error) {
    console.error(ui.error(`Invalid diagram: ${displayInput(filePath)}`));
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function cmdFormat(args: ParsedArgs): number {
  const allowed = new Set(["check", "write", "stdout"]);
  if (args.positionals.length !== 1 || [...args.flags.keys()].some((flag) => !allowed.has(flag))) {
    console.error(ui.error("format expects one .dgm file path (or - for stdin), with optional --check, --write, or --stdout."));
    return 1;
  }
  const input = args.positionals[0]!;
  if (input === "-" && args.flags.has("write")) {
    console.error(ui.error("format --write requires a file path; stdin cannot be overwritten."));
    return 1;
  }
  if (args.flags.has("check") && args.flags.has("write")) {
    console.error(ui.error("format --check and --write cannot be used together."));
    return 1;
  }
  if (args.flags.has("stdout") && args.flags.has("write")) {
    console.error(ui.error("format --stdout and --write cannot be used together."));
    return 1;
  }

  const filePath = input === "-" ? undefined : resolve(process.cwd(), input);
  try {
    const source = readDiagramSource(input);
    const doc = parseDgm(source);
    const result = compileDiagram(doc);
    if (!result.ok) {
      reportCompilationFailure(result.issues, filePath);
      return 1;
    }
    const formatted = printDgm(doc);
    if (args.flags.has("check")) {
      if (source !== formatted) {
        console.error(ui.error(`Needs formatting: ${displayInput(filePath)}`));
        return 1;
      }
      console.error(ui.success(`Already formatted: ${displayInput(filePath)}`));
      return 0;
    }
    if (args.flags.has("write")) {
      writeOutputAtomically(filePath!, formatted);
      console.error(ui.success(`Formatted: ${displayInput(filePath)}`));
      return 0;
    }
    process.stdout.write(formatted);
    return 0;
  } catch (error) {
    reportInputFailure(error, filePath);
    return 1;
  }
}

async function cmdRender(args: ParsedArgs): Promise<number> {
  const allowed = new Set(["output", "o", "stdout", "format"]);
  if (args.positionals.length !== 1 || [...args.flags.keys()].some((flag) => !allowed.has(flag))) {
    console.error(ui.error("render expects one .dgm file path (or - for stdin), with optional --output/-o and --format svg."));
    return 1;
  }
  const input = args.positionals[0]!;
  const outputValue = args.flags.get("output") ?? args.flags.get("o");
  if (outputValue !== undefined && typeof outputValue !== "string") {
    console.error(ui.error("render --output/-o requires a destination path."));
    return 1;
  }
  const outputPath = typeof outputValue === "string" && outputValue !== "-" ? resolve(process.cwd(), outputValue) : undefined;
  if (args.flags.has("stdout") && outputPath) {
    console.error(ui.error("render --stdout and --output cannot be used together."));
    return 1;
  }
  const format = args.flags.get("format");
  if (format !== undefined && format !== "svg") {
    console.error(ui.error(`Unsupported render format ${String(format)}; only svg is supported.`));
    return 1;
  }

  const filePath = input === "-" ? undefined : resolve(process.cwd(), input);
  try {
    const source = readDiagramSource(input);
    const doc = parseDgm(source);
    const result = compileDiagram(doc);
    if (!result.ok) {
      reportCompilationFailure(result.issues, filePath);
      return 1;
    }
    const svg = await renderPortableSvg(doc, result.layout, {
      loadCatalogSvg: loadCatalogSvg,
    });
    if (outputPath) {
      writeOutputAtomically(outputPath, svg);
      console.error(ui.success(`Rendered SVG: ${relativeForLog(outputPath)}`));
    } else {
      process.stdout.write(svg);
    }
    return 0;
  } catch (error) {
    reportInputFailure(error, filePath);
    return 1;
  }
}

function readDiagramSource(input: string): string {
  return input === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(process.cwd(), input), "utf8");
}

function displayInput(filePath: string | undefined): string {
  return filePath ? relativeForLog(filePath) : "<stdin>";
}

function reportCompilationFailure(issues: Array<{ code: string; id?: string; message: string }>, filePath: string | undefined): void {
  console.error(ui.error(`Invalid diagram: ${displayInput(filePath)}`));
  for (const issue of issues) {
    console.error(`  ${issue.code}${issue.id ? ` (${issue.id})` : ""}: ${issue.message}`);
  }
}

function reportInputFailure(error: unknown, filePath: string | undefined): void {
  console.error(ui.error(`Unable to process diagram: ${displayInput(filePath)}`));
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
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

function loadCatalogSvg(browserPath: string): Promise<string> {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  if (!entry) return Promise.reject(new Error(`Catalog icon is not registered: ${browserPath}`));
  const candidates = [
    resolve(__dirname, "..", "..", "..", entry.icon.sourcePath),
    resolve(__dirname, "source", entry.icon.sourcePath),
    resolve(__dirname, "studio", browserPath),
  ];
  const filePath = candidates.find((candidate) => existsAsFileOrDirectory(candidate));
  if (!filePath) {
    return Promise.reject(new Error(`Catalog icon asset is unavailable for ${browserPath}`));
  }
  return Promise.resolve(readFileSync(filePath, "utf8"));
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
    .filter((entry) => !entry.canonical && canonicalByIcon.has(entry.icon.sourceId))
    .map((entry) => ({
      alias: entry.type,
      canonicalType: canonicalByIcon.get(entry.icon.sourceId)!.type,
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
    "- For a general logical container, always use `cloud-agnostic.boundary`.",
    "  Never author the legacy `group` shorthand or `cloud-agnostic.logical`.",
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
    "rg -n \"DynamoDB|aws\\.dynamodb\" .dumbdiagrams/catalog.md .dumbdiagrams/catalog.json",
    "rg -n \"API Gateway|aws\\.api-gateway\" .dumbdiagrams/catalog.md .dumbdiagrams/catalog.json",
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

function rejectArguments(args: ParsedArgs, command: string): void {
  if (args.positionals.length || args.flags.size) {
    throw new Error(`${command} does not accept file paths, positionals, or options.`);
  }
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

function openBrowser(url: string): void {
  const { command, args } = browserLaunchCommand(process.platform, url);
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
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
