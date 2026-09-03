import { describe, expect, it } from "vitest";

import { sanitizeSvg, sanitizeSvgResult } from "./index.js";
import { embedAssetsInSvg } from "./assets.js";
import { createEmptyDocument } from "../core/index.js";

describe("sanitizeSvg", () => {
  it("returns typed results without changing legacy throwing behavior", () => {
    const safe = sanitizeSvgResult('<svg viewBox="0 0 8 8"><rect/></svg>');
    expect(safe.isOk()).toBe(true);
    if (safe.isErr()) return;
    expect(safe.value.intrinsicW).toBe(16);

    const unsafe = sanitizeSvgResult('<svg><script>alert(1)</script></svg>');
    expect(unsafe.isErr()).toBe(true);
    if (unsafe.isOk()) return;
    expect(unsafe.error).toEqual({
      code: "invalid-svg",
      message: "SVG element <script> is not allowed",
    });
    expect(() => sanitizeSvg('<svg><script>alert(1)</script></svg>')).toThrow();
  });

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

  it("rejects malformed markup and non-local SVG references", () => {
    expect(() => sanitizeSvg("<!doctype svg><svg/>")).toThrow(/forbidden declarations/i);
    expect(() => sanitizeSvg("<div/>")).toThrow(/root element/i);
    expect(() => sanitizeSvg("<svg><foreignObject/></svg>")).toThrow(/element/i);
    expect(() => sanitizeSvg("<svg malformed></svg>")).toThrow(/malformed attributes/i);
    expect(() => sanitizeSvg('<svg><rect fill="https://example.com/color"/></svg>')).toThrow(/external/i);
    expect(() => sanitizeSvg('<svg><use clip-path="url(external)"/></svg>')).toThrow(/local fragment/i);
    expect(() => sanitizeSvg('<svg><use href="icon"/></svg>')).toThrow(/local fragment/i);
    expect(() => sanitizeSvg("plain text")).toThrow(/Invalid SVG/);
    expect(() => sanitizeSvg('<svg width="-1" height="10"/>')).toThrow(/width/i);
    expect(() => sanitizeSvg('<svg><rect fill="url(#paint0)"/></svg>')).not.toThrow();
    expect(() => sanitizeSvg('<svg><rect></svg>')).toThrow(/unbalanced/i);
    expect(() => sanitizeSvg('<svg></svg><svg></svg>')).toThrow(/multiple root/i);
    expect(() => sanitizeSvg('<svg></svg>trailing text')).toThrow(/outside root/i);
  });

  it("uses explicit dimensions and safe local references when the DOM parser is unavailable", () => {
    const explicit = sanitizeSvg('<svg width="20" height="24"><defs><clipPath id="clip"/></defs><rect clip-path="url(#clip)"/></svg>');
    expect(explicit.intrinsicW).toBe(20);
    expect(explicit.intrinsicH).toBe(24);

    const defaults = sanitizeSvg("<svg></svg>");
    expect(defaults.intrinsicW).toBe(64);
    expect(defaults.intrinsicH).toBe(64);
  });

  it("allows only base64-embedded raster images", () => {
    const safe = sanitizeSvg(
      '<svg width="2" height="2"><image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="2" height="2"/></svg>',
    );
    expect(safe.content).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(() => sanitizeSvg(
      '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    )).toThrow(/embedded raster/i);
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
