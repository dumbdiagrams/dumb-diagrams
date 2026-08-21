import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DIAGRAM_LIMITS, characterLength, hasErrors, utf8ByteLength, validateDocument } from "@dumb-diagrams/core";
import { getCatalogMap } from "@dumb-diagrams/catalog";
import { parseDgm } from "@dumb-diagrams/dsl";
import { sanitizeSvg } from "@dumb-diagrams/render";

import type { Viewport } from "../canvas/CanvasStage";

export type DocumentOrigin =
  | "fixture"
  | "new"
  | "import"
  | "example"
  | "recovery"
  | "duplicate";

export type DocumentRef =
  | { kind: "browser"; id: string }
  | { kind: "file"; path: string };

export interface DocumentSourceAdapter {
  load(ref: DocumentRef): Promise<string>;
  save(ref: DocumentRef, source: string): Promise<void>;
  watch?(ref: DocumentRef, onChange: (source: string) => void): () => void;
}

export interface WorkspaceTab {
  id: string;
  source: string;
  savedSource: string;
  filename?: string;
  origin: DocumentOrigin;
  viewport: Viewport;
  viewportCustomized: boolean;
}

export interface WorkspaceState {
  version: 1;
  tabs: WorkspaceTab[];
  activeTabId: string;
  recentlyClosed: WorkspaceTab[];
}

export interface WorkspaceOptions {
  initialSource: string;
  initialSavedSource?: string;
  initialOrigin?: DocumentOrigin;
  initialFilename?: string;
  initialViewport: Viewport;
  blankSource: string;
}

interface HistoryState {
  past: string[];
  future: string[];
  transactionStart: string | null;
}

const DB_NAME = "dumb-diagrams-studio";
const DB_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";
const FALLBACK_KEY = "dumb-diagrams:workspace";
const MAX_HISTORY = 100;
const MAX_RECENTLY_CLOSED = 10;

export const MAX_WORKSPACE_TABS = 10;

export function createWorkspaceTab(
  source: string,
  options: {
    savedSource?: string;
    filename?: string;
    origin?: DocumentOrigin;
    viewport: Viewport;
    viewportCustomized?: boolean;
    id?: string;
  },
): WorkspaceTab {
  return {
    id: options.id ?? createTabId(),
    source,
    savedSource: options.savedSource ?? source,
    filename: options.filename,
    origin: options.origin ?? "new",
    viewport: { ...options.viewport },
    viewportCustomized: options.viewportCustomized ?? false,
  };
}

export function isTabDirty(tab: WorkspaceTab | undefined): boolean {
  return Boolean(tab && tab.source !== tab.savedSource);
}

export function createWorkspaceState(options: WorkspaceOptions): WorkspaceState {
  const tab = createWorkspaceTab(options.initialSource, {
    savedSource: options.initialSavedSource ?? options.initialSource,
    filename: options.initialFilename,
    origin: options.initialOrigin ?? "fixture",
    viewport: options.initialViewport,
  });
  return {
    version: 1,
    tabs: [tab],
    activeTabId: tab.id,
    recentlyClosed: [],
  };
}

export function normalizeWorkspaceState(input: unknown): WorkspaceState | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<WorkspaceState>;
  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) return null;

  const tabs = raw.tabs.slice(0, MAX_WORKSPACE_TABS)
    .map((tab) => normalizeTab(tab))
    .filter((tab): tab is WorkspaceTab => Boolean(tab));
  if (tabs.length === 0) return null;

  const activeTabId = tabs.some((tab) => tab.id === raw.activeTabId)
    ? String(raw.activeTabId)
    : tabs[0]!.id;
  const recentlyClosed = Array.isArray(raw.recentlyClosed)
    ? raw.recentlyClosed.slice(0, MAX_RECENTLY_CLOSED)
        .map((tab) => normalizeTab(tab))
        .filter((tab): tab is WorkspaceTab => Boolean(tab))
    : [];

  return {
    version: 1,
    tabs,
    activeTabId,
    recentlyClosed,
  };
}

export function serializeWorkspace(state: WorkspaceState): string {
  return JSON.stringify(state);
}

