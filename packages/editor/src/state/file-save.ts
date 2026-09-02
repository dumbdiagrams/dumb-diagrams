export type FileSystemWritableLike = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

export type FileSystemHandleLike = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableLike>;
};

export type FileSaveErrorCode = "invalid-source" | "missing-tab" | "read-failed" | "write-failed" | "download-failed";

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
  options: { overwrite?: boolean } = {},
): Promise<FileSaveResult> {
  const filename = handle.name;
  if (!options.overwrite) {
    let diskSource: string;
    try {
      diskSource = await (await handle.getFile()).text();
    } catch (error) {
      return {
        status: "error",
        filename,
        code: "read-failed",
        message: error instanceof Error ? error.message : `Unable to read ${filename}.`,
      };
    }
    if (diskSource !== savedSource) return { status: "conflict", filename, diskSource };
  }

  try {
    const writable = await handle.createWritable();
    await writable.write(source);
    await writable.close();
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
