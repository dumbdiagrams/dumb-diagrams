import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { describe, expect, it } from "vitest";

import { importSvgAssetResult } from "./asset-import";
import { addCustomResourceResult } from "./document-operations";

describe("pure document operations", () => {
  it("inserts a custom resource without mutating the input document", () => {
    const doc = createAsyncDocsFixture();
    const imported = importSvgAssetResult(doc, '<svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg>');
    expect(imported.isOk()).toBe(true);
    if (imported.isErr()) return;
    const result = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Badge", undefined, { x: 40, y: 80 });

    expect(result.isOk()).toBe(true);
    expect(doc.resources).toHaveLength(createAsyncDocsFixture().resources.length);
    if (result.isErr()) return;
    expect(result.value.doc.resources.at(-1)).toMatchObject({
      id: result.value.id,
      type: "generic.custom",
      props: { iconAsset: imported.value.assetId },
    });
  });

  it("returns stable errors for missing assets and parents", () => {
    const doc = createAsyncDocsFixture();
    const missingAsset = addCustomResourceResult(doc, "missing", "Badge", undefined, { x: 0, y: 0 });
    expect(missingAsset.isErr() && missingAsset.error.code).toBe("asset-not-found");
    const imported = importSvgAssetResult(doc, '<svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg>');
    expect(imported.isOk()).toBe(true);
    if (imported.isErr()) return;
    const result = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Badge", "missing", { x: 0, y: 0 });
    expect(result.isErr() && result.error.code).toBe("parent-not-found");
  });
});
