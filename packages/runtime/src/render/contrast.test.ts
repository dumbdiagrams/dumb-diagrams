import { describe, expect, it } from "vitest";

import { contrastRatio, DARK_CANVAS, needsDarkContrastAid, parseRgb } from "./contrast.js";

describe("contrast", () => {
  it("parses hex and rgb colours", () => {
    expect(parseRgb("#2a3542")).toEqual({ r: 42, g: 53, b: 66 });
    expect(parseRgb("rgba(255,255,255,0.25)")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("flags dark canonical group strokes that fail on the dark canvas", () => {
    expect(needsDarkContrastAid("#2a3542", DARK_CANVAS)).toBe(true);
    expect(needsDarkContrastAid("#147EBA", DARK_CANVAS)).toBe(true);
  });

  it("leaves adequately contrasting structural strokes alone", () => {
    expect(needsDarkContrastAid("#879196", DARK_CANVAS)).toBe(false);
  });

  it("leaves saturated canonical colours untouched", () => {
    expect(needsDarkContrastAid("#E7157B", DARK_CANVAS)).toBe(false);
    expect(needsDarkContrastAid("#ED7100", DARK_CANVAS)).toBe(false);
    expect(needsDarkContrastAid("#7AA116", DARK_CANVAS)).toBe(false);
    expect(needsDarkContrastAid("#00A4A6", DARK_CANVAS)).toBe(false);
  });

  it("computes a higher ratio for light-on-dark than dark-on-dark", () => {
    const darkOnDark = contrastRatio("#2a3542", DARK_CANVAS);
    const lightOnDark = contrastRatio("#ffffff", DARK_CANVAS);
    expect(darkOnDark).not.toBeNull();
    expect(lightOnDark).not.toBeNull();
    expect(lightOnDark!).toBeGreaterThan(darkOnDark!);
  });
});
