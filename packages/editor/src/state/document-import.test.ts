import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { printDgm } from "@dumb-diagrams/runtime/dsl";
import { importDocumentFiles, readDiagramFile } from "./document-import";

const source = printDgm(createEmptyDocument("imported"));
const file = (name: string, content = source) => new File([content], name);

describe("document imports", () => {
  it("preserves partial success when one file is invalid or unreadable", async () => {
    const broken = file("broken.dgm");
    vi.spyOn(broken, "text").mockRejectedValue(new Error("read failed"));
    const accept = vi.fn(() => true);
    const result = await importDocumentFiles([
      { file: file("valid.dgm") }, { file: file("invalid.dgm", "broken") }, { file: broken },
    ], 3, accept, async () => {});
    expect(result).toEqual({ opened: ["valid.dgm"], rejected: ["invalid.dgm", "broken.dgm"], unexpected: [], limitReached: false });
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it("captures synchronous file API failures as read errors", async () => {
    const broken = file("broken.dgm");
    vi.spyOn(broken, "text").mockImplementation(() => { throw new Error("sync read failure"); });
    const result = await readDiagramFile(broken);
    expect(result.isErr() && result.error.code).toBe("read");
  });

  it("reports a full workspace without accepting a document", async () => {
    const accept = vi.fn(() => false);
    const result = await importDocumentFiles([{ file: file("valid.dgm") }], 1, accept, async () => {});
    expect(result).toEqual({ opened: [], rejected: [], unexpected: [], limitReached: true });
  });

  it("keeps an unexpected file defect separate from ordinary rejection", async () => {
    const unstable = {
      size: source.length,
      text: async () => source,
      get name(): string {
        throw new TypeError("file name getter failed");
      },
    } as unknown as File;
    const result = await importDocumentFiles([{ file: unstable }], 1, vi.fn(() => true), async () => {});
    expect(result.opened).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.unexpected).toHaveLength(1);
    expect(result.unexpected[0]?.error).toMatchObject({ code: "unexpected" });
  });

  it("keeps an unexpected tab publication defect separate from rejection", async () => {
    const cause = new Error("tab publication failed");
    const result = await importDocumentFiles(
      [{ file: file("valid.dgm") }],
      1,
      () => { throw cause; },
      async () => {},
    );
    expect(result.rejected).toEqual([]);
    expect(result.unexpected[0]?.error).toMatchObject({ code: "unexpected", cause });
  });
});
