import { describe, expect, it } from "vitest";

import {
  closeWorkspaceTabs,
  createWorkspaceState,
  createWorkspaceTab,
  deserializeWorkspace,
  isTabDirty,
  MAX_RECYCLED_PREVIEW_BYTES,
  MAX_RECENTLY_CLOSED,
  MAX_WORKSPACE_TABS,
  normalizeWorkspacePreview,
  normalizeWorkspaceState,
  restoreWorkspaceTab,
  serializeWorkspace,
} from "./workspace";
import { DIAGRAM_LIMITS } from "@dumb-diagrams/core";

const viewport = { panX: 12, panY: 24, zoom: 0.9 };

describe("workspace state", () => {
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
