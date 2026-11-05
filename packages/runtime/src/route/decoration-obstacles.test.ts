import { describe, expect, it } from "vitest";

import { boundaryStrokeRects } from "./decoration-obstacles.js";

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("boundaryStrokeRects", () => {
  const group = { bounds: { x: 20, y: 30, w: 200, h: 120 } };

  it("marks a label crossing a frame stroke while leaving clear interior space available", () => {
    const strokes = boundaryStrokeRects([group]);
    const crossingTopStroke = { x: 80, y: 28, w: 70, h: 12 };
    const insideBelowTopStroke = { x: 80, y: 40, w: 70, h: 12 };

    expect(strokes.some((stroke) => intersects(crossingTopStroke, stroke))).toBe(true);
    expect(strokes.some((stroke) => intersects(insideBelowTopStroke, stroke))).toBe(false);
    expect(strokes).toHaveLength(4);
  });

  it("keeps nested group frames as linear, separate stroke obstacles", () => {
    const nested = [group, { bounds: { x: 50, y: 60, w: 100, h: 60 } }];
    const strokes = boundaryStrokeRects(nested);

    expect(strokes).toHaveLength(8);
    expect(
      strokes.every(
        (stroke) => [stroke.x, stroke.y, stroke.w, stroke.h].every(Number.isFinite) && stroke.w >= 0 && stroke.h >= 0,
      ),
    ).toBe(true);
    expect(strokes.some((stroke) => intersects({ x: 90, y: 90, w: 20, h: 20 }, stroke))).toBe(false);
  });

  it("handles zero-size and invalid geometry without producing non-finite or negative rectangles", () => {
    const strokes = boundaryStrokeRects([
      { bounds: { x: 0, y: 0, w: 0, h: 10 } },
      { bounds: { x: 0, y: 0, w: 10, h: 0 } },
      { bounds: { x: 0, y: 0, w: 0, h: 0 } },
      { bounds: { x: Number.NaN, y: 0, w: 10, h: 10 } },
    ]);

    expect(strokes).toHaveLength(4);
    expect(
      strokes.every(
        (stroke) => [stroke.x, stroke.y, stroke.w, stroke.h].every(Number.isFinite) && stroke.w >= 0 && stroke.h >= 0,
      ),
    ).toBe(true);
  });

  it("uses a two-pixel default clearance and clamps negative clearance to zero", () => {
    expect(boundaryStrokeRects([group])[0]).toEqual({ x: 18, y: 28, w: 204, h: 4 });
    expect(boundaryStrokeRects([group], -3)[0]).toEqual({ x: 20, y: 30, w: 200, h: 0 });
  });
});
