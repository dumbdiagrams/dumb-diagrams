import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getCatalogEntryByBrowserPath } from "@dumb-diagrams/catalog";
import { createAsyncDocsFixture } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";
import { renderPortableSvg } from "./svg.js";

const ROOT = join(import.meta.dirname, "../../..");

describe("portable SVG export", () => {
  it("inlines catalog icons and does not retain repository or file URLs", async () => {
    const doc = createAsyncDocsFixture();
    const svg = await renderPortableSvg(doc, layoutDocument(doc), {
      loadCatalogSvg: async (browserPath) => {
        const entry = getCatalogEntryByBrowserPath(browserPath);
        if (!entry) throw new Error(`missing ${browserPath}`);
        return readFileSync(join(ROOT, entry.icon.sourcePath), "utf8");
      },
    });
    expect(svg).toContain("data:image/svg+xml");
    expect(svg).not.toContain("file://");
    expect(svg).not.toMatch(/(?:^|["'(])\/(?:aws|azure|gcp)-icons\//);
    expect(svg).not.toContain("catalog-icons/");
  });
});
