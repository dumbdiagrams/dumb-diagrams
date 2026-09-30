import { useCallback, useEffect, useRef, useState } from "react";

import { DIAGRAM_LIMITS, utf8ByteLength } from "@dumb-diagrams/runtime/core";

import type { Viewport } from "../model/types";
import {
  beginSourceDraft,
  beginTransaction as beginHistoryTransaction,
  canRedo as canRedoHistory,
  canUndo as canUndoHistory,
  cancelTransaction as cancelHistoryTransaction,
  commitSource as commitSourceHistory,
  commitSourceDraft as commitSourceDraftHistory,
  createHistory,
  endTransaction as endHistoryTransaction,
  redo as redoHistory,
  undo as undoHistory,
  type DocumentHistory,
} from "./document-history";
import {
  closeWorkspaceTabs,
  createWorkspaceState,
  createWorkspaceTab,
  deserializeWorkspace,
  duplicateFilename,
  isTabDirty,
  MAX_WORKSPACE_TABS,
  normalizeWorkspaceState,
  restoreWorkspaceTab,
  serializeWorkspace,
  validateRestoredWorkspace,
  type WorkspaceModelOptions,
  type WorkspacePreviewMap,
  type WorkspaceState,
  type WorkspaceTab,
} from "./workspace-model";
import {
  createDefaultPersistencePlatform,
  loadPersistedWorkspace as loadPersistedWorkspaceWithCodec,
  persistWorkspace,
  persistWorkspaceJournal,
  storageWarning,
} from "./workspace-persistence";
import type { WorkspaceLoadOutcome, WorkspacePersistencePlatform } from "./workspace-persistence";

export type {
  StorageError,
  StorageErrorCode,
  WorkspaceIndexedDb,
  WorkspaceLoadOutcome,
  WorkspacePersistenceOutcome,
  WorkspacePersistencePlatform,
  WorkspaceStorage,
} from "./workspace-persistence";

export {
  closeWorkspaceTabs,
  createWorkspaceState,
  createWorkspaceTab,
  deserializeWorkspace,
  isDisposableTab,
  isProtectedDefaultTab,
  isTabDirty,
  MAX_RECYCLED_PREVIEW_BYTES,
  MAX_RECENTLY_CLOSED,
  MAX_WORKSPACE_TABS,
  normalizeWorkspacePreview,
  normalizeWorkspaceState,
  restoreWorkspaceTab,
  serializeWorkspace,
} from "./workspace-model";
export { persistWorkspace, persistWorkspaceJournal } from "./workspace-persistence";
export type {
  DocumentOrigin,
  WorkspacePreviewMap,
  WorkspaceState,
  WorkspaceTab,
} from "./workspace-model";

export interface WorkspaceOptions extends WorkspaceModelOptions {
  /** Injectable storage boundary for deterministic recovery tests and hosts. */
  persistencePlatform?: WorkspacePersistencePlatform;
}

const WORKSPACE_PERSIST_DEBOUNCE_MS = 350;

