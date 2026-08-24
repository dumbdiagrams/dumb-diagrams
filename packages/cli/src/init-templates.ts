import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export interface InitTemplateVars {
  projectName: string;
  diagramFile: string;
  description?: string;
}

export function renderInitTemplate(fileName: string, vars: InitTemplateVars): string {
  const template = readProjectTemplate(fileName);
  const diagramFilePadded = vars.diagramFile.padEnd(32);
  const descriptionBlock = vars.description ? `${vars.description}\n\n` : "";
  const replacements: Record<string, string> = {
    projectName: vars.projectName,
    diagramFile: vars.diagramFile,
    diagramFilePadded,
    descriptionBlock,
  };
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function readProjectTemplate(fileName: string): string {
  const path = resolveProjectTemplate(fileName);
  if (!path) {
    throw new Error(`Missing init template: ${fileName}`);
  }
  return readFileSync(path, "utf8");
}

function resolveProjectTemplate(fileName: string): string | undefined {
  const candidates = [
    join(moduleDir, "templates", "project", fileName),
    join(moduleDir, "..", "templates", "project", fileName),
    join(moduleDir, "dist", "templates", "project", fileName),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}
