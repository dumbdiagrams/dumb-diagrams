import { describe, expect, it } from "vitest";

import { ANNOTATION_THEMES } from "./annotation-themes.js";
import { contrastRatio, parseRgb } from "./contrast.js";

describe("annotation themes", () => {
  it("meets contrast targets for every preset", () => {
    for (const theme of ANNOTATION_THEMES) {
      expect(parseRgb(theme.background), `${theme.id} background`).not.toBeNull();
      expect(parseRgb(theme.color), `${theme.id} color`).not.toBeNull();
      const ratio = contrastRatio(theme.color, theme.background);
      expect(ratio, `${theme.id} contrast`).not.toBeNull();
      expect(ratio ?? 0, `${theme.id} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
