import { describe, expect, it } from "vitest";

import type { LayoutResult } from "../core/index.js";
import { parseDgmResult } from "../dsl/index.js";
import { checkInvariants } from "./invariants.js";
import { readabilityMetrics } from "./readability.js";

const doc = parseDgmResult(`diagram flow { grammar cloud-agnostic flow lr
  cloud-agnostic.server a cloud-agnostic.server b cloud-agnostic.server c
  a -> b { id ab } b -> a { id ba } b -> c { id bc } c -> a { id ca } a -> c { id ac style dashed }
}`)._unsafeUnwrap();
const node = (id: string, x: number) => {
  const icon = { x, y: 0, w: 40, h: 40 };
  return { id, icon, label: { x, y: 44, w: 0, h: 0 }, obstacle: icon };
};
const layout = {
  nodes: [node("a", 0), node("b", 200), node("c", 400)],
  edges: [
    {
      id: "ab",
      source: "a",
      target: "b",
      points: [
        { x: 40, y: 20 },
        { x: 200, y: 20 },
      ],
    },
    {
      id: "ba",
      source: "b",
      target: "a",
      points: [
        { x: 200, y: 30 },
        { x: 40, y: 30 },
      ],
    },
    {
      id: "bc",
      source: "b",
      target: "c",
      points: [
        { x: 220, y: 40 },
        { x: 220, y: 900 },
        { x: -600, y: 900 },
        { x: -600, y: 60 },
        { x: 400, y: 60 },
      ],
    },
    {
      id: "ca",
      source: "c",
      target: "a",
      points: [
        { x: 420, y: 0 },
        { x: 420, y: -20 },
        { x: 20, y: -20 },
        { x: 20, y: 0 },
      ],
    },
    {
      id: "ac",
      source: "a",
      target: "c",
      points: [
        { x: 20, y: 40 },
        { x: 20, y: 80 },
        { x: 420, y: 80 },
        { x: 420, y: 40 },
      ],
    },
  ],
  groups: [],
  width: 1000,
  height: 1000,
  symmetries: [],
} as unknown as LayoutResult;

describe("flow readability", () => {
  it("counts backward and doubled-back flow edges, excluding responses and dashed links", () => {
    const metrics = readabilityMetrics(doc, layout, []);
    expect(metrics.flowEdges).toBe(4);
    expect(metrics.backwardEdges).toEqual(["ca"]);
    expect(metrics.backtrackingEdges).toEqual(["bc"]);
    expect(metrics.maxBends).toBe(3);
  });

  it("reports a route that loops far beyond its endpoint distance", () => {
    const detours = checkInvariants(layout).filter((failure) => failure.code === "edge-detour");
    expect(detours.map((failure) => failure.elementIds[0])).toEqual(["bc"]);
  });
});
