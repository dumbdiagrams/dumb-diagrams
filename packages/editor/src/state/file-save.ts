import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";

export type FileSystemWritableLike = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
};

export type FileSystemHandleLike = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableLike>;
};

export type FileSaveErrorCode =
  | "invalid-source"
  | "missing-tab"
  | "read-failed"
  | "write-failed"
  | "download-failed"
  | "external-file-too-large"
  | "stale-source";

export type FileSaveResult =
  | { status: "saved"; filename: string }
  | { status: "cancelled" }
  | { status: "conflict"; filename: string; diskSource: string }
  | { status: "error"; filename: string; code: FileSaveErrorCode; message: string };

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Save through an existing File System Access handle. The caller must opt in
 * to overwrite after a conflict has been shown to the user.
 */
export async function saveExistingFileHandle(
  handle: FileSystemHandleLike,
  source: string,
  savedSource: string,
  options: { overwrite?: boolean; isCurrent?: () => boolean } = {},
): Promise<FileSaveResult> {
  const filename = handle.name;
  const staleResult = (): FileSaveResult => ({
    status: "error",
    filename,
    code: "stale-source",
    message: "The diagram changed while it was being saved.",
  });

  if (!options.overwrite) {
    let diskSource: string;
    try {
      const file = await handle.getFile();
      if (file.size > DIAGRAM_LIMITS.sourceBytes) {
        return {
          status: "error",
          filename,
          code: "external-file-too-large",
          message: `${filename} exceeds the 1 MiB source limit after being changed on disk.`,
        };
      }
      diskSource = await file.text();
    } catch (error) {
      return {
        status: "error",
        filename,
        code: "read-failed",
        message: error instanceof Error ? error.message : `Unable to read ${filename}.`,
      };
    }
    if (options.isCurrent && !options.isCurrent()) return staleResult();
    if (diskSource !== savedSource) return { status: "conflict", filename, diskSource };
  }

  try {
    if (options.isCurrent && !options.isCurrent()) return staleResult();
    const writable = await handle.createWritable();
    if (options.isCurrent && !options.isCurrent()) {
      try {
        await writable.abort?.();
      } catch {
        // Aborting is best effort; never close an empty stream because that
        // can replace the existing file with an empty document.
      }
      return staleResult();
    }
    await writable.write(source);
    await writable.close();
    if (options.isCurrent && !options.isCurrent()) return staleResult();
    return { status: "saved", filename };
  } catch (error) {
    return {
      status: "error",
      filename,
      code: "write-failed",
      message: error instanceof Error ? error.message : `Unable to save ${filename}.`,
    };
  }
}
