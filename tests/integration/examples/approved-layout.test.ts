import { readFileSync } from "node:fs";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { compiledGeometry, diffCompiledGeometry } from "../../../scripts/lib/compiled-geometry.mjs";
import { approvedDiagrams, repoRoot } from "../../../scripts/lib/example-manifest.mjs";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const contracts = JSON.parse(readFileSync(`${repoRoot()}/examples/layout-contracts.json`, "utf8"));

describe("approved example layout contracts", () => {
  it("covers every approved example", () => {
    expect(Object.keys(contracts.examples).sort()).toEqual(approvedDiagrams().map(({ id }) => id));
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

  for (const { id, file } of approvedDiagrams()) {
    it(`keeps ${id} within its reviewed layout contract`, async () => {
      const contract = contracts.examples[id];
      const doc = parseDgm(readFileSync(file, "utf8"));
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
