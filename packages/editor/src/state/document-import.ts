import type { DiagramDocument, Point } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, hasErrors, normalizeSingleLineText, validateDocument } from "@dumb-diagrams/runtime/core";
import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { sanitizeSvgResult } from "@dumb-diagrams/runtime/render";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { importSvgAssetResult } from "../model/asset-import";
import { addCustomResourceResult } from "../model/document-operations";
import type { OpenFileEntry } from "./file-open";

export type DocumentImportError = {
  code: "size" | "extension" | "read" | "source" | "asset" | "unexpected";
  message: string;
  cause?: unknown;
};
export type ImportedSource = { source: string; filename: string };
export type DocumentImportBatchError = { filename: string; error: DocumentImportError };
export type DocumentImportBatchResult = {
  opened: string[];
  rejected: string[];
  unexpected: DocumentImportBatchError[];
  limitReached: boolean;
};

export function documentHasUnsafeAssets(doc: DiagramDocument): boolean {
  return (doc.assets ?? []).some((asset) => sanitizeSvgResult(asset.content).isErr());
}

export function validateImportedSource(
  source: string,
  enforceCatalogRules = true,
): Result<string, DocumentImportError> {
  const parsed = parseDgmResult(source);
  if (parsed.isErr()) return err({ code: "source", message: parsed.error.message });
  const issues = validateDocument(parsed.value, getCatalogMap(), { enforceCatalogRules });
  if (hasErrors(issues))
    return err({ code: "source", message: issues.find((issue) => issue.level === "error")!.message });
  if (documentHasUnsafeAssets(parsed.value))
    return err({ code: "asset", message: "Diagram contains unsafe SVG assets." });
  return ok(source);
}

export function readDiagramFile(file: File): ResultAsync<ImportedSource, DocumentImportError> {
  if (file.size > DIAGRAM_LIMITS.sourceBytes) {
    return errAsync({ code: "size", message: `${file.name} (over 1 MiB)` });
  }
  if (!/\.dgm$/i.test(file.name)) {
    return errAsync({ code: "extension", message: file.name });
  }
  // Promise.resolve().then also captures a synchronous platform read failure.
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => file.text()),
    (cause): DocumentImportError => ({ code: "read", message: file.name, cause }),
  ).andThen((source) =>
    ResultAsync.fromPromise(
      Promise.resolve().then(() =>
        validateImportedSource(source).map((validatedSource) => ({
          source: validatedSource,
          filename: normalizeSingleLineText(file.name).slice(0, DIAGRAM_LIMITS.filenameCharacters),
        })),
      ),
      (cause): DocumentImportError => ({
        code: "unexpected",
        message: "Diagram import failed unexpectedly. The document was not changed.",
        cause,
      }),
    ).andThen((result) => result),
  );
}

export async function importDocumentFiles(
  entries: OpenFileEntry[],
  remainingSlots: number,
  accept: (source: ImportedSource, entry: OpenFileEntry) => boolean,
  yieldToBrowser: () => Promise<void>,
  initiallyRejected: string[] = [],
): Promise<DocumentImportBatchResult> {
  const opened: string[] = [];
  const rejected = [...initiallyRejected];
  const unexpected: DocumentImportBatchError[] = [];
  let limitReached = entries.length > remainingSlots;
  for (const entry of entries.slice(0, remainingSlots)) {
    try {
      const result = await readDiagramFile(entry.file);
      if (result.isErr()) {
        if (result.error.code === "unexpected") {
          unexpected.push({ filename: safeFileName(entry.file), error: result.error });
        } else {
          rejected.push(result.error.code === "size" ? result.error.message : safeFileName(entry.file));
        }
      } else {
        try {
          if (accept(result.value, entry)) {
            opened.push(entry.file.name);
          } else {
            limitReached = true;
          }
        } catch (cause) {
          unexpected.push({
            filename: safeFileName(entry.file),
            error: {
              code: "unexpected",
              message: "Diagram import failed unexpectedly. The document was not changed.",
              cause,
            },
          });
        }
      }
    } catch (cause) {
      unexpected.push({
        filename: safeFileName(entry.file),
        error: {
          code: "unexpected",
          message: "Diagram import failed unexpectedly. The document was not changed.",
          cause,
        },
      });
    }
    await yieldToBrowser();
  }
  return { opened, rejected, unexpected, limitReached };
}

function safeFileName(file: File): string {
  try {
    return file.name || "selected file";
  } catch {
    return "selected file";
  }
}

export function importSvgFile(file: File, doc: DiagramDocument, parent: string | undefined, at: Point) {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => prepareSvgFile(file, doc, parent, at)),
    (cause): DocumentImportError => ({
      code: "unexpected",
      message: "SVG import failed unexpectedly. Your diagram was not changed.",
      cause,
    }),
  ).andThen((result) => result);
}

function prepareSvgFile(file: File, doc: DiagramDocument, parent: string | undefined, at: Point) {
  if (file.size > DIAGRAM_LIMITS.svgBytes) {
    return errAsync<never, DocumentImportError>({ code: "size", message: "SVG exceeds 256 KiB limit" });
  }
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => file.text()),
    (cause): DocumentImportError => ({ code: "read", message: "Unable to read SVG file.", cause }),
  )
    .andThen((raw) =>
      importSvgAssetResult(doc, raw).mapErr(
        (error): DocumentImportError => ({ code: "asset", message: error.message }),
      ),
    )
    .andThen((imported) =>
      addCustomResourceResult(
        imported.doc,
        imported.assetId,
        normalizeSingleLineText(file.name.replace(/\.svg$/i, "")),
        parent,
        at,
      ).mapErr((error): DocumentImportError => ({ code: "asset", message: error.message })),
    );
}
