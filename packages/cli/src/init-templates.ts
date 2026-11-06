import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { err, Result } from "neverthrow";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export interface InitTemplateVars {
  projectName: string;
}

export type InitTemplateError =
  | { readonly code: "missing-template"; readonly message: string; readonly fileName: string }
  | {
      readonly code: "template-read-failed";
      readonly message: string;
      readonly fileName: string;
      readonly path: string;
      readonly cause: unknown;
    };

export function renderInitTemplate(fileName: string, vars: InitTemplateVars): Result<string, InitTemplateError> {
  return readInitTemplate(fileName).map((template) => template.replaceAll("{{projectName}}", vars.projectName));
}

function readInitTemplate(fileName: string): Result<string, InitTemplateError> {
  const path = resolveInitTemplate(fileName);
  if (!path) {
    return err({ code: "missing-template", message: `Missing init template: ${fileName}`, fileName });
  }
  return Result.fromThrowable(
    () => readFileSync(path, "utf8"),
    (cause): InitTemplateError => ({
      code: "template-read-failed",
      message: `Unable to read init template ${fileName}: ${cause instanceof Error ? cause.message : String(cause)}`,
      fileName,
      path,
      cause,
    }),
  )();
}

function resolveInitTemplate(fileName: string): string | undefined {
  const candidates = [
    join(moduleDir, "templates", "project", fileName),
    join(moduleDir, "..", "templates", "project", fileName),
    join(moduleDir, "dist", "templates", "project", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
