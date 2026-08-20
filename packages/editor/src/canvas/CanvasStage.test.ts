import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEWPORT_LEFT_MARGIN,
  DEFAULT_VIEWPORT_RIGHT_MARGIN,
  DEFAULT_VIEWPORT_TOP_MARGIN,
  DEFAULT_VIEWPORT_ZOOM,
  clampZoom,
  defaultViewportForContent,
} from "./CanvasStage.js";

describe("CanvasStage zoom", () => {
  it("clamps zoom between min and max", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(5)).toBe(2.5);
  });

  it("anchors a fitting artboard to the upper-right with a visible outside margin", () => {
    expect(defaultViewportForContent(2_000, 1_600)).toEqual({
      panX: 520,
      panY: DEFAULT_VIEWPORT_TOP_MARGIN,
      zoom: DEFAULT_VIEWPORT_ZOOM,
    });
  });

  it("keeps a safe left margin when the artboard is wider than the stage", () => {
    expect(defaultViewportForContent(1_000, 1_600)).toEqual({
      panX: DEFAULT_VIEWPORT_LEFT_MARGIN,
      panY: DEFAULT_VIEWPORT_TOP_MARGIN,
      zoom: DEFAULT_VIEWPORT_ZOOM,
    });
    expect(DEFAULT_VIEWPORT_RIGHT_MARGIN).toBe(40);
  });
});
