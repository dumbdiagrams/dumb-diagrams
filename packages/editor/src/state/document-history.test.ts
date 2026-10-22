import { describe, expect, it } from "vitest";

import {
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
