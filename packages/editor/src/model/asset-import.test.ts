import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { describe, expect, it } from "vitest";

import { importSvgAssetResult, MAX_SVG_BYTES } from "./asset-import";

describe("pure SVG asset model API", () => {
  it("returns an error for unsafe SVG input without mutating the document", () => {
    const doc = createAsyncDocsFixture();
    const result = importSvgAssetResult(doc, "<svg><script>alert(1)</script></svg>");

    expect(result.isErr() && result.error.code).toBe("invalid-svg");
    expect(doc.assets).toBeUndefined();
  });

  it("rejects oversized SVG input before sanitization", () => {
    const doc = createAsyncDocsFixture();
    const result = importSvgAssetResult(doc, "x".repeat(MAX_SVG_BYTES + 1));

    expect(result.isErr() && result.error.code).toBe("svg-too-large");
    expect(doc.assets).toBeUndefined();
  });

  it("deduplicates safe SVGs while returning a cloned document", () => {
    const doc = createAsyncDocsFixture();
    const svg = '<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
    const first = importSvgAssetResult(doc, svg);

    expect(first.isOk()).toBe(true);
    expect(doc.assets).toBeUndefined();
    if (first.isErr()) return;
    const second = importSvgAssetResult(first.value.doc, svg);

    expect(second.isOk()).toBe(true);
    if (second.isErr()) return;
    expect(second.value.assetId).toBe(first.value.assetId);
    expect(second.value.doc.assets).toHaveLength(1);
  });

  it("deduplicates an existing asset even when the document is already over the total byte budget", () => {
    const doc = createAsyncDocsFixture();
    const svg = `<svg viewBox="0 0 32 32">${"<rect width=\"32\" height=\"32\"/>".repeat(6_000)}</svg>`;
    const first = importSvgAssetResult(doc, svg);
    expect(first.isOk()).toBe(true);
    if (first.isErr()) return;

    doc.assets = Array.from({ length: 12 }, (_, index) => ({
      ...first.value.doc.assets![0]!,
      id: `existing-${index}`,
    }));
    const duplicate = importSvgAssetResult(doc, svg);

    expect(duplicate.isOk()).toBe(true);
    if (duplicate.isErr()) return;
    expect(duplicate.value.assetId).toBe("existing-0");
  });
});
