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
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

export type FileSaveErrorCode =
  | "invalid-source"
  | "missing-tab"
  | "read-failed"
  | "write-failed"
  | "download-failed"
  | "external-file-too-large"
  | "permission-denied"
  | "stale-source";

export type FileSaveResult =
  | { status: "saved"; filename: string }
  | { status: "cancelled" }
  | { status: "conflict"; filename: string; diskSource: string }
  | { status: "error"; filename: string; code: FileSaveErrorCode; message: string; committed?: boolean };

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Start a user-gesture-bound write permission request before awaiting other work. */
export function requestWritePermission(handle: FileSystemHandleLike): Promise<boolean> {
  if (!handle.requestPermission) return Promise.resolve(true);
  try {
    return handle.requestPermission({ mode: "readwrite" }).then(
      (state) => state === "granted",
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Background writes must query permission and never trigger a browser prompt. */
export async function hasWritePermission(handle: FileSystemHandleLike): Promise<boolean> {
  if (!handle.queryPermission) return !handle.requestPermission;
  try {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
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
    if (diskSource === source) return { status: "saved", filename };
    if (diskSource !== savedSource) return { status: "conflict", filename, diskSource };
  }

  let writable: FileSystemWritableLike | undefined;
  try {
    if (options.isCurrent && !options.isCurrent()) return staleResult();
    writable = await handle.createWritable();
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
    if (options.isCurrent && !options.isCurrent()) {
      try {
        await writable.abort?.();
      } catch {
        // Best effort: stale text must not be committed when the stream supports abort.
      }
      return staleResult();
    }
    if (!options.overwrite) {
      const file = await handle.getFile();
      if (file.size > DIAGRAM_LIMITS.sourceBytes) {
        try {
          await writable.abort?.();
        } catch {
          // Keep the existing file when possible.
        }
        return {
          status: "error",
          filename,
          code: "external-file-too-large",
          message: `${filename} exceeds the 1 MiB source limit after being changed on disk.`,
        };
      }
      const latestDiskSource = await file.text();
      if (options.isCurrent && !options.isCurrent()) {
        try {
          await writable.abort?.();
        } catch {
          // Best effort.
        }
        return staleResult();
      }
      if (latestDiskSource !== savedSource && latestDiskSource !== source) {
        try {
          await writable.abort?.();
        } catch {
          // Keep the externally changed file when possible.
        }
        return { status: "conflict", filename, diskSource: latestDiskSource };
      }
    }
    if (options.isCurrent && !options.isCurrent()) {
      try {
        await writable.abort?.();
      } catch {
        // Best effort.
      }
      return staleResult();
    }
    await writable.close();
    if (options.isCurrent && !options.isCurrent())
      return {
        status: "error",
        filename,
        code: "stale-source",
        message: "The diagram changed while it was being saved.",
        committed: true,
      };
    return { status: "saved", filename };
  } catch (error) {
    try {
      await writable?.abort?.();
    } catch {
      // The stream may already be closed; abort is best effort.
    }
    return {
      status: "error",
      filename,
      code: "write-failed",
      message: error instanceof Error ? error.message : `Unable to save ${filename}.`,
    };
  }
}

export type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemHandleLike>;

/** First save: ask for a file, then write it with the same stale-source guards as an existing handle. */
export async function saveWithPicker(
  picker: SaveFilePicker,
  suggestedName: string,
  source: string,
  isCurrent: () => boolean,
): Promise<{ result: FileSaveResult; handle?: FileSystemHandleLike }> {
  let handle: FileSystemHandleLike;
  try {
    handle = await picker({
      suggestedName,
      types: [{ description: "DumbDiagrams source", accept: { "text/plain": [".dgm"] } }],
    });
  } catch (error) {
    if (isAbortError(error)) return { result: { status: "cancelled" } };
    const message = error instanceof Error ? error.message : "The diagram could not be saved.";
    return { result: { status: "error", filename: suggestedName, code: "write-failed", message } };
  }
  const result = await saveExistingFileHandle(handle, source, "", { overwrite: true, isCurrent });
  return result.status === "saved" || (result.status === "error" && result.committed) ? { result, handle } : { result };
}
