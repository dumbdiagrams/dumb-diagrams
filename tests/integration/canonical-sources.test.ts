import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { validateDocument } from "@dumb-diagrams/runtime/core";
import { formatParseError, parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sources = globSync(["examples/**/*.dgm", "packages/website/src/**/*.dgm", "tests/**/*.dgm"], { cwd: root }).sort();

describe("checked-in .dgm sources", () => {
  it("finds the source corpus", () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(sources)("%s is canonical and valid", (file) => {
    const source = readFileSync(resolve(root, file), "utf8");
    const parsed = parseDgmResult(source);
    if (parsed.isErr()) throw new Error(`${file}:${formatParseError(parsed.error)}`);
    const canonical = printDgm(parsed.value);
    const historical = file.startsWith("examples/reviewed/") || file.startsWith("examples/model-runs/") || file.startsWith("examples/evaluations/incomplete-composer/") || file.startsWith("tests/fixtures/automatic-quality/");
    if (historical) {
      // Preserve historical source bytes alongside original exports and model
      // failures. They must still parse, validate, and canonicalize stably.
      expect(printDgm(parseDgmResult(canonical)._unsafeUnwrap())).toBe(canonical);
    } else {
      expect(canonical, "run dumbdiagrams format --write").toBe(source);
    }
    const errors = validateDocument(parsed.value, getCatalogMap()).filter((issue) => issue.level === "error");
    expect(errors).toEqual([]);
  });
});
