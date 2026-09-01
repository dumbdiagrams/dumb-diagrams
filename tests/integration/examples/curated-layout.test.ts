import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const contracts = JSON.parse(readFileSync(resolve(root, "examples/layout-contracts.json"), "utf8"));

describe("curated AWS layout contracts", () => {
  const awsIds = readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("covers every AWS curated example", () => {
    expect(Object.keys(contracts.examples).sort()).toEqual(awsIds);
  });

  for (const [id, contract] of Object.entries(contracts.examples)) {
    it(`keeps ${id} within its reviewed layout contract`, () => {
      const doc = parseDgm(readFileSync(resolve(root, contract.diagram), "utf8"));
      expect(doc.flow, `${id} flow`).toBe(contract.flow);

      const result = compileDiagram(doc);
      expect(result.ok, result.ok ? undefined : result.issues.map((issue) => issue.message).join("; ")).toBe(true);
      if (!result.ok) return;

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
    });
  }
});
