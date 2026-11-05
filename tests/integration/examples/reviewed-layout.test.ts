import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, "examples/reviewed/manifest.json"), "utf8"));

describe("reviewed Studio source layout goldens", () => {
  for (const example of manifest.examples) {
    it(`preserves ${example.id} when the engine changes`, async () => {
      const parsed = parseDgmResult(readFileSync(resolve(root, example.source), "utf8"));
      expect(parsed.isOk()).toBe(true);
      if (parsed.isErr()) return;
      expect(parsed.value.grammar).toBe(example.provider);

      const result = compileDiagram(parsed.value);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.issues).toEqual([]);
      expect(result.invariantFailures.filter((finding) => finding.code !== "edge-crossing")).toEqual([]);
      // Historical SVG downloads stay immutable. These fresh render goldens
      // detect engine drift; known visual findings remain in the manifest.
      await expect(result.svg).toMatchFileSnapshot(`__snapshots__/reviewed/${example.id}.svg`);
    });
  }
});
