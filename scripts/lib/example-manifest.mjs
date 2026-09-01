import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEGACY_FIXTURES = [
  "examples/diagrams/async-docs.dgm",
  "examples/diagrams/transfer-hub.dgm",
];

export function repoRoot() {
  return root;
}

export function loadCuratedBaseline() {
  return JSON.parse(readFileSync(resolve(root, "examples/curated-baseline.json"), "utf8"));
}

export function curatedEntries() {
  return Object.entries(loadCuratedBaseline().curated ?? {});
}

export function awsCuratedIds() {
  return curatedEntries()
    .filter(([, entry]) => entry.architectureBrief)
    .map(([id]) => id);
}

export function curatedDiagrams() {
  return curatedEntries().map(([id, entry]) => ({
    id,
    file: resolve(root, entry.diagram),
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
