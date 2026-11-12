import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";

import type { FileSystemHandleLike } from "./file-save";
import type { WorkspaceTab } from "./workspace-model";

export type FileSyncStatus =
  | "watching"
  | "pending"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "saving"
  | "unsaved"
  | "save-error";
export type FileSyncByTab = Readonly<Record<string, { status: FileSyncStatus; filename: string }>>;

type SyncTab = Pick<WorkspaceTab, "id" | "source" | "savedSource" | "filename">;

type SyncOptions = {
  getHandle: (tabId: string) => FileSystemHandleLike | undefined;
  sourceIsValid: (source: string) => boolean;
  onExternalReload: (tabId: string, source: string, filename: string) => void;
  canAutoReloadTab: (tabId: string) => boolean;
  onConflict: (conflict: { tabId: string; filename: string; diskSource: string }) => void;
  onMessage: (message: string) => void;
  onStatus: (status: FileSyncByTab) => void;
  now?: () => number;
};

type Entry = {
  handle: FileSystemHandleLike;
  observed: string | null;
  candidate: string | null;
  quietSince: number;
  valid: boolean | null;
  status: FileSyncStatus;
  inFlight: Promise<void> | null;
};

type ReadResult = { source: string; version: number; tab: SyncTab };
class FileTooLargeError extends Error {}

const QUIET_MS = 1_500;

/**
 * Watches linked handles using exact text comparisons. Polling is driven by
 * the React hook so visibility and lifecycle policy stay at the boundary.
 */
export class FileSyncController {
  private tabs = new Map<string, SyncTab>();
  private versions = new Map<string, number>();
  private entries = new Map<string, Entry>();
  private manualReloads = new Map<string, Promise<boolean>>();
  private revision = 0;
  private published: FileSyncByTab = {};
  private active = true;
  private readonly now: () => number;

  constructor(private readonly options: SyncOptions) {
    this.now = options.now ?? Date.now;
  }

  refreshTabs(tabs: readonly SyncTab[]): void {
    const next = new Map(tabs.map((tab) => [tab.id, tab]));
    for (const [id, prior] of this.tabs) {
      const current = next.get(id);
      if (!current) {
        this.versions.delete(id);
        this.entries.delete(id);
      } else if (prior.source !== current.source || prior.savedSource !== current.savedSource) {
        this.versions.set(id, ++this.revision);
      }
    }
    for (const id of next.keys()) if (!this.versions.has(id)) this.versions.set(id, ++this.revision);
    this.tabs = next;
  }

  stop(): void {
    this.active = false;
    for (const id of this.versions.keys()) this.versions.set(id, ++this.revision);
    this.entries.clear();
  }

  start(): void {
    this.active = true;
  }

  beginOwnWrite(tabId: string): void {
    this.bumpVersion(tabId);
  }

  endOwnWrite(tabId: string): void {
    this.bumpVersion(tabId);
  }

  noteConflict(tabId: string): void {
    const entry = this.entries.get(tabId);
    if (!entry) return;
    entry.status = "conflict";
    this.publish();
  }

  async poll(): Promise<void> {
    if (!this.active) return;
    const tasks: Promise<void>[] = [];
    for (const [tabId] of this.tabs) {
      const handle = this.options.getHandle(tabId);
      if (!handle) {
        this.entries.delete(tabId);
        continue;
      }
      const entry = this.ensureEntry(tabId, handle);
      if (!entry.inFlight) tasks.push(this.pollTab(tabId, entry));
    }
    this.publish();
    await Promise.all(tasks);
  }

  noteOwnWrite(tabId: string, source: string, handle?: FileSystemHandleLike): void {
    const currentHandle = handle ?? this.options.getHandle(tabId);
    if (!currentHandle || !this.tabs.has(tabId)) return;
    const entry = this.ensureEntry(tabId, currentHandle);
    this.bumpVersion(tabId);
    entry.observed = source;
    entry.candidate = null;
    entry.valid = null;
    entry.status = "watching";
    this.publish();
  }

