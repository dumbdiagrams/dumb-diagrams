import { globSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function repoRoot() {
  return root;
}

/** Normalize filesystem paths for stable manifest IDs and baseline keys. */
export function toPosixPath(path) {
  return path.replaceAll("\\", "/");
}

/** Diagrams from every reviewed model run, keyed `<run>/<bundle>`. */
export function approvedDiagrams() {
  return globSync("examples/approved/*/*/diagram.dgm", { cwd: root })
    .sort()
    .map((path) => {
      const key = toPosixPath(path);
      const id = key.replace(/^examples\/approved\//, "").replace(/\/diagram\.dgm$/, "");
      return { id, file: resolve(root, path), baselineName: `${id}.dgm` };
    });
}

/** Engine regression fixtures that unit and browser tests target directly. */
export function engineFixtures() {
  return globSync("tests/fixtures/engine/*.dgm", { cwd: root })
    .sort()
    .map((path) => {
      const key = toPosixPath(path);
      const id = key.replace(/^.*\//, "").replace(/\.dgm$/, "");
      return { id, file: resolve(root, path), baselineName: key };
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
    .map((relativePath) => {
      const key = toPosixPath(relativePath);
      return {
        id: key.replace(/\.dgm$/, "").replaceAll("/", "-"),
        file: resolve(compatRoot, relativePath),
        baselineName: `tests/compat/${key}`,
      };
    });
  return [
    ...performanceDiagrams().map((file) => ({
      id: toPosixPath(relative(root, file))
        .replaceAll("/", "-")
        .replace(/\.dgm$/, ""),
      file,
      baselineName: toPosixPath(relative(root, file)),
    })),
    ...compatibility,
  ];
}
