import { describe, expect, it, vi } from "vitest";

import { isAbortError, saveExistingFileHandle, type FileSystemHandleLike } from "./file-save";

function fakeHandle(diskSource: string, filename = "diagram.dgm"): FileSystemHandleLike & {
  writable: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
} {
  const writable = { write: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
  return {
    kind: "file",
    name: filename,
    getFile: vi.fn(async () => new File([diskSource], filename, { type: "text/plain" })),
    createWritable: vi.fn(async () => writable),
    writable,
  };
}

describe("existing file saves", () => {
  it("writes when disk still matches the saved source snapshot", async () => {
    const handle = fakeHandle("old source");
    const result = await saveExistingFileHandle(handle, "new source", "old source");
    expect(result).toEqual({ status: "saved", filename: "diagram.dgm" });
    expect(handle.writable.write).toHaveBeenCalledWith("new source");
  });

  it("returns a conflict without opening a writable stream after external edits", async () => {
    const handle = fakeHandle("external source");
    const result = await saveExistingFileHandle(handle, "new source", "old source");
    expect(result).toEqual({ status: "conflict", filename: "diagram.dgm", diskSource: "external source" });
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it("allows overwrite only when explicitly requested", async () => {
    const handle = fakeHandle("external source");
    const result = await saveExistingFileHandle(handle, "new source", "old source", { overwrite: true });
    expect(result.status).toBe("saved");
    expect(handle.getFile).not.toHaveBeenCalled();
  });

  it("distinguishes read and write failures and cancellation", async () => {
    const missing = fakeHandle("old source");
    missing.getFile = vi.fn(async () => { throw new Error("file was deleted"); });
    expect(await saveExistingFileHandle(missing, "new", "old")).toMatchObject({ status: "error", code: "read-failed" });

    const broken = fakeHandle("old");
    broken.writable.write.mockRejectedValue(new Error("permission denied"));
    expect(await saveExistingFileHandle(broken, "new", "old")).toMatchObject({ status: "error", code: "write-failed" });

    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
  });
});