  reloadTabFromDisk(tabId: string, options: { discardStudioEdits?: boolean } = {}): Promise<boolean> {
    const existing = this.manualReloads.get(tabId);
    if (existing) return existing;
    const task = this.reloadLatest(tabId, options).finally(() => this.manualReloads.delete(tabId));
    this.manualReloads.set(tabId, task);
    return task;
  }

  private async reloadLatest(tabId: string, options: { discardStudioEdits?: boolean }): Promise<boolean> {
    if (!this.active) return false;
    const tab = this.tabs.get(tabId);
    const handle = this.options.getHandle(tabId);
    if (!tab || !handle) return false;
    const startVersion = this.versions.get(tabId) ?? 0;
    const entry = this.ensureEntry(tabId, handle);
    const priorRead = entry.inFlight;
    let releaseLock!: () => void;
    const readLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    entry.inFlight = readLock;
    let result: ReadResult;
    try {
      if (priorRead) await priorRead;
      if (!this.isCurrent(tabId, handle, startVersion)) return false;
      result = await this.readLatest(tabId, handle);
    } catch (error) {
      const filename = handle.name;
      const message = error instanceof Error ? error.message : `Unable to read ${filename}.`;
      const stillCurrent = this.isCurrent(tabId, handle, startVersion);
      if (stillCurrent) this.options.onMessage(`Could not reload ${filename}: ${message}`);
      if (stillCurrent) this.setStatus(tabId, error instanceof FileTooLargeError ? "invalid" : "unavailable");
      return false;
    } finally {
      if (entry.inFlight === readLock) entry.inFlight = null;
      releaseLock();
    }
    if (!this.active || !this.isCurrent(tabId, handle, result.version)) return false;
    if (!this.options.sourceIsValid(result.source)) {
      this.setStatus(tabId, "invalid");
      this.options.onMessage(`Could not reload ${handle.name}: the file does not contain a valid diagram.`);
      return false;
    }

    const current = this.tabs.get(tabId)!;
    if (!options.discardStudioEdits && current.source !== current.savedSource) {
      this.options.onConflict({ tabId, filename: handle.name, diskSource: result.source });
      this.setStatus(tabId, "conflict");
      return false;
    }
    if (current.source !== result.source || current.savedSource !== result.source) {
      this.options.onExternalReload(tabId, result.source, handle.name);
      this.tabs.set(tabId, { ...current, source: result.source, savedSource: result.source });
    }
    this.noteOwnWrite(tabId, result.source, handle);
    return true;
  }

  private async pollTab(tabId: string, entry: Entry): Promise<void> {
    const handle = entry.handle;
    const version = this.versions.get(tabId) ?? 0;
    const task = this.readLatest(tabId, handle);
    const readLock = task.then(
      () => undefined,
      () => undefined,
    );
    entry.inFlight = readLock;
    try {
      const result = await task;
      if (!this.active || !this.isCurrent(tabId, handle, result.version)) return;
      this.observe(tabId, entry, result.source, result.tab);
    } catch (error) {
      if (this.active && this.isCurrent(tabId, handle, version))
        this.setStatus(tabId, error instanceof FileTooLargeError ? "invalid" : "unavailable");
    } finally {
      if (entry.inFlight === readLock) entry.inFlight = null;
      this.publish();
    }
  }

