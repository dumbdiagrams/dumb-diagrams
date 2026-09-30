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
});
