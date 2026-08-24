import { describe, expect, it } from "vitest";

import {
  distanceToResource,
  pointInRect,
  resourceHitRects,
  resourceVisualBounds,
} from "./selection-targeting.js";

const node = {
  icon: { x: 80, y: 20, w: 64, h: 64 },
  label: { x: 30, y: 88, w: 164, h: 42 },
};

describe("resource selection targeting", () => {
  it("uses separate icon and label regions instead of the full layout obstacle", () => {
    const [icon, label] = resourceHitRects(node);

    expect(icon).toEqual({ x: 76, y: 16, w: 72, h: 72 });
    expect(label).toEqual({ x: 26, y: 86, w: 172, h: 46 });
    expect(distanceToResource({ x: 50, y: 50 }, node)).toBeGreaterThan(0);
    expect(distanceToResource({ x: 100, y: 50 }, node)).toBe(0);
  });

  it("keeps the selection outline tight to visible icon and text", () => {
    expect(resourceVisualBounds(node)).toEqual({ x: 30, y: 20, w: 164, h: 110 });
  });

  it("recognizes a connector label rectangle exactly", () => {
    const label = { x: 24, y: 150, w: 68, h: 18 };
    expect(pointInRect({ x: 40, y: 158 }, label)).toBe(true);
    expect(pointInRect({ x: 40, y: 170 }, label)).toBe(false);
  });
});
