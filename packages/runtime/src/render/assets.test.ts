import { describe, expect, it, vi } from "vitest";

import { createEmptyDocument } from "../core/document.js";
import { getCatalogEntry } from "../catalog/catalog.js";
import {
  embedAssetsInSvg,
  inlineCatalogIcons,
  PortableSvgError,
  resolveResourceIcon,
} from "./assets.js";

describe("render assets", () => {
  it("resolves embedded, catalog, and missing resource icons", () => {
    const doc = createEmptyDocument("assets");
    doc.assets = [{
      id: "custom&icon",
      kind: "svg",
      content: '<svg viewBox="0 0 16 12"><rect width="16" height="12"/></svg>',
      intrinsicW: 16,
      intrinsicH: 12,
    }];

    expect(resolveResourceIcon(doc, "generic.user", { iconAsset: "custom&icon" })).toMatchObject({
      kind: "asset",
      assetId: "custom&icon",
    });
    expect(resolveResourceIcon(doc, "generic.user", { iconAsset: "missing" }).kind).toBe("catalog");
    expect(resolveResourceIcon(doc, "unknown.type", {}).kind).toBe("none");
  });

  it("embeds sanitized assets as symbols and leaves asset-free SVG unchanged", () => {
    const original = "<svg><defs></defs><rect/></svg>";
    const empty = createEmptyDocument("empty");
    expect(embedAssetsInSvg(original, empty)).toBe(original);

    const doc = createEmptyDocument("assets");
    doc.assets = [{
      id: "custom&icon",
      kind: "svg",
      content: '<svg viewBox="0 0 16 12"><rect width="16" height="12"/></svg>',
      intrinsicW: 16,
      intrinsicH: 12,
    }];
    const output = embedAssetsInSvg(original, doc);
    expect(output).toContain('id="asset-custom&amp;icon"');
    expect(output).toContain('<symbol id="asset-custom&amp;icon" viewBox="0 0 16 16"><rect');
  });

  it("inlines each known catalog icon once and skips data or unknown URLs", async () => {
    const entry = getCatalogEntry("generic.user")!;
    const loader = vi.fn(async () => '<svg viewBox="0 0 16 16"><path d="M0 0"/></svg>');
    const svg = `<svg><image href="${entry.browserPath}"/><image href="${entry.browserPath}"/><image href="data:image/svg+xml,already"/><image href="catalog-icons/unknown.svg"/></svg>`;

    const output = await inlineCatalogIcons(svg, { loadCatalogSvg: loader });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(output).toContain("data:image/svg+xml;charset=utf-8");
    expect(output).toContain("data:image/svg+xml,already");
    expect(output).toContain("catalog-icons/unknown.svg");
  });

  it("rejects malformed or unsafe catalog icon responses", async () => {
    const entry = getCatalogEntry("generic.user")!;
    const href = `<svg><image href="${entry.browserPath}"/></svg>`;

    await expect(inlineCatalogIcons(href, {
      loadCatalogSvg: async () => "<div>not an icon</div>",
    })).rejects.toThrow(/not an SVG/);
    await expect(inlineCatalogIcons(href, {
      loadCatalogSvg: async () => '<svg><script>alert(1)</script></svg>',
    })).rejects.toThrow(/unsafe SVG/);
  });

  it("uses the default fetch loader for browser catalog paths", async () => {
    const entry = getCatalogEntry("generic.user")!;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 16 16"><path d="M0 0"/></svg>',
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { baseURI: "https://example.test/" });
    try {
      const output = await inlineCatalogIcons(`<svg><image href="/${entry.browserPath}"/></svg>`);
      expect(output).toContain("data:image/svg+xml;charset=utf-8");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports unavailable and failed default loaders clearly", async () => {
    const entry = getCatalogEntry("generic.user")!;
    const svg = `<svg><image href="${entry.browserPath}"/></svg>`;

    vi.stubGlobal("fetch", undefined);
    try {
      await expect(inlineCatalogIcons(svg)).rejects.toThrow(/loader required/);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "" })));
    try {
      await expect(inlineCatalogIcons(svg)).rejects.toBeInstanceOf(PortableSvgError);
      await expect(inlineCatalogIcons(svg)).rejects.toMatchObject({ code: "catalog-loader-required" });
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => "" })));
    vi.stubGlobal("document", { baseURI: "https://example.test/" });
    try {
      await expect(inlineCatalogIcons(svg)).rejects.toThrow(/Unable to load catalog icon/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores non-catalog paths, including malformed URLs", async () => {
    const svg = '<svg><image href="unknown.svg"/><image href="catalog-icons/%E0%A4%A"/></svg>';
    await expect(inlineCatalogIcons(svg, {
      loadCatalogSvg: async () => "<svg/>",
    })).resolves.toBe(svg);
  });
});
