import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 100;

export function useSourceHistory(initial: string) {
  const [source, setSource] = useState(initial);
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const transactionRef = useRef<string | null>(null);
  const sourceRef = useRef(initial);
  sourceRef.current = source;

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const replace = useCallback((next: string) => {
    setSource(next);
  }, []);

  const commit = useCallback(
    (next: string) => {
      const current = sourceRef.current;
      if (next === current) return;
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), current];
      futureRef.current = [];
      setSource(next);
      syncFlags();
    },
    [syncFlags],
  );

  const resetHistory = useCallback(
    (next: string) => {
      pastRef.current = [];
      futureRef.current = [];
      transactionRef.current = null;
      setSource(next);
      syncFlags();
    },
    [syncFlags],
  );

  const beginTransaction = useCallback(() => {
    transactionRef.current = sourceRef.current;
  }, []);

  const endTransaction = useCallback(() => {
    const start = transactionRef.current;
    transactionRef.current = null;
    if (!start) return;
    const current = sourceRef.current;
    if (current === start) return;
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), start];
    futureRef.current = [];
    syncFlags();
  }, [syncFlags]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1]!;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [sourceRef.current, ...futureRef.current];
    setSource(previous);
    syncFlags();
  }, [syncFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[0]!;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, sourceRef.current];
    setSource(next);
    syncFlags();
  }, [syncFlags]);

  return {
    source,
    replace,
    commit,
    resetHistory,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