  private observe(tabId: string, entry: Entry, source: string, tab: SyncTab): void {
    const now = this.now();
    if (entry.observed !== source) {
      entry.observed = source;
      entry.candidate = source === tab.source || source === tab.savedSource ? null : source;
      entry.quietSince = now;
      entry.valid = null;
      entry.status = entry.candidate === null ? (tab.source === tab.savedSource ? "watching" : "unsaved") : "pending";
      this.publish();
      return;
    }
    if (source === tab.source || source === tab.savedSource) {
      entry.candidate = null;
      entry.valid = null;
      entry.status = tab.source === tab.savedSource ? "watching" : "unsaved";
      this.publish();
      return;
    }
    if (entry.candidate !== source) {
      entry.candidate = source;
      entry.quietSince = now;
      entry.valid = null;
      entry.status = "pending";
      this.publish();
      return;
    }
    if (now - entry.quietSince < QUIET_MS) {
      entry.status = "pending";
      return;
    }
    if (entry.valid === null) entry.valid = this.options.sourceIsValid(source);
    if (!entry.valid) {
      entry.status = "invalid";
      this.publish();
      return;
    }
    const current = this.tabs.get(tabId);
    if (!current) return;
    if (current.source === source) {
      if (current.savedSource !== source) {
        this.options.onExternalReload(tabId, source, entry.handle.name);
        this.tabs.set(tabId, { ...current, source, savedSource: source });
      }
      entry.status = "watching";
    } else if (current.source === current.savedSource && this.options.canAutoReloadTab(tabId)) {
      this.options.onExternalReload(tabId, source, entry.handle.name);
      this.tabs.set(tabId, { ...current, source, savedSource: source });
      entry.status = "watching";
    } else if (current.source !== current.savedSource) {
      entry.status = "conflict";
    } else {
      entry.status = "pending";
    }
    this.publish();
  }

  private async readLatest(tabId: string, handle: FileSystemHandleLike): Promise<ReadResult> {
    const tab = this.tabs.get(tabId);
    if (!tab) throw new Error("The diagram tab is no longer open.");
    const version = this.versions.get(tabId) ?? 0;
    const file = await handle.getFile();
    if (!this.isCurrent(tabId, handle, version)) throw new Error("The linked file changed while it was being read.");
    if (file.size > DIAGRAM_LIMITS.sourceBytes) throw new FileTooLargeError("The file exceeds the 1 MiB source limit.");
    const source = await file.text();
    if (!this.isCurrent(tabId, handle, version)) throw new Error("The linked file changed while it was being read.");
    return { source, version, tab };
  }

  private isCurrent(tabId: string, handle: FileSystemHandleLike, version: number): boolean {
    return (
      this.active &&
      this.tabs.has(tabId) &&
      this.options.getHandle(tabId) === handle &&
      (this.versions.get(tabId) ?? 0) === version
    );
  }

  private bumpVersion(tabId: string): void {
    if (this.versions.has(tabId)) this.versions.set(tabId, ++this.revision);
  }

  private ensureEntry(tabId: string, handle: FileSystemHandleLike): Entry {
    let entry = this.entries.get(tabId);
    if (!entry || entry.handle !== handle) {
      entry = {
        handle,
        observed: null,
        candidate: null,
        quietSince: this.now(),
        valid: null,
        status: "watching",
        inFlight: null,
      };
      this.entries.set(tabId, entry);
    }
    return entry;
  }

  private setStatus(tabId: string, status: FileSyncStatus): void {
    const entry = this.entries.get(tabId);
    if (entry) entry.status = status;
    this.publish();
  }

  private publish(): void {
    const statuses: Record<string, { status: FileSyncStatus; filename: string }> = {};
    for (const [tabId, entry] of this.entries) {
      if (this.tabs.has(tabId) && this.options.getHandle(tabId) === entry.handle) {
        statuses[tabId] = { status: entry.status, filename: entry.handle.name };
      }
    }
    const ids = Object.keys(statuses);
    const previousIds = Object.keys(this.published);
    const unchanged =
      ids.length === previousIds.length &&
      ids.every((id) => {
        const current = statuses[id];
        const previous = this.published[id];
        return current?.status === previous?.status && current?.filename === previous?.filename;
      });
    if (unchanged) return;
    this.published = statuses;
    this.options.onStatus(statuses);
  }
}
