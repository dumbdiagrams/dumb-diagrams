import { globSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEGACY_FIXTURES = ["examples/diagrams/async-docs.dgm", "examples/diagrams/transfer-hub.dgm"];

export function repoRoot() {
  return root;
}

export function curatedIds() {
  return readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function curatedDiagrams() {
  return curatedIds().map((id) => ({
    id,
    file: resolve(root, "examples/curated", id, "diagram.dgm"),
    baselineName: `${id}.dgm`,
  }));
}

export function performanceDiagrams() {
  return [
    ...LEGACY_FIXTURES.map((diagram) => resolve(root, diagram)),
    ...curatedDiagrams().map((diagram) => diagram.file),
  ];
}

export function routingDiagrams() {
  return [
    ...curatedDiagrams(),
    ...LEGACY_FIXTURES.map((diagram) => ({
      id: diagram.replace(/^.*\//, "").replace(/\.dgm$/, ""),
      file: resolve(root, diagram),
      baselineName: diagram.replace(/^.*\//, ""),
    })),
  ];
}

export function engineDiagrams() {
  const compatRoot = resolve(root, "tests/compat");
  const compatibility = globSync("v*/*.dgm", { cwd: compatRoot })
    .sort()
    .map((relativePath) => ({
      id: relativePath.replace(/\.dgm$/, "").replaceAll("/", "-"),
      file: resolve(compatRoot, relativePath),
      baselineName: `tests/compat/${relativePath}`,
    }));
  return [
    ...performanceDiagrams().map((file) => ({
      id: file
        .replace(`${root}/`, "")
        .replaceAll("/", "-")
        .replace(/\.dgm$/, ""),
      file,
      baselineName: file.replace(`${root}/`, ""),
    })),
    ...compatibility,
  ];
}
