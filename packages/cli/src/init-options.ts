import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";

import { errorMessage, type CliError } from "./cli-errors.js";

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

export function resolveInitOptions(
  args: InitArgs,
  context: InitOptionsContext,
): ResultAsync<ResolvedInitOptions, CliError> {
  if (args.positionals.length || args.flags.size) {
    return errAsync(invalidInit("init does not accept file paths, positionals, or options."));
  }

  const defaultName = defaultProjectDirectory(context.now ?? new Date());
  const askProjectName = context.askProjectName;
  const answer =
    context.interactive && askProjectName
      ? ResultAsync.fromPromise(
          Promise.resolve().then(() => askProjectName(defaultName)),
          (cause) => invalidInit(errorMessage(cause), cause),
        )
      : okAsync<string | undefined, CliError>(undefined);
  return answer
    .andThen((value) => cleanDisplayText(value?.trim() || defaultName, "project name", 120))
    .andThen((projectName) =>
      slugify(projectName, "project name").map((projectDirectory) => ({ projectDirectory, projectName })),
    );
}

function invalidInit(message: string, cause?: unknown): CliError {
  return { code: "invalid-arguments", message, command: "init", ...(cause === undefined ? {} : { cause }) };
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

function cleanDisplayText(value: string, label: string, maxLength: number): Result<string, CliError> {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return err(invalidInit(`${label} cannot be empty.`));
  if (cleaned.length > maxLength) return err(invalidInit(`${label} must be ${maxLength} characters or fewer.`));
  return ok(cleaned);
}

function slugify(value: string, label: string): Result<string, CliError> {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug ? ok(slug) : err(invalidInit(`${label} must contain at least one letter or number.`));
}
