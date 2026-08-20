import type { DiagramDocument, ID, LayoutResult, Rect } from "@dumb-diagrams/core";

export const GRID_SIZE = 24;

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
 * Return a safe starting point for a new root-level object. New groups are
 * intentional additions to the diagram, so keep them out of the existing
 * auto-tiled canvas and place them in the first open lane to its right.
 */
export function outsideCanvasInsertionPoint(
  layout: LayoutResult,
  gap = 48,
): { x: number; y: number } {
  const rects = [
    ...layout.groups.map((group) => group.bounds),
    ...layout.nodes.map((node) => node.obstacle),
  ];
  if (!rects.length) return { x: 48, y: 48 };

  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const top = Math.max(48, Math.min(...rects.map((rect) => rect.y)));
  return { x: right + gap, y: top };
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

  const offsets = new Map<ID, { dx: number; dy: number }>();
  for (const rootId of findPositionRoots(doc)) {
    const rootGroup = layout.groups.find((group) => group.id === rootId);
    const rootNode = layout.nodes.find((node) => node.id === rootId);
    const rootBounds = rootGroup?.bounds ?? rootNode?.obstacle;
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
  const childIds = new Set<ID>();
  for (const group of doc.groups) {
    for (const childId of group.children) childIds.add(childId);
    for (const child of group.borderChildren ?? []) childIds.add(child.id);
  }

  const roots = [
    ...doc.groups.filter((group) => !group.parent && !childIds.has(group.id)).map((group) => group.id),
    ...doc.resources
      .filter((resource) => !resource.parent && !childIds.has(resource.id))
      .map((resource) => resource.id),
  ];

  if (roots.length > 0) return roots;

  return [
    ...doc.groups.filter((group) => !group.parent).map((group) => group.id),
    ...doc.resources.filter((resource) => !resource.parent).map((resource) => resource.id),
  ];
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
