import type { FileSystemHandleLike } from "./file-save";

export type OpenFileEntry = { file: File; handle?: FileSystemHandleLike };

export type FileHandleReadResult = {
  entries: OpenFileEntry[];
  rejected: string[];
};

/**
 * Resolve selected handles independently so one revoked or unreadable file does
 * not discard the rest of a multi-file selection.
 */
export async function readFileHandles(handles: FileSystemHandleLike[]): Promise<FileHandleReadResult> {
  const settled = await Promise.allSettled(
    handles.map(async (handle) => ({
      handle,
      file: await handle.getFile(),
    })),
  );
  const entries: OpenFileEntry[] = [];
  const rejected: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") entries.push(result.value);
    else rejected.push(`${handles[index]?.name ?? "selected file"} (could not be read)`);
  });

  return { entries, rejected };
}
