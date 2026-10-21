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
/** Conservative UTF-16 source-string budget for a tab's retained snapshots. */
export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;

export function createHistory(): DocumentHistory {
  return { past: [], future: [], transactionStart: null, sourceDraftStart: null };
}

/** Begin a source editor draft and immediately discard its redo branch. */
export function beginSourceDraft(history: DocumentHistory, source: string): DocumentHistory {
  return boundHistory({
    ...history,
    sourceDraftStart: history.sourceDraftStart ?? source,
    future: [],
  });
}

/** Commit the source editor draft as one undoable history entry. */
export function commitSourceDraft(history: DocumentHistory, source: string): HistoryTransition {
  const start = history.sourceDraftStart;
  const nextHistory = boundHistory({ ...history, sourceDraftStart: null });
  if (start === null || start === source) return { history: nextHistory, changed: false };
  return {
    history: boundHistory({
      ...nextHistory,
      past: [...nextHistory.past, start],
      future: [],
    }),
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
    history: boundHistory({
      ...draft.history,
      past: [...draft.history.past, currentSource],
      future: [],
      transactionStart: null,
    }),
    changed: true,
  };
}

/** Start a pointer gesture transaction at the current source. */
export function beginTransaction(history: DocumentHistory, source: string): DocumentHistory {
  return boundHistory({ ...history, transactionStart: source });
}

/** Finish a pointer gesture as one undoable history entry. */
export function endTransaction(history: DocumentHistory, source: string): HistoryTransition {
  const start = history.transactionStart;
  const nextHistory = boundHistory({ ...history, transactionStart: null });
  if (!start || start === source) return { history: nextHistory, changed: false };
  return {
    history: boundHistory({
      ...nextHistory,
      past: [...nextHistory.past, start],
      future: [],
    }),
    changed: true,
  };
}

/** Cancel an in-progress gesture without creating an undo entry. */
export function cancelTransaction(history: DocumentHistory): DocumentHistory {
  return boundHistory({ ...history, transactionStart: null });
}

export function undo(history: DocumentHistory, source: string): HistoryTransition {
  // A pending source draft is committed before undo, so one undo returns to
  // the source that preceded the draft, even when the draft is invalid.
  const committed = commitSourceDraft(history, source);
  const previous = committed.history.past.at(-1);
  if (previous === undefined) return { history: committed.history, changed: false };
  const past = committed.history.past.slice(0, -1);
  return {
    history: boundHistory({
      ...committed.history,
      past,
      future: [source, ...committed.history.future],
      transactionStart: null,
      sourceDraftStart: null,
    }),
    changed: true,
    source: previous,
  };
}

export function redo(history: DocumentHistory, source: string): HistoryTransition {
  const committed = commitSourceDraft(history, source);
  const next = committed.history.future[0];
  if (next === undefined) return { history: committed.history, changed: false };
  return {
    history: boundHistory({
      ...committed.history,
      past: [...committed.history.past, source],
      future: committed.history.future.slice(1),
      transactionStart: null,
      sourceDraftStart: null,
    }),
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

function boundHistory(history: DocumentHistory): DocumentHistory {
  const snapshots = boundSnapshots(history.past, history.future);
  return { ...history, ...snapshots };
}

function boundSnapshots(past: string[], future: string[]): { past: string[]; future: string[] } {
  // The end of `past` and the start of `future` are the snapshots nearest to
  // the current source. Trim from the opposite ends so those transitions win
  // when the count or byte budget is reached.
  const boundedPast = past.slice(-MAX_HISTORY);
  const boundedFuture = future.slice(0, MAX_HISTORY);
  const keptPast: string[] = [];
  const keptFuture: string[] = [];
  let pastIndex = boundedPast.length - 1;
  let futureIndex = 0;
  let bytes = 0;
  let takePast = true;

  while ((pastIndex >= 0 || futureIndex < boundedFuture.length) &&
         keptPast.length + keptFuture.length < MAX_HISTORY) {
    const canTakePast = pastIndex >= 0;
    const canTakeFuture = futureIndex < boundedFuture.length;
    const usePast = canTakePast && (!canTakeFuture || takePast);
    if (usePast) {
      const source = boundedPast[pastIndex]!;
      const sourceBytes = estimateSourceBytes(source);
      const fits = bytes + sourceBytes <= MAX_HISTORY_BYTES;
      if (fits) {
        keptPast.push(source);
        bytes += sourceBytes;
      }
      // If the nearest snapshot does not fit, farther snapshots on this side
      // cannot be retained without breaking undo chronology.
      pastIndex = fits ? pastIndex - 1 : -1;
      takePast = false;
      continue;
    }

    if (canTakeFuture) {
      const source = boundedFuture[futureIndex]!;
      const sourceBytes = estimateSourceBytes(source);
      const fits = bytes + sourceBytes <= MAX_HISTORY_BYTES;
      if (fits) {
        keptFuture.push(source);
        bytes += sourceBytes;
      }
      futureIndex = fits ? futureIndex + 1 : boundedFuture.length;
      takePast = true;
      continue;
    }

    // Only possible when the past side was exhausted after taking a future
    // snapshot; the loop condition will terminate on the next iteration.
    takePast = true;
  }

  return { past: keptPast.reverse(), future: keptFuture };
}

function estimateSourceBytes(source: string): number {
  return source.length * 2;
}
