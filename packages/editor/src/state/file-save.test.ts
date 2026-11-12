import { describe, expect, it, vi } from "vitest";
import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";

import {
  hasWritePermission,
  isAbortError,
  requestWritePermission,
  saveExistingFileHandle,
  saveWithPicker,
  type FileSystemHandleLike,
} from "./file-save";

function fakeHandle(
  diskSource: string,
  filename = "diagram.dgm",
): FileSystemHandleLike & {
  writable: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> };
} {
  const writable = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  return {
    kind: "file",
    name: filename,
    getFile: vi.fn(async () => new File([diskSource], filename, { type: "text/plain" })),
    createWritable: vi.fn(async () => writable),
    writable,
  };
}

describe("existing file saves", () => {
  it("requests write permission immediately for explicit actions", async () => {
    const requestPermission = vi.fn(async () => "granted" as PermissionState);
    const handle = { ...fakeHandle("baseline"), requestPermission };
    const request = requestWritePermission(handle);
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(await request).toBe(true);
  });

  it("queries background permission without prompting", async () => {
    const requestPermission = vi.fn(async () => "granted" as PermissionState);
    const handle = {
      ...fakeHandle("baseline"),
      queryPermission: vi.fn(async () => "denied" as PermissionState),
      requestPermission,
    };
    expect(await hasWritePermission(handle)).toBe(false);
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(requestPermission).not.toHaveBeenCalled();
  });

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

  it("acknowledges a disk file that already contains the desired source", async () => {
    const handle = fakeHandle("same source");
    const result = await saveExistingFileHandle(handle, "same source", "older baseline");
    expect(result).toEqual({ status: "saved", filename: "diagram.dgm" });
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it("allows overwrite only when explicitly requested", async () => {
    const handle = fakeHandle("external source");
    const result = await saveExistingFileHandle(handle, "new source", "old source", { overwrite: true });
    expect(result.status).toBe("saved");
    expect(handle.getFile).not.toHaveBeenCalled();
  });

  it("rejects an oversized external file without reading it", async () => {
    const text = vi.fn(async () => "unreachable");
    const handle = fakeHandle("old source");
    handle.getFile = vi.fn(
      async () =>
        ({
          size: DIAGRAM_LIMITS.sourceBytes + 1,
          text,
        }) as unknown as File,
    );

    expect(await saveExistingFileHandle(handle, "new source", "old source")).toMatchObject({
      status: "error",
      code: "external-file-too-large",
    });
    expect(text).not.toHaveBeenCalled();
    expect(handle.createWritable).not.toHaveBeenCalled();
  });

  it("does not open or write after the source becomes stale", async () => {
    const handle = fakeHandle("old source");
    let current = true;
    handle.getFile = vi.fn(async () => {
      current = false;
      return new File(["old source"], handle.name, { type: "text/plain" });
    });
    const result = await saveExistingFileHandle(handle, "new source", "old source", {
      isCurrent: () => current,
    });
    expect(result).toMatchObject({ status: "error", code: "stale-source" });
    expect(handle.createWritable).not.toHaveBeenCalled();
    expect(handle.writable.write).not.toHaveBeenCalled();
  });

  it("aborts an opened stream if the source changes before writing", async () => {
    const handle = fakeHandle("old source");
    let checks = 0;
    const result = await saveExistingFileHandle(handle, "new source", "old source", {
      isCurrent: () => checks++ < 2,
    });
    expect(result).toMatchObject({ status: "error", code: "stale-source" });
    expect(handle.createWritable).toHaveBeenCalledOnce();
    expect(handle.writable.write).not.toHaveBeenCalled();
    expect(handle.writable.abort).toHaveBeenCalledOnce();
    expect(handle.writable.close).not.toHaveBeenCalled();
  });

  it("aborts a write if the source becomes stale after write but before close", async () => {
    const handle = fakeHandle("old source");
    let checks = 0;
    const result = await saveExistingFileHandle(handle, "new source", "old source", {
      isCurrent: () => checks++ < 3,
    });
    expect(result).toMatchObject({ status: "error", code: "stale-source" });
    expect(handle.writable.write).toHaveBeenCalledOnce();
    expect(handle.writable.abort).toHaveBeenCalledOnce();
    expect(handle.writable.close).not.toHaveBeenCalled();
  });

  it("checks for a conflicting disk edit again before closing the write", async () => {
    let disk = "saved baseline";
    const writable = {
      write: vi.fn(async () => {
        disk = "external edit";
      }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const handle: FileSystemHandleLike & { writable: typeof writable } = {
      kind: "file",
      name: "diagram.dgm",
      getFile: vi.fn(async () => new File([disk], "diagram.dgm", { type: "text/plain" })),
      createWritable: vi.fn(async () => writable),
      writable,
    };
    const result = await saveExistingFileHandle(handle, "desired source", "saved baseline");
    expect(result).toEqual({ status: "conflict", filename: "diagram.dgm", diskSource: "external edit" });
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
  });

  it("returns stale after close while preserving that the captured source was committed", async () => {
    const handle = fakeHandle("old source");
    let current = true;
    handle.writable.close.mockImplementation(async () => {
      current = false;
    });
    const result = await saveExistingFileHandle(handle, "captured source", "old source", {
      isCurrent: () => current,
    });
    expect(result).toMatchObject({ status: "error", code: "stale-source", committed: true });
  });

  it("distinguishes read and write failures and cancellation", async () => {
    const missing = fakeHandle("old source");
    missing.getFile = vi.fn(async () => {
      throw new Error("file was deleted");
    });
    expect(await saveExistingFileHandle(missing, "new", "old")).toMatchObject({ status: "error", code: "read-failed" });

    const broken = fakeHandle("old");
    broken.writable.write.mockRejectedValue(new Error("permission denied"));
    expect(await saveExistingFileHandle(broken, "new", "old")).toMatchObject({ status: "error", code: "write-failed" });

    expect(isAbortError(new DOMException("cancelled", "AbortError"))).toBe(true);
  });
});

describe("first save through the file picker", () => {
  it("writes the chosen file and returns its handle", async () => {
    const handle = fakeHandle("");
    const picker = vi.fn(async () => handle);
    const { result, handle: saved } = await saveWithPicker(picker, "flow.dgm", "source", () => true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "flow.dgm" }));
    expect(result).toEqual({ status: "saved", filename: "diagram.dgm" });
    expect(saved).toBe(handle);
    expect(handle.getFile).not.toHaveBeenCalled();
    expect(handle.writable.write).toHaveBeenCalledWith("source");
  });

  it("treats a dismissed picker as cancelled", async () => {
    const picker = vi.fn(async () => {
      throw new DOMException("dismissed", "AbortError");
    });
    expect(await saveWithPicker(picker, "flow.dgm", "source", () => true)).toEqual({ result: { status: "cancelled" } });
  });

  it("reports picker failures without a handle", async () => {
    const picker = vi.fn(async () => {
      throw new Error("denied");
    });
    expect(await saveWithPicker(picker, "flow.dgm", "source", () => true)).toEqual({
      result: { status: "error", filename: "flow.dgm", code: "write-failed", message: "denied" },
    });
  });

  it("aborts instead of writing when the diagram changed while the picker was open", async () => {
    const handle = fakeHandle("");
    const { result, handle: saved } = await saveWithPicker(
      async () => handle,
      "flow.dgm",
      "source",
      () => false,
    );
    expect(result).toMatchObject({ status: "error", code: "stale-source" });
    expect(saved).toBeUndefined();
    expect(handle.writable.write).not.toHaveBeenCalled();
  });
});