export function deserializeWorkspace(raw: string): WorkspaceState | null {
  if (utf8ByteLength(raw) > DIAGRAM_LIMITS.workspaceBytes) return null;
  try {
    return normalizeWorkspaceState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function useWorkspace(options: WorkspaceOptions) {
  const initialState = useMemo(() => createWorkspaceState(options), []);
  const [workspace, setWorkspace] = useState<WorkspaceState>(initialState);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const historiesRef = useRef(new Map<string, HistoryState>());
  const [historyVersion, setHistoryVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const touchHistory = useCallback(() => {
    setHistoryVersion((current) => current + 1);
  }, []);

  const ensureHistory = useCallback((tabId: string): HistoryState => {
    const existing = historiesRef.current.get(tabId);
    if (existing) return existing;
    const next = { past: [], future: [], transactionStart: null };
    historiesRef.current.set(tabId, next);
    return next;
  }, []);

  const updateWorkspace = useCallback(
    (change: (current: WorkspaceState) => WorkspaceState) => {
      setWorkspace((current) => {
        const next = change(current);
        workspaceRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void loadPersistedWorkspace().then((persisted) => {
      if (cancelled) return;
      const next = persisted ?? initialState;
      historiesRef.current = new Map(next.tabs.map((tab) => [tab.id, createHistory()]));
      workspaceRef.current = next;
      setWorkspace(next);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialState]);

  useEffect(() => {
    if (!ready) return;
    void persistWorkspace(workspace);
  }, [ready, workspace]);

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

  const commitSource = useCallback(
    (source: string) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) return;
      const currentState = workspaceRef.current;
      const active = currentState.tabs.find((tab) => tab.id === currentState.activeTabId);
      if (!active || active.source === source) return;
      const history = ensureHistory(active.id);
      history.past = [...history.past.slice(-(MAX_HISTORY - 1)), active.source];
      history.future = [];
      history.transactionStart = null;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === active.id ? { ...tab, source } : tab),
      }));
      touchHistory();
    },
    [ensureHistory, touchHistory, updateWorkspace],
  );

  const resetActive = useCallback(
    (source: string, savedSource = source, metadata: Partial<Pick<WorkspaceTab, "filename" | "origin">> = {}) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes || utf8ByteLength(savedSource) > DIAGRAM_LIMITS.sourceBytes) return;
      const activeId = workspaceRef.current.activeTabId;
      historiesRef.current.set(activeId, createHistory());
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId
          ? { ...tab, source, savedSource, ...metadata }
          : tab),
      }));
      touchHistory();
    },
    [touchHistory, updateWorkspace],
  );

  const beginTransaction = useCallback(() => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    ensureHistory(tab.id).transactionStart = tab.source;
  }, [ensureHistory]);

  const endTransaction = useCallback(() => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const start = history.transactionStart;
    history.transactionStart = null;
    if (!start || start === tab.source) return;
    history.past = [...history.past.slice(-(MAX_HISTORY - 1)), start];
    history.future = [];
    touchHistory();
  }, [ensureHistory, touchHistory]);

  const undo = useCallback(() => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const previous = history.past.pop();
    if (previous === undefined) return;
    history.future.unshift(tab.source);
    history.transactionStart = null;
    updateWorkspace((current) => ({
      ...current,
      tabs: current.tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, source: previous } : candidate),
    }));
    touchHistory();
  }, [ensureHistory, touchHistory, updateWorkspace]);

  const redo = useCallback(() => {
    const state = workspaceRef.current;
    const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
    if (!tab) return;
    const history = ensureHistory(tab.id);
    const next = history.future.shift();
    if (next === undefined) return;
    history.past.push(tab.source);
    history.transactionStart = null;
    updateWorkspace((current) => ({
      ...current,
      tabs: current.tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, source: next } : candidate),
    }));
    touchHistory();
  }, [ensureHistory, touchHistory, updateWorkspace]);

  const setActiveTab = useCallback(
    (tabId: string) => {
      if (!workspaceRef.current.tabs.some((tab) => tab.id === tabId)) return;
      updateWorkspace((current) => ({ ...current, activeTabId: tabId }));
    },
    [updateWorkspace],
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
    (source: string, tabOptions: Partial<Pick<WorkspaceTab, "savedSource" | "filename" | "origin" | "viewport">> = {}) => {
      if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes ||
          (tabOptions.savedSource !== undefined && utf8ByteLength(tabOptions.savedSource) > DIAGRAM_LIMITS.sourceBytes)) return null;
      if (workspaceRef.current.tabs.length >= MAX_WORKSPACE_TABS) return null;
      const tab = createWorkspaceTab(source, {
        savedSource: tabOptions.savedSource ?? source,
        filename: tabOptions.filename,
        origin: tabOptions.origin ?? "new",
        viewport: tabOptions.viewport ?? options.initialViewport,
      });
      historiesRef.current.set(tab.id, createHistory());
      updateWorkspace((current) => ({
        ...current,
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
      }));
      return tab.id;
    },
    [options.initialViewport, updateWorkspace],
  );

  const newTab = useCallback(() => openTab(options.blankSource, { origin: "new" }), [openTab, options.blankSource]);

  const closeTab = useCallback(
    (tabId = workspaceRef.current.activeTabId) => {
      const current = workspaceRef.current;
      const index = current.tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0 || current.tabs.length <= 1) return;
      const closed = current.tabs[index]!;
      const nextRecentlyClosed = [closed, ...current.recentlyClosed.filter((tab) => tab.id !== tabId)]
        .slice(0, MAX_RECENTLY_CLOSED);
      historiesRef.current.delete(tabId);

      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = current.activeTabId === tabId
        ? tabs[Math.max(0, index - 1)]?.id ?? tabs[0]!.id
        : current.activeTabId;
      updateWorkspace((state) => ({
        ...state,
        tabs,
        activeTabId,
        recentlyClosed: nextRecentlyClosed,
      }));
    },
    [options.blankSource, options.initialViewport, updateWorkspace],
  );

  const reopenClosed = useCallback(() => {
    const current = workspaceRef.current;
    if (current.tabs.length >= MAX_WORKSPACE_TABS) return false;
    const [tab, ...remaining] = current.recentlyClosed;
    if (!tab) return false;
    const restored = { ...tab, viewport: { ...tab.viewport } };
    historiesRef.current.set(restored.id, createHistory());
    updateWorkspace((state) => ({
      ...state,
      tabs: [...state.tabs, restored],
      activeTabId: restored.id,
      recentlyClosed: remaining,
    }));
    return true;
  }, [updateWorkspace]);

  const duplicateTab = useCallback(
    (tabId = workspaceRef.current.activeTabId) => {
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
      updateWorkspace((current) => ({
        ...current,
        tabs: [...current.tabs, duplicate],
        activeTabId: duplicate.id,
      }));
      return duplicate.id;
    },
    [updateWorkspace],
  );

  const updateViewport = useCallback(
    (viewport: Viewport, options: { userInitiated?: boolean } = {}) => {
      const activeId = workspaceRef.current.activeTabId;
      const userInitiated = options.userInitiated ?? true;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId
          ? {
              ...tab,
              viewport: { ...viewport },
              viewportCustomized: userInitiated ? true : tab.viewportCustomized,
            }
          : tab),
      }));
    },
    [updateWorkspace],
  );

  const markSaved = useCallback(
    (source = workspaceRef.current.tabs.find((tab) => tab.id === workspaceRef.current.activeTabId)?.source ?? "", filename?: string) => {
      const activeId = workspaceRef.current.activeTabId;
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === activeId
          ? { ...tab, savedSource: source, ...(filename === undefined ? {} : { filename }) }
          : tab),
      }));
    },
    [updateWorkspace],
  );

  const markTabSaved = useCallback(
    (tabId: string, source: string, filename?: string) => {
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId
          ? { ...tab, savedSource: source, ...(filename === undefined ? {} : { filename }) }
          : tab),
      }));
    },
    [updateWorkspace],
  );

  const setTabFilename = useCallback(
    (tabId: string, filename?: string) => {
      updateWorkspace((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => tab.id === tabId
          ? { ...tab, filename }
          : tab),
      }));
    },
    [updateWorkspace],
  );

  const canUndo = (historyVersion >= 0 && ensureHistory(activeTab.id).past.length > 0);
  const canRedo = (historyVersion >= 0 && ensureHistory(activeTab.id).future.length > 0);

  return {
    ready,
    tabs: workspace.tabs,
    activeTab,
    activeTabId: workspace.activeTabId,
    recentlyClosed: workspace.recentlyClosed,
    source: activeTab.source,
    viewport: activeTab.viewport,
    replaceSource,
    commitSource,
    resetActive,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
    setActiveTab,
    reorderTabs,
    openTab,
    newTab,
    closeTab,
    reopenClosed,
    duplicateTab,
    updateViewport,
    markSaved,
    markTabSaved,
    setTabFilename,
  };
}

