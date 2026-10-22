import type { DiagramDocument, LayoutResult, ValidationIssue } from "@dumb-diagrams/runtime/core";
import { getDefaultView, hasErrors, validateDocument } from "@dumb-diagrams/runtime/core";
import { catalogIconUrl, getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult, type DgmParseError } from "@dumb-diagrams/runtime/dsl";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import {
  checkInvariants,
  INVARIANT_DIAGNOSTICS_TRUNCATED_CODE,
  qualityFindings,
  qualityHardRegressionReason,
  renderSvg,
  validateEmbeddedAssets,
  type InvariantFailure,
} from "@dumb-diagrams/runtime/render";
import {
  attachRoutes,
  routeEdges,
  ROUTING_BUDGET_WARNING_CODE,
  ROUTING_BUDGET_WARNING_MESSAGE,
  type RoutingOptions,
} from "@dumb-diagrams/runtime/route";

import { snapLayoutToGrid } from "./grid";
import { ByteBudgetLruCache } from "./compilation-cache";

export type DiagramCompilation =
  | {
      ok: true;
      issues: ValidationIssue[];
      svg: string;
      invariantFailures: InvariantFailure[];
      doc: DiagramDocument;
      layout: LayoutResult;
    }
  | {
      ok: false;
      issues: ValidationIssue[];
      svg: null;
      invariantFailures: InvariantFailure[];
      compilationError?: CompilationError;
      parseError?: string;
      parseErrorCode?: DgmParseError["code"];
      parseErrorLocation?: { line: number; column: number };
      layout?: null;
    };

/** A plain diagnostic safe to include in a worker response. */
export type CompilationError = {
  readonly code: "compilation";
  readonly phase: "prepare" | "layout" | "routing" | "render";
  readonly message: string;
};

const MAX_CACHED_COMPILATIONS = 12;
/** Approximate retained object budget per compiler isolate (UI thread or worker). */
export const MAX_CACHED_COMPILATION_BYTES = 8 * 1024 * 1024;
export const MAX_STUDIO_INVARIANT_FAILURES = 200;
export const STUDIO_CANVAS_PADDING = 128;

const ESTIMATOR_MAX_NODES = 100_000;
const ESTIMATOR_UNKNOWN_BYTES = Number.MAX_SAFE_INTEGER / 4;

/**
 * Estimate the retained size of a cache entry without serializing the result.
 * This deliberately counts object and string overhead conservatively; it is
 * a budget guard rather than an attempt to model the V8 heap precisely.
 */
export function estimateCompilationCacheEntryBytes(key: string, compilation: DiagramCompilation): number {
  const state = { nodes: 0, seen: new Set<object>() };
  return estimateCacheValue(key, state) + estimateCacheValue(compilation, state);
}

function estimateCacheValue(value: unknown, state: { nodes: number; seen: Set<object> }, depth = 0): number {
  if (state.nodes++ > ESTIMATOR_MAX_NODES || depth > 64) return ESTIMATOR_UNKNOWN_BYTES;
  if (typeof value === "string") return 24 + value.length * 2;
  if (value === null || value === undefined) return 8;
  if (typeof value === "number" || typeof value === "bigint") return 8;
  if (typeof value === "boolean") return 4;
  if (typeof value !== "object") return 8;
  if (state.seen.has(value)) return 8;
  state.seen.add(value);

  if (Array.isArray(value)) {
    return 24 + value.reduce((total, item) => total + estimateCacheValue(item, state, depth + 1), 0);
  }

  return (
    40 +
    Object.entries(value).reduce(
      (total, [key, item]) => total + 24 + key.length * 2 + estimateCacheValue(item, state, depth + 1),
      0,
    )
  );
}

const compilationCache = new ByteBudgetLruCache<string, DiagramCompilation>(
  MAX_CACHED_COMPILATIONS,
  MAX_CACHED_COMPILATION_BYTES,
  estimateCompilationCacheEntryBytes,
);
let committedCompilationEpoch = 0;
let deferredCompilationKey: string | null = null;

export function getCommittedCompilationEpoch(): number {
  return committedCompilationEpoch;
}

function cacheKey(source: string, snapToGrid: boolean): string {
  return `${snapToGrid ? "grid" : "free"}\0${source}`;
}

/** Mark a gesture drop published before the display worker has compiled it. */
export function markDeferredCompilation(source: string, snapToGrid: boolean): void {
  deferredCompilationKey = cacheKey(source, snapToGrid);
}

