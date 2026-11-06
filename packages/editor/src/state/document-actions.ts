import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { validateDocument } from "@dumb-diagrams/runtime/core";
import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { err, ok, type Result } from "neverthrow";
import { compileDiagramSource, warmDiagramCompilationCache, type DiagramCompilation } from "../diagram-compiler";
import { preserveManualLayout, reconcileManualRouteMoves } from "../model/layout-preservation";

export type DocumentActionError = {
  code: "invalid-source" | "invalid-document" | "compilation" | "unexpected";
  message: string;
  cause?: unknown;
};

export type PreparedDocument = { doc: DiagramDocument; source: string };

/**
 * Prepare before publishing source or changing history. A deferred compile
 * validates here and leaves layout and routing to the display worker, so a
 * layout or routing defect surfaces as a diagram error instead of a rejection.
 */
export function prepareDocument(
  doc: DiagramDocument,
  snapToGrid: boolean,
  compilation?: DiagramCompilation,
  deferCompile = false,
): Result<PreparedDocument, DocumentActionError> {
  try {
    const issue = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }).find(
      (candidate) => candidate.level === "error",
    );
    if (issue) return err({ code: "invalid-document", message: issue.message });
    const source = printDgm(doc);
    if (deferCompile) return ok({ doc, source });
    const prepared = warmDiagramCompilationCache(source, snapToGrid, compilation);
    if (!prepared.ok) {
      return err({
        code: "compilation",
        message:
          prepared.issues.find((candidate) => candidate.level === "error")?.message ??
          "The change could not be compiled.",
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
  deferCompile = false,
): Result<PreparedDocument, DocumentActionError> {
  try {
    const parsed = parseDgmResult(source);
    if (parsed.isErr()) return err({ code: "invalid-source", message: parsed.error.message });
    const baseline = compileDiagramSource(source, snapToGrid);
    if (!baseline.ok) {
      return err({
        code: "compilation",
        message:
          baseline.issues.find((candidate) => candidate.level === "error")?.message ??
          baseline.compilationError?.message ??
          "The existing diagram could not be compiled.",
      });
    }
    const preserved = preserveManualLayout(parsed.value, baseline.layout);
    return prepareDocument(
      reconcileManualRouteMoves(preserved, change(structuredClone(preserved))),
      snapToGrid,
      undefined,
      deferCompile,
    );
  } catch (cause) {
    return err({ code: "unexpected", message: "The edit failed unexpectedly. Your diagram was not changed.", cause });
  }
}
