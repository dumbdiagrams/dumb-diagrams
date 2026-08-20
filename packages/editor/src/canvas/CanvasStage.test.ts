import { describe, expect, it } from "vitest";

import { clampZoom } from "./CanvasStage.js";

describe("CanvasStage zoom", () => {
  it("clamps zoom between min and max", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(5)).toBe(2.5);
  });
});
