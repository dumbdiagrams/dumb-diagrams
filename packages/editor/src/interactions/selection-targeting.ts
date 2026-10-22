import type { DiagramDocument, LayoutResult, NodeGeom, Point, Rect, View } from "@dumb-diagrams/runtime/core";

import type { Selection, SelectionItem } from "../model/types.js";

const ICON_HIT_PADDING = 4;
const LABEL_HIT_PADDING_X = 4;
const LABEL_HIT_PADDING_Y = 2;

export type SelectionMode = "replace" | "add" | "toggle";

export type SelectionModifiers = Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">;

export function selectionModeForModifiers({ shiftKey, metaKey, ctrlKey }: SelectionModifiers): SelectionMode {
  if (metaKey || ctrlKey) return "toggle";
  if (shiftKey) return "add";
  return "replace";
}

/**
 * Applies a gesture's selection mode while preserving stable, duplicate-free
 * ordering. Toggle treats duplicate hits as one gesture target so a repeated
 * candidate cannot add and immediately remove itself.
 */
export function mergeSelection(current: Selection, hits: Selection, mode: SelectionMode): Selection {
  const stableCurrent = uniqueSelection(current);
  const stableHits = uniqueSelection(hits);
  if (mode === "replace") return stableHits;
  if (mode === "add") return uniqueSelection([...stableCurrent, ...stableHits]);

  const next = [...stableCurrent];
  for (const hit of stableHits) {
    const index = next.findIndex((item) => sameSelectionItem(item, hit));
    if (index >= 0) next.splice(index, 1);
    else next.push(hit);
  }
  return next;
}

/**
 * Computes the semantic result of an empty-canvas marquee. Resources and
 * annotations use visual intersection; groups require full containment. A
 * selected outer group suppresses all of its descendants, keeping the result
 * usable by grouping and movement commands.
 */
export function marqueeSelection(doc: DiagramDocument, layout: LayoutResult, view: View, rect: Rect): Selection {
  const hits = marqueeSelectionCandidates(doc, layout, view, rect);
  const selectedGroups = new Set(hits.filter((item) => item.kind === "group").map((item) => item.id));
  return hits.filter((item) => {
    if (item.kind !== "resource" && item.kind !== "group") return true;
    return !hasSelectedGroupAncestor(doc, item.id, selectedGroups);
  });
}

/**
 * Returns every visible entity currently covered by a marquee. Unlike the
 * committed selection, this intentionally keeps parent groups together with
 * their descendants so the live preview never drops an item while the
 * rectangle grows across an enclosing boundary.
 */
export function marqueeSelectionCandidates(
  doc: DiagramDocument,
  layout: LayoutResult,
  view: View,
  rect: Rect,
): Selection {
  const marquee = normalizeRect(rect);
  const hits: Selection = [];

  for (const node of layout.nodes) {
    if (!isEntityVisibleForSelection(doc, view, node.id)) continue;
    if (rectsIntersect(resourceVisualBounds(node), marquee)) {
      hits.push({ kind: "resource", id: node.id });
    }
  }

  for (const annotation of doc.annotations) {
    if (!isEntityVisibleForSelection(doc, view, annotation.id)) continue;
    const place = view.annotations?.[annotation.id];
    const bounds = {
      x: place?.x ?? 48,
      y: place?.y ?? 48,
      w: place?.w ?? 160,
      h: place?.h ?? 48,
    };
    if (rectsIntersect(bounds, marquee)) {
      hits.push({ kind: "annotation", id: annotation.id });
    }
  }

  for (const group of layout.groups) {
    if (isEntityVisibleForSelection(doc, view, group.id) && rectContains(marquee, group.bounds)) {
      hits.push({ kind: "group", id: group.id });
    }
  }

  return hits;
}

/**
 * Resource layout obstacles deliberately include routing and spacing room.
 * Pointer targeting should follow only what the user can actually see.
 */
export function resourceHitRects(node: Pick<NodeGeom, "icon" | "label">): [Rect, Rect] {
  return [
    expandRect(node.icon, ICON_HIT_PADDING, ICON_HIT_PADDING),
    expandRect(node.label, LABEL_HIT_PADDING_X, LABEL_HIT_PADDING_Y),
  ];
}

export function resourceVisualBounds(node: Pick<NodeGeom, "icon" | "label">): Rect {
  const minX = Math.min(node.icon.x, node.label.x);
  const minY = Math.min(node.icon.y, node.label.y);
  const maxX = Math.max(node.icon.x + node.icon.w, node.label.x + node.label.w);
  const maxY = Math.max(node.icon.y + node.icon.h, node.label.y + node.label.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function distanceToResource(point: Point, node: Pick<NodeGeom, "icon" | "label">): number {
  return Math.min(...resourceHitRects(node).map((rect) => distanceToRect(point, rect)));
}

function expandRect(rect: Rect, x: number, y: number): Rect {
  return {
    x: rect.x - x,
    y: rect.y - y,
    w: rect.w + x * 2,
    h: rect.h + y * 2,
  };
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

function uniqueSelection(selection: Selection): Selection {
  const seen = new Set<string>();
  return selection.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameSelectionItem(a: SelectionItem, b: SelectionItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function isEntityVisibleForSelection(doc: DiagramDocument, view: View, id: string): boolean {
  if (view.places[id]?.visible === false || view.annotations?.[id]?.visible === false) {
    return false;
  }
  const parentById = new Map<string, string | undefined>();
  for (const resource of doc.resources) parentById.set(resource.id, resource.parent);
  for (const group of doc.groups) parentById.set(group.id, group.parent);
  const resolving = new Set<string>();
  const resolve = (entityId: string): boolean => {
    if (view.places[entityId]?.visible === false || view.annotations?.[entityId]?.visible === false) {
      return false;
    }
    const parent = parentById.get(entityId);
    if (!parent) return true;
    if (resolving.has(entityId)) return false;
    resolving.add(entityId);
    const visible = resolve(parent);
    resolving.delete(entityId);
    return visible;
  };
  return resolve(id);
}

function hasSelectedGroupAncestor(doc: DiagramDocument, id: string, selectedGroups: ReadonlySet<string>): boolean {
  const parentById = new Map<string, string | undefined>();
  for (const resource of doc.resources) parentById.set(resource.id, resource.parent);
  for (const group of doc.groups) parentById.set(group.id, group.parent);
  const visited = new Set<string>();
  let parent = parentById.get(id);
  while (parent) {
    if (selectedGroups.has(parent)) return true;
    if (visited.has(parent)) return false;
    visited.add(parent);
    parent = parentById.get(parent);
  }
  return false;
}