export function isDeferredCompilation(source: string, snapToGrid: boolean): boolean {
  return deferredCompilationKey === cacheKey(source, snapToGrid);
}

function remember(key: string, compilation: DiagramCompilation): DiagramCompilation {
  compilationCache.set(key, compilation);
  return compilation;
}

export function cacheDiagramCompilation(
  source: string,
  snapToGrid: boolean,
  compilation: DiagramCompilation,
): DiagramCompilation {
  compilationCache.set(cacheKey(source, snapToGrid), compilation);
  return compilation;
}

/** Keep the visible diagram in sync immediately after source commits. */
export function warmDiagramCompilationCache(
  source: string,
  snapToGrid: boolean,
  precompiled?: DiagramCompilation,
): DiagramCompilation {
  committedCompilationEpoch += 1;
  const compilation = precompiled ?? compileDiagramSource(source, snapToGrid);
  if (!compilation.ok) return compilation;
  try {
    return cacheDiagramCompilation(source, snapToGrid, {
      ...compilation,
      svg: renderSvg(compilation.doc, compilation.layout, {
        resolveIconHref: catalogIconUrl,
      }),
    });
  } catch (error) {
    return compilationFailure(compilation.issues, error, "render");
  }
}

export function getCachedDiagramCompilation(source: string, snapToGrid: boolean): DiagramCompilation | undefined {
  const key = cacheKey(source, snapToGrid);
  const cached = compilationCache.get(key);
  if (!cached) return undefined;
  return cached;
}

export function compileDiagramSource(
  source: string,
  snapToGrid: boolean,
  routingOptions: RoutingOptions = {},
): DiagramCompilation {
  const usesCustomRoutingOptions = Object.keys(routingOptions).length > 0;
  const cached = usesCustomRoutingOptions ? undefined : getCachedDiagramCompilation(source, snapToGrid);
  if (cached) return cached;

  const key = cacheKey(source, snapToGrid);
  const parsed = parseDgmResult(source);
  if (parsed.isErr()) {
    return remember(key, {
      ok: false,
      parseError: parsed.error.message,
      parseErrorCode: parsed.error.code,
      ...(parsed.error.code === "invalid-syntax"
        ? { parseErrorLocation: { line: parsed.error.line, column: parsed.error.column } }
        : {}),
      issues: [],
      svg: null,
      layout: null,
      invariantFailures: [],
    });
  }
  const compilation = compileParsedDocument(parsed.value, snapToGrid, routingOptions);
  return usesCustomRoutingOptions ? compilation : remember(key, compilation);
}

/** Compile a parsed document without consulting the source-string cache. */
export function compileDocument(
  doc: DiagramDocument,
  snapToGrid: boolean,
  routingOptions: RoutingOptions = {},
): DiagramCompilation {
  return compileParsedDocument(doc, snapToGrid, routingOptions);
}

function compileParsedDocument(
  doc: DiagramDocument,
  snapToGrid: boolean,
  routingOptions: RoutingOptions,
): DiagramCompilation {
  const issues = [
    ...validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }),
    ...validateEmbeddedAssets(doc),
  ];
  if (hasErrors(issues)) {
    return {
      ok: false,
      issues,
      svg: null,
      layout: null,
      invariantFailures: [],
    };
  }
  let phase: CompilationError["phase"] = "layout";
  try {
    const placedLayout = snapToGrid ? snapLayoutToGrid(layoutDocument(doc), true, doc) : layoutDocument(doc);
    phase = "routing";
    const routingWarnings: ValidationIssue[] = [];
    const routedEdges = routeEdges(doc, placedLayout, {
      ...routingOptions,
      onDiagnostics: (diagnostics) => {
        routingOptions.onDiagnostics?.(diagnostics);
        if (diagnostics.exhausted)
          routingWarnings.push({
            level: "warning",
            code: ROUTING_BUDGET_WARNING_CODE,
            message: ROUTING_BUDGET_WARNING_MESSAGE,
          });
      },
    });
    phase = "render";
    const layout = expandLayoutToContent(doc, attachRoutes(placedLayout, routedEdges));
    const invariantFailures = checkInvariants(layout, { maxFailures: MAX_STUDIO_INVARIANT_FAILURES });
    const svg = renderSvg(doc, layout, { resolveIconHref: catalogIconUrl });
    return {
      ok: true,
      issues: [...issues, ...routingWarnings],
      invariantFailures,
      doc,
      layout,
      svg,
    };
  } catch (error) {
    return compilationFailure(issues, error, phase);
  }
}

