import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { importDocumentFiles, readDiagramFile } from "./document-import";

const source = printDgm(createEmptyDocument("imported"));
const file = (name: string, content = source) => new File([content], name);

describe("document imports", () => {
  it("imports a canonical file manually created from two catalog icons and a connector", async () => {
    const manualSource = `dgm 1
diagram untitled-diagram {
  grammar aws
  flow lr

  aws.aws-activate aws-activate
  cloud-agnostic.cache cache

  aws-activate -> cache { kind flow from e offset 0.5 to w offset 0.25 }
}

view default {
  place aws-activate { x 62 y 72 pin manual }
  place cache { x 184 y 24 pin manual }
}`;
    const read = await readDiagramFile(file("test.dgm", manualSource));
    expect(read.isOk()).toBe(true);
    if (read.isErr()) throw read.error;
    expect(parseDgmResult(read.value.source).isOk()).toBe(true);
  });

  it("rejects an ungrouped catalog resource without a manual canvas placement", async () => {
    const invalid = file(
      "invalid-containment.dgm",
      `diagram invalid-containment {
  grammar aws
  aws.aws-lambda orphan "Orphan" {}
}`,
    );
    const result = await readDiagramFile(invalid);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("no parent group");
  });

  it("preserves partial success when one file is invalid or unreadable", async () => {
    const broken = file("broken.dgm");
    vi.spyOn(broken, "text").mockRejectedValue(new Error("read failed"));
    const accept = vi.fn(() => true);
    const result = await importDocumentFiles(
      [{ file: file("valid.dgm") }, { file: file("invalid.dgm", "broken") }, { file: broken }],
      3,
      accept,
      async () => {},
    );
    expect(result).toEqual({
      opened: ["valid.dgm"],
      rejected: ["invalid.dgm", "broken.dgm"],
      unexpected: [],
      limitReached: false,
    });
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it("captures synchronous file API failures as read errors", async () => {
    const broken = file("broken.dgm");
    vi.spyOn(broken, "text").mockImplementation(() => {
      throw new Error("sync read failure");
    });
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
    const result = await importDocumentFiles(
      [{ file: unstable }],
      1,
      vi.fn(() => true),
      async () => {},
    );
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
      () => {
        throw cause;
      },
      async () => {},
    );
    expect(result.rejected).toEqual([]);
    expect(result.unexpected[0]?.error).toMatchObject({ code: "unexpected", cause });
  });
});
