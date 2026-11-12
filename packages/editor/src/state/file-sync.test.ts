import { describe, expect, it, vi } from "vitest";
import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";

import { FileSyncController } from "./file-sync";
import type { FileSystemHandleLike } from "./file-save";
import type { WorkspaceTab } from "./workspace-model";

function fakeHandle(source: string, getFile?: () => Promise<File>): FileSystemHandleLike {
  return {
    kind: "file",
    name: "diagram.dgm",
    getFile: getFile ?? vi.fn(async () => new File([source], "diagram.dgm", { type: "text/plain" })),
    createWritable: vi.fn(async () => ({ write: vi.fn(async () => undefined), close: vi.fn(async () => undefined) })),
  };
}

function createController(
  options: {
    source?: string;
    savedSource?: string;
    handle?: FileSystemHandleLike;
    valid?: (s: string) => boolean;
  } = {},
) {
  let now = 0;
  const tab: WorkspaceTab = {
    id: "tab-1",
    source: options.source ?? "baseline",
    savedSource: options.savedSource ?? "baseline",
    filename: "diagram.dgm",
  } as WorkspaceTab;
  let currentTab = tab;
  let currentHandle = options.handle ?? fakeHandle("baseline");
  const onExternalReload = vi.fn((_tabId: string, source: string) => {
    currentTab = { ...currentTab, source, savedSource: source };
    controller.refreshTabs([currentTab]);
  });
  const onConflict = vi.fn();
  const onMessage = vi.fn();
  const onStatus = vi.fn();
  const valid = vi.fn(options.valid ?? ((source: string) => source !== "" && source !== "bad"));
  const controller = new FileSyncController({
    getHandle: () => currentHandle,
    sourceIsValid: valid,
    onExternalReload,
    canAutoReloadTab: () => true,
    onConflict,
    onMessage,
    onStatus,
    now: () => now,
  });
  controller.refreshTabs([currentTab]);
  return {
    controller,
    valid,
    onExternalReload,
    onConflict,
    onMessage,
    onStatus,
    get tab() {
      return currentTab;
    },
    set tab(next: WorkspaceTab) {
      currentTab = next;
      controller.refreshTabs([next]);
    },
    set handle(next: FileSystemHandleLike) {
      currentHandle = next;
    },
    set now(value: number) {
      now = value;
    },
  };
}

