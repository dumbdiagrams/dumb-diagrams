import { describe, expect, it } from "vitest";

import type { Point } from "../core/types.js";
import { routeSimplificationCandidates } from "./path-refinement.js";

const key = (points: readonly Point[]) => points.map(({ x, y }) => `${x},${y}`).join(";");

describe("routeSimplificationCandidates", () => {
  it("offers a straight alternative for a C-shaped detour with exact endpoints", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 0 },
      { x: 120, y: 0 },
    ];

    const candidates = routeSimplificationCandidates(route);

    expect(candidates.map(key)).toContain("0,0;120,0");
    expect(candidates.every((candidate) => key([candidate[0]!, candidate.at(-1)!]) === "0,0;120,0")).toBe(true);
  });

  it("can move a tiny terminal jog while keeping endpoint facing directions", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 5 },
      { x: 100, y: 5 },
    ];

    const candidates = routeSimplificationCandidates(route);

    expect(candidates.some((candidate) => key(candidate) === "0,0;20,0;20,5;100,5")).toBe(true);
    expect(routeSimplificationCandidates(route, { minimumSegmentLength: 8 })).toEqual([]);
    expect(candidates.every((candidate) => candidate[1]!.y === 0)).toBe(true);
    expect(candidates.every((candidate) => candidate.at(-2)!.y === 5)).toBe(true);
  });

  it("simplifies collinear points, is deterministic, and does not mutate input", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 60, y: 30 },
    ];
    const before = structuredClone(route);

    const first = routeSimplificationCandidates(route);
    const second = routeSimplificationCandidates(route);

    expect(first.map(key)).toEqual(second.map(key));
    expect(first.map(key)).toContain("0,0;40,0;40,30;60,30");
    expect(route).toEqual(before);
    expect(
      first.every((candidate) =>
        candidate.slice(1).every((point, index) => {
          const previous = candidate[index]!;
          return previous.x !== point.x || previous.y !== point.y;
        }),
      ),
    ).toBe(true);
  });

  it("deduplicates and obeys the candidate limit", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 0 },
      { x: 90, y: 0 },
    ];
    const candidates = routeSimplificationCandidates(route, { maxCandidates: 3 });

    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map(key)).size).toBe(candidates.length);
    expect(routeSimplificationCandidates(route, { maxCandidates: 0 })).toEqual([]);
    expect(routeSimplificationCandidates([...route, { x: 100, y: 10 }])).toEqual([]);
  });
});
