import type { DiagramDocument, Point } from "@dumb-diagrams/runtime/core";
import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { pasteClipboardResult } from "../model/clipboard";
import { importSvgAssetResult } from "../model/asset-import";
import { addCustomResourceResult } from "../model/document-operations";
import type { Selection } from "../model/types";

export type ClipboardActionError = { code: "unavailable" | "image" | "empty" | "unexpected"; message: string; cause?: unknown };
export type ClipboardPaste = { doc: DiagramDocument; selection: Selection; kind: "image" | "selection"; usedFallback: boolean };

export function writeClipboardText(payload: string): ResultAsync<void, ClipboardActionError> {
  const unavailable = (cause?: unknown): ClipboardActionError => ({ code: "unavailable", message: "Could not copy source. Allow clipboard access and try again.", cause });
  if (!navigator.clipboard?.writeText) return errAsync(unavailable());
  return ResultAsync.fromPromise(Promise.resolve().then(() => navigator.clipboard.writeText(payload)), unavailable);
}

export function readClipboardSelection(
  doc: DiagramDocument,
  at: Point,
  internalPayload: string | null,
): ResultAsync<ClipboardPaste, ClipboardActionError> {
  return ResultAsync.fromPromise(readSelection(doc, at, internalPayload),
    (cause): ClipboardActionError => ({ code: "unexpected", message: "Paste failed unexpectedly. Your diagram was not changed.", cause }))
    .andThen((result) => result);
}

async function readSelection(doc: DiagramDocument, at: Point, internalPayload: string | null): Promise<Result<ClipboardPaste, ClipboardActionError>> {
  let clipboardWarning = false;
  const image = await ResultAsync.fromPromise(Promise.resolve().then(async () => {
    const items = await navigator.clipboard?.read?.();
    const item = items?.find((candidate) => candidate.types.some(isRasterType));
    const type = item?.types.find(isRasterType);
    return item && type ? await item.getType(type) : null;
  }), (cause) => cause);
  if (image.isErr()) {
    clipboardWarning = true;
  } else if (image.value) {
    const decoded = await ResultAsync.fromPromise(rasterSvg(image.value), (cause): ClipboardActionError => ({
      code: "image", message: "Unable to read clipboard image.", cause,
    }));
    if (decoded.isErr()) return err(decoded.error);
    const imported = importSvgAssetResult(doc, decoded.value);
    if (imported.isErr()) return err({ code: "image", message: imported.error.message });
    const placed = addCustomResourceResult(imported.value.doc, imported.value.assetId, "Pasted image", undefined, at);
    if (placed.isErr()) return err({ code: "image", message: placed.error.message });
    return ok({ doc: placed.value.doc, selection: [{ kind: "resource", id: placed.value.id }], kind: "image", usedFallback: false });
  }
  const text = await ResultAsync.fromPromise(Promise.resolve().then(() => navigator.clipboard?.readText()), (cause) => cause);
  if (text.isErr()) clipboardWarning = true;
  const systemPayload = text.isOk() ? text.value : null;
  const payloads = [systemPayload, internalPayload].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  for (const payload of payloads) {
    const pasted = pasteClipboardResult(doc, payload, at);
    if (pasted.isOk()) return ok({ ...pasted.value, kind: "selection", usedFallback: clipboardWarning });
  }
  return err({ code: clipboardWarning ? "unavailable" : "empty", message: clipboardWarning
    ? "Paste failed: clipboard access was denied. Copy a selection in Studio or allow clipboard access."
    : "Paste failed: copy a diagram selection first." });
}

function isRasterType(type: string): boolean {
  return /^image\/(?:png|jpeg|webp|gif)$/.test(type);
}

async function rasterSvg(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read clipboard image"));
    reader.onabort = () => reject(new Error("Clipboard image read was cancelled"));
    reader.readAsDataURL(blob);
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}
