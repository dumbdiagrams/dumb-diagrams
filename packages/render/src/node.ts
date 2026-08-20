import type { DiagramDocument, LayoutResult } from "@dumb-diagrams/core";

import { renderSvg, type RenderOptions } from "./svg.js";

export function renderSvgWithDefs(
  doc: DiagramDocument,
  layout: LayoutResult,
): string {
  // Node output is intentionally portable-path based. Callers that need a
  // self-contained download should use renderPortableSvg.
  return renderSvg(doc, layout, { resolveIconHref: (path) => path });
}

export { renderSvg, type RenderOptions };
