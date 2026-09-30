import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";
import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { describe, expect, it } from "vitest";

import { duplicateSelectionResult, pasteClipboardResult, serializeClipboardResult } from "./clipboard";

describe("pure clipboard model APIs", () => {
  it("round trips a selection without mutating the source document", () => {
    const source = createAsyncDocsFixture();
    const before = structuredClone(source);
    const serialized = serializeClipboardResult(source, [{ kind: "resource", id: "client" }]);

    expect(serialized.isOk()).toBe(true);
    if (serialized.isErr()) return;
    const pasted = pasteClipboardResult(source, serialized.value, { x: 600, y: 600 });

    expect(pasted.isOk()).toBe(true);
    expect(source).toEqual(before);
    if (pasted.isErr()) return;
    expect(pasted.value.selection).toContainEqual(expect.objectContaining({ kind: "resource" }));
    expect(pasted.value.doc.resources).toHaveLength(source.resources.length + 1);
  });

  it("reports duplicate-selection limits without throwing or mutating the document", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations = Array.from({ length: DIAGRAM_LIMITS.clipboardItems + 1 }, (_, index) => ({
      id: `note-${index}`, text: "Note", style: "paper" as const,
    }));
    const before = structuredClone(doc);
    const result = duplicateSelectionResult(doc, doc.annotations.map(({ id }) => ({ kind: "annotation", id })));
    expect(result.isErr() && result.error.code).toBe("clipboard-object-limit");
    expect(doc).toEqual(before);
  });

  it("returns stable errors for malformed and oversized payloads", () => {
    const doc = createAsyncDocsFixture();
    const malformed = pasteClipboardResult(doc, "{", { x: 0, y: 0 });
    expect(malformed.isErr() && malformed.error.code).toBe("clipboard-invalid-json");

    const oversized = pasteClipboardResult(
      doc,
      "x".repeat(DIAGRAM_LIMITS.clipboardBytes + 1),
      { x: 0, y: 0 },
    );
    expect(oversized.isErr() && oversized.error.code).toBe("clipboard-too-large");
    expect(doc).toEqual(createAsyncDocsFixture());
  });

  it("rejects malformed structured clipboard members without changing the document", () => {
    const doc = createAsyncDocsFixture();
    const result = pasteClipboardResult(doc, JSON.stringify({
      type: "dumb-diagrams/clipboard",
      resources: [{ resource: { id: 42 } }],
    }), { x: 0, y: 0 });

    expect(result.isErr() && result.error.code).toBe("clipboard-invalid-resource");
    expect(doc).toEqual(createAsyncDocsFixture());
  });
});
