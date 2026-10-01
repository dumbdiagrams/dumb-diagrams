import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram, invariantTier } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { compiledGeometry, diffCompiledGeometry } from "../../../scripts/lib/compiled-geometry.mjs";

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

      const hard = result.invariantFailures.filter((failure) => invariantTier(failure.code) === "hard");
      expect(hard, hard.map((failure) => `${failure.code}: ${failure.message}`).join("; ")).toEqual([]);
      const obscuredLabels = result.invariantFailures.filter((failure) =>
        failure.code === "edge-label-node-collision" || failure.code === "edge-label-group-collision",
      );
      expect(obscuredLabels, obscuredLabels.map((failure) => failure.message).join("; ")).toEqual([]);

      const layout = result.layout;
      const aspect = layout.width / layout.height;
      expect(aspect, `${id} aspect ${aspect.toFixed(2)}`).toBeGreaterThanOrEqual(contract.minAspectRatio);
      expect(aspect, `${id} aspect ${aspect.toFixed(2)}`).toBeLessThanOrEqual(contract.maxAspectRatio);
      expect(layout.width, `${id} width`).toBeLessThanOrEqual(contract.maxWidth);
      expect(layout.height, `${id} height`).toBeLessThanOrEqual(contract.maxHeight);

      const nodes = new Map(layout.nodes.map((node) => [node.id, node.obstacle]));
      for (const chain of contract.leftToRight ?? []) {
        for (let index = 1; index < chain.length; index += 1) {
          const leftId = chain[index - 1]!;
          const rightId = chain[index]!;
          const left = nodes.get(leftId);
          const right = nodes.get(rightId);
          expect(left, `${id} missing ${leftId}`).toBeDefined();
          expect(right, `${id} missing ${rightId}`).toBeDefined();
          if (!left || !right) continue;
          expect(left.x, `${id}: ${leftId} should be left of ${rightId}`).toBeLessThan(right.x);
        }
      }

      const diffs = diffCompiledGeometry(contract.geometry, compiledGeometry(layout));
      expect(diffs, diffs.join("\n")).toEqual([]);
      await expect(result.svg).toMatchFileSnapshot(`__snapshots__/${id}.svg`);
    });
  }
});
