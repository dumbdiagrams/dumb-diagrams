import { describe, expect, it } from "vitest";

import {
  createWorkspaceState,
  createWorkspaceTab,
  deserializeWorkspace,
  isTabDirty,
  MAX_WORKSPACE_TABS,
  normalizeWorkspaceState,
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
});
