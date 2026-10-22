import { describe, expect, it, vi } from "vitest";

import { sanitizeSvgResult } from "./index.js";
import { embedAssetsInSvg } from "./assets.js";
import { createEmptyDocument } from "../core/index.js";

function sanitizeSvg(svg: string) {
  const result = sanitizeSvgResult(svg);
  if (result.isErr()) throw new Error(result.error.message);
  return result.value;
}

describe("sanitizeSvgResult", () => {
  it("returns typed results", () => {
    const safe = sanitizeSvgResult('<svg viewBox="0 0 8 8"><rect/></svg>');
    expect(safe.isOk()).toBe(true);
    if (safe.isErr()) return;
    expect(safe.value.intrinsicW).toBe(16);

    const unsafe = sanitizeSvgResult("<svg><script>alert(1)</script></svg>");
    expect(unsafe.isErr()).toBe(true);
    if (unsafe.isOk()) return;
    expect(unsafe.error).toEqual({
      code: "invalid-svg",
      message: "SVG element <script> is not allowed",
    });
    expect(() => sanitizeSvg("<svg><script>alert(1)</script></svg>")).toThrow();
  });

  it("does not classify sanitizer defects as invalid SVG input", () => {
    class BrokenDomParser {
      parseFromString() {
        throw new TypeError("parser defect");
      }
    }
    vi.stubGlobal("DOMParser", BrokenDomParser);
    try {
      expect(() => sanitizeSvgResult("<svg/>")).toThrow(TypeError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("accepts valid svg and rejects scripts", () => {
    const safe = sanitizeSvg('<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>');
    expect(safe.intrinsicW).toBe(32);
    expect(() => sanitizeSvg("<svg><script>alert(1)</script><rect/></svg>")).toThrow();
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
    expect(() => sanitizeSvg('<svg><rect fill="url(relative.svg#paint)"/></svg>')).toThrow(/local fragment/i);
    expect(() => sanitizeSvg('<svg><rect fill="url(&#104;ttp:&#47;&#47;127.0.0.1/paint.svg#paint)"/></svg>')).toThrow(
      /local fragment/i,
    );
    expect(() => sanitizeSvg('<svg><rect stroke="u\\72l(https://example.com/paint.svg)"/></svg>')).toThrow(
      /local fragment/i,
    );
    expect(() => sanitizeSvg('<svg><rect fill="url(\\68 ttp:\\2f\\2f 127.0.0.1/paint.svg#paint)"/></svg>')).toThrow(
      /local fragment/i,
    );
    expect(() => sanitizeSvg("<svg><rect></svg>")).toThrow(/unbalanced/i);
    expect(() => sanitizeSvg("<svg></svg><svg></svg>")).toThrow(/multiple root/i);
    expect(() => sanitizeSvg("<svg></svg>trailing text")).toThrow(/outside root/i);
  });

  it("uses explicit dimensions and safe local references when the DOM parser is unavailable", () => {
    const explicit = sanitizeSvg(
      '<svg width="20" height="24"><defs><clipPath id="clip"/></defs><rect clip-path="url(#clip)"/></svg>',
    );
    expect(explicit.intrinsicW).toBe(20);
    expect(explicit.intrinsicH).toBe(24);

    const defaults = sanitizeSvg("<svg></svg>");
    expect(defaults.intrinsicW).toBe(64);
    expect(defaults.intrinsicH).toBe(64);
  });

  it.each([
    [
      "Figma",
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h20v20H2z" fill="#232F3E"/></svg>',
    ],
    [
      "Illustrator",
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 48 48"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/></svg>',
    ],
    [
      "Inkscape plain SVG",
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg width="32" height="32" viewBox="0 0 32 32" version="1.1" id="svg1" xmlns="http://www.w3.org/2000/svg"><defs id="defs1"/><g id="layer1"><circle cx="16" cy="16" r="12"/></g></svg>',
    ],
  ])("accepts real-world %s exports with standard namespaces", (_tool, svg) => {
    expect(sanitizeSvgResult(svg).isOk()).toBe(true);
  });

  it("rejects non-standard namespace declarations", () => {
    expect(() => sanitizeSvg('<svg xmlns="https://example.com/ns"><rect/></svg>')).toThrow(/standard namespace/);
    expect(() => sanitizeSvg('<svg xmlns:xlink="javascript:alert(1)"><rect/></svg>')).toThrow(/standard namespace/);
  });

  it("allows only base64-embedded raster images", () => {
    const safe = sanitizeSvg(
      '<svg width="2" height="2"><image href="data:image/png;base64,iVBORw0KGgo=" x="0" y="0" width="2" height="2"/></svg>',
    );
    expect(safe.content).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(() => sanitizeSvg('<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>')).toThrow(
      /embedded raster/i,
    );
  });

  it("re-sanitizes embedded document assets and omits unsafe ones", () => {
    const doc = createEmptyDocument("unsafe-asset");
    doc.assets = [
      {
        id: "unsafe",
        kind: "svg",
        content: "<svg><script>alert(1)</script></svg>",
        intrinsicW: 64,
        intrinsicH: 64,
      },
    ];
    const output = embedAssetsInSvg("<svg><defs></defs></svg>", doc);
    expect(output).not.toContain("script");
    expect(output).not.toContain("asset-unsafe");
  });
});
