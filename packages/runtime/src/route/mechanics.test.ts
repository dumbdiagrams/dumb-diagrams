import { describe, expect, it } from "vitest";

import { routePathBaseCost, ROUTE_PATH_COSTS } from "./mechanics.js";

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
});
