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
  projectName: string;
}

export async function resolveInitOptions(
  args: InitArgs,
  context: InitOptionsContext,
): Promise<ResolvedInitOptions> {
  if (args.positionals.length || args.flags.size) {
    throw new Error("init does not accept file paths, positionals, or options.");
  }

  const defaultName = defaultProjectDirectory(context.now ?? new Date());
  const answer = context.interactive ? await context.askProjectName?.(defaultName) : undefined;
  const projectName = cleanDisplayText(answer?.trim() || defaultName, "project name", 120);
  return {
    projectDirectory: slugify(projectName, "project name"),
    projectName,
  };
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

function cleanDisplayText(value: string, label: string, maxLength: number): string {
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
