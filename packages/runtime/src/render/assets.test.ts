import { describe, expect, it, vi } from "vitest";
import { errAsync, okAsync, ResultAsync } from "neverthrow";

import { createEmptyDocument } from "../core/document.js";
import { getCatalogEntry } from "../catalog/catalog.js";
import { embedAssetsInSvg, inlineCatalogIcons, resolveResourceIcon, type PortableSvgError } from "./assets.js";

describe("render assets", () => {
  it("resolves embedded, catalog, and missing resource icons", () => {
    const doc = createEmptyDocument("assets");
    doc.assets = [
      {
        id: "custom&icon",
        kind: "svg",
        content: '<svg viewBox="0 0 16 12"><rect width="16" height="12"/></svg>',
        intrinsicW: 16,
        intrinsicH: 12,
      },
    ];

    expect(resolveResourceIcon(doc, "cloud-agnostic.actor", { iconAsset: "custom&icon" })).toMatchObject({
      kind: "asset",
      assetId: "custom&icon",
    });
    expect(resolveResourceIcon(doc, "cloud-agnostic.actor", { iconAsset: "missing" }).kind).toBe("catalog");
    expect(resolveResourceIcon(doc, "unknown.type", {}).kind).toBe("none");
  });

  it("embeds sanitized assets as symbols and leaves asset-free SVG unchanged", () => {
    const original = "<svg><defs></defs><rect/></svg>";
    const empty = createEmptyDocument("empty");
    expect(embedAssetsInSvg(original, empty)).toBe(original);

    const doc = createEmptyDocument("assets");
    doc.assets = [
      {
        id: "custom&icon",
        kind: "svg",
        content: '<svg viewBox="0 0 16 12"><rect width="16" height="12"/></svg>',
        intrinsicW: 16,
        intrinsicH: 12,
      },
    ];
    const output = embedAssetsInSvg(original, doc);
    expect(output).toContain('id="asset-custom&amp;icon"');
    expect(output).toContain('<symbol id="asset-custom&amp;icon" viewBox="0 0 16 16"><rect');
  });

  it("inlines each known catalog icon once and skips data or unknown URLs", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const loader = vi.fn(() => okAsync('<svg viewBox="0 0 16 16"><path d="M0 0"/></svg>'));
    const svg = `<svg><image href="${entry.browserPath}"/><image href="${entry.browserPath}"/><image href="data:image/svg+xml,already"/><image href="catalog-icons/unknown.svg"/></svg>`;

    const output = (await inlineCatalogIcons(svg, { loadCatalogSvg: loader }))._unsafeUnwrap();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(output).toContain("data:image/svg+xml;charset=utf-8");
    expect(output).toContain("data:image/svg+xml,already");
    expect(output).toContain("catalog-icons/unknown.svg");
  });

  it("rejects malformed or unsafe catalog icon responses", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const href = `<svg><image href="${entry.browserPath}"/></svg>`;

    expect(
      (
        await inlineCatalogIcons(href, {
          loadCatalogSvg: () => okAsync("<div>not an icon</div>"),
        })
      )._unsafeUnwrapErr(),
    ).toMatchObject({
      code: "catalog-icon-unsafe",
      message: expect.stringMatching(/not an SVG/),
      browserPath: entry.browserPath,
    });
    expect(
      (
        await inlineCatalogIcons(href, {
          loadCatalogSvg: () => okAsync("<svg><script>alert(1)</script></svg>"),
        })
      )._unsafeUnwrapErr(),
    ).toMatchObject({ code: "catalog-icon-unsafe", message: expect.stringMatching(/unsafe SVG/) });
    expect(
      (
        await inlineCatalogIcons(href, {
          loadCatalogSvg: () => {
            throw new Error("disk gone");
          },
        })
      )._unsafeUnwrapErr(),
    ).toMatchObject({ code: "catalog-icon-load-failed", message: "disk gone" });
  });

  it("preserves typed loader errors without wrapping them", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const error: PortableSvgError = {
      code: "catalog-icon-load-failed",
      message: "Icon file is unavailable",
      browserPath: entry.browserPath,
    };
    const result = await inlineCatalogIcons(`<svg><image href="${entry.browserPath}"/></svg>`, {
      loadCatalogSvg: () => errAsync(error),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe(error);
  });

  it("adapts rejected platform work inside a typed loader", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const result = await inlineCatalogIcons(`<svg><image href="${entry.browserPath}"/></svg>`, {
      loadCatalogSvg: () =>
        ResultAsync.fromPromise(
          Promise.reject(new Error("disk gone")),
          (cause): PortableSvgError => ({
            code: "catalog-icon-load-failed",
            message: "disk gone",
            browserPath: entry.browserPath,
            cause,
          }),
        ),
    });
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: "catalog-icon-load-failed", message: "disk gone" });
  });

  it("uses the default fetch loader for browser catalog paths", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 16 16"><path d="M0 0"/></svg>',
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { baseURI: "https://example.test/" });
    try {
      const output = (await inlineCatalogIcons(`<svg><image href="/${entry.browserPath}"/></svg>`))._unsafeUnwrap();
      expect(output).toContain("data:image/svg+xml;charset=utf-8");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(`https://example.test/${entry.browserPath}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports unavailable and failed default loaders clearly", async () => {
    const entry = getCatalogEntry("cloud-agnostic.actor")!;
    const svg = `<svg><image href="${entry.browserPath}"/></svg>`;

    vi.stubGlobal("fetch", undefined);
    try {
      expect((await inlineCatalogIcons(svg))._unsafeUnwrapErr().message).toMatch(/loader required/);
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "" })),
    );
    try {
      expect((await inlineCatalogIcons(svg))._unsafeUnwrapErr()).toMatchObject({ code: "catalog-loader-required" });
    } finally {
      vi.unstubAllGlobals();
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, text: async () => "" })),
    );
    vi.stubGlobal("document", { baseURI: "https://example.test/" });
    try {
      expect((await inlineCatalogIcons(svg))._unsafeUnwrapErr()).toMatchObject({
        code: "catalog-icon-load-failed",
        message: expect.stringMatching(/Unable to load catalog icon/),
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores non-catalog paths, including malformed URLs", async () => {
    const svg = '<svg><image href="unknown.svg"/><image href="catalog-icons/%E0%A4%A"/></svg>';
    expect(
      (
        await inlineCatalogIcons(svg, {
          loadCatalogSvg: () => okAsync("<svg/>"),
        })
      )._unsafeUnwrap(),
    ).toBe(svg);
  });
});
