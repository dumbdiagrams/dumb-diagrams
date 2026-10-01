import { useEffect, useRef } from "react";
import { saveExistingFileHandle, saveWithPicker, type FileSaveResult, type FileSystemHandleLike, type SaveFilePicker } from "./file-save";
import { downloadTextResult, filenameWithExtension } from "./export-actions";
import type { WorkspaceTab } from "./workspace";

export type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemHandleLike[]>;
  showSaveFilePicker?: SaveFilePicker;
};

type FileActionsOptions = {
  tabs: WorkspaceTab[];
  tabLabel: (tab: WorkspaceTab) => string;
  sourceIsValid: (source: string) => boolean;
  onMessage: (message: string) => void;
  onSaved: (tabId: string, source: string, filename: string) => void;
  onConflict: (conflict: { tabId: string; filename: string; diskSource: string }) => void;
};

export function useFileActions({ tabs, tabLabel, sourceIsValid, onMessage, onSaved, onConflict }: FileActionsOptions) {
  const handles = useRef(new Map<string, FileSystemHandleLike>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
    const openIds = new Set(tabs.map(({ id }) => id));
    for (const id of handles.current.keys()) if (!openIds.has(id)) handles.current.delete(id);
  }, [tabs]);

  const saveTabSource = async (
    tabId: string,
    requestedFilename?: string,
    options: { overwriteExisting?: boolean } = {},
  ): Promise<FileSaveResult> => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return {
      status: "error",
      filename: requestedFilename ?? "diagram.dgm",
      code: "missing-tab",
      message: "The diagram tab is no longer open.",
    };
    if (!sourceIsValid(tab.source)) {
      onMessage("Cannot save an invalid diagram. Fix the source errors first.");
      return {
        status: "error",
        filename: requestedFilename ?? tab.filename ?? "diagram.dgm",
        code: "invalid-source",
        message: "Cannot save an invalid diagram. Fix the source errors first.",
      };
    }
    const existingHandle = !requestedFilename ? handles.current.get(tabId) : undefined;
    if (existingHandle) {
      const result = await saveExistingFileHandle(existingHandle, tab.source, tab.savedSource, {
        overwrite: options.overwriteExisting,
        isCurrent: () => tabsRef.current.find((candidate) => candidate.id === tabId)?.source === tab.source,
      });
      if (result.status === "saved") {
        onSaved(tabId, tab.source, result.filename);
        onMessage(`Saved ${existingHandle.name}`);
      }
      if (result.status === "conflict") {
        onConflict({ ...result, tabId });
      } else if (result.status === "error") {
        onMessage(`Could not save ${result.filename}: ${result.message}`);
      }
      return result;
    }

    const picker = requestedFilename ? (window as FilePickerWindow).showSaveFilePicker : undefined;
    if (requestedFilename && picker) {
      const { result, handle } = await saveWithPicker(
        picker,
        filenameWithExtension(requestedFilename, "dgm"),
        tab.source,
        () => tabsRef.current.find((candidate) => candidate.id === tabId)?.source === tab.source,
      );
      if (handle) {
        handles.current.set(tabId, handle);
        onSaved(tabId, tab.source, handle.name);
        onMessage(`Saved ${handle.name}`);
      } else if (result.status === "error") {
        onMessage(`Could not save ${result.filename}: ${result.message}`);
      }
      return result;
    }
    const baseName = requestedFilename || tab.filename || tabLabel(tab);
    const filename = filenameWithExtension(baseName, "dgm");
    return downloadTextResult(tab.source, filename).match(
      () => {
        onSaved(tab.id, tab.source, filename);
        onMessage(`Downloaded ${filename}`);
        return { status: "saved", filename };
      },
      (error) => {
        onMessage(`Save failed: ${error.message}`);
        return { status: "error", filename, code: "download-failed", message: error.message };
      },
    );
  };

  const attachFileHandle = (tabId: string, handle: FileSystemHandleLike) => {
    handles.current.set(tabId, handle);
  };
  return { saveTabSource, attachFileHandle };
}
