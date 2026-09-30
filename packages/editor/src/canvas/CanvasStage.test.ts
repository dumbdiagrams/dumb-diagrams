import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEWPORT_RIGHT_MARGIN,
  DEFAULT_VIEWPORT_TOP_MARGIN,
  DEFAULT_VIEWPORT_ZOOM,
  DEFAULT_VIEWPORT_BOTTOM_MARGIN,
  DEFAULT_EMPTY_CANVAS_HEIGHT,
  DEFAULT_EMPTY_CANVAS_WIDTH,
  clampZoom,
  defaultViewportForContent,
  normalizedWheelDelta,
} from "./CanvasStage.js";

describe("CanvasStage zoom", () => {
  it("clamps zoom between min and max", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(5)).toBe(2.5);
  });

  it("normalizes wheel units before applying pan or zoom", () => {
    expect(normalizedWheelDelta(3, 0, 800)).toBe(3);
    expect(normalizedWheelDelta(3, 1, 800)).toBe(48);
    expect(normalizedWheelDelta(1, 2, 800)).toBe(800);
  });

  it("centers a fitting artboard with visible surrounding canvas", () => {
    expect(defaultViewportForContent(2_000, 1_600, 1_000, 600)).toEqual({
      panX: 280,
      panY: 230,
      zoom: DEFAULT_VIEWPORT_ZOOM,
    });
  });

  it("keeps safe margins when the artboard is wider than the stage", () => {
    expect(defaultViewportForContent(1_000, 1_600, 800, 1_200)).toEqual({
      panX: 96,
      panY: DEFAULT_VIEWPORT_TOP_MARGIN,
      zoom: (800 - DEFAULT_VIEWPORT_TOP_MARGIN - DEFAULT_VIEWPORT_BOTTOM_MARGIN) / 1_200,
    });
    expect(DEFAULT_VIEWPORT_RIGHT_MARGIN).toBe(40);
  });

  it("frames an empty diagram card instead of pushing it to the edge", () => {
    expect(defaultViewportForContent(1_200, 0, 800, 0)).toEqual({
      panX: 384,
      panY: 292,
      zoom: DEFAULT_VIEWPORT_ZOOM,
    });
    expect(DEFAULT_EMPTY_CANVAS_WIDTH).toBe(480);
    expect(DEFAULT_EMPTY_CANVAS_HEIGHT).toBe(240);
  });
});
