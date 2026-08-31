import { describe, expect, it } from "vitest";

import { resizeHandles, resizeRect, type ResizeHandle } from "./InteractionOverlay.js";

describe("resizeHandles", () => {
  it("exposes all eight handles for groups", () => {
    expect(resizeHandles({ x: 10, y: 20, w: 100, h: 60 }, true).map((handle) => handle.name))
      .toEqual(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  });

  it("keeps the legacy three handles for non-group items", () => {
    expect(resizeHandles({ x: 10, y: 20, w: 100, h: 60 }).map((handle) => handle.name))
      .toEqual(["se", "e", "s"]);
  });
});

describe("resizeRect", () => {
  const origin = { x: 100, y: 80, w: 200, h: 120 };

  const directionalCases = [
    ["n", 0, -30, { x: 100, y: 50, w: 200, h: 150 }],
    ["s", 0, 30, { x: 100, y: 80, w: 200, h: 150 }],
    ["e", 50, 0, { x: 100, y: 80, w: 250, h: 120 }],
    ["w", -50, 0, { x: 50, y: 80, w: 250, h: 120 }],
    ["ne", 50, -30, { x: 100, y: 50, w: 250, h: 150 }],
    ["nw", -50, -30, { x: 50, y: 50, w: 250, h: 150 }],
    ["se", 50, 30, { x: 100, y: 80, w: 250, h: 150 }],
    ["sw", -50, 30, { x: 50, y: 80, w: 250, h: 150 }],
  ] as const satisfies ReadonlyArray<[ResizeHandle, number, number, typeof origin]>;

  for (const [handle, dx, dy, expected] of directionalCases) {
    it(`resizes from ${handle}`, () => {
      expect(resizeRect(origin, handle, dx, dy, 32)).toEqual(expected);
    });
  }

  it("moves the origin while clamping a north resize", () => {
    expect(resizeRect(origin, "n", 0, 200, 32)).toEqual({
      x: 100,
      y: 168,
      w: 200,
      h: 32,
    });
  });

  it("moves the origin while clamping a west resize", () => {
    expect(resizeRect(origin, "w", 200, 0, 32)).toEqual({
      x: 268,
      y: 80,
      w: 32,
      h: 120,
    });
  });

  it("snaps dragged edges in world coordinates", () => {
    expect(resizeRect(origin, "nw", 13, -11, 32, true)).toEqual({
      x: 120,
      y: 72,
      w: 180,
      h: 128,
    });
  });

  it("supports independent minimum width and height", () => {
    expect(resizeRect(origin, "se", -500, -500, { w: 48, h: 56 })).toEqual({
      x: 100,
      y: 80,
      w: 48,
      h: 56,
    });
  });
});
