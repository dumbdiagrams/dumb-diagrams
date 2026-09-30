import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, utf8ByteLength } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramSource, type DiagramCompilation } from "../diagram-compiler";
import { preserveManualLayout, preserveUnplacedLayout, preserveUnplacedManualLayout, reconcileManualRouteMoves } from "../model/layout-preservation";
import type { LayoutEditingMode } from "../model/types";
import { planAutoFix } from "../auto-fix";
import { prepareCanvasEdit, prepareDocument, prepareDocumentMutation, type DocumentActionError, type PreparedDocument } from "./document-actions";

type DocumentCommandOptions = {
  source: string;
  tabId: string;
  snapToGrid: boolean;
  layoutMode: LayoutEditingMode;
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

  const reportFailure = (error: DocumentActionError) => {
    if (error.code === "invalid-source") return;
    if (error.code === "unexpected") console.error("Document edit failed", error.cause);
    options.notify(error.message);
  };
  const publish = (prepared: PreparedDocument, preview: boolean) => {
    clearDraftTimer();
    sourceRef.current = prepared.source;
    setCommittedCompilationKey((current) => current + 1);
    if (preview) options.replaceSource(prepared.source);
    else options.commitSource(prepared.source);
  };
  const commitDocument = (doc: DiagramDocument, compilation?: DiagramCompilation, preservePositions = true) => {
    const baseline = preservePositions ? compileDiagramSource(sourceRef.current, options.snapToGrid) : null;
    const preserved = baseline?.ok
      ? options.layoutMode === "manual"
        ? preserveUnplacedManualLayout(doc, baseline.layout, baseline.doc)
        : preserveUnplacedLayout(doc, baseline.layout)
      : doc;
    const nextDoc = baseline?.ok && options.layoutMode === "manual"
      ? reconcileManualRouteMoves(preserveManualLayout(baseline.doc, baseline.layout), preserved)
      : preserved;
    const cached = nextDoc === doc ? compilation : undefined;
    const result = preservePositions
      ? prepareCanvasEdit(nextDoc, options.snapToGrid, options.layoutMode, cached)
      : prepareDocument(nextDoc, options.snapToGrid, cached);
    if (result.isErr()) { reportFailure(result.error); return false; }
    publish(result.value, false);
    return true;
  };
  const mutate = (change: (doc: DiagramDocument) => DiagramDocument, preview = false): PreparedDocument | null => {
    const result = prepareDocumentMutation(sourceRef.current, change, options.snapToGrid, options.layoutMode);
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
  const autoFix = (compilation: DiagramCompilation) => {
    try {
      const parsed = parseDgmResult(sourceRef.current);
      if (parsed.isErr()) return;
      const plan = planAutoFix(compilation.ok ? compilation.doc : parsed.value,
        options.snapToGrid, compilation.ok ? compilation : undefined);
      if (plan.status !== "repaired") {
        options.notify(plan.message ?? (plan.status === "unchanged"
          ? "Diagram already passes Auto-fix checks" : "Auto-fix could not improve the diagram"));
        return;
      }
      if (commitDocument(plan.doc, plan.compilation, false)) options.notify(plan.message ?? "Diagram auto-fixed");
    } catch (cause) {
      reportFailure({ code: "unexpected", message: "Auto-fix failed unexpectedly. Your diagram was not changed.", cause });
    }
  };
  return {
    sourceRef, committedCompilationKey, commitDocument, mutate, autoFix,
    mutateCurrent: (change: (doc: DiagramDocument) => DiagramDocument) => mutate(change) !== null,
    previewMutate: (change: (doc: DiagramDocument) => DiagramDocument) => mutate(change, true) !== null,
    onSourceChange, onSourceCommit, clearDraftTimer,
  };
}
