import { describe, expect, it } from "vitest";

import { nearestEdgeIdAt, nearestNodePortAt } from "./edge-targeting.js";

describe("nearestEdgeIdAt", () => {
  const edges = [
    {
      id: "upper",
      points: [{ x: 0, y: 100 }, { x: 240, y: 100 }],
    },
    {
      id: "lower",
      points: [{ x: 0, y: 116 }, { x: 240, y: 116 }],
    },
  ];

  it("selects the closest route when widened hit areas overlap", () => {
    expect(nearestEdgeIdAt({ x: 120, y: 111 }, edges)).toBe("lower");
    expect(nearestEdgeIdAt({ x: 120, y: 105 }, edges)).toBe("upper");
  });

  it("uses the current DOM target only to break an exact tie", () => {
    expect(nearestEdgeIdAt({ x: 120, y: 108 }, edges, "lower")).toBe("lower");
    expect(nearestEdgeIdAt({ x: 120, y: 108 }, edges, "upper")).toBe("upper");
  });
});

describe("nearestNodePortAt", () => {
  const nodes = [
    {
      id: "api",
      icon: { x: 100, y: 100, w: 80, h: 80 },
    },
  ];

  it("infers a top-face anchor from a drop on the top area of an icon", () => {
    expect(nearestNodePortAt({ x: 120, y: 108 }, nodes)).toEqual({
      nodeId: "api",
      side: "n",
      offset: 0.25,
    });
  });

  it("chooses the closest legal offset along the inferred face", () => {
    expect(nearestNodePortAt({ x: 174, y: 138 }, nodes)).toEqual({
      nodeId: "api",
      side: "e",
      offset: 0.5,
    });
  });

  it("accepts a forgiving near-icon drop but ignores distant canvas space", () => {
    expect(nearestNodePortAt({ x: 140, y: 82 }, nodes)?.side).toBe("n");
    expect(nearestNodePortAt({ x: 140, y: 60 }, nodes)).toBeNull();
  });

  it("keeps the highlighted mount stable until another port is clearly nearer", () => {
    const preferred = { nodeId: "api", side: "n" as const, offset: 0.5 };
    expect(nearestNodePortAt({ x: 140, y: 141 }, nodes, 24, preferred)).toEqual(preferred);
    expect(nearestNodePortAt({ x: 140, y: 168 }, nodes, 24, preferred)).toEqual({
      nodeId: "api",
      side: "s",
      offset: 0.5,
    });
  });
});
