import { describe, expect, it } from "vitest";
import { routeVisibility } from "./visibility.js";

describe("exact visibility routing", () => {
  it("keeps fractional attachments orthogonal through a corridor narrower than a grid cell", () => {
    const start = { x: 0.5, y: 0.25 };
    const goal = { x: 40.5, y: 0.25 };
    const obstacles = [
      { x: 10, y: -20, w: 10, h: 19 },
      { x: 10, y: 2, w: 10, h: 20 },
    ];
    const path = routeVisibility(start, goal, obstacles)!;
    expect(path).toEqual([start, goal]);
  });
  it("uses a rectilinear detour around content and repeats deterministically", () => {
    const obstacles = [{ x: 10, y: -10, w: 20, h: 20 }];
    const start = { x: 0.5, y: 0.5 };
    const goal = { x: 40.5, y: 0.5 };
    const path = routeVisibility(start, goal, obstacles)!;
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(goal);
    for (let index = 1; index < path.length; index++) {
      expect(path[index]!.x === path[index - 1]!.x || path[index]!.y === path[index - 1]!.y).toBe(true);
    }
    expect(routeVisibility(start, goal, obstacles)).toEqual(path);
  });
  it("respects a finite operation budget and rejects blocked attachments", () => {
    expect(
      routeVisibility(
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        [],
        () => 0,
        () => false,
      ),
    ).toBeNull();
    expect(routeVisibility({ x: 0, y: 0 }, { x: 40, y: 0 }, [{ x: -1, y: -1, w: 2, h: 2 }])).toBeNull();
  });
});