/** Convert an unexpected compiler/display failure into a worker-safe DTO. */
export function compilationFailure(
  issues: ValidationIssue[],
  error: unknown,
  phase: CompilationError["phase"],
): Extract<DiagramCompilation, { ok: false }> {
  const compilationError = toCompilationError(error, phase);
  return {
    ok: false,
    issues: [
      ...issues,
      {
        level: "error",
        code: compilationError.code,
        message: compilationError.message,
      },
    ],
    svg: null,
    invariantFailures: [],
    compilationError,
    layout: null,
  };
}

function toCompilationError(error: unknown, phase: CompilationError["phase"]): CompilationError {
  const detail = compilerErrorMessage(error);
  const message = detail.trim() || "Unknown compiler error";
  return {
    code: "compilation",
    phase,
    message: `Compilation failed during ${phase}: ${message}`,
  };
}

function compilerErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (isRecordWithMessage(error)) return error.message;
  try {
    const serialized = JSON.stringify(error);
    if (serialized !== undefined) return serialized;
  } catch {
    // Fall through to a stable generic message for values that cannot be serialized.
  }
  return "Unknown compiler error";
}

function isRecordWithMessage(value: unknown): value is { message: string } {
  return typeof value === "object" && value !== null && "message" in value && typeof value.message === "string";
}

/**
 * Auto-fix can remove authored overrides, so reject any candidate that
 * introduces a new hard finding. Soft findings and warnings may trade only
 * when the complete quality tuple strictly improves.
 */
export function autoFixRejectionReason(current: DiagramCompilation, candidate: DiagramCompilation): string | undefined {
  if (
    [current, candidate].some((compilation) =>
      compilation.invariantFailures.some((failure) => failure.code === INVARIANT_DIAGNOSTICS_TRUNCATED_CODE),
    )
  ) {
    return "Auto-fix cannot safely compare diagrams with incomplete layout diagnostics.";
  }
  return qualityHardRegressionReason(compilationQualityFindings(current), compilationQualityFindings(candidate));
}

function compilationQualityFindings(compilation: DiagramCompilation): ReturnType<typeof qualityFindings> {
  const parseError = !compilation.ok && "parseError" in compilation ? compilation.parseError : undefined;
  return qualityFindings(compilation.issues, compilation.invariantFailures, parseError);
}

/** Keep a generous editable margin around every diagram and any authored overflow. */
function expandLayoutToContent(doc: DiagramDocument, layout: LayoutResult): LayoutResult {
  const view = getDefaultView(doc);
  const originalWidth = layout.width;
  const originalHeight = layout.height;
  let left = 0;
  let top = 0;
  let right = layout.width;
  let bottom = layout.height;
  const include = (x: number, y: number, w = 0, h = 0) => {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, y + h);
  };

  for (const group of layout.groups) include(group.bounds.x, group.bounds.y, group.bounds.w, group.bounds.h);
  for (const node of layout.nodes) include(node.obstacle.x, node.obstacle.y, node.obstacle.w, node.obstacle.h);

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

  if (right > originalWidth) layout.width = Math.ceil(right + STUDIO_CANVAS_PADDING);
  if (bottom > originalHeight) layout.height = Math.ceil(bottom + STUDIO_CANVAS_PADDING);
  const canvasLeft = Math.floor(left - STUDIO_CANVAS_PADDING);
  const canvasTop = Math.floor(top - STUDIO_CANVAS_PADDING);
  const canvasRight = Math.ceil(right + STUDIO_CANVAS_PADDING);
  const canvasBottom = Math.ceil(bottom + STUDIO_CANVAS_PADDING);
  layout.canvasBounds = {
    x: canvasLeft,
    y: canvasTop,
    w: Math.max(1, canvasRight - canvasLeft),
    h: Math.max(1, canvasBottom - canvasTop),
  };
  return layout;
}

function annotationDimensions(style: string | undefined): { w: number; h: number } {
  switch (style) {
    case "text":
      return { w: 240, h: 48 };
    case "code":
      return { w: 300, h: 160 };
    case "callout":
      return { w: 280, h: 104 };
    case "checklist":
      return { w: 260, h: 152 };
    default:
      return { w: 220, h: 96 };
  }
}
