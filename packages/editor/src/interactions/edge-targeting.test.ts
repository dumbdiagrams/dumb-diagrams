import { describe, expect, it } from "vitest";

import { nearestEdgeIdAt } from "./edge-targeting.js";

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
