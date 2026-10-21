import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { compiledGeometry, diffCompiledGeometry } from "../../../scripts/lib/compiled-geometry.mjs";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const contracts = JSON.parse(readFileSync(resolve(root, "examples/layout-contracts.json"), "utf8"));

describe("curated provider layout contracts", () => {
  const curatedIds = readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("covers every curated provider example", () => {
    expect(Object.keys(contracts.examples).sort()).toEqual(curatedIds);
  });

  it("names the moved entity when compiled geometry drifts", () => {
    const expected = {
      width: 96,
      height: 80,
      nodes: { handler: { x: 0, y: 0, w: 40, h: 40 } },
      groups: {},
      routes: {},
    };
    const actual = {
      ...expected,
      nodes: { handler: { x: 16, y: 0, w: 40, h: 40 } },
    };
    expect(diffCompiledGeometry(expected, actual).join("\n")).toContain("node handler");
  });

  for (const [id, contract] of Object.entries(contracts.examples)) {
    it(`keeps ${id} within its reviewed layout contract`, async () => {
      const doc = parseDgm(readFileSync(resolve(root, contract.diagram), "utf8"));
      expect(doc.flow, `${id} flow`).toBe(contract.flow);

      const result = compileDiagram(doc);
      expect(result.ok, result.ok ? undefined : result.issues.map((issue) => issue.message).join("; ")).toBe(true);
      if (!result.ok) return;

      const diffs = diffCompiledGeometry(contract.geometry, compiledGeometry(result.layout));
      expect(diffs, diffs.join("\n")).toEqual([]);
      await expect(result.svg).toMatchFileSnapshot(`__snapshots__/${id}.svg`);
    });
  }
});
