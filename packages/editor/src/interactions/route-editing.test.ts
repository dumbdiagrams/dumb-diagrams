import { describe, expect, it } from "vitest";

import {
  anchorOrthogonalRouteEndpoints,
  moveOrthogonalBend,
} from "./route-editing.js";

describe("moveOrthogonalBend", () => {
  const route = [
    { x: 130, y: 72 },
    { x: 176, y: 72 },
    { x: 176, y: 202 },
    { x: 356, y: 202 },
  ];

  it("moves the adjoining horizontal leg instead of creating a hairpin", () => {
    expect(moveOrthogonalBend(route, 2, { x: 176, y: 300 })).toEqual([
      { x: 130, y: 72 },
      { x: 176, y: 72 },
      { x: 176, y: 300 },
      { x: 356, y: 300 },
    ]);
  });

  it("moves both adjoining legs for a diagonal corner drag", () => {
    expect(moveOrthogonalBend(route, 2, { x: 224, y: 300 })).toEqual([
      { x: 130, y: 72 },
      { x: 224, y: 72 },
      { x: 224, y: 300 },
      { x: 356, y: 300 },
    ]);
  });

  it("shifts collinear authored runs as one leg", () => {
    expect(moveOrthogonalBend([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
    ], 2, { x: 96, y: 24 })).toEqual([
      { x: 0, y: 24 },
      { x: 96, y: 24 },
      { x: 96, y: 80 },
    ]);
  });

  it("merges a bend that collapses onto an adjoining straight run", () => {
    expect(moveOrthogonalBend([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 160, y: 80 },
    ], 2, { x: 80, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 160, y: 0 },
    ]);
  });
});

describe("anchorOrthogonalRouteEndpoints", () => {
  it("keeps an edited final leg before snapping back to the target port", () => {
    expect(anchorOrthogonalRouteEndpoints([
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 240 },
      { x: 300, y: 240 },
    ], {
      x: 0,
      y: 16,
      w: 40,
      h: 48,
    }, {
      x: 300,
      y: 96,
      w: 48,
      h: 48,
    })).toEqual([
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 240 },
      { x: 312, y: 240 },
      { x: 312, y: 144 },
    ]);
  });

  it("preserves an edited first leg with an orthogonal departure stub", () => {
    expect(anchorOrthogonalRouteEndpoints([
      { x: 40, y: 160 },
      { x: 120, y: 160 },
      { x: 120, y: 240 },
      { x: 300, y: 240 },
    ], {
      x: 0,
      y: 16,
      w: 40,
      h: 48,
    }, {
      x: 300,
      y: 216,
      w: 48,
      h: 48,
    })).toEqual([
      { x: 30, y: 64 },
      { x: 30, y: 160 },
      { x: 120, y: 160 },
      { x: 120, y: 240 },
      { x: 300, y: 240 },
    ]);
  });
});
