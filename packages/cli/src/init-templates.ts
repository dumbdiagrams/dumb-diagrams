import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export interface InitTemplateVars {
  projectName: string;
}

export function renderInitTemplate(fileName: string, vars: InitTemplateVars): string {
  const template = readInitTemplate(fileName);
  return template.replaceAll("{{projectName}}", vars.projectName);
}

function readInitTemplate(fileName: string): string {
  const path = resolveInitTemplate(fileName);
  if (!path) {
    throw new Error(`Missing init template: ${fileName}`);
  }
  return readFileSync(path, "utf8");
}

function resolveInitTemplate(fileName: string): string | undefined {
  const candidates = [
    join(moduleDir, "templates", "project", fileName),
    join(moduleDir, "..", "templates", "project", fileName),
    join(moduleDir, "dist", "templates", "project", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
