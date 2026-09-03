import { describe, expect, it, vi } from "vitest";

import { readFileHandles } from "./file-open";
import type { FileSystemHandleLike } from "./file-save";

function fakeHandle(filename: string, source?: string): FileSystemHandleLike {
  return {
    kind: "file",
    name: filename,
    getFile: source === undefined
      ? vi.fn(async () => { throw new Error("permission revoked"); })
      : vi.fn(async () => new File([source], filename, { type: "text/plain" })),
    createWritable: vi.fn(async () => ({
      write: async () => undefined,
      close: async () => undefined,
    })),
  };
}

describe("multi-file reads", () => {
  it("keeps readable files when another selected handle fails", async () => {
    const readable = fakeHandle("available.dgm", "diagram available");
    const unavailable = fakeHandle("revoked.dgm");

    const result = await readFileHandles([unavailable, readable]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.handle).toBe(readable);
    expect(result.entries[0]?.file.name).toBe("available.dgm");
    expect(result.rejected).toEqual(["revoked.dgm (could not be read)"]);
  });

  it("preserves the order of successful selections", async () => {
    const first = fakeHandle("first.dgm", "first");
    const second = fakeHandle("second.dgm", "second");

    const result = await readFileHandles([first, second]);

    expect(result.entries.map(({ file }) => file.name)).toEqual(["first.dgm", "second.dgm"]);
    expect(result.rejected).toEqual([]);
  });
});
