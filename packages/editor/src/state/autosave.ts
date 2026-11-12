export type AutosaveTab = {
  id: string;
  source: string;
  savedSource: string;
  linked: boolean;
  valid: boolean;
  allowed?: boolean;
};

export type AutosaveStatus = "saving" | "unsaved" | "save-error" | undefined;

type AutosaveOptions = {
  save: (tabId: string, source: string) => Promise<"saved" | "conflict" | "error" | "stale" | "blocked">;
  onStatus: (tabId: string, status: AutosaveStatus) => void;
  delayMs?: number;
};

type Entry = {
  tab: AutosaveTab;
  timer?: ReturnType<typeof setTimeout>;
  inFlight?: Promise<void>;
  status?: AutosaveStatus;
  attemptedSource?: string;
  flushPending?: boolean;
};

/** Debounces eligible linked tabs and always reads the latest snapshot at write time. */
export class AutosaveController {
  private entries = new Map<string, Entry>();
  private enabled: boolean;
  private readonly delayMs: number;

  constructor(
    private readonly options: AutosaveOptions,
    enabled = true,
  ) {
    this.enabled = enabled;
    this.delayMs = options.delayMs ?? 600;
  }

  update(tabs: readonly AutosaveTab[]): void {
    const next = new Map(tabs.map((tab) => [tab.id, tab]));
    for (const [id, entry] of this.entries) {
      const tab = next.get(id);
      if (!tab) {
        this.clearTimer(entry);
        this.entries.delete(id);
        this.options.onStatus(id, undefined);
        continue;
      }
      const changed = entry.tab.source !== tab.source || entry.tab.savedSource !== tab.savedSource;
      const becameAllowed = entry.tab.allowed === false && tab.allowed !== false;
      const becameBlocked = entry.tab.allowed !== false && tab.allowed === false;
      const becameEligible = !this.eligible(entry.tab) && this.eligible(tab);
      entry.tab = tab;
      if (changed) entry.attemptedSource = undefined;
      if (!this.enabled || !this.eligible(tab) || tab.source === tab.savedSource) {
        this.clearTimer(entry);
        if (!entry.inFlight)
          this.setStatus(id, entry, tab.linked && tab.source !== tab.savedSource ? "unsaved" : undefined);
      } else if (changed || becameAllowed || becameEligible) {
        this.schedule(id, entry);
      }
      if (becameBlocked) this.setStatus(id, entry, tab.source === tab.savedSource ? undefined : "unsaved");
    }
    for (const [id, tab] of next) {
      if (this.entries.has(id)) continue;
      const entry: Entry = { tab };
      this.entries.set(id, entry);
      if (this.enabled && this.eligible(tab) && tab.source !== tab.savedSource) this.schedule(id, entry);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    for (const [id, entry] of this.entries) {
      if (!enabled) {
        this.clearTimer(entry);
        if (!entry.inFlight && entry.tab.source !== entry.tab.savedSource && entry.tab.linked)
          this.setStatus(id, entry, "unsaved");
        else if (!entry.inFlight) this.setStatus(id, entry, undefined);
      } else if (this.eligible(entry.tab) && entry.tab.source !== entry.tab.savedSource) {
        entry.attemptedSource = undefined;
        this.schedule(id, entry);
      }
    }
  }

  flush(): void {
    if (!this.enabled) return;
    for (const [id, entry] of this.entries) {
      if (this.eligible(entry.tab) && entry.tab.source !== entry.tab.savedSource) {
        this.clearTimer(entry);
        if (entry.inFlight) {
          entry.flushPending = true;
          continue;
        }
        void this.run(id, entry);
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.clearTimer(entry);
    this.entries.clear();
  }

  private schedule(id: string, entry: Entry): void {
    if (!this.enabled || !this.eligible(entry.tab) || entry.tab.source === entry.tab.savedSource) return;
    this.clearTimer(entry);
    if (entry.attemptedSource === entry.tab.source) return;
    this.setStatus(id, entry, "unsaved");
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.run(id, entry);
    }, this.delayMs);
  }

  private async run(id: string, entry: Entry): Promise<void> {
    if (!this.enabled || entry.inFlight || !this.eligible(entry.tab)) return;
    const source = entry.tab.source;
    if (source === entry.tab.savedSource || entry.attemptedSource === source) return;
    entry.attemptedSource = source;
    this.setStatus(id, entry, "saving");
    const task = this.options
      .save(id, source)
      .then((result) => {
        const latest = entry.tab;
        if (result === "error") this.setStatus(id, entry, "save-error");
        else if (result === "conflict") this.setStatus(id, entry, "unsaved");
        else if (result === "blocked") {
          entry.tab = { ...entry.tab, allowed: false };
          this.setStatus(id, entry, "unsaved");
        } else if (result === "stale") {
          this.setStatus(id, entry, latest.source === latest.savedSource ? undefined : "unsaved");
        } else if (latest.source === source || latest.savedSource === source) {
          this.setStatus(id, entry, undefined);
        } else {
          this.setStatus(id, entry, "unsaved");
        }
        if (result === "saved" && latest.source !== latest.savedSource) this.schedule(id, entry);
      })
      .catch(() => {
        this.setStatus(id, entry, "save-error");
      })
      .finally(() => {
        entry.inFlight = undefined;
        if (entry.flushPending) {
          entry.flushPending = false;
          entry.attemptedSource = undefined;
          void this.run(id, entry);
          return;
        }
        if (this.enabled && entry.tab.source !== entry.tab.savedSource && this.eligible(entry.tab) && !entry.timer) {
          if (entry.attemptedSource !== entry.tab.source) this.schedule(id, entry);
        }
      });
    entry.inFlight = task;
    await task;
  }

  private clearTimer(entry: Entry): void {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  private eligible(tab: AutosaveTab): boolean {
    return tab.linked && tab.valid && tab.allowed !== false;
  }

  private setStatus(id: string, entry: Entry, status: AutosaveStatus): void {
    if (entry.status === status) return;
    entry.status = status;
    this.options.onStatus(id, status);
  }
}
