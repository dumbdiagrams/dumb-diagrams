import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { describe, expect, it } from "vitest";

import { importSvgAssetResult } from "./asset-import";
import { addCustomResourceResult } from "./document-operations";
import { deleteSelection } from "../editor-model";

describe("pure document operations", () => {
  it("inserts a custom resource without mutating the input document", () => {
    const doc = createAsyncDocsFixture();
    const imported = importSvgAssetResult(doc, '<svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg>');
    expect(imported.isOk()).toBe(true);
    if (imported.isErr()) return;
    const result = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Badge", undefined, {
      x: 40,
      y: 80,
    });

    expect(result.isOk()).toBe(true);
    expect(doc.resources).toHaveLength(createAsyncDocsFixture().resources.length);
    if (result.isErr()) return;
    expect(result.value.doc.resources.at(-1)).toMatchObject({
      id: result.value.id,
      type: "cloud-agnostic.server",
      parent: undefined,
      label: { service: "Badge" },
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
    const result = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Badge", "missing", {
      x: 0,
      y: 0,
    });
    expect(result.isErr() && result.error.code).toBe("parent-not-found");
  });

  it("deletes an ungrouped custom SVG resource by itself", () => {
    const doc = createAsyncDocsFixture();
    const imported = importSvgAssetResult(doc, '<svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg>');
    if (imported.isErr()) throw new Error(imported.error.message);
    const inserted = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Pasted image", undefined, {
      x: 40,
      y: 80,
    });
    if (inserted.isErr()) throw new Error(inserted.error.message);

    const deleted = deleteSelection(inserted.value.doc, [{ kind: "resource", id: inserted.value.id }]);

    expect(deleted.resources.some((resource) => resource.id === inserted.value.id)).toBe(false);
    expect(deleted.groups).toEqual(inserted.value.doc.groups);
  });
});
