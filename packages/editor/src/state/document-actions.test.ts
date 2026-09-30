import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { printDgm } from "@dumb-diagrams/runtime/dsl";
import { prepareDocument, prepareDocumentMutation } from "./document-actions";

describe("document action preparation", () => {
  it("does not invoke a mutation on an invalid source draft", () => {
    const change = vi.fn((doc) => doc);
    const result = prepareDocumentMutation("diagram { unfinished", change, true);
    expect(result.isErr() && result.error.code).toBe("invalid-source");
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves an unexpected mutation cause instead of reporting invalid syntax", () => {
    const source = printDgm(createEmptyDocument("original"));
    const cause = new TypeError("mutation defect");
    const result = prepareDocumentMutation(source, () => { throw cause; }, true);
    expect(result.isErr() && result.error.code).toBe("unexpected");
    expect(result.isErr() && result.error.cause).toBe(cause);
  });

  it("rejects a failed precompilation before a source can be published", () => {
    const result = prepareDocument(createEmptyDocument("original"), true, {
      ok: false, issues: [{ level: "error", code: "routing", message: "Routing failed" }],
      svg: null, invariantFailures: [],
    });
    expect(result.isErr() && result.error).toMatchObject({ code: "compilation", message: "Routing failed" });
  });

  it("reports the compilation error when an earlier warning is present", () => {
    const result = prepareDocument(createEmptyDocument("original"), true, {
      ok: false,
      issues: [
        { level: "warning", code: "routing-budget", message: "Routing took too long" },
        { level: "error", code: "compilation", message: "Render failed" },
      ],
      svg: null,
      invariantFailures: [],
    });
    expect(result.isErr() && result.error).toMatchObject({ code: "compilation", message: "Render failed" });
  });

  it("returns the serialized validated mutation for publication", () => {
    const source = printDgm(createEmptyDocument("original"));
    const result = prepareDocumentMutation(source, (doc) => ({ ...doc, title: "Renamed" }), true);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.doc.title).toBe("Renamed");
      expect(result.value.source).toBe(printDgm(result.value.doc));
    }
  });
});
