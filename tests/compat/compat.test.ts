// Frozen format corpus. Files under v<N>/ are never edited: they prove that
// every release still reads what format N allowed. New syntax goes into a new
// file (or a new v<N+1>/ folder for a breaking format change).
import { globSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DGM_KEYWORDS, DGM_VALUES, parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));
const files = globSync("v*/*.dgm", { cwd: here }).sort();

// Defaults the canonical printer omits, so they cannot appear in a canonical file.
const PRINTER_DEFAULTS = new Set(["primary", "solid", "paper", "true", "auto"]);
const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

describe("format compatibility corpus", () => {
  it.each(files)("%s parses, validates, round-trips, and renders unchanged", async (file) => {
    const source = readFileSync(resolve(here, file), "utf8");
    const doc = parseDgm(source);
    expect(printDgm(doc)).toBe(source);
    const compiled = compileDiagram(doc);
    expect(compiled.issues.filter((issue) => issue.level === "error")).toEqual([]);
    await expect(compiled.svg).toMatchFileSnapshot(`__snapshots__/${file.replace("/", "-").replace(/\.dgm$/, ".svg")}`);
  });

  it("uses every v1 keyword and allowed value", () => {
    const v1 = files.filter((file) => file.startsWith("v1/"));
    expect(v1.map((file) => basename(file))).toContain("kitchen-sink.dgm");
    const tokens = new Set(
      v1.flatMap((file) => readFileSync(resolve(here, file), "utf8").replace(/"(?:\\.|[^"\\])*"/g, " ").split(/[\s{}]+/)),
    );
    const expected = [...Object.values(DGM_KEYWORDS), ...Object.values(DGM_VALUES)].flat();
    const missing = expected.filter((word) => !tokens.has(word) && !PRINTER_DEFAULTS.has(word));
    expect(missing).toEqual([]);
  });
});
