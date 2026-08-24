import { basename } from "node:path";

export interface InitArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

export interface InitOptionsContext {
  interactive: boolean;
  askProjectName?: (defaultName: string) => Promise<string>;
  now?: Date;
}

export interface ResolvedInitOptions {
  projectDirectory: string;
  projectName?: string;
  diagramName: string;
  description?: string;
  prompted: boolean;
}

const INTERACTIVE_DEFAULT_NAME = "my-diagram-project";

export async function resolveInitOptions(
  args: InitArgs,
  context: InitOptionsContext,
): Promise<ResolvedInitOptions> {
  if (args.positionals.length > 1) {
    throw new Error("init accepts at most one directory. Use --name for the project display name.");
  }

  const positionalDirectory = args.positionals[0];
  const flaggedDirectory = optionalValueFlag(args, "directory");
  if (positionalDirectory && flaggedDirectory) {
    throw new Error("Choose either the positional directory or --directory, not both.");
  }

  let projectName = cleanDisplayText(optionalValueFlag(args, "name"), "project name", 120);
  let projectDirectory = positionalDirectory ?? flaggedDirectory;
  let prompted = false;

  if (!projectDirectory && !projectName && context.interactive && !args.flags.has("yes")) {
    const answer = await context.askProjectName?.(INTERACTIVE_DEFAULT_NAME);
    projectName = cleanDisplayText(answer?.trim() || INTERACTIVE_DEFAULT_NAME, "project name", 120);
    prompted = true;
  }

  if (!projectDirectory) {
    projectDirectory = projectName
      ? slugify(projectName, "project name")
      : defaultProjectDirectory(context.now ?? new Date());
  }

  const diagramFlag = optionalValueFlag(args, "diagram") ?? "architecture";
  const diagramName = slugify(diagramFlag.replace(/\.dgm$/i, ""), "diagram name");
  const description = cleanDisplayText(
    optionalValueFlag(args, "description"),
    "description",
    240,
  );

  return {
    projectDirectory,
    projectName,
    diagramName,
    description,
    prompted,
  };
}

export function displayNameForDirectory(path: string): string {
  const value = basename(path) || "diagram-project";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function defaultProjectDirectory(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-");
  return `dumb-diagrams-${timestamp}`;
}

function optionalValueFlag(args: InitArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  if (value === true) throw new Error(`--${name} requires a value.`);
  return value?.trim() || undefined;
}

function cleanDisplayText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} cannot be empty.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function slugify(value: string, label: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  if (!slug) throw new Error(`${label} must contain at least one letter or number.`);
  return slug;
}
