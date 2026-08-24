import { describe, expect, it } from "vitest";

import { sanitizeSvg } from "./sanitize-svg.js";
import { embedAssetsInSvg } from "./assets.js";
import { createEmptyDocument } from "../core/index.js";

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

  it("rejects event handlers, external references, styles, and huge dimensions", () => {
    expect(() => sanitizeSvg('<svg><rect onclick="alert(1)"/></svg>')).toThrow(/attribute/i);
    expect(() => sanitizeSvg('<svg><use href="https://example.com/icon.svg"/></svg>')).toThrow(/local fragment/i);
    expect(() => sanitizeSvg('<svg><path style="fill:red" d="M0 0"/></svg>')).toThrow(/attribute/i);
    expect(() => sanitizeSvg('<svg width="10001" height="10"><rect width="1" height="1"/></svg>')).toThrow(/width/i);
  });

  it("re-sanitizes embedded document assets before inserting SVG markup", () => {
    const doc = createEmptyDocument("unsafe-asset");
    doc.assets = [{
      id: "unsafe",
      kind: "svg",
      content: '<svg><script>alert(1)</script></svg>',
      intrinsicW: 64,
      intrinsicH: 64,
    }];
    expect(() => embedAssetsInSvg("<svg><defs></defs></svg>", doc)).toThrow(/element/i);
  });
});
