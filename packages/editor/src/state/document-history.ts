export interface DocumentHistory {
  past: string[];
  future: string[];
  transactionStart: string | null;
  /** Source editor baseline, kept separate from pointer gesture transactions. */
  sourceDraftStart: string | null;
}

export interface HistoryTransition {
  history: DocumentHistory;
  changed: boolean;
  source?: string;
}

export const MAX_HISTORY = 100;

export function createHistory(): DocumentHistory {
  return { past: [], future: [], transactionStart: null, sourceDraftStart: null };
}

/** Begin a source editor draft and immediately discard its redo branch. */
export function beginSourceDraft(history: DocumentHistory, source: string): DocumentHistory {
  return {
    ...history,
    sourceDraftStart: history.sourceDraftStart ?? source,
    future: [],
  };
}

/** Commit the source editor draft as one undoable history entry. */
export function commitSourceDraft(history: DocumentHistory, source: string): HistoryTransition {
  const start = history.sourceDraftStart;
  const nextHistory = { ...history, sourceDraftStart: null };
  if (start === null || start === source) return { history: nextHistory, changed: false };
  return {
    history: {
      ...nextHistory,
      past: pushPast(history.past, start),
      future: [],
    },
    changed: true,
  };
}

/** Record a direct source replacement, resolving any pending source draft. */
export function commitSource(
  history: DocumentHistory,
  currentSource: string,
  nextSource: string,
): HistoryTransition {
  const draft = commitSourceDraft(history, currentSource);
  if (currentSource === nextSource) return draft;
  return {
    history: {
      ...draft.history,
      past: pushPast(draft.history.past, currentSource),
      future: [],
      transactionStart: null,
    },
    changed: true,
  };
}

/** Start a pointer gesture transaction at the current source. */
export function beginTransaction(history: DocumentHistory, source: string): DocumentHistory {
  return { ...history, transactionStart: source };
}

/** Finish a pointer gesture as one undoable history entry. */
export function endTransaction(history: DocumentHistory, source: string): HistoryTransition {
  const start = history.transactionStart;
  const nextHistory = { ...history, transactionStart: null };
  if (!start || start === source) return { history: nextHistory, changed: false };
  return {
    history: {
      ...nextHistory,
      past: pushPast(history.past, start),
      future: [],
    },
    changed: true,
  };
}

/** Cancel an in-progress gesture without creating an undo entry. */
export function cancelTransaction(history: DocumentHistory): DocumentHistory {
  return { ...history, transactionStart: null };
}

export function undo(history: DocumentHistory, source: string): HistoryTransition {
  // A pending source draft is committed before undo, so one undo returns to
  // the source that preceded the draft, even when the draft is invalid.
  const committed = commitSourceDraft(history, source);
  const previous = committed.history.past.at(-1);
  if (previous === undefined) return { history: committed.history, changed: false };
  const past = committed.history.past.slice(0, -1);
  return {
    history: {
      ...committed.history,
      past,
      future: [source, ...committed.history.future],
      transactionStart: null,
      sourceDraftStart: null,
    },
    changed: true,
    source: previous,
  };
}

export function redo(history: DocumentHistory, source: string): HistoryTransition {
  const committed = commitSourceDraft(history, source);
  const next = committed.history.future[0];
  if (next === undefined) return { history: committed.history, changed: false };
  return {
    history: {
      ...committed.history,
      past: [...committed.history.past, source],
      future: committed.history.future.slice(1),
      transactionStart: null,
      sourceDraftStart: null,
    },
    changed: true,
    source: next,
  };
}

export function canUndo(history: DocumentHistory, source: string): boolean {
  return history.past.length > 0 ||
    (history.sourceDraftStart !== null && history.sourceDraftStart !== source);
}

export function canRedo(history: DocumentHistory, _source: string): boolean {
  return history.sourceDraftStart === null && history.future.length > 0;
}

function pushPast(past: string[], source: string): string[] {
  return [...past.slice(-(MAX_HISTORY - 1)), source];
}
