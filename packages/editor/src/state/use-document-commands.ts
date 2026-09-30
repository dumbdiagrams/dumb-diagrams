import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, utf8ByteLength } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import {
  compileDiagramSource,
  getCachedDiagramCompilation,
  isDeferredCompilation,
  markDeferredCompilation,
  warmDiagramCompilationCache,
  type DiagramCompilation,
} from "../diagram-compiler";
import { planAutoFixInWorker } from "../diagram-compiler-worker-client";
import { preserveManualLayout, preserveUnplacedManualLayout, reconcileManualRouteMoves } from "../model/layout-preservation";
import { planAutoFix } from "../auto-fix";
import { prepareDocument, prepareDocumentMutation, type DocumentActionError, type PreparedDocument } from "./document-actions";

type DocumentCommandOptions = {
  source: string;
  tabId: string;
  snapToGrid: boolean;
  commitSource: (source: string) => void;
  replaceSource: (source: string) => void;
  editSourceDraft: (source: string) => void;
  commitSourceDraft: () => void;
  notify: (message: string) => void;
};

/** Own source publication and draft timing; callers update UI only on success. */
export function useDocumentCommands(options: DocumentCommandOptions) {
  const sourceRef = useRef(options.source);
  sourceRef.current = options.source;
  const [committedCompilationKey, setCommittedCompilationKey] = useState(0);
  const [autoFixing, setAutoFixing] = useState(false);
  const autoFixingRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTabRef = useRef(options.tabId);

  const clearDraftTimer = useCallback(() => {
    if (draftTimerRef.current !== null) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
  }, []);
  useEffect(() => {
    if (draftTabRef.current !== options.tabId) {
      clearDraftTimer();
      draftTabRef.current = options.tabId;
    }
    return clearDraftTimer;
  }, [clearDraftTimer, options.tabId]);
  const snapToGridRef = useRef(options.snapToGrid);
  snapToGridRef.current = options.snapToGrid;
  // A capture listener on window runs before React collects its handlers, so
  // the next input after a gesture drop never acts on the pre-drop geometry.
  // Registered once, it also precedes the window-level shortcut listener.
  useEffect(() => {
    const settleDeferredCompilation = () => {
      const source = sourceRef.current;
      const snapToGrid = snapToGridRef.current;
      if (!isDeferredCompilation(source, snapToGrid) || getCachedDiagramCompilation(source, snapToGrid)) return;
      warmDiagramCompilationCache(source, snapToGrid);
      flushSync(() => setCommittedCompilationKey((current) => current + 1));
    };
    window.addEventListener("pointerdown", settleDeferredCompilation, true);
    window.addEventListener("keydown", settleDeferredCompilation, true);
    return () => {
      window.removeEventListener("pointerdown", settleDeferredCompilation, true);
      window.removeEventListener("keydown", settleDeferredCompilation, true);
    };
  }, []);

  const reportFailure = (error: DocumentActionError) => {
    if (error.code === "invalid-source") return;
    if (error.code === "unexpected") console.error("Document edit failed", error.cause);
    options.notify(error.message);
  };
  const publish = (prepared: PreparedDocument, preview: boolean) => {
    clearDraftTimer();
    sourceRef.current = prepared.source;
    setCommittedCompilationKey((current) => current + 1);
    if (preview) {
      markDeferredCompilation(prepared.source, options.snapToGrid);
      options.replaceSource(prepared.source);
    } else options.commitSource(prepared.source);
  };
  const commitDocument = (doc: DiagramDocument, compilation?: DiagramCompilation, preservePositions = true) => {
    const baseline = preservePositions ? compileDiagramSource(sourceRef.current, options.snapToGrid) : null;
    const nextDoc = baseline?.ok
      ? reconcileManualRouteMoves(preserveManualLayout(baseline.doc, baseline.layout),
        preserveUnplacedManualLayout(doc, baseline.layout, baseline.doc))
      : doc;
    const result = prepareDocument(nextDoc, options.snapToGrid, nextDoc === doc ? compilation : undefined);
    if (result.isErr()) { reportFailure(result.error); return false; }
    publish(result.value, false);
    return true;
  };
  // Gesture drops keep their on-canvas preview until the worker's compile lands,
  // so routing them here would only freeze the pointer release.
  const mutate = (change: (doc: DiagramDocument) => DiagramDocument, preview = false): PreparedDocument | null => {
    const result = prepareDocumentMutation(sourceRef.current, change, options.snapToGrid, preview);
    if (result.isErr()) { reportFailure(result.error); return null; }
    publish(result.value, preview);
    return result.value;
  };
  const onSourceCommit = () => {
    clearDraftTimer();
    options.commitSourceDraft();
  };
  const onSourceChange = (next: string) => {
    if (utf8ByteLength(next) > DIAGRAM_LIMITS.sourceBytes) {
      options.notify("Diagram exceeds the 1 MiB source limit");
      return;
    }
    sourceRef.current = next;
    options.editSourceDraft(next);
    clearDraftTimer();
    draftTimerRef.current = setTimeout(onSourceCommit, 600);
  };
  const autoFix = async (compilation: DiagramCompilation) => {
    if (autoFixingRef.current) return;
    const source = sourceRef.current;
    const parsed = parseDgmResult(source);
    if (parsed.isErr()) return;
    const doc = compilation.ok ? compilation.doc : parsed.value;
    autoFixingRef.current = true;
    setAutoFixing(true);
    try {
      const plan = await planAutoFixInWorker(
        () => new Worker(new URL("../diagram-compiler.worker.ts", import.meta.url), { type: "module" }),
        doc,
        options.snapToGrid,
        () => planAutoFix(doc, options.snapToGrid, compilation.ok ? compilation : undefined),
      );
      if (sourceRef.current !== source) {
        options.notify("The diagram changed while Auto-fix was running. Run it again to repair the latest version.");
        return;
      }
      if (plan.status !== "repaired") {
        options.notify(plan.message ?? (plan.status === "unchanged"
          ? "Diagram already passes Auto-fix checks" : "Auto-fix could not improve the diagram"));
        return;
      }
      if (commitDocument(plan.doc, plan.compilation, false)) options.notify(plan.message ?? "Diagram auto-fixed");
    } catch (cause) {
      reportFailure({ code: "unexpected", message: "Auto-fix failed unexpectedly. Your diagram was not changed.", cause });
    } finally {
      autoFixingRef.current = false;
      setAutoFixing(false);
    }
  };
  return {
    sourceRef, committedCompilationKey, commitDocument, mutate, autoFix, autoFixing,
    mutateCurrent: (change: (doc: DiagramDocument) => DiagramDocument) => mutate(change) !== null,
    previewMutate: (change: (doc: DiagramDocument) => DiagramDocument) => mutate(change, true) !== null,
    onSourceChange, onSourceCommit, clearDraftTimer,
  };
}
