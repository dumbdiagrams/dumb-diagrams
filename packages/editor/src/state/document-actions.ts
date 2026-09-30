import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { validateDocument } from "@dumb-diagrams/runtime/core";
import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { err, ok, type Result } from "neverthrow";
import { compileDiagramSource, warmDiagramCompilationCache, type DiagramCompilation } from "../diagram-compiler";
import { planAutoFix } from "../auto-fix";
import { preserveLayout, preserveManualLayout, reconcileManualRouteMoves } from "../model/layout-preservation";
import type { LayoutEditingMode } from "../model/types";

export type DocumentActionError = {
  code: "invalid-source" | "invalid-document" | "compilation" | "unexpected";
  message: string;
  cause?: unknown;
};

export type PreparedDocument = { doc: DiagramDocument; source: string };

/** Prepare completely before publishing source or changing history. */
export function prepareDocument(
  doc: DiagramDocument,
  snapToGrid: boolean,
  compilation?: DiagramCompilation,
): Result<PreparedDocument, DocumentActionError> {
  try {
    const issue = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false })
      .find((candidate) => candidate.level === "error");
    if (issue) return err({ code: "invalid-document", message: issue.message });
    const source = printDgm(doc);
    const prepared = warmDiagramCompilationCache(source, snapToGrid, compilation);
    if (!prepared.ok) {
      return err({
        code: "compilation",
        message: prepared.issues.find((candidate) => candidate.level === "error")?.message
          ?? "The change could not be compiled.",
      });
    }
    return ok({ doc, source });
  } catch (cause) {
    return err({ code: "unexpected", message: "The edit failed unexpectedly. Your diagram was not changed.", cause });
  }
}

export function prepareDocumentMutation(
  source: string,
  change: (doc: DiagramDocument) => DiagramDocument,
  snapToGrid: boolean,
  layoutMode: LayoutEditingMode = "manual",
): Result<PreparedDocument, DocumentActionError> {
  try {
    const parsed = parseDgmResult(source);
    if (parsed.isErr()) return err({ code: "invalid-source", message: parsed.error.message });
    const baseline = compileDiagramSource(source, snapToGrid);
    if (!baseline.ok) {
      return err({
        code: "compilation",
        message: baseline.issues.find((candidate) => candidate.level === "error")?.message
          ?? baseline.compilationError?.message
          ?? "The existing diagram could not be compiled.",
      });
    }
    const preserved = layoutMode === "manual"
      ? preserveManualLayout(parsed.value, baseline.layout)
      : preserveLayout(parsed.value, baseline.layout);
    const changed = change(structuredClone(preserved));
    const next = layoutMode === "manual" ? reconcileManualRouteMoves(preserved, changed) : changed;
    return prepareCanvasEdit(next, snapToGrid, layoutMode);
  } catch (cause) {
    return err({ code: "unexpected", message: "The edit failed unexpectedly. Your diagram was not changed.", cause });
  }
}

/** Repair only a completed edit, never merely because an editing mode changed. */
export function prepareCanvasEdit(
  doc: DiagramDocument,
  snapToGrid: boolean,
  layoutMode: LayoutEditingMode,
  compilation?: DiagramCompilation,
): Result<PreparedDocument, DocumentActionError> {
  const prepared = prepareDocument(doc, snapToGrid, compilation);
  if (prepared.isErr() || layoutMode === "manual") return prepared;
  try {
    const compiled = compileDiagramSource(prepared.value.source, snapToGrid);
    if (!compiled.ok) return prepared;
    const plan = planAutoFix(compiled.doc, snapToGrid, compiled);
    return plan.status === "repaired"
      ? prepareDocument(plan.doc, snapToGrid, plan.compilation)
      : prepared;
  } catch (cause) {
    return err({ code: "unexpected", message: "The edit failed unexpectedly. Your diagram was not changed.", cause });
  }
}
