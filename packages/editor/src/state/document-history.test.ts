import { describe, expect, it } from "vitest";

import {
  adoptExternalSource,
  beginSourceDraft,
  beginTransaction,
  cancelTransaction,
  canRedo,
  canUndo,
  commitSourceDraft,
  createHistory,
  endTransaction,
  MAX_HISTORY,
  MAX_HISTORY_BYTES,
  redo,
  undo,
} from "./document-history";

describe("document history", () => {
  it("makes consecutive external source versions undoable and redoable", () => {
    const toB = adoptExternalSource(createHistory(), "A", "B");
    const toC = adoptExternalSource(toB.history, "B", "C");

    const undoC = undo(toC.history, "C");
    expect(undoC.source).toBe("B");
    const undoB = undo(undoC.history, "B");
    expect(undoB.source).toBe("A");

    const redoB = redo(undoB.history, "A");
    expect(redoB.source).toBe("B");
    const redoC = redo(redoB.history, "B");
    expect(redoC.source).toBe("C");
  });

  it("keeps local edits between external versions in chronological order", () => {
    const toB = adoptExternalSource(createHistory(), "A", "B");
    const local = commitSourceDraft(beginSourceDraft(toB.history, "B"), "local");
    const toD = adoptExternalSource(local.history, "local", "D");

    expect(undo(toD.history, "D").source).toBe("local");
    const undoLocal = undo(undo(toD.history, "D").history, "local");
    expect(undoLocal.source).toBe("B");
    const undoExternal = undo(undoLocal.history, "B");
    expect(undoExternal.source).toBe("A");
  });

  it("does not add a snapshot or discard redo for an identical external source", () => {
    const edited = adoptExternalSource(createHistory(), "A", "B");
    const undone = undo(edited.history, "B");
    const reloaded = adoptExternalSource(undone.history, "A", "A");

    expect(reloaded.changed).toBe(false);
    expect(reloaded.history).toEqual(undone.history);
    expect(canRedo(reloaded.history, "A")).toBe(true);
  });

  it("clears redo when a new external version is accepted", () => {
    const edited = adoptExternalSource(createHistory(), "A", "B");
    const undone = undo(edited.history, "B");
    expect(canRedo(undone.history, "A")).toBe(true);

    const accepted = adoptExternalSource(undone.history, "A", "C");
    expect(accepted.history.future).toEqual([]);
    expect(canRedo(accepted.history, "C")).toBe(false);
    expect(undo(accepted.history, "C").source).toBe("A");
  });

  it("settles an in-progress source draft before an external adoption", () => {
    const drafting = beginSourceDraft(createHistory(), "A");
    const adopted = adoptExternalSource(drafting, "local draft", "B");

    expect(adopted.history.sourceDraftStart).toBeNull();
    expect(adopted.history.past).toEqual(["A", "local draft"]);
    expect(undo(adopted.history, "B").source).toBe("local draft");
  });

  it("settles an in-progress gesture before an external adoption, including empty source", () => {
    const gesture = beginTransaction(createHistory(), "");
    const adopted = adoptExternalSource(gesture, "gesture result", "external");

    expect(adopted.history.transactionStart).toBeNull();
    expect(adopted.history.past).toEqual(["", "gesture result"]);
    expect(undo(adopted.history, "external").source).toBe("gesture result");
    expect(undo(undo(adopted.history, "external").history, "gesture result").source).toBe("");
  });

  it("commits an invalid source draft as one undoable transition", () => {
    const initial = createHistory();
    const drafting = beginSourceDraft(initial, "valid source");
    const committed = commitSourceDraft(drafting, "diagram unfinished {");

    expect(committed.changed).toBe(true);
    expect(committed.history.past).toEqual(["valid source"]);
    expect(committed.history.sourceDraftStart).toBeNull();
    expect(canUndo(committed.history, "diagram unfinished {")).toBe(true);

    const reverted = undo(committed.history, "diagram unfinished {");
    expect(reverted.source).toBe("valid source");
    expect(reverted.history.future).toEqual(["diagram unfinished {"]);
  });

  it("clears redo when a new draft starts after undo", () => {
    const edited = commitSourceDraft(beginSourceDraft(createHistory(), "a"), "b");
    const undone = undo(edited.history, "b");
    expect(canRedo(undone.history, "a")).toBe(true);

    const branched = beginSourceDraft(undone.history, "a");
    expect(branched.future).toEqual([]);
    expect(canRedo(branched, "c")).toBe(false);
    expect(redo(branched, "c").changed).toBe(false);
  });

  it("cancels a gesture without recording a history entry", () => {
    const initial = createHistory();
    const started = beginTransaction(initial, "before");
    const cancelled = cancelTransaction(started);
    const ended = endTransaction(cancelled, "after");

    expect(cancelled.transactionStart).toBeNull();
    expect(ended.changed).toBe(false);
    expect(ended.history.past).toEqual([]);
  });

  it("records a completed gesture once and preserves the original history", () => {
    const initial = createHistory();
    const ended = endTransaction(beginTransaction(initial, "before"), "after");

    expect(initial.transactionStart).toBeNull();
    expect(ended.history.past).toEqual(["before"]);
    expect(ended.changed).toBe(true);
  });

  it("keeps the nearest snapshots within the count bound", () => {
    let history = createHistory();
    for (let index = 0; index < MAX_HISTORY + 5; index += 1) {
      history = commitSourceDraft(beginSourceDraft(history, `source-${index}`), `next-${index}`).history;
    }

    expect(history.past).toHaveLength(MAX_HISTORY);
    expect(history.past[0]).toBe("source-5");
    expect(history.past.at(-1)).toBe("source-104");
  });

  it("caps past and future together", () => {
    const history = {
      past: Array.from({ length: MAX_HISTORY }, (_, index) => `past-${index}`),
      future: Array.from({ length: MAX_HISTORY }, (_, index) => `future-${index}`),
      transactionStart: null,
      sourceDraftStart: null,
    };

    const transition = redo(history, "current");

    expect(transition.history.past.length + transition.history.future.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(transition.history.future[0]).toBe("future-1");
  });

  it("bounds mixed undo and redo snapshots by conservative UTF-16 bytes", () => {
    const source = (label: string) => `${label}${"x".repeat(1024 * 1024 - label.length)}`;
    const history = {
      past: [source("past-old"), source("past-near")],
      future: [source("future-near"), source("future-old")],
      transactionStart: null,
      sourceDraftStart: null,
    };

    const transition = undo(history, source("current"));
    const retainedBytes = [...transition.history.past, ...transition.history.future].reduce(
      (total, snapshot) => total + snapshot.length * 2,
      0,
    );

    expect(retainedBytes).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
    expect(transition.source).toBe("past-near".padEnd(1024 * 1024, "x"));
    expect(transition.history.past).toEqual([]);
    expect(transition.history.future[0]).toBe("current".padEnd(1024 * 1024, "x"));
    expect(transition.history.future[1]).toBe("future-near".padEnd(1024 * 1024, "x"));
  });

  it("drops an oversized snapshot instead of retaining unbounded source text", () => {
    const oversized = "🙂".repeat(Math.floor(MAX_HISTORY_BYTES / 4) + 1);
    const transition = commitSourceDraft(beginSourceDraft(createHistory(), oversized), "next");

    expect(transition.history.past).toEqual([]);
    expect(transition.history.future).toEqual([]);
  });

  it("does not mutate caller-owned history arrays", () => {
    const past = ["before"];
    const future = ["after"];
    const history = { past, future, transactionStart: null, sourceDraftStart: null };

    undo(history, "current");

    expect(past).toEqual(["before"]);
    expect(future).toEqual(["after"]);
  });
});
