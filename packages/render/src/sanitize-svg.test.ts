import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./sanitize-svg.js";

describe("sanitizeSvg", () => {
  it("accepts valid svg and rejects scripts", () => {
    const safe = sanitizeSvg(
      '<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>',
    );
    expect(safe.intrinsicW).toBe(32);
    expect(() =>
      sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>'),
    ).toThrow();
  });
});