describe("linked file synchronization", () => {
  it("waits for repeated writes to settle before applying the final valid text", async () => {
    let disk = "baseline";
    const harness = createController({ handle: fakeHandle("", async () => new File([disk], "diagram.dgm")) });
    await harness.controller.poll();
    disk = "intermediate";
    harness.now = 100;
    await harness.controller.poll();
    harness.now = 900;
    disk = "final";
    await harness.controller.poll();
    harness.now = 2_300;
    await harness.controller.poll();
    expect(harness.onExternalReload).not.toHaveBeenCalled();
    harness.now = 2_400;
    await harness.controller.poll();
    expect(harness.onExternalReload).toHaveBeenCalledOnce();
    expect(harness.onExternalReload).toHaveBeenCalledWith("tab-1", "final", "diagram.dgm");
    expect(harness.valid).toHaveBeenCalledTimes(1);
  });

  it("keeps invalid content and auto-recovers after a valid replacement settles", async () => {
    let disk = "baseline";
    const harness = createController({ handle: fakeHandle("", async () => new File([disk], "diagram.dgm")) });
    await harness.controller.poll();
    disk = "bad";
    await harness.controller.poll();
    harness.now = 1_500;
    await harness.controller.poll();
    expect(harness.onExternalReload).not.toHaveBeenCalled();
    expect(harness.onStatus).toHaveBeenLastCalledWith({ "tab-1": { status: "invalid", filename: "diagram.dgm" } });
    disk = "repaired";
    harness.now = 1_600;
    await harness.controller.poll();
    harness.now = 3_100;
    await harness.controller.poll();
    expect(harness.onExternalReload).toHaveBeenCalledOnce();
    expect(harness.onExternalReload).toHaveBeenCalledWith("tab-1", "repaired", "diagram.dgm");
  });

  it("does not turn the saved disk baseline into a conflict while local edits are dirty", async () => {
    const harness = createController({
      source: "local edits",
      savedSource: "baseline",
      handle: fakeHandle("baseline"),
    });
    await harness.controller.poll();
    harness.now = 2_000;
    await harness.controller.poll();
    expect(harness.onExternalReload).not.toHaveBeenCalled();
    expect(harness.onConflict).not.toHaveBeenCalled();
    expect(harness.onStatus).toHaveBeenLastCalledWith({ "tab-1": { status: "unsaved", filename: "diagram.dgm" } });
  });

  it("acknowledges disk content that already matches a dirty studio draft", async () => {
    const harness = createController({
      source: "same content",
      savedSource: "old baseline",
      handle: fakeHandle("same content"),
    });
    expect(await harness.controller.reloadTabFromDisk("tab-1", { discardStudioEdits: true })).toBe(true);
    expect(harness.onExternalReload).toHaveBeenCalledWith("tab-1", "same content", "diagram.dgm");
    expect(harness.tab.savedSource).toBe("same content");
  });

  it("drops an in-flight read when source or savedSource changes", async () => {
    let resolveFile!: (file: File) => void;
    const handle = fakeHandle("", () => new Promise((resolve) => (resolveFile = resolve)));
    const harness = createController({ handle });
    const poll = harness.controller.poll();
    await Promise.resolve();
    harness.tab = { ...harness.tab, savedSource: "new saved baseline" };
    resolveFile(new File(["external"], "diagram.dgm"));
    await poll;
    expect(harness.onExternalReload).not.toHaveBeenCalled();
  });

  it("rejects a read that resolves after stop and restart", async () => {
    let resolveFile!: (file: File) => void;
    const handle = fakeHandle("", () => new Promise((resolve) => (resolveFile = resolve)));
    const harness = createController({ handle });
    const poll = harness.controller.poll();
    await Promise.resolve();
    harness.controller.stop();
    harness.controller.start();
    resolveFile(new File(["external"], "diagram.dgm"));
    await poll;
    expect(harness.onExternalReload).not.toHaveBeenCalled();
  });

  it("reports unreadable and oversized files without applying them", async () => {
    const unreadable = createController({
      handle: fakeHandle("", async () => {
        throw new Error("permission denied");
      }),
    });
    await unreadable.controller.poll();
    expect(unreadable.onStatus).toHaveBeenLastCalledWith({
      "tab-1": { status: "unavailable", filename: "diagram.dgm" },
    });

    const text = vi.fn(async () => "too large");
    const oversizedHandle = fakeHandle(
      "",
      async () => ({ size: DIAGRAM_LIMITS.sourceBytes + 1, text }) as unknown as File,
    );
    const oversized = createController({ handle: oversizedHandle });
    await oversized.controller.poll();
    expect(text).not.toHaveBeenCalled();
    expect(oversized.onStatus).toHaveBeenLastCalledWith({ "tab-1": { status: "invalid", filename: "diagram.dgm" } });
    expect(oversized.onExternalReload).not.toHaveBeenCalled();
  });

  it("treats its own write as the new baseline", async () => {
    let disk = "baseline";
    const handle = fakeHandle("", async () => new File([disk], "diagram.dgm"));
    const harness = createController({ handle });
    await harness.controller.poll();
    disk = "saved by this tab";
    harness.controller.beginOwnWrite("tab-1");
    harness.controller.noteOwnWrite("tab-1", disk, handle);
    harness.tab = { ...harness.tab, source: disk, savedSource: disk };
    await harness.controller.poll();
    harness.now = 3_000;
    await harness.controller.poll();
    expect(harness.onExternalReload).not.toHaveBeenCalled();
    expect(harness.onConflict).not.toHaveBeenCalled();
  });

  it("reviews dirty manual reloads and applies only a fresh confirmed disk read", async () => {
    let disk = "first disk version";
    const handle = fakeHandle("", async () => new File([disk], "diagram.dgm"));
    const harness = createController({ source: "local edits", savedSource: "baseline", handle });

    expect(await harness.controller.reloadTabFromDisk("tab-1")).toBe(false);
    expect(harness.onConflict).toHaveBeenCalledWith({
      tabId: "tab-1",
      filename: "diagram.dgm",
      diskSource: "first disk version",
    });
    expect(harness.onExternalReload).not.toHaveBeenCalled();

    disk = "latest confirmed version";
    expect(await harness.controller.reloadTabFromDisk("tab-1", { discardStudioEdits: true })).toBe(true);
    expect(harness.onExternalReload).toHaveBeenCalledWith("tab-1", "latest confirmed version", "diagram.dgm");
    expect(harness.tab.source).toBe("latest confirmed version");
  });

  it("cancels a confirmed reload if the draft changes while it waits for a poll read", async () => {
    let resolveFile!: (file: File) => void;
    const handle = fakeHandle("", () => new Promise((resolve) => (resolveFile = resolve)));
    const harness = createController({ source: "draft before confirm", savedSource: "baseline", handle });
    const poll = harness.controller.poll();
    await Promise.resolve();
    const reload = harness.controller.reloadTabFromDisk("tab-1", { discardStudioEdits: true });
    harness.tab = { ...harness.tab, source: "newer user draft" };
    resolveFile(new File(["disk contents"], "diagram.dgm"));

    expect(await reload).toBe(false);
    await poll;
    expect(harness.onExternalReload).not.toHaveBeenCalled();
    expect(harness.tab.source).toBe("newer user draft");
    expect(harness.onMessage).not.toHaveBeenCalled();
  });

  it("rejects an in-flight read after the linked handle is replaced", async () => {
    let resolveFile!: (file: File) => void;
    const firstHandle = fakeHandle("", () => new Promise((resolve) => (resolveFile = resolve)));
    const harness = createController({ handle: firstHandle });
    const poll = harness.controller.poll();
    await Promise.resolve();
    harness.handle = fakeHandle("replacement");
    resolveFile(new File(["external"], "diagram.dgm"));
    await poll;
    expect(harness.onExternalReload).not.toHaveBeenCalled();
  });
});
