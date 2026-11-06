import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DGM_KEYWORDS, DGM_VALUES } from "@dumb-diagrams/runtime/dsl";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const docs = {
  website: "packages/website/src/content/docs/source-format.md",
  agent: "packages/cli/templates/project/.dumbdiagrams/dgm.md",
};
const terms = [...new Set([...Object.values(DGM_KEYWORDS), ...Object.values(DGM_VALUES)].flat())];

describe.each(Object.entries(docs))("%s format reference", (_, path) => {
  const codeWords = new Set(
    [...readFileSync(resolve(root, path), "utf8").matchAll(/`([^`\n]+)`/g)].flatMap(([, span]) => span!.split(/[\s{}]+/)),
  );
  it.each(terms)("documents `%s`", (term) => {
    expect(codeWords).toContain(term);
  });
});