export const browserDocumentAdapter: DocumentSourceAdapter = {
  async load(ref) {
    if (ref.kind !== "browser") {
      throw new Error("Filesystem documents are not available in browser Studio mode.");
    }
    const workspace = await loadPersistedWorkspace();
    const tab = workspace?.tabs.find((candidate) => candidate.id === ref.id);
    if (!tab) throw new Error(`Document ${ref.id} was not found.`);
    return tab.source;
  },
  async save(ref, source) {
    if (ref.kind !== "browser") {
      throw new Error("Filesystem documents are not available in browser Studio mode.");
    }
    if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) throw new Error("Diagram exceeds the 1 MiB source limit");
    const workspace = await loadPersistedWorkspace();
    if (!workspace) throw new Error("The browser workspace has not been initialized.");
    const next = {
      ...workspace,
      tabs: workspace.tabs.map((tab) => tab.id === ref.id
        ? { ...tab, source, savedSource: source }
        : tab),
    };
    await persistWorkspace(next);
  },
};

function createHistory(): HistoryState {
  return { past: [], future: [], transactionStart: null };
}

function createTabId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function duplicateFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : ".dgm";
  return `${stem} copy${extension}`;
}

function normalizeTab(input: unknown): WorkspaceTab | null {
  if (!input || typeof input !== "object") return null;
  const tab = input as Partial<WorkspaceTab>;
  if (typeof tab.id !== "string" || !tab.id || characterLength(tab.id) > DIAGRAM_LIMITS.idCharacters || typeof tab.source !== "string") return null;
  if (utf8ByteLength(tab.source) > DIAGRAM_LIMITS.sourceBytes) return null;
  if (typeof tab.savedSource === "string" && utf8ByteLength(tab.savedSource) > DIAGRAM_LIMITS.sourceBytes) return null;
  const viewport = tab.viewport;
  if (!viewport || !finiteCoordinate(viewport.panX) || !finiteCoordinate(viewport.panY) ||
      typeof viewport.zoom !== "number" || !Number.isFinite(viewport.zoom) || viewport.zoom <= 0 || viewport.zoom > 10) {
    return null;
  }
  return {
    id: tab.id,
    source: tab.source,
    savedSource: typeof tab.savedSource === "string" ? tab.savedSource : tab.source,
    filename: normalizeSourceFilename(typeof tab.filename === "string" ? tab.filename : undefined),
    origin: isDocumentOrigin(tab.origin) ? tab.origin : "new",
    viewport: { panX: viewport.panX, panY: viewport.panY, zoom: viewport.zoom },
    viewportCustomized: tab.viewportCustomized === true,
  };
}

function normalizeSourceFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  if (characterLength(filename) > DIAGRAM_LIMITS.filenameCharacters) return undefined;
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? `${filename.slice(0, dot)}.dgm` : filename;
}

function isDocumentOrigin(value: unknown): value is DocumentOrigin {
  return value === "fixture" || value === "new" || value === "import" || value === "example" || value === "recovery" || value === "duplicate";
}

async function loadPersistedWorkspace(): Promise<WorkspaceState | null> {
  try {
    const db = await openDatabase();
    try {
      const value = await readWorkspaceValue(db);
      const normalized = normalizeWorkspaceState(value);
      const validated = normalized ? validateRestoredWorkspace(normalized) : null;
      if (validated) return validated;
    } finally {
      db.close();
    }
  } catch {
    // Fall through to the localStorage recovery path.
  }
  try {
    const normalized = deserializeWorkspace(localStorage.getItem(FALLBACK_KEY) ?? "");
    return normalized ? validateRestoredWorkspace(normalized) : null;
  } catch {
    return null;
  }
}

async function persistWorkspace(workspace: WorkspaceState): Promise<void> {
  if (utf8ByteLength(serializeWorkspace(workspace)) > DIAGRAM_LIMITS.workspaceBytes) return;
  try {
    const db = await openDatabase();
    try {
      await writeWorkspaceValue(db, workspace);
    } finally {
      db.close();
    }
    return;
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, serializeWorkspace(workspace));
    } catch {
      // Private browsing and storage quota failures degrade to memory-only mode.
    }
  }
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= DIAGRAM_LIMITS.coordinateMagnitude;
}

function validateRestoredWorkspace(workspace: WorkspaceState): WorkspaceState | null {
  const valid = (tab: WorkspaceTab) => {
    try {
      const doc = parseDgm(tab.source);
      if (hasErrors(validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }))) return false;
      for (const asset of doc.assets ?? []) sanitizeSvg(asset.content);
      return true;
    } catch {
      return false;
    }
  };
  const tabs = workspace.tabs.filter(valid);
  if (!tabs.length) return null;
  const recentlyClosed = workspace.recentlyClosed.filter(valid);
  return {
    ...workspace,
    tabs,
    recentlyClosed,
    activeTabId: tabs.some((tab) => tab.id === workspace.activeTabId) ? workspace.activeTabId : tabs[0]!.id,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open workspace storage."));
  });
}

function readWorkspaceValue(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
    let value: unknown;
    request.onsuccess = () => {
      value = request.result;
    };
    request.onerror = () => reject(request.error ?? new Error("Workspace read failed."));
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error ?? new Error("Workspace read transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace read transaction aborted."));
  });
}

function writeWorkspaceValue(db: IDBDatabase, workspace: WorkspaceState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    try {
      transaction.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Workspace write transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Workspace write transaction aborted."));
  });
}
