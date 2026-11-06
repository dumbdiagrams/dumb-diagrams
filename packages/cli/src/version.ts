import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function readCliVersion(): string {
  const candidates = [join(moduleDir, "..", "package.json"), join(moduleDir, "package.json")];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { version?: string };
    if (manifest.version) return manifest.version;
  }
  return "0.0.0";
}
