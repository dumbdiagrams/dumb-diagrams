import type { DiagramDocument, LayoutResult, ValidationIssue } from "@dumb-diagrams/runtime/core";
import { getDefaultView, hasErrors, validateDocument } from "@dumb-diagrams/runtime/core";
import { catalogIconUrl, getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgm } from "@dumb-diagrams/runtime/dsl";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import {
  checkInvariants,
  renderSvg,
  type InvariantFailure,
} from "@dumb-diagrams/runtime/render";
import { attachRoutes, routeEdges } from "@dumb-diagrams/runtime/route";

import { snapLayoutToGrid } from "./grid";

export type DiagramCompilation = {
  ok: true;
  issues: ValidationIssue[];
  svg: string;
  invariantFailures: InvariantFailure[];
  doc: DiagramDocument;
  layout: LayoutResult;
} | {
  ok: false;
  issues: ValidationIssue[];
  svg: null;
  invariantFailures: InvariantFailure[];
  parseError?: string;
  layout?: null;
};

const MAX_CACHED_COMPILATIONS = 12;
const compilationCache = new Map<string, DiagramCompilation>();

function cacheKey(source: string, snapToGrid: boolean): string {
  return `${snapToGrid ? "grid" : "free"}\0${source}`;
}

function remember(key: string, compilation: DiagramCompilation): DiagramCompilation {
  compilationCache.delete(key);
  compilationCache.set(key, compilation);
  while (compilationCache.size > MAX_CACHED_COMPILATIONS) {
    const oldestKey = compilationCache.keys().next().value;
    if (oldestKey === undefined) break;
    compilationCache.delete(oldestKey);
  }
  return compilation;
}

export function cacheDiagramCompilation(
  source: string,
  snapToGrid: boolean,
  compilation: DiagramCompilation,
): DiagramCompilation {
  return remember(cacheKey(source, snapToGrid), compilation);
}

export function getCachedDiagramCompilation(
  source: string,
  snapToGrid: boolean,
): DiagramCompilation | undefined {
  const key = cacheKey(source, snapToGrid);
  const cached = compilationCache.get(key);
  if (!cached) return undefined;
  // Refresh insertion order so diagrams in active use remain in the small LRU.
  compilationCache.delete(key);
  compilationCache.set(key, cached);
  return cached;
}

export function compileDiagramSource(source: string, snapToGrid: boolean): DiagramCompilation {
  const cached = getCachedDiagramCompilation(source, snapToGrid);
  if (cached) return cached;

  const key = cacheKey(source, snapToGrid);
  try {
    const doc = parseDgm(source);
    const issues = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false });
    if (hasErrors(issues)) {
      return remember(key, {
        ok: false,
        issues,
        svg: null,
        invariantFailures: [],
      });
    }
    const placedLayout = snapToGrid
      ? snapLayoutToGrid(layoutDocument(doc), true, doc)
      : layoutDocument(doc);
    const layout = expandLayoutToContent(doc, attachRoutes(placedLayout, routeEdges(doc, placedLayout)));
    const invariantFailures = checkInvariants(layout);
    const svg = renderSvg(doc, layout, { resolveIconHref: catalogIconUrl });
    return remember(key, {
      ok: true,
      issues,
      invariantFailures,
      doc,
      layout,
      svg,
    });
  } catch (error) {
    return remember(key, {
      ok: false,
      parseError: (error as Error).message,
      issues: [],
      svg: null,
      layout: null,
      invariantFailures: [],
    });
  }
}

/** Keep the visible artboard large enough for authored moves, notes, and long routes. */
function expandLayoutToContent(doc: DiagramDocument, layout: LayoutResult): LayoutResult {
  const view = getDefaultView(doc);
  const padding = 32;
  let left = 0;
  let top = 0;
  let right = layout.width;
  let bottom = layout.height;
  const include = (x: number, y: number, w = 0, h = 0) => {
    if (x < 0) left = Math.min(left, x - padding);
    if (y < 0) top = Math.min(top, y - padding);
    if (x + w > right) right = x + w + padding;
    if (y + h > bottom) bottom = y + h + padding;
  };

  for (const group of layout.groups) include(
    group.bounds.x,
    group.bounds.y,
    group.bounds.w,
    group.bounds.h,
  );
  for (const node of layout.nodes) include(
    node.obstacle.x,
    node.obstacle.y,
    node.obstacle.w,
    node.obstacle.h,
  );

  for (const edge of layout.edges) {
    for (const point of edge.points) include(point.x, point.y);
    if (edge.labelPoint) include(edge.labelPoint.x - 48, edge.labelPoint.y - 16, 96, 32);
    if (edge.labelRect) include(edge.labelRect.x, edge.labelRect.y, edge.labelRect.w, edge.labelRect.h);
  }

  for (const annotation of doc.annotations) {
    const place = view.annotations?.[annotation.id];
    const dimensions = annotationDimensions(annotation.style);
    include(place?.x ?? 48, place?.y ?? 48, place?.w ?? dimensions.w, place?.h ?? dimensions.h);
  }

  layout.width = Math.max(layout.width, Math.ceil(right));
  layout.height = Math.max(layout.height, Math.ceil(bottom));
  layout.canvasBounds = {
    x: Math.floor(left),
    y: Math.floor(top),
    w: Math.max(1, Math.ceil(right) - Math.floor(left)),
    h: Math.max(1, Math.ceil(bottom) - Math.floor(top)),
  };
  return layout;
}

function annotationDimensions(style: string | undefined): { w: number; h: number } {
  switch (style) {
    case "text": return { w: 240, h: 48 };
    case "code": return { w: 300, h: 160 };
    case "callout": return { w: 280, h: 104 };
    case "checklist": return { w: 260, h: 152 };
    default: return { w: 220, h: 96 };
  }
}
