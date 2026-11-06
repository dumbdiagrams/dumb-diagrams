import type { DiagramAsset, DiagramDocument } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, utf8ByteLength } from "@dumb-diagrams/runtime/core";
import { sanitizeSvgResult } from "@dumb-diagrams/runtime/render";
import { err, ok, type Result } from "neverthrow";

import { cloneDocument, uniqueId } from "./document-structure";

export const MAX_SVG_BYTES = DIAGRAM_LIMITS.svgBytes;
export const MAX_TOTAL_ASSET_BYTES = DIAGRAM_LIMITS.totalAssetBytes;

export type SvgAssetImportErrorCode = "svg-too-large" | "invalid-svg" | "total-assets-too-large";

export type SvgAssetImportError = {
  readonly code: SvgAssetImportErrorCode;
  readonly message: string;
};

export type SvgAssetImport = { doc: DiagramDocument; assetId: string };

export function importSvgAssetResult(
  doc: DiagramDocument,
  rawSvg: string,
): Result<SvgAssetImport, SvgAssetImportError> {
  if (utf8ByteLength(rawSvg) > MAX_SVG_BYTES) {
    return err({
      code: "svg-too-large",
      message: `SVG exceeds ${Math.round(MAX_SVG_BYTES / 1024)}KB limit`,
    });
  }
  const sanitized = sanitizeSvgResult(rawSvg);
  if (sanitized.isErr()) {
    return err({ code: "invalid-svg", message: sanitized.error.message });
  }
  const next = cloneDocument(doc);
  if (!next.assets) next.assets = [];
  const existing = next.assets.find((asset) => asset.hash === sanitized.value.hash);
  if (existing) return ok({ doc: next, assetId: existing.id });
  const totalBytes = next.assets.reduce((sum, asset) => sum + utf8ByteLength(asset.content), 0);
  if (totalBytes + utf8ByteLength(sanitized.value.content) > MAX_TOTAL_ASSET_BYTES) {
    return err({
      code: "total-assets-too-large",
      message: "Total embedded asset size limit reached",
    });
  }
  const id = uniqueId(next, "icon");
  const asset: DiagramAsset = {
    id,
    kind: "svg",
    content: sanitized.value.content,
    intrinsicW: sanitized.value.intrinsicW,
    intrinsicH: sanitized.value.intrinsicH,
    hash: sanitized.value.hash,
  };
  next.assets.push(asset);
  return ok({ doc: next, assetId: id });
}
