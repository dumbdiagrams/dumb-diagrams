import { describe, expect, it } from "vitest";

import { createPolylineDistance, distanceToPolyline, routePathBaseCost, ROUTE_PATH_COSTS } from "./mechanics.js";
import { projectPointToPolyline } from "./router.js";

describe("documented routing mechanics", () => {
  it("keeps the worked clear-detour cost attached to runtime constants", () => {
    const result = routePathBaseCost([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 160, y: 40 },
      { x: 160, y: 0 },
    ]);

    expect(result).toEqual({ bends: 2, length: 240, excessLength: 80, score: 1_120 });
    expect(160 + ROUTE_PATH_COSTS.crossing).toBe(300_160);
  });

  it("matches polyline projection distance across representative paths", () => {
    const routes = [
      [],
      [{ x: 2, y: -3 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: -2, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: -5 },
        { x: 7, y: -5 },
      ],
      [
        { x: 7, y: -5 },
        { x: 3, y: -5 },
        { x: 3, y: 4 },
        { x: -2, y: 4 },
      ],
      [
        { x: 0.25, y: -1.75 },
        { x: 4.5, y: 2.125 },
        { x: -3.25, y: 6.5 },
      ],
      [
        { x: 2, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 2 },
      ],
    ];
    const queryPoints = [
      { x: 0, y: 0 },
      { x: 1.125, y: -2.75 },
      { x: 5, y: 3 },
      { x: -6.5, y: 8.25 },
      { x: 3, y: -5 },
    ];

    for (const points of routes) {
      const evaluateDistance = createPolylineDistance(points);
      for (const point of queryPoints) {
        const expected = projectPointToPolyline(point, points)?.distance ?? Infinity;
        expect(distanceToPolyline(point, points)).toBe(expected);
        expect(evaluateDistance(point)).toBe(expected);
      }
    }
  });

  it("keeps a distance evaluator bound to the route coordinates at creation", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 6 },
    ];
    const evaluateDistance = createPolylineDistance(points);

    points[0]!.x = 100;
    points[1]!.y = 100;
    points.push({ x: -20, y: -20 });

    expect(evaluateDistance({ x: 2, y: 3 })).toBe(3);
    expect(evaluateDistance({ x: 8, y: 3 })).toBe(0);
  });

  it("returns Infinity when the polyline has no nonzero segments", () => {
    expect(distanceToPolyline({ x: 1, y: 2 }, [])).toBe(Infinity);
    expect(distanceToPolyline({ x: 1, y: 2 }, [{ x: 1, y: 2 }])).toBe(Infinity);
    expect(
      distanceToPolyline({ x: 1, y: 2 }, [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ]),
    ).toBe(Infinity);
    expect(createPolylineDistance([])({ x: 1, y: 2 })).toBe(Infinity);
    expect(
      createPolylineDistance([
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ])({ x: 1, y: 2 }),
    ).toBe(Infinity);
  });
});
