import { describe, expect, it } from "vitest";

import { assertThemeContrast } from "./annotation-themes.js";

describe("annotation themes", () => {
  it("meets contrast targets for every preset", () => {
    expect(() => assertThemeContrast()).not.toThrow();
  });
});
