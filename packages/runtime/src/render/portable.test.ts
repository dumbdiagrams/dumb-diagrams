import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errAsync, ResultAsync } from "neverthrow";
import type { PortableSvgError } from "./assets.js";

import { getCatalogEntryByBrowserPath } from "../catalog/index.js";
import { createAsyncDocsFixture } from "../../test-fixtures.js";
import { layoutDocument } from "../layout/index.js";
import { renderPortableSvg } from "./svg.js";

const ROOT = join(import.meta.dirname, "../../../..");

describe("portable SVG export", () => {
  it("inlines catalog icons and does not retain repository or file URLs", async () => {
    const doc = createAsyncDocsFixture();
    const svg = (
      await renderPortableSvg(doc, layoutDocument(doc), {
        loadCatalogSvg: (browserPath) => {
          const entry = getCatalogEntryByBrowserPath(browserPath);
          const failure = (cause?: unknown): PortableSvgError => ({
            code: "catalog-icon-load-failed",
            message: `missing ${browserPath}`,
            browserPath,
            cause,
          });
          return entry
            ? ResultAsync.fromPromise(
                Promise.resolve().then(() => readFileSync(join(ROOT, entry.icon.sourcePath), "utf8")),
                failure,
              )
            : errAsync(failure());
        },
      })
    )._unsafeUnwrap();
    expect(svg).toContain("data:image/svg+xml");
    expect(svg).not.toContain("file://");
    expect(svg).not.toMatch(/(?:^|["'(])\/(?:aws|azure|gcp)-icons\//);
    expect(svg).not.toContain("catalog-icons/");
  });
});
