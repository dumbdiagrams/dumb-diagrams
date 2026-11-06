import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { LayoutResult, Rect } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramResult, invariantTier } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { approvedDiagrams, repoRoot } from "../../../scripts/lib/example-manifest.mjs";

const root = repoRoot();
const contracts = JSON.parse(readFileSync(resolve(root, "examples/layout-contracts.json"), "utf8"));
const reviewed = JSON.parse(readFileSync(resolve(root, "examples/routing-warnings.json"), "utf8"));

// These assertions describe acceptable output without requiring today's coordinates
// or SVG markup. Exact output remains in approved-layout.test.ts.
describe("engine-independent approved contracts", () => {
  it("covers every approved example", () => {
    expect(Object.keys(contracts.examples).sort()).toEqual(approvedDiagrams().map(({ id }) => id).sort());
  });

  for (const { id, file, baselineName } of approvedDiagrams()) {
    it(`${id} preserves layout intent and does not increase reviewed defects`, () => {
      const contract = contracts.examples[id];
      expect(contract, `${id} missing layout contract`).toBeDefined();
      const parsed = parseDgmResult(readFileSync(file, "utf8"));
      expect(parsed.isOk(), parsed.isErr() ? parsed.error.message : undefined).toBe(true);
      if (parsed.isErr()) return;
      const doc = parsed.value;
      expect(doc.flow).toBe(contract.flow);
      const result = compileDiagramResult(doc);
      expect(result.isOk(), result.isErr() ? result.error.message : undefined).toBe(true);
      if (result.isErr()) return;
      const { layout, issues, invariantFailures } = result.value;
      expect(issues).toEqual([]);
      expect(invariantFailures.filter((failure) => invariantTier(failure.code) === "hard")).toEqual([]);
      expect(invariantFailures.filter((failure) =>
        failure.code === "edge-label-node-collision" || failure.code === "edge-label-group-collision",
      )).toEqual([]);

      // Per-code ceilings allow improvements and intentional geometry changes,
      // while a different kind of defect cannot hide behind a lower total score.
      const ceilings = new Map<string, number>();
      for (const warning of reviewed.warnings.filter((warning: { file: string }) => warning.file === baselineName)) {
        ceilings.set(warning.code, (ceilings.get(warning.code) ?? 0) + 1);
      }
      const counts = new Map<string, number>();
      for (const failure of invariantFailures) counts.set(failure.code, (counts.get(failure.code) ?? 0) + 1);
      for (const [code, count] of counts) {
        expect(count, `${id}: ${code}`).toBeLessThanOrEqual(ceilings.get(code) ?? 0);
      }

      expect(layout.nodes.map((node) => node.id).sort()).toEqual(doc.resources.map((node) => node.id).sort());
      expect(layout.groups.map((group) => group.id).sort()).toEqual(doc.groups.map((group) => group.id).sort());
      expect(layout.edges.map((edge) => edge.id).sort()).toEqual(doc.edges.map((edge) => edge.id).sort());
      for (const edge of layout.edges) {
        const original = doc.edges.find((candidate) => candidate.id === edge.id)!;
        expect([edge.source, edge.target], edge.id).toEqual([original.source, original.target]);
      }
      expectFiniteGeometry(layout);
      expect(layout.width / layout.height).toBeGreaterThanOrEqual(contract.minAspectRatio);
      expect(layout.width / layout.height).toBeLessThanOrEqual(contract.maxAspectRatio);
      expect(layout.width).toBeLessThanOrEqual(contract.maxWidth);
      expect(layout.height).toBeLessThanOrEqual(contract.maxHeight);

      const nodes = new Map(layout.nodes.map((node) => [node.id, node.obstacle]));
      for (const chain of contract.leftToRight ?? []) {
        for (let index = 1; index < chain.length; index += 1) {
          const left = nodes.get(chain[index - 1]);
          const right = nodes.get(chain[index]);
          expect(left, `${id} missing ${chain[index - 1]}`).toBeDefined();
          expect(right, `${id} missing ${chain[index]}`).toBeDefined();
          expect(left!.x, `${id}: ${chain[index - 1]} before ${chain[index]}`).toBeLessThan(right!.x);
        }
      }
    });
  }
});

function expectFiniteGeometry(layout: LayoutResult) {
  expect(Number.isFinite(layout.width) && layout.width > 0).toBe(true);
  expect(Number.isFinite(layout.height) && layout.height > 0).toBe(true);
  const rect = (value: Rect) => {
    expect(Object.values(value).every(Number.isFinite), JSON.stringify(value)).toBe(true);
    expect(value.w).toBeGreaterThanOrEqual(0);
    expect(value.h).toBeGreaterThanOrEqual(0);
  };
  for (const node of layout.nodes) [node.icon, node.label, node.obstacle].forEach(rect);
  for (const group of layout.groups) {
    [group.bounds, group.header, group.content].forEach(rect);
    if (group.labelRect) rect(group.labelRect);
  }
  if (layout.canvasBounds) rect(layout.canvasBounds);
  for (const edge of layout.edges) {
    expect(edge.points.length, edge.id).toBeGreaterThanOrEqual(2);
    for (const point of [...edge.points, edge.badge, edge.labelPoint].filter((point) => point !== undefined)) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y), edge.id).toBe(true);
    }
    const canvas = layout.canvasBounds ?? { x: 0, y: 0, w: layout.width, h: layout.height };
    for (const point of edge.points) {
      expect(point.x, `${edge.id} x inside canvas`).toBeGreaterThanOrEqual(canvas.x);
      expect(point.x, `${edge.id} x inside canvas`).toBeLessThanOrEqual(canvas.x + canvas.w);
      expect(point.y, `${edge.id} y inside canvas`).toBeGreaterThanOrEqual(canvas.y);
      expect(point.y, `${edge.id} y inside canvas`).toBeLessThanOrEqual(canvas.y + canvas.h);
    }
    for (let index = 1; index < edge.points.length; index += 1) {
      const a = edge.points[index - 1]!;
      const b = edge.points[index]!;
      expect(a.x === b.x || a.y === b.y, `${edge.id} segment ${index} must be orthogonal`).toBe(true);
    }
    if (edge.labelRect) rect(edge.labelRect);
  }
}
