import type { ValidationIssue } from "@dumb-diagrams/runtime/core";
import type { DgmParseError } from "@dumb-diagrams/runtime/dsl";

export type CliError =
  | {
      readonly code: "invalid-arguments";
      readonly message: string;
      readonly command?: string;
      readonly cause?: unknown;
    }
  | { readonly code: "unknown-command"; readonly message: string; readonly command: string }
  | { readonly code: "input-read-failed"; readonly message: string; readonly input: string; readonly cause?: unknown }
  | {
      readonly code: "parse-failed";
      readonly parseCode: DgmParseError["code"];
      readonly message: string;
      readonly input: string;
      readonly line?: number;
      readonly column?: number;
      readonly cause?: unknown;
    }
  | {
      readonly code: "validation-failed";
      readonly message: string;
      readonly input: string;
      readonly issues: readonly ValidationIssue[];
    }
  | { readonly code: "format-failed"; readonly message: string; readonly input: string; readonly cause?: unknown }
  | {
      readonly code: "format-write-failed";
      readonly message: string;
      readonly output: string;
      readonly cause?: unknown;
    }
  | {
      readonly code: "catalog-asset-failed";
      readonly message: string;
      readonly asset: string;
      readonly cause?: unknown;
    }
  | {
      readonly code: "output-write-failed";
      readonly message: string;
      readonly output: string;
      readonly cause?: unknown;
    }
  | { readonly code: "init-failed"; readonly message: string; readonly cause?: unknown }
  | { readonly code: "studio-start-failed"; readonly message: string; readonly cause?: unknown };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseCliError(input: string, error: DgmParseError): CliError {
  return {
    code: "parse-failed",
    parseCode: error.code,
    message: error.message,
    input,
    ...(error.code === "invalid-syntax" ? { line: error.line, column: error.column } : {}),
    cause: error,
  };
}
