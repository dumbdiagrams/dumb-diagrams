import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function repoRoot() {
  return root;
}

/** Diagrams from every reviewed model run, keyed `<run>/<bundle>`. */
export function approvedDiagrams() {
  return globSync("examples/approved/*/*/diagram.dgm", { cwd: root })
    .sort()
    .map((path) => {
      const id = path.replace(/^examples\/approved\//, "").replace(/\/diagram\.dgm$/, "");
      return { id, file: resolve(root, path), baselineName: `${id}.dgm` };
    });
}

/** Engine regression fixtures that unit and browser tests target directly. */
export function engineFixtures() {
  return globSync("tests/fixtures/engine/*.dgm", { cwd: root })
    .sort()
    .map((path) => {
      const id = path.replace(/^.*\//, "").replace(/\.dgm$/, "");
      return { id, file: resolve(root, path), baselineName: path };
    });
}

export function performanceDiagrams() {
  return [...engineFixtures(), ...approvedDiagrams()].map((diagram) => diagram.file);
}

export function routingDiagrams() {
  return approvedDiagrams();
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
