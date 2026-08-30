import { basename } from "node:path";

export interface InitArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

export interface InitOptionsContext {
  interactive: boolean;
  askProjectName?: (defaultName: string) => Promise<string>;
  currentName?: string;
}

export interface ResolvedInitOptions {
  projectName: string;
}

export async function resolveInitOptions(
  args: InitArgs,
  context: InitOptionsContext,
): Promise<ResolvedInitOptions> {
  if (args.positionals.length || args.flags.size) {
    throw new Error("init does not accept file paths, positionals, or options.");
  }

  const defaultName = displayNameForDirectory(context.currentName ?? process.cwd());
  const answer = context.interactive ? await context.askProjectName?.(defaultName) : undefined;
  return {
    projectName: cleanDisplayText(answer?.trim() || defaultName, "repository name", 120),
  };
}

export function displayNameForDirectory(path: string): string {
  const value = basename(path) || "repository";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function cleanDisplayText(value: string, label: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error(`${label} cannot be empty.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}
