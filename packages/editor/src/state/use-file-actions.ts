import { useEffect, useRef, useState } from "react";
import { AutosaveController, type AutosaveStatus } from "./autosave";
import {
  saveExistingFileHandle,
  saveWithPicker,
  hasWritePermission,
  requestWritePermission,
  type FileSaveResult,
  type FileSystemHandleLike,
  type SaveFilePicker,
} from "./file-save";
import { downloadTextResult, filenameWithExtension } from "./export-actions";
import { FileSyncController, type FileSyncByTab } from "./file-sync";
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
  onSaved: (tabId: string, source: string, filename: string, options?: { automatic?: boolean }) => void;
  onConflict: (conflict: { tabId: string; filename: string; diskSource: string }) => void;
  onExternalReload: (tabId: string, source: string, filename: string) => void;
  canAutoReloadTab?: (tabId: string) => boolean;
  canAutoSaveTab?: (tabId: string) => boolean;
};

const AUTOSAVE_PREFERENCE_KEY = "dumb-diagrams:auto-save:v1";

function readAutoSavePreference(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(AUTOSAVE_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useFileActions({
  tabs,
  tabLabel,
  sourceIsValid,
  onMessage,
  onSaved,
  onConflict,
  onExternalReload,
  canAutoReloadTab,
  canAutoSaveTab,
}: FileActionsOptions) {
  const handles = useRef(new Map<string, FileSystemHandleLike>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const writingTabs = useRef(new Set<string>());
  const validSources = useRef(new Map<string, boolean>());
  const callbacksRef = useRef({
    sourceIsValid,
    onMessage,
    onSaved,
    onConflict,
    onExternalReload,
    canAutoReloadTab,
    canAutoSaveTab,
  });
  callbacksRef.current = {
    sourceIsValid,
    onMessage,
    onSaved,
    onConflict,
    onExternalReload,
    canAutoReloadTab,
    canAutoSaveTab,
  };
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState(readAutoSavePreference);
  const [fileSyncByTab, setFileSyncByTab] = useState<FileSyncByTab>({});
  const syncStatusRef = useRef<FileSyncByTab>({});
  const autoStatusRef = useRef<Record<string, AutosaveStatus>>({});
  const writeQueues = useRef(new Map<FileSystemHandleLike, Promise<void>>());
  const permissionRequestGeneration = useRef(0);
  const withHandleWrite = <T>(handle: FileSystemHandleLike, operation: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.current.get(handle) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(operation);
    const queued = task.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.current.set(handle, queued);
    return task.finally(() => {
      if (writeQueues.current.get(handle) === queued) writeQueues.current.delete(handle);
    });
  };
  const publishStatuses = (base: FileSyncByTab) => {
    syncStatusRef.current = base;
    const combined: Record<string, { status: (typeof base)[string]["status"]; filename: string }> = { ...base };
    for (const [tabId, status] of Object.entries(autoStatusRef.current)) {
      if (!status || !combined[tabId]) continue;
      if (combined[tabId].status === "conflict" || combined[tabId].status === "invalid") continue;
      combined[tabId] = { ...combined[tabId], status };
    }
    setFileSyncByTab(combined);
  };
  const syncRef = useRef<FileSyncController | null>(null);
  if (!syncRef.current) {
    syncRef.current = new FileSyncController({
      getHandle: (tabId) => handles.current.get(tabId),
      sourceIsValid: (source) => callbacksRef.current.sourceIsValid(source),
      onExternalReload: (tabId, source, filename) => callbacksRef.current.onExternalReload(tabId, source, filename),
      canAutoReloadTab: (tabId) =>
        !writingTabs.current.has(tabId) && (callbacksRef.current.canAutoReloadTab?.(tabId) ?? true),
      onConflict: (conflict) => callbacksRef.current.onConflict(conflict),
      onMessage: (message) => callbacksRef.current.onMessage(message),
      onStatus: publishStatuses,
    });
  }
  const autosaveRef = useRef<AutosaveController | null>(null);
  if (!autosaveRef.current) {
    autosaveRef.current = new AutosaveController(
      {
        save: async (tabId, source) => {
          const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
          const handle = handles.current.get(tabId);
          if (!tab || !handle || tab.source !== source || !callbacksRef.current.sourceIsValid(source)) return "stale";
          if ((callbacksRef.current.canAutoSaveTab?.(tabId) ?? true) === false) return "blocked";
          return withHandleWrite(handle, async () => {
            const latestTab = tabsRef.current.find((candidate) => candidate.id === tabId);
            if (!latestTab || handles.current.get(tabId) !== handle || latestTab.source !== source) return "stale";
            if ((callbacksRef.current.canAutoSaveTab?.(tabId) ?? true) === false) return "blocked";
            if (!(await hasWritePermission(handle))) return "error";
            writingTabs.current.add(tabId);
            syncRef.current?.beginOwnWrite(tabId);
            try {
              const result = await saveExistingFileHandle(handle, source, latestTab.savedSource, {
                isCurrent: () => {
                  const current = tabsRef.current.find((candidate) => candidate.id === tabId);
                  return handles.current.get(tabId) === handle && current?.source === source;
                },
              });
              if (result.status === "saved" || (result.status === "error" && result.committed)) {
                syncRef.current?.noteOwnWrite(tabId, source, handle);
                callbacksRef.current.onSaved(tabId, source, handle.name, { automatic: true });
                return result.status === "saved" ? ("saved" as const) : ("stale" as const);
              }
              syncRef.current?.endOwnWrite(tabId);
              if (result.status === "conflict") {
                syncRef.current?.noteConflict(tabId);
                return "conflict" as const;
              }
              if (result.status === "error" && result.code !== "stale-source") return "error" as const;
              return "stale" as const;
            } finally {
              writingTabs.current.delete(tabId);
            }
          });
        },
        onStatus: (tabId, status) => {
          if (status) autoStatusRef.current[tabId] = status;
          else delete autoStatusRef.current[tabId];
          publishStatuses(syncStatusRef.current);
        },
      },
      autoSaveEnabled,
    );
  }
  syncRef.current.refreshTabs(tabs);
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_PREFERENCE_KEY, String(autoSaveEnabled));
    } catch {
      // Autosave remains enabled for this session when storage is unavailable.
    }
    autosaveRef.current?.setEnabled(autoSaveEnabled);
  }, [autoSaveEnabled]);
  const isValidCached = (source: string) => {
    const existing = validSources.current.get(source);
    if (existing !== undefined) return existing;
    const valid = sourceIsValid(source);
    validSources.current.set(source, valid);
    if (validSources.current.size > 32) validSources.current.delete(validSources.current.keys().next().value!);
    return valid;
  };
  const refreshAutosaveTabs = () => {
    autosaveRef.current?.update(
      tabsRef.current.map((tab) => ({
        id: tab.id,
        source: tab.source,
        savedSource: tab.savedSource,
        linked: handles.current.has(tab.id),
        valid: isValidCached(tab.source),
        allowed: callbacksRef.current.canAutoSaveTab?.(tab.id) ?? true,
      })),
    );
  };
  const refreshAutosaveTabsRef = useRef(refreshAutosaveTabs);
  refreshAutosaveTabsRef.current = refreshAutosaveTabs;
  useEffect(() => {
    refreshAutosaveTabs();
  });
  useEffect(() => {
    const openIds = new Set(tabs.map(({ id }) => id));
    for (const id of handles.current.keys()) if (!openIds.has(id)) handles.current.delete(id);
  }, [tabs]);
  useEffect(() => {
    const controller = syncRef.current!;
    controller.start();
    if (typeof document === "undefined") return () => controller.stop();
    const pollIfVisible = () => {
      refreshAutosaveTabsRef.current();
      if (document.visibilityState !== "hidden") void controller.poll();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") pollIfVisible();
    };
    const interval = window.setInterval(pollIfVisible, 750);
    window.addEventListener("focus", pollIfVisible);
    document.addEventListener("visibilitychange", onVisibilityChange);
    pollIfVisible();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", pollIfVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.stop();
    };
  }, []);
  useEffect(() => {
    const controller = autosaveRef.current!;
    if (typeof window === "undefined") return;
    const flush = () => controller.flush();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const hasLinkedDirty = tabsRef.current.some(
        (tab) => handles.current.has(tab.id) && tab.source !== tab.savedSource,
      );
      if (!hasLinkedDirty && writingTabs.current.size === 0 && writeQueues.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.dispose();
    };
  }, []);

  const saveTabSource = async (
    tabId: string,
    requestedFilename?: string,
    options: { overwriteExisting?: boolean } = {},
  ): Promise<FileSaveResult> => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab)
      return {
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
      const permissionPromise = requestWritePermission(existingHandle);
      const result = await withHandleWrite(existingHandle, async () => {
        if (!(await permissionPromise))
          return {
            status: "error",
            filename: existingHandle.name,
            code: "permission-denied",
            message: "Write permission was not granted for this file.",
          } as FileSaveResult;
        const latestTab = tabsRef.current.find((candidate) => candidate.id === tabId);
        if (!latestTab || latestTab.source !== tab.source || handles.current.get(tabId) !== existingHandle)
          return {
            status: "error",
            filename: existingHandle.name,
            code: "stale-source",
            message: "The diagram changed while it was being saved.",
          } as FileSaveResult;
        writingTabs.current.add(tabId);
        syncRef.current?.beginOwnWrite(tabId);
        try {
          const saved = await saveExistingFileHandle(existingHandle, tab.source, latestTab.savedSource, {
            overwrite: options.overwriteExisting,
            isCurrent: () =>
              handles.current.get(tabId) === existingHandle &&
              tabsRef.current.find((candidate) => candidate.id === tabId)?.source === tab.source,
          });
          if (saved.status === "saved" || (saved.status === "error" && saved.committed)) {
            syncRef.current?.noteOwnWrite(tabId, tab.source, existingHandle);
            onSaved(tabId, tab.source, saved.filename);
          }
          return saved;
        } finally {
          writingTabs.current.delete(tabId);
        }
      });
      if (result.status === "saved") {
        onMessage(`Saved ${existingHandle.name}`);
      } else {
        syncRef.current?.endOwnWrite(tabId);
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
        if (result.status === "saved" || (result.status === "error" && result.committed)) {
          syncRef.current?.noteOwnWrite(tabId, tab.source, handle);
          onSaved(tabId, tab.source, handle.name);
        }
        if (result.status === "saved") onMessage(`Saved ${handle.name}`);
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
    syncRef.current?.noteOwnWrite(tabId, tabsRef.current.find((tab) => tab.id === tabId)?.source ?? "", handle);
    refreshAutosaveTabs();
  };
  const setAutoSaveEnabled = (enabled: boolean) => {
    const generation = ++permissionRequestGeneration.current;
    if (!enabled) {
      setAutoSaveEnabledState(false);
      return;
    }
    const requests = [...new Set(handles.current.values())].map((handle) => requestWritePermission(handle));
    void Promise.all(requests).then((results) => {
      if (permissionRequestGeneration.current !== generation) return;
      if (results.every(Boolean)) setAutoSaveEnabledState(true);
      else callbacksRef.current.onMessage("Autosave permission was not granted for one or more linked files.");
    });
  };
  const reloadTabFromDisk = (tabId: string, options?: { discardStudioEdits?: boolean }) =>
    syncRef.current!.reloadTabFromDisk(tabId, options);
  return { saveTabSource, attachFileHandle, fileSyncByTab, reloadTabFromDisk, autoSaveEnabled, setAutoSaveEnabled };
}
