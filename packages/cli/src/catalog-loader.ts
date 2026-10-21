import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { errAsync, okAsync, Result, type ResultAsync } from "neverthrow";
import { getCatalogEntryByBrowserPath } from "@dumb-diagrams/runtime/catalog";
import type { PortableSvgError } from "@dumb-diagrams/runtime/render";

import { errorMessage } from "./cli-errors.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function loadCatalogSvg(browserPath: string): ResultAsync<string, PortableSvgError> {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  if (!entry) {
    return errAsync<string, PortableSvgError>({
      code: "catalog-icon-load-failed",
      message: `Catalog icon is not registered: ${browserPath}`,
      browserPath,
    });
  }
  const filePath = [
    resolve(moduleDir, "..", "..", "..", entry.icon.sourcePath),
    resolve(moduleDir, "source", entry.icon.sourcePath),
    resolve(moduleDir, "studio", browserPath),
  ].find((candidate) => existsAsFileOrDirectory(candidate));
  if (!filePath) {
    return errAsync<string, PortableSvgError>({
      code: "catalog-icon-load-failed",
      message: `Catalog icon asset is unavailable for ${browserPath}`,
      browserPath,
    });
  }
  return readCatalogSvgFile(browserPath, filePath);
}

export function readCatalogSvgFile(browserPath: string, filePath: string): ResultAsync<string, PortableSvgError> {
  const content = Result.fromThrowable(
    () => readFileSync(filePath, "utf8"),
    (cause): PortableSvgError => ({
      code: "catalog-icon-load-failed",
      message: errorMessage(cause),
      browserPath,
      cause,
    }),
  )();
  return content.isOk()
    ? okAsync<string, PortableSvgError>(content.value)
    : errAsync<string, PortableSvgError>(content.error);
}

function existsAsFileOrDirectory(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

