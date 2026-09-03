import { describe, expect, it } from "vitest";

import {
  closeWorkspaceTabs,
  createWorkspaceState,
  createWorkspaceTab,
  deserializeWorkspace,
  isTabDirty,
  isDisposableTab,
  loadPersistedWorkspace,
  MAX_RECYCLED_PREVIEW_BYTES,
  MAX_RECENTLY_CLOSED,
  MAX_WORKSPACE_TABS,
  normalizeWorkspacePreview,
  normalizeWorkspaceState,
  restoreWorkspaceTab,
  persistWorkspace,
  persistWorkspaceJournal,
  serializeWorkspace,
  type WorkspacePersistencePlatform,
  type WorkspaceState,
  type WorkspaceStorage,
} from "./workspace";
import { createEmptyDocument, DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";
import { printDgm } from "@dumb-diagrams/runtime/dsl";

const viewport = { panX: 12, panY: 24, zoom: 0.9 };

function createStorage(initial: Record<string, string> = {}, options: { set?: (key: string, value: string) => void } = {}) {
  const values = new Map(Object.entries(initial));
  const storage: WorkspaceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      options.set?.(key, value);
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  return { storage, values };
}

function createPersistencePlatform(overrides: Partial<WorkspacePersistencePlatform> = {}): WorkspacePersistencePlatform {
  const journal = createStorage();
  const fallback = createStorage();
  return {
    journal: journal.storage,
    fallback: fallback.storage,
    indexedDb: { read: async () => undefined, write: async () => undefined },
    ...overrides,
  };
}

function sampleWorkspace(): WorkspaceState {
  const source = printDgm(createEmptyDocument("recovery"));
  return createWorkspaceState({ initialSource: source, initialViewport: viewport, blankSource: source });
}

describe("workspace state", () => {
  it("loads no workspace successfully and preserves journal, IndexedDB, fallback order", async () => {
    const calls: string[] = [];
    const journal = createStorage({}, { set: () => undefined });
    const fallback = createStorage();
    const platform = createPersistencePlatform({
      journal: {
        getItem: (key) => { calls.push(`journal.read:${key}`); return journal.storage.getItem(key); },
        setItem: journal.storage.setItem,
        removeItem: journal.storage.removeItem,
      },
      indexedDb: {
        read: async (key) => { calls.push(`indexeddb.read:${key}`); return undefined; },
        write: async () => undefined,
      },
      fallback: {
        getItem: (key) => { calls.push(`fallback.read:${key}`); return fallback.storage.getItem(key); },
        setItem: fallback.storage.setItem,
        removeItem: fallback.storage.removeItem,
      },
    });

    const result = await loadPersistedWorkspace(platform);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({ status: "ok", workspace: null });
    expect(calls).toEqual([
      "journal.read:dumb-diagrams:workspace-pending",
      "indexeddb.read:current",
      "fallback.read:dumb-diagrams:workspace",
    ]);
  });

  it("recovers from a corrupt journal with a degraded warning and closed error cause", async () => {
    const workspace = sampleWorkspace();
    const platform = createPersistencePlatform({
      journal: createStorage({ "dumb-diagrams:workspace-pending": "{broken" }).storage,
      indexedDb: { read: async () => workspace, write: async () => undefined },
    });

    const result = await loadPersistedWorkspace(platform);
    expect(result.isOk()).toBe(true);
    const outcome = result._unsafeUnwrap();
    expect(outcome.status).toBe("degraded");
    expect(outcome.workspace?.tabs).toHaveLength(1);
    expect(outcome.errors?.[0]).toMatchObject({ code: "corrupt", layer: "journal", cause: "{broken" });
  });

  it("falls back to local storage after an IndexedDB transaction failure", async () => {
    const workspace = sampleWorkspace();
    const platform = createPersistencePlatform({
      indexedDb: {
        read: () => { throw new Error("transaction aborted"); },
        write: async () => undefined,
      },
      fallback: createStorage({ "dumb-diagrams:workspace": serializeWorkspace(workspace) }).storage,
    });

    const result = await loadPersistedWorkspace(platform);
    expect(result.isOk()).toBe(true);
    const outcome = result._unsafeUnwrap();
    expect(outcome.status).toBe("degraded");
    expect(outcome.workspace?.tabs[0]?.source).toBe(workspace.tabs[0]?.source);
    expect(outcome.errors?.[0]?.code).toBe("transaction-failed");
  });

  it("returns an error when every storage source is unavailable", async () => {
    const unavailable = () => { throw new Error("storage unavailable"); };
    const platform = createPersistencePlatform({
      journal: { getItem: unavailable, setItem: unavailable, removeItem: unavailable },
      indexedDb: { read: unavailable, write: unavailable },
      fallback: { getItem: unavailable, setItem: unavailable, removeItem: unavailable },
    });

    const result = await loadPersistedWorkspace(platform);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: "unavailable", message: "All workspace storage sources failed." });
    expect(result._unsafeUnwrapErr().relatedErrors).toHaveLength(2);
  });

  it("returns an error when every storage source is corrupt", async () => {
    const platform = createPersistencePlatform({
      journal: createStorage({ "dumb-diagrams:workspace-pending": "{broken" }).storage,
      indexedDb: { read: async () => ({ broken: true }), write: async () => undefined },
      fallback: createStorage({ "dumb-diagrams:workspace": "{broken" }).storage,
    });

    const result = await loadPersistedWorkspace(platform);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: "corrupt", message: "All workspace storage sources failed." });
    expect(result._unsafeUnwrapErr().relatedErrors).toHaveLength(2);
  });

  it("reports quota errors for the synchronous journal without blocking IndexedDB", async () => {
    const journal: WorkspaceStorage = {
      getItem: () => null,
      setItem: () => { throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" }); },
      removeItem: () => undefined,
    };
    const platform = createPersistencePlatform({ journal });
    const result = await persistWorkspaceJournal("snapshot", platform);
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: "quota-exceeded", layer: "journal", cause: expect.any(Error) });
  });

  it("writes the journal before the asynchronous IndexedDB operation starts", async () => {
    const events: string[] = [];
    let release: (() => void) | undefined;
    const journal = createStorage({}, { set: () => events.push("journal") });
    const workspace = sampleWorkspace();
    const platform = createPersistencePlatform({
      journal: journal.storage,
      indexedDb: {
        read: async () => undefined,
        write: async () => {
          events.push("indexeddb");
          await new Promise<void>((resolve) => { release = resolve; });
        },
      },
    });

    const pending = persistWorkspace(workspace, "snapshot", platform);
    expect(events).toEqual(["journal"]);
    while (!release) await Promise.resolve();
    expect(events).toEqual(["journal", "indexeddb"]);
    release();
    expect((await pending).isOk()).toBe(true);
  });

  it("writes fallback storage after an IndexedDB write failure", async () => {
    const workspace = sampleWorkspace();
    const fallback = createStorage();
    const platform = createPersistencePlatform({
      indexedDb: { read: async () => undefined, write: async () => { throw new Error("transaction failed"); } },
      fallback: fallback.storage,
    });

    const result = await persistWorkspace(workspace, serializeWorkspace(workspace), platform);
    expect(result.isOk()).toBe(true);
    const outcome = result._unsafeUnwrap();
    expect(outcome.status).toBe("degraded");
    expect(outcome.errors?.[0]?.code).toBe("transaction-failed");
    expect(fallback.values.get("dumb-diagrams:workspace")).toBe(serializeWorkspace(workspace));
  });

  it("does not clear a newer journal when an older IndexedDB write finishes", async () => {
    const oldWorkspace = sampleWorkspace();
    const journal = createStorage({ "dumb-diagrams:workspace-pending": "old" });
    let release: (() => void) | undefined;
    const platform = createPersistencePlatform({
      journal: journal.storage,
      indexedDb: {
        read: async () => undefined,
        write: async () => await new Promise<void>((resolve) => { release = resolve; }),
      },
    });

    const pending = persistWorkspace(oldWorkspace, "old", platform);
    while (!release) await Promise.resolve();
    journal.storage.setItem("dumb-diagrams:workspace-pending", "new");
    release?.();
    const result = await pending;
    expect(result.isOk()).toBe(true);
    expect(journal.values.get("dumb-diagrams:workspace-pending")).toBe("new");
  });

  it("creates a clean initial tab and detects source changes", () => {
    const workspace = createWorkspaceState({
      initialSource: "diagram initial",
      initialViewport: viewport,
      blankSource: "blank",
    });
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.activeTabId).toBe(workspace.tabs[0]!.id);
    expect(isTabDirty(workspace.tabs[0])).toBe(false);

    const dirty = createWorkspaceTab("changed", {
      savedSource: "original",
      viewport,
    });
    expect(isTabDirty(dirty)).toBe(true);
  });

  it("round-trips persisted tabs, active selection, and recently closed tabs", () => {
    const tab = createWorkspaceTab("source", {
      initialSource: "original source",
      filename: "diagram.dgm",
      origin: "import",
      viewport,
    });
    const workspace = {
      version: 1 as const,
      tabs: [tab],
      activeTabId: tab.id,
      recentlyClosed: [tab],
    };
    const restored = deserializeWorkspace(serializeWorkspace(workspace));
    expect(restored).toEqual(workspace);
    expect(restored?.tabs[0]?.initialSource).toBe("original source");
  });

  it("normalizes malformed snapshots without accepting empty workspaces", () => {
    expect(normalizeWorkspaceState({ tabs: [] })).toBeNull();
    const valid = normalizeWorkspaceState({
      version: 99,
      tabs: [{
        id: "tab-1",
        source: "source",
        savedSource: "source",
        origin: "import",
        viewport,
      }],
      activeTabId: "missing",
      recentlyClosed: "not-an-array",
    });
    expect(valid).toMatchObject({
      version: 1,
      activeTabId: "tab-1",
      recentlyClosed: [],
    });
  });

  it("uses the last saved example source when migrating older tabs", () => {
    const restored = normalizeWorkspaceState({
      version: 1,
      tabs: [{
        id: "example-tab",
        source: "changed source",
        savedSource: "original source",
        origin: "example",
        viewport,
      }],
      activeTabId: "example-tab",
      recentlyClosed: [],
    });

    expect(restored?.tabs[0]?.initialSource).toBe("original source");
  });

  it("migrates persisted source filenames to dgm", () => {
    const restored = normalizeWorkspaceState({
      version: 1,
      tabs: [{
        id: "tab-1",
        source: "source",
        savedSource: "source",
        filename: "Async-Docs.source",
        origin: "import",
        viewport,
      }],
      activeTabId: "tab-1",
      recentlyClosed: [],
    });

    expect(restored?.tabs[0]?.filename).toBe("Async-Docs.dgm");
  });

  it("caps restored workspaces at the open-tab limit", () => {
    const tabs = Array.from({ length: MAX_WORKSPACE_TABS + 2 }, (_, index) => createWorkspaceTab(`source-${index}`, {
      id: `tab-${index}`,
      viewport,
    }));
    const restored = normalizeWorkspaceState({
      version: 1,
      tabs,
      activeTabId: tabs[MAX_WORKSPACE_TABS + 1]!.id,
      recentlyClosed: [],
    });

    expect(restored?.tabs).toHaveLength(MAX_WORKSPACE_TABS);
    expect(restored?.tabs.at(-1)?.id).toBe(`tab-${MAX_WORKSPACE_TABS - 1}`);
    expect(restored?.activeTabId).toBe("tab-0");
  });

  it("rejects oversized snapshots and unsafe viewport values", () => {
    expect(deserializeWorkspace("x".repeat(DIAGRAM_LIMITS.workspaceBytes + 1))).toBeNull();
    expect(normalizeWorkspaceState({
      version: 1,
      tabs: [{ id: "bad", source: "source", viewport: { panX: Infinity, panY: 0, zoom: 1 } }],
      activeTabId: "bad",
      recentlyClosed: [],
    })).toBeNull();
  });

  it("keeps safe recycle-bin previews and drops unsafe or oversized markup", () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60"/></svg>';
    const tab = createWorkspaceTab("source", { id: "tab-1", viewport });
    const normalized = normalizeWorkspaceState({
      version: 1,
      tabs: [tab],
      activeTabId: tab.id,
      recentlyClosed: [{ ...tab, previewSvg: safe }],
    });

    expect(normalized?.recentlyClosed[0]?.previewSvg).toBe(safe);
    expect(normalizeWorkspacePreview('<svg><script>alert(1)</script></svg>')).toBeUndefined();
    expect(normalizeWorkspacePreview(`<svg>${"x".repeat(MAX_RECYCLED_PREVIEW_BYTES)}</svg>`)).toBeUndefined();
  });

  it("bulk closes tabs while keeping the requested tab active and archiving the closed tabs", () => {
    const tabs = ["a", "b", "c", "d"].map((id) => createWorkspaceTab(id, {
      id: `tab-${id}`,
      viewport,
    }));
    const workspace = {
      version: 1 as const,
      tabs,
      activeTabId: "tab-d",
      recentlyClosed: [],
    };

    const result = closeWorkspaceTabs(workspace, ["tab-c", "tab-d"], {
      preferredActiveTabId: "tab-b",
    });

    expect(result.closed.map((tab) => tab.id)).toEqual(["tab-c", "tab-d"]);
    expect(result.state.tabs.map((tab) => tab.id)).toEqual(["tab-a", "tab-b"]);
    expect(result.state.activeTabId).toBe("tab-b");
    expect(result.state.recentlyClosed.map((tab) => tab.id)).toEqual(["tab-d", "tab-c"]);
  });

  it("protects the sole untouched blank default tab but closes other sole tabs", () => {
    const blank = createWorkspaceTab("blank", { id: "blank", origin: "new", viewport });
    const state = { version: 1 as const, tabs: [blank], activeTabId: blank.id, recentlyClosed: [] };
    expect(closeWorkspaceTabs(state, [blank.id], { protectedBlankSource: "blank" }).closed).toHaveLength(0);
    const named = createWorkspaceTab("blank", { id: "named", origin: "new", filename: "x.dgm", viewport });
    const result = closeWorkspaceTabs({ ...state, tabs: [named], activeTabId: named.id }, [named.id], { protectedBlankSource: "blank" });
    expect(result.closed).toHaveLength(1);
  });

  it("keeps disposable tabs out of recovery while still removing them", () => {
    const fixture = createWorkspaceTab("example", { id: "fixture", origin: "fixture", initialSource: "example", savedSource: "example", viewport });
    const blank = createWorkspaceTab("blank", { id: "blank", origin: "new", viewport });
    const changedExample = createWorkspaceTab("edited", { id: "edited", origin: "example", initialSource: "example", savedSource: "edited", viewport });
    const namedBlank = createWorkspaceTab("blank", { id: "named", origin: "new", filename: "named.dgm", viewport });
    const state = { version: 1 as const, tabs: [fixture, blank, changedExample, namedBlank], activeTabId: fixture.id, recentlyClosed: [] };
    const result = closeWorkspaceTabs(state, state.tabs.map((tab) => tab.id), { protectedBlankSource: "blank" });
    expect(result.closed.map((tab) => tab.id)).toEqual(["fixture", "blank", "edited", "named"]);
    expect(result.state.recentlyClosed.map((tab) => tab.id)).toEqual(["edited"]);
    expect(isDisposableTab(fixture, "blank")).toBe(true);
    expect(isDisposableTab(blank, "blank")).toBe(true);
    expect(isDisposableTab(changedExample, "blank")).toBe(false);
    expect(isDisposableTab(namedBlank, "blank")).toBe(true);
  });

  it("discards serialized empty untitled drafts but keeps intentionally named empty drafts", () => {
    const empty = createEmptyDocument("another-empty-draft");
    empty.title = "Untitled-Diagram";
    const untitled = createWorkspaceTab(printDgm(empty), {
      origin: "new",
      filename: "Untitled-Diagram.dgm",
      viewport,
    });
    const named = createEmptyDocument("named-empty-draft");
    named.title = "Quarterly architecture";
    const namedTab = createWorkspaceTab(printDgm(named), { origin: "new", viewport });

    expect(isDisposableTab(untitled, "different blank source")).toBe(true);
    expect(isDisposableTab(namedTab, "different blank source")).toBe(false);
    expect(isDisposableTab(createWorkspaceTab("diagram {", { origin: "new", viewport }), "different blank source")).toBe(false);
  });

  it("attaches the latest render preview when tabs are archived", () => {
    const tab = createWorkspaceTab("source", { id: "tab-a", viewport });
    const replacement = createWorkspaceTab("blank", { id: "blank", viewport });
    const preview = '<svg viewBox="0 0 120 80"><rect width="120" height="80"/></svg>';
    const workspace = {
      version: 1 as const,
      tabs: [tab],
      activeTabId: tab.id,
      recentlyClosed: [],
    };

    const result = closeWorkspaceTabs(workspace, [tab.id], {
      replacementTab: replacement,
      previewByTabId: { [tab.id]: preview },
    });

    expect(result.closed[0]?.previewSvg).toBe(preview);
    expect(result.state.recentlyClosed[0]?.previewSvg).toBe(preview);
  });

  it("keeps a replacement tab after closing everything and caps the recycle bin", () => {
    const tabs = ["a", "b", "c"].map((id) => createWorkspaceTab(id, {
      id: `tab-${id}`,
      viewport,
    }));
    const existing = Array.from({ length: MAX_RECENTLY_CLOSED - 1 }, (_, index) => createWorkspaceTab(`old-${index}`, {
      id: `old-${index}`,
      viewport,
    }));
    const replacement = createWorkspaceTab("blank", { id: "blank", viewport });
    const workspace = {
      version: 1 as const,
      tabs,
      activeTabId: "tab-b",
      recentlyClosed: existing,
    };

    const result = closeWorkspaceTabs(workspace, tabs.map((tab) => tab.id), { replacementTab: replacement });

    expect(result.state.tabs.map((tab) => tab.id)).toEqual(["blank"]);
    expect(result.state.activeTabId).toBe("blank");
    expect(result.state.recentlyClosed).toHaveLength(MAX_RECENTLY_CLOSED);
    expect(result.state.recentlyClosed.slice(0, 3).map((tab) => tab.id)).toEqual(["tab-c", "tab-b", "tab-a"]);
  });

  it("restores a selected recycle-bin entry and refuses recovery at the tab limit", () => {
    const open = createWorkspaceTab("open", { id: "open", viewport });
    const closed = createWorkspaceTab("closed", { id: "closed", viewport });
    const workspace = {
      version: 1 as const,
      tabs: [open],
      activeTabId: open.id,
      recentlyClosed: [closed],
    };

    const restored = restoreWorkspaceTab(workspace, closed.id);
    expect(restored?.tabs.map((tab) => tab.id)).toEqual(["open", "closed"]);
    expect(restored?.activeTabId).toBe("closed");
    expect(restored?.recentlyClosed).toEqual([]);

    const full = {
      ...workspace,
      tabs: Array.from({ length: MAX_WORKSPACE_TABS }, (_, index) => createWorkspaceTab(`open-${index}`, {
        id: `open-${index}`,
        viewport,
      })),
    };
    expect(restoreWorkspaceTab(full, closed.id)).toBeNull();
  });
});