export function useWorkspace(options: WorkspaceOptions) {
  const [initialState] = useState(() => createWorkspaceState(options));
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const persistencePlatformRef = useRef(options.persistencePlatform ?? createDefaultPersistencePlatform());
  const historiesRef = useRef(new Map<string, DocumentHistory>());
  const persistenceAtRiskRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<WorkspaceState | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [historyVersion, setHistoryVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);

  const reportPersistenceWarning = useCallback((warning: string | undefined) => {
    if (!warning) return;
    setPersistenceWarning((current) => current ?? warning);
  }, []);

  const touchHistory = useCallback(() => {
    setHistoryVersion((current) => current + 1);
  }, []);

  const ensureHistory = useCallback((tabId: string): DocumentHistory => {
    const existing = historiesRef.current.get(tabId);
    if (existing) return existing;
    const next = createHistory();
    historiesRef.current.set(tabId, next);
    return next;
  }, []);

  const flushPendingPersist = useCallback(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const next = pendingPersistRef.current;
    pendingPersistRef.current = null;
    if (!next) return;
    const serialized = serializeWorkspace(next);
    if (utf8ByteLength(serialized) > DIAGRAM_LIMITS.workspaceBytes) {
      persistenceAtRiskRef.current = true;
      reportPersistenceWarning("Workspace is too large to persist; edits remain local and may not survive reload.");
      return;
    }
    // Keep a synchronous write-ahead snapshot so an immediate reload cannot
    // outrun the debounced IndexedDB transaction (notably in WebKit).
    const journal = persistWorkspaceJournal(serialized, persistencePlatformRef.current);
    if (journal.isErr()) {
      persistenceAtRiskRef.current = true;
      reportPersistenceWarning(storageWarning(journal.error));
    }
    persistQueueRef.current = persistQueueRef.current
      .then(() => persistWorkspace(next, serialized, persistencePlatformRef.current, journal))
      .then((result) => {
        result.match(
          (outcome) => {
            // A journal failure was already surfaced synchronously above;
            // keep the queued result for diagnostics without duplicating it.
            persistenceAtRiskRef.current = outcome.status !== "ok";
            if (journal.isOk()) reportPersistenceWarning(outcome.warning);
          },
          (error) => {
            persistenceAtRiskRef.current = true;
            reportPersistenceWarning(storageWarning(error));
          },
        );
      })
      .catch((cause: unknown) => {
        console.error("Workspace persistence failed unexpectedly", cause);
        persistenceAtRiskRef.current = true;
        reportPersistenceWarning("Workspace persistence failed unexpectedly; edits may not survive reload. Save your diagrams to disk.");
      });
  }, [reportPersistenceWarning]);

  const updateWorkspace = useCallback(
    (change: (current: WorkspaceState) => WorkspaceState) => {
      // Keep the ref in lockstep with queued updates. Pointer gestures can
      // commit a preview and finish their transaction in the same event; a
      // functional React update may not run until after that event, leaving
      // endTransaction() looking at the pre-gesture source.
      const next = change(workspaceRef.current);
      workspaceRef.current = next;
      setWorkspace(next);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadPersistedWorkspace(persistencePlatformRef.current);
      if (cancelled) return;
      let outcome: WorkspaceLoadOutcome | undefined;
      if (result.isOk()) {
        outcome = result.value;
        reportPersistenceWarning(outcome.warning);
      } else {
        persistenceAtRiskRef.current = true;
        reportPersistenceWarning(storageWarning(result.error));
      }
      if (outcome?.status === "degraded" && outcome.workspace === null) {
        persistenceAtRiskRef.current = true;
      }
      const next = outcome?.workspace ?? initialState;
      historiesRef.current = new Map(next.tabs.map((tab) => [tab.id, createHistory()]));
      workspaceRef.current = next;
      setWorkspace(next);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialState, reportPersistenceWarning]);

  useEffect(() => {
    if (!ready) return;
    pendingPersistRef.current = workspace;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(
      flushPendingPersist,
      WORKSPACE_PERSIST_DEBOUNCE_MS,
    );

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [flushPendingPersist, ready, workspace]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingPersist();
    };
    window.addEventListener("pagehide", flushPendingPersist);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushPendingPersist);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flushPendingPersist();
    };
  }, [flushPendingPersist]);

  useEffect(() => {
    const warnAboutAtRiskDrafts = (event: BeforeUnloadEvent) => {
      if (!workspaceRef.current.tabs.some((tab) => isTabDirty(tab))) return;
      // Capture the latest source draft in the synchronous journal before
      // deciding whether an exit warning is needed.
      flushPendingPersist();
      if (!persistenceAtRiskRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutAtRiskDrafts);
    return () => window.removeEventListener("beforeunload", warnAboutAtRiskDrafts);
  }, [flushPendingPersist]);

  const activeTab = workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ?? workspace.tabs[0]!;

  const replaceSource = useCallback(
    (source: string) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) return;
      const activeId = workspaceRef.current.activeTabId;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId ? { ...tab, source } : tab),
      }));
    },
    [updateWorkspace],
  );

  const editSourceDraft = useCallback(
    (source: string) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) return;
      const currentState = workspaceRef.current;
      const active = currentState.tabs.find((tab) => tab.id === currentState.activeTabId);
      if (!active || active.source === source) return;
      const history = ensureHistory(active.id);
      historiesRef.current.set(active.id, beginSourceDraft(history, active.source));
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === active.id ? { ...tab, source } : tab),
      }));
      touchHistory();
    },
    [ensureHistory, touchHistory, updateWorkspace],
  );

  const commitSourceDraft = useCallback(() => {
    const currentState = workspaceRef.current;
    const active = currentState.tabs.find((tab) => tab.id === currentState.activeTabId);
    if (!active) return;
    const history = ensureHistory(active.id);
    const transition = commitSourceDraftHistory(history, active.source);
    historiesRef.current.set(active.id, transition.history);
    if (transition.changed) touchHistory();
  }, [ensureHistory, touchHistory]);

  const commitSource = useCallback(
    (source: string) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) return;
      commitSourceDraft();
      const currentState = workspaceRef.current;
      const active = currentState.tabs.find((tab) => tab.id === currentState.activeTabId);
      if (!active || active.source === source) return;
      const history = ensureHistory(active.id);
      const transition = commitSourceHistory(history, active.source, source);
      historiesRef.current.set(active.id, transition.history);
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === active.id ? { ...tab, source } : tab),
      }));
      touchHistory();
    },
    [commitSourceDraft, ensureHistory, touchHistory, updateWorkspace],
  );

  const resetTab = useCallback(
    (tabId: string, source: string, savedSource = source, metadata: Partial<Pick<WorkspaceTab, "filename" | "origin" | "initialSource">> = {}) => {
      const initialSource = metadata.initialSource ?? source;
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes ||
          utf8ByteLength(savedSource) > DIAGRAM_LIMITS.sourceBytes ||
          utf8ByteLength(initialSource) > DIAGRAM_LIMITS.sourceBytes) return;
      if (!workspaceRef.current.tabs.some((tab) => tab.id === tabId)) return;
      if (workspaceRef.current.activeTabId === tabId) commitSourceDraft();
      historiesRef.current.set(tabId, createHistory());
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId
          ? { ...tab, source, initialSource, savedSource, ...metadata }
          : tab),
      }));
      touchHistory();
    },
    [commitSourceDraft, touchHistory, updateWorkspace],
  );

  const resetActive = useCallback(
    (source: string, savedSource = source, metadata: Partial<Pick<WorkspaceTab, "filename" | "origin" | "initialSource">> = {}) => {
      resetTab(workspaceRef.current.activeTabId, source, savedSource, metadata);
    },
    [resetTab],
  );

  const beginTransaction = useCallback((tabId?: string) => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === (tabId ?? state.activeTabId));
    if (!tab) return;
    const history = ensureHistory(tab.id);
    historiesRef.current.set(tab.id, beginHistoryTransaction(history, tab.source));
  }, [ensureHistory]);

  const endTransaction = useCallback((tabId?: string) => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === (tabId ?? state.activeTabId));
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const transition = endHistoryTransaction(history, tab.source);
    historiesRef.current.set(tab.id, transition.history);
    if (transition.changed) touchHistory();
  }, [ensureHistory, touchHistory]);

  const cancelTransaction = useCallback((tabId?: string) => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === (tabId ?? state.activeTabId));
    if (!tab) return;
    const history = ensureHistory(tab.id);
    historiesRef.current.set(tab.id, cancelHistoryTransaction(history));
  }, [ensureHistory]);

  const undo = useCallback(() => {
    commitSourceDraft();
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const transition = undoHistory(history, tab.source);
    historiesRef.current.set(tab.id, transition.history);
    if (!transition.changed || transition.source === undefined) return;
    updateWorkspace((current) => ({
      ...current,
      tabs: current.tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, source: transition.source! } : candidate),
    }));
    touchHistory();
  }, [commitSourceDraft, ensureHistory, touchHistory, updateWorkspace]);

  const redo = useCallback(() => {
    commitSourceDraft();
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const transition = redoHistory(history, tab.source);
    historiesRef.current.set(tab.id, transition.history);
    if (!transition.changed || transition.source === undefined) return;
    updateWorkspace((current) => ({
      ...current,
      tabs: current.tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, source: transition.source! } : candidate),
    }));
    touchHistory();
  }, [commitSourceDraft, ensureHistory, touchHistory, updateWorkspace]);

  const setActiveTab = useCallback(
    (tabId: string) => {
      commitSourceDraft();
      if (!workspaceRef.current.tabs.some((tab) => tab.id === tabId)) return;
      updateWorkspace((current) => ({ ...current, activeTabId: tabId }));
    },
    [commitSourceDraft, updateWorkspace],
  );

  const reorderTabs = useCallback(
    (tabId: string, targetTabId: string) => {
      if (tabId === targetTabId) return;
      updateWorkspace((current) => {
        const fromIndex = current.tabs.findIndex((tab) => tab.id === tabId);
        const targetIndex = current.tabs.findIndex((tab) => tab.id === targetTabId);
        if (fromIndex < 0 || targetIndex < 0) return current;
        const tabs = [...current.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(tabs.findIndex((tab) => tab.id === targetTabId), 0, moved!);
        return { ...current, tabs };
      });
    },
    [updateWorkspace],
  );

  const openTab = useCallback(
    (source: string, tabOptions: Partial<Pick<WorkspaceTab, "initialSource" | "savedSource" | "filename" | "origin" | "viewport">> = {}) => {
      commitSourceDraft();
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes ||
          (tabOptions.initialSource !== undefined && utf8ByteLength(tabOptions.initialSource) > DIAGRAM_LIMITS.sourceBytes) ||
          (tabOptions.savedSource !== undefined && utf8ByteLength(tabOptions.savedSource) > DIAGRAM_LIMITS.sourceBytes)) return null;
      if (workspaceRef.current.tabs.length >= MAX_WORKSPACE_TABS) return null;
      const tab = createWorkspaceTab(source, {
        initialSource: tabOptions.initialSource ?? source,
        savedSource: tabOptions.savedSource ?? source,
        filename: tabOptions.filename,
        origin: tabOptions.origin ?? "new",
        viewport: tabOptions.viewport ?? options.initialViewport,
      });
      historiesRef.current.set(tab.id, createHistory());
      updateWorkspace((current) => ({ ...current, tabs: [...current.tabs, tab], activeTabId: tab.id }));
      return tab.id;
    },
    [commitSourceDraft, options.initialViewport, updateWorkspace],
  );

  const newTab = useCallback(() => openTab(options.blankSource, { origin: "new" }), [openTab, options.blankSource]);

  const closeTabs = useCallback(
    (tabIds: string[], preferredActiveTabId?: string, previewByTabId?: WorkspacePreviewMap) => {
      commitSourceDraft();
      const current = workspaceRef.current;
      const closesEveryTab = tabIds.length > 0 && current.tabs.every((tab) => tabIds.includes(tab.id));
      const replacementTab = closesEveryTab
        ? createWorkspaceTab(options.blankSource, { origin: "new", viewport: options.initialViewport })
        : undefined;
      const result = closeWorkspaceTabs(current, tabIds, {
        preferredActiveTabId,
        replacementTab,
        previewByTabId,
        protectedBlankSource: options.blankSource,
      });
      if (!result.closed.length) return 0;
      if (replacementTab) historiesRef.current.set(replacementTab.id, createHistory());
      result.closed.forEach((tab) => historiesRef.current.delete(tab.id));
      updateWorkspace(() => result.state);
      return result.closed.length;
    },
    [commitSourceDraft, options.blankSource, options.initialViewport, updateWorkspace],
  );

  const closeTab = useCallback(
    (tabId = workspaceRef.current.activeTabId, previewByTabId?: WorkspacePreviewMap) => closeTabs([tabId], undefined, previewByTabId),
    [closeTabs],
  );

  const closeAllTabs = useCallback(
    (previewByTabId?: WorkspacePreviewMap) => closeTabs(workspaceRef.current.tabs.map((tab) => tab.id), undefined, previewByTabId),
    [closeTabs],
  );

  const closeTabsToRight = useCallback(
    (tabId: string, previewByTabId?: WorkspacePreviewMap) => {
      const current = workspaceRef.current;
      const index = current.tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return 0;
      return closeTabs(current.tabs.slice(index + 1).map((tab) => tab.id), tabId, previewByTabId);
    },
    [closeTabs],
  );

  const restoreClosed = useCallback((tabId = workspaceRef.current.recentlyClosed[0]?.id) => {
    commitSourceDraft();
    const current = workspaceRef.current;
    if (!tabId) return false;
    const next = restoreWorkspaceTab(current, tabId);
    if (!next) return false;
    const restored = next.tabs[next.tabs.length - 1]!;
    historiesRef.current.set(restored.id, createHistory());
    updateWorkspace(() => next);
    return true;
  }, [commitSourceDraft, updateWorkspace]);

  const reopenClosed = useCallback(() => restoreClosed(), [restoreClosed]);

  const removeClosed = useCallback((tabId: string) => {
    const current = workspaceRef.current;
    if (!current.recentlyClosed.some((tab) => tab.id === tabId)) return false;
    updateWorkspace((state) => ({ ...state, recentlyClosed: state.recentlyClosed.filter((tab) => tab.id !== tabId) }));
    return true;
  }, [updateWorkspace]);

  const clearRecentlyClosed = useCallback(() => {
    if (!workspaceRef.current.recentlyClosed.length) return false;
    updateWorkspace((state) => ({ ...state, recentlyClosed: [] }));
    return true;
  }, [updateWorkspace]);

  const duplicateTab = useCallback(
    (tabId = workspaceRef.current.activeTabId) => {
      commitSourceDraft();
      if (workspaceRef.current.tabs.length >= MAX_WORKSPACE_TABS) return null;
      const sourceTab = workspaceRef.current.tabs.find((tab) => tab.id === tabId);
      if (!sourceTab) return null;
      const duplicate = createWorkspaceTab(sourceTab.source, {
        savedSource: sourceTab.savedSource,
        filename: duplicateFilename(sourceTab.filename),
        origin: "duplicate",
        viewport: sourceTab.viewport,
        viewportCustomized: sourceTab.viewportCustomized,
      });
      historiesRef.current.set(duplicate.id, createHistory());
      updateWorkspace((current) => ({ ...current, tabs: [...current.tabs, duplicate], activeTabId: duplicate.id }));
      return duplicate.id;
    },
    [commitSourceDraft, updateWorkspace],
  );

  const updateViewport = useCallback(
    (viewport: Viewport, viewportOptions: { userInitiated?: boolean } = {}) => {
      const activeId = workspaceRef.current.activeTabId;
      const userInitiated = viewportOptions.userInitiated ?? true;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId
          ? { ...tab, viewport: { ...viewport }, viewportCustomized: userInitiated ? true : tab.viewportCustomized }
          : tab),
      }));
    },
    [updateWorkspace],
  );

  const markSaved = useCallback(
    (source = workspaceRef.current.tabs.find((tab) => tab.id === workspaceRef.current.activeTabId)?.source ?? "", filename?: string) => {
      commitSourceDraft();
      const activeId = workspaceRef.current.activeTabId;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId
          ? { ...tab, savedSource: source, ...(filename === undefined ? {} : { filename }) }
          : tab),
      }));
    },
    [commitSourceDraft, updateWorkspace],
  );

  const markTabSaved = useCallback(
    (tabId: string, source: string, filename?: string) => {
      if (workspaceRef.current.activeTabId === tabId) commitSourceDraft();
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId
          ? { ...tab, savedSource: source, ...(filename === undefined ? {} : { filename }) }
          : tab),
      }));
    },
    [commitSourceDraft, updateWorkspace],
  );

  const setTabFilename = useCallback(
    (tabId: string, filename?: string) => {
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId ? { ...tab, filename } : tab),
      }));
    },
    [updateWorkspace],
  );

  const activeHistory = ensureHistory(activeTab.id);
  const canUndo = historyVersion >= 0 && canUndoHistory(activeHistory, activeTab.source);
  const canRedo = historyVersion >= 0 && canRedoHistory(activeHistory, activeTab.source);

  return {
    ready,
    tabs: workspace.tabs,
    activeTab,
    activeTabId: workspace.activeTabId,
    recentlyClosed: workspace.recentlyClosed,
    source: activeTab.source,
    viewport: activeTab.viewport,
    replaceSource,
    editSourceDraft,
    commitSourceDraft,
    commitSource,
    resetTab,
    resetActive,
    beginTransaction,
    endTransaction,
    cancelTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
    setActiveTab,
    reorderTabs,
    openTab,
    newTab,
    closeTab,
    closeAllTabs,
    closeTabsToRight,
    reopenClosed,
    restoreClosed,
    removeClosed,
    clearRecentlyClosed,
    duplicateTab,
    updateViewport,
    markSaved,
    markTabSaved,
    setTabFilename,
    persistenceWarning,
  };
}

export function loadPersistedWorkspace(platform = createDefaultPersistencePlatform()) {
  return loadPersistedWorkspaceWithCodec(platform, {
    deserialize: deserializeWorkspace,
    normalize: normalizeWorkspaceState,
    validate: validateRestoredWorkspace,
  });
}
