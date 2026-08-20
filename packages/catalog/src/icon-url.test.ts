import { describe, expect, it, vi } from "vitest";

import { catalogIconUrl } from "./icon-url.js";

describe("catalogIconUrl", () => {
  it("encodes path segments with spaces", () => {
    expect(catalogIconUrl("gcp-icons/Category Icons/Management Tools/SVG/icon.svg")).toBe(
      "/gcp-icons/Category%20Icons/Management%20Tools/SVG/icon.svg",
    );
  });

  it("resolves local assets against a subpath deployment", () => {
    vi.stubGlobal("document", { baseURI: "https://example.test/dumb-diagrams/" });
    try {
      expect(catalogIconUrl("catalog-icons/aws/example.svg")).toBe(
        "https://example.test/dumb-diagrams/catalog-icons/aws/example.svg",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to a root-relative URL when the browser base is invalid", () => {
    vi.stubGlobal("document", { baseURI: "not a URL" });
    try {
      expect(catalogIconUrl("catalog-icons/aws/example.svg")).toBe(
        "/catalog-icons/aws/example.svg",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
