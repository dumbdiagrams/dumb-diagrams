import type { DiagramDocument, ID, LayoutResult, Rect } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { findDiagramRoots, orderRootsForFlow } from "@dumb-diagrams/runtime/layout";

export const GRID_SIZE = 24;
export const ALIGNMENT_GUIDE_THRESHOLD_PX = 6;
/** Gutter between the fixed staging slot and the diagram's leftmost content. */
export const STAGING_GUTTER_PX = 50;

export interface AlignmentGuide {
  axis: "x" | "y";
  position: number;
  from: number;
  to: number;
  anchor: "start" | "center" | "end";
}

export interface DragSnapResult {
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
}

export function snapCoordinate(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

export function snapPoint(
  point: { x: number; y: number },
  enabled: boolean,
): { x: number; y: number } {
  return {
    x: snapCoordinate(point.x, enabled),
    y: snapCoordinate(point.y, enabled),
  };
}

/**
 * Resolve a drag against the visible grid and nearby peer bounds. Alignment
 * is deliberately magnetic: the pointer remains fluid until an edge or
 * centre is within a small, zoom-independent screen distance.
 */
export function snapDragDelta(
  moving: Rect,
  targets: Rect[],
  rawDx: number,
  rawDy: number,
  snapToGrid: boolean,
  zoom = 1,
): DragSnapResult {
  const dx = snapCoordinate(moving.x + rawDx, snapToGrid) - moving.x;
  const dy = snapCoordinate(moving.y + rawDy, snapToGrid) - moving.y;
  const threshold = ALIGNMENT_GUIDE_THRESHOLD_PX / Math.max(zoom, 0.01);
  const xMatch = closestAlignment(moving, targets, "x", rawDx, rawDy, threshold);
  const yMatch = closestAlignment(moving, targets, "y", rawDx, rawDy, threshold);

  return {
    dx: xMatch?.delta ?? dx,
    dy: yMatch?.delta ?? dy,
    guides: [xMatch?.guide, yMatch?.guide].filter(
      (guide): guide is AlignmentGuide => Boolean(guide),
    ),
  };
}

function closestAlignment(
  moving: Rect,
  targets: Rect[],
  axis: "x" | "y",
  rawDx: number,
  rawDy: number,
  threshold: number,
): { delta: number; guide: AlignmentGuide; distance: number; priority: number } | null {
  const rawDelta = axis === "x" ? rawDx : rawDy;
  const anchors = [
    { name: "center" as const, ratio: 0.5, priority: 0 },
    { name: "start" as const, ratio: 0, priority: 1 },
    { name: "end" as const, ratio: 1, priority: 1 },
  ];
  let best: { delta: number; guide: AlignmentGuide; distance: number; priority: number } | null = null;

  for (const target of targets) {
    for (const anchor of anchors) {
      const movingStart = axis === "x" ? moving.x : moving.y;
      const movingSize = axis === "x" ? moving.w : moving.h;
      const targetStart = axis === "x" ? target.x : target.y;
      const targetSize = axis === "x" ? target.w : target.h;
      const movingAnchor = movingStart + movingSize * anchor.ratio + rawDelta;
      const targetAnchor = targetStart + targetSize * anchor.ratio;
      const distance = Math.abs(targetAnchor - movingAnchor);
      if (distance > threshold) continue;
      if (best && (distance > best.distance || (distance === best.distance && anchor.priority >= best.priority))) {
        continue;
      }

      const delta = rawDelta + targetAnchor - movingAnchor;
      const translated = {
        x: moving.x + (axis === "x" ? delta : rawDx),
        y: moving.y + (axis === "y" ? delta : rawDy),
        w: moving.w,
        h: moving.h,
      };
      best = {
        delta,
        distance,
        priority: anchor.priority,
        guide: axis === "x"
          ? {
              axis,
              position: targetAnchor,
              from: Math.min(translated.y, target.y),
              to: Math.max(translated.y + translated.h, target.y + target.h),
              anchor: anchor.name,
            }
          : {
              axis,
              position: targetAnchor,
              from: Math.min(translated.x, target.x),
              to: Math.max(translated.x + translated.w, target.x + target.w),
              anchor: anchor.name,
            },
      };
    }
  }

  return best;
}

/**
 * Return a fixed staging slot immediately left of the diagram's stable
 * content. Previously spawned root catalog items are excluded from the
 * baseline so every new item lands in the same top-left slot.
 */
export function leftStagingInsertionPoint(
  doc: DiagramDocument,
  layout: LayoutResult,
  itemWidth = 240,
  gap = STAGING_GUTTER_PX,
): { x: number; y: number } {
  const exclude = stagedRootIds(doc);
  const rects = [
    ...layout.groups
      .filter((group) => !exclude.has(group.id))
      .map((group) => group.bounds),
    ...layout.nodes
      .filter((node) => !exclude.has(node.id))
      .map((node) => node.obstacle),
    ...layout.edges.flatMap((edge) => {
      const xs = edge.points.map((point) => point.x);
      const ys = edge.points.map((point) => point.y);
      const route = xs.length && ys.length
        ? [{
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
          }]
        : [];
      return edge.labelRect ? [...route, edge.labelRect] : route;
    }),
  ];
  if (!rects.length) return { x: 48, y: 48 };

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  return {
    x: left - gap - itemWidth,
    y: top,
  };
}

function stagedRootIds(doc: DiagramDocument): Set<ID> {
  const view = getDefaultView(doc);
  const staged = new Set<ID>();
  for (const rootId of findDiagramRoots(doc)) {
    if (view.places[rootId]?.manual) staged.add(rootId);
  }
  return staged;
}

/**
 * Snap authored layout anchors without disturbing the layout engine's
 * hierarchy.
 *
 * The AWS layout engine intentionally uses a smaller internal rhythm for
 * headers, padding, icons, and labels. Snapping every nested rectangle to the
 * editor's 24px grid independently changes those relationships and can make
 * containers touch or appear compressed. Instead, each top-level object is a
 * single movable unit: its anchor is snapped and every descendant keeps the
 * exact relative geometry produced by the layout engine.
 *
 * Auto-fix remains the structural layout operation. Snap to grid is only a
 * safe positioning aid for manually authored top-level objects.
 */
export function snapLayoutToGrid(
  layout: LayoutResult,
  enabled: boolean,
  doc: DiagramDocument,
): LayoutResult {
  if (!enabled) return layout;

  const view = getDefaultView(doc);
  const offsets = new Map<ID, { dx: number; dy: number }>();
  for (const rootId of findPositionRoots(doc).filter((id) => {
    const place = view.places[id];
    return Boolean(
      place &&
      (place.manual || place.pin) &&
      (place.x !== undefined || place.y !== undefined),
    );
  })) {
    const rootGroup = layout.groups.find((group) => group.id === rootId);
    const rootNode = layout.nodes.find((node) => node.id === rootId);
    // A resource's obstacle includes label/routing padding, which varies with
    // its caption. Snap the icon itself so equal icon boxes share the same
    // visible grid even when their labels have different widths.
    const rootBounds = rootGroup?.bounds ?? rootNode?.icon;
    if (!rootBounds) continue;

    const dx = snapCoordinate(rootBounds.x, true) - rootBounds.x;
    const dy = snapCoordinate(rootBounds.y, true) - rootBounds.y;
    for (const id of collectSubtreeIds(doc, rootId)) {
      offsets.set(id, { dx, dy });
    }
  }

  return {
    ...layout,
    groups: layout.groups.map((group) => {
      const { dx, dy } = offsets.get(group.id) ?? { dx: 0, dy: 0 };

      return {
        ...group,
        bounds: translateRect(group.bounds, dx, dy),
        header: translateRect(group.header, dx, dy),
        labelRect: group.labelRect ? translateRect(group.labelRect, dx, dy) : undefined,
        content: translateRect(group.content, dx, dy),
      };
    }),
    nodes: layout.nodes.map((node) => {
      const { dx, dy } = offsets.get(node.id) ?? { dx: 0, dy: 0 };

      return {
        ...node,
        icon: translateRect(node.icon, dx, dy),
        label: translateRect(node.label, dx, dy),
        obstacle: translateRect(node.obstacle, dx, dy),
      };
    }),
  };
}

function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

function findPositionRoots(doc: DiagramDocument): ID[] {
  return orderRootsForFlow(doc, findDiagramRoots(doc));
}

function collectSubtreeIds(doc: DiagramDocument, rootId: ID): Set<ID> {
  const ids = new Set<ID>();

  const visit = (id: ID) => {
    if (ids.has(id)) return;
    ids.add(id);
    const group = doc.groups.find((candidate) => candidate.id === id);
    if (!group) return;
    for (const childId of group.children) visit(childId);
    for (const child of group.borderChildren ?? []) visit(child.id);
  };

  visit(rootId);
  return ids;
}
