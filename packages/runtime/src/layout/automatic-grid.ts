import { getDefaultView, getGroup } from "../core/index.js";
import type { DiagramDocument, GroupGeom, ID, LayoutResult, NodeGeom, Rect } from "../core/index.js";

/** Shared layout/editor rhythm for automatically positioned icon centres. */
export const AUTOMATIC_GRID_SIZE = 24;

const MAX_GRID_SEARCH_DISTANCE = AUTOMATIC_GRID_SIZE * 2;
const EPSILON = 0.01;

/** Keep the document-level grid pass for small, unambiguous end-to-end chains. */
export function isSimpleAutomaticGridFlow(doc: DiagramDocument): boolean {
  const resourceIds = new Set(doc.resources.map((resource) => resource.id));
  if (resourceIds.size < 2 || resourceIds.size > 32 || doc.edges.length > 48) return false;
  const neighbors = new Map([...resourceIds].map((id) => [id, new Set<ID>()]));
  const pairs = new Set<string>();
  for (const edge of doc.edges) {
    if (!resourceIds.has(edge.source) || !resourceIds.has(edge.target) || edge.source === edge.target) return false;
    const pair = [edge.source, edge.target].sort().join("\u0000");
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }
  if (pairs.size !== resourceIds.size - 1 || [...neighbors.values()].some((items) => items.size > 2)) return false;
  const start = resourceIds.values().next().value as ID | undefined;
  if (!start) return false;
  const visited = new Set<ID>();
  const visit = (id: ID): void => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const next of neighbors.get(id)!) visit(next);
  };
  visit(start);
  return visited.size === resourceIds.size;
}

/**
 * Aligns automatic resource icon centres to the canonical grid while keeping
 * the layout engine's card and frame geometry intact. Equal input rows and
 * columns are moved as units, so an existing alignment remains an alignment.
 */
export function alignAutomaticIconCentres(doc: DiagramDocument, layout: LayoutResult): LayoutResult {
  const locked = pinnedSubtreeAxes(doc);
  const nodes = layout.nodes.map(cloneNode);
  const groups = layout.groups;

  for (const axis of ["y", "x"] as const) {
    // A neighbour can free a safe grid slot after an earlier icon was tried.
    // Retry once; icons already on the grid stay fixed.
    for (let pass = 0; pass < 2; pass++) {
      for (const row of groupEqualCentres(nodes, axis)) {
        alignCohort(doc, nodes, groups, axis, row, locked[axis]);
      }
    }
  }

  return { ...layout, nodes };
}

function pinnedSubtreeAxes(doc: DiagramDocument): Record<"x" | "y", Set<ID>> {
  const places = getDefaultView(doc).places;
  const locked: Record<"x" | "y", Set<ID>> = { x: new Set(), y: new Set() };
  const collect = (id: ID, axis: "x" | "y", visited: Set<ID>): void => {
    if (visited.has(id)) return;
    visited.add(id);
    locked[axis].add(id);
    const group = getGroup(doc, id);
    if (!group) return;
    for (const child of group.children) collect(child, axis, visited);
    for (const child of group.borderChildren ?? []) collect(child.id, axis, visited);
  };
  for (const [id, place] of Object.entries(places)) {
    if (!place.pin) continue;
    // A manual size edit resizes only the frame. Its descendants still receive
    // their ordinary automatic grid placement after the boundary override.
    if (place.manual && getGroup(doc, id) && (place.w !== undefined || place.h !== undefined)) continue;
    for (const axis of ["x", "y"] as const) {
      if (place[axis] !== undefined) collect(id, axis, new Set());
    }
  }
  return locked;
}

function alignCohort(
  doc: DiagramDocument,
  nodes: NodeGeom[],
  groups: GroupGeom[],
  axis: "x" | "y",
  cohort: NodeGeom[],
  locked: Set<ID>,
): void {
  if (cohort.length === 0 || cohort.some((node) => locked.has(node.id))) return;
  const movedIds = new Set(cohort.map((node) => node.id));
  const members = (): NodeGeom[] => nodes.filter((node) => movedIds.has(node.id));
  const centre = members().reduce((sum, node) => sum + centreOf(node.icon, axis), 0) / movedIds.size;
  for (const target of nearbyGridCentres(centre).filter((candidate) =>
    members().every((node) => Math.abs(candidate - centreOf(node.icon, axis)) <= MAX_GRID_SEARCH_DISTANCE + EPSILON),
  )) {
    const current = members();
    if (current.every((node) => Math.abs(target - centreOf(node.icon, axis)) < EPSILON)) break;
    const before = nodes.map(cloneNode);
    for (const node of current) translateNodeAxis(node, axis, target - centreOf(node.icon, axis));
    if (safeCandidate(doc, before, nodes, groups, axis, movedIds)) break;
    for (let index = 0; index < nodes.length; index++) nodes[index] = before[index]!;
  }
}

function groupEqualCentres(nodes: NodeGeom[], axis: "x" | "y"): NodeGeom[][] {
  const grouped = new Map<number, NodeGeom[]>();
  for (const node of nodes) {
    const centre = centreOf(node.icon, axis);
    const key = Math.round(centre / EPSILON);
    const row = grouped.get(key) ?? [];
    row.push(node);
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((left, right) => centreOf(left[0]!.icon, axis) - centreOf(right[0]!.icon, axis));
}

function nearbyGridCentres(centre: number): number[] {
  const nearest = Math.round(centre / AUTOMATIC_GRID_SIZE);
  const candidates = Array.from({ length: 5 }, (_, index) => nearest + index - 2)
    .map((step) => step * AUTOMATIC_GRID_SIZE)
    .filter((target) => Math.abs(target - centre) <= MAX_GRID_SEARCH_DISTANCE + EPSILON);
  return candidates.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
}

function safeCandidate(
  doc: DiagramDocument,
  before: NodeGeom[],
  after: NodeGeom[],
  groups: GroupGeom[],
  axis: "x" | "y",
  movedIds: Set<ID>,
): boolean {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  for (const node of after) {
    if (!movedIds.has(node.id)) continue;
    const previous = beforeById.get(node.id)!;
    for (const ancestorId of ancestors(doc, node.id)) {
      const frame = groups.find((group) => group.id === ancestorId)?.content;
      const bounds = groups.find((group) => group.id === ancestorId)?.bounds;
      if (!frame || !bounds) continue;
      if (contains(bounds, previous.icon) && !contains(bounds, node.icon)) return false;
      if (contains(frame, previous.icon) && !contains(frame, node.icon)) return false;
      if (contains(bounds, previous.label) && !contains(bounds, node.label)) return false;
    }
    for (const group of groups) {
      const textBounds = [group.header, ...(group.labelRect ? [group.labelRect] : [])];
      if (textBounds.some((rect) => overlaps(rect, node.obstacle) && !overlaps(rect, previous.obstacle))) return false;
    }
    for (const other of after) {
      if (other.id === node.id) continue;
      const previousOther = beforeById.get(other.id)!;
      if (overlaps(node.obstacle, other.obstacle) && !overlaps(previous.obstacle, previousOther.obstacle)) return false;
    }
  }
  if (axis === "x" && shrinksReservedLabelRun(doc, before, after)) return false;
  return after.every(
    (node) =>
      !movedIds.has(node.id) ||
      Math.abs(
        centreOf(node.icon, axis) / AUTOMATIC_GRID_SIZE - Math.round(centreOf(node.icon, axis) / AUTOMATIC_GRID_SIZE),
      ) < 1e-6,
  );
}

function shrinksReservedLabelRun(doc: DiagramDocument, before: NodeGeom[], after: NodeGeom[]): boolean {
  const beforeById = new Map(before.map((node) => [node.id, node]));
  const afterById = new Map(after.map((node) => [node.id, node]));
  for (const edge of doc.edges) {
    if (!edge.label && edge.step === undefined) continue;
    const previousSource = beforeById.get(edge.source);
    const previousTarget = beforeById.get(edge.target);
    const source = afterById.get(edge.source);
    const target = afterById.get(edge.target);
    if (!previousSource || !previousTarget || !source || !target) continue;
    const required = (edge.label?.length ?? 0) * 11 * 0.55 + 16 + (edge.step === undefined ? 0 : 36);
    const run = (left: NodeGeom, right: NodeGeom): number => right.icon.x - (left.icon.x + left.icon.w);
    const previousGap =
      previousSource.icon.x <= previousTarget.icon.x
        ? run(previousSource, previousTarget)
        : run(previousTarget, previousSource);
    if (previousGap < required) continue;
    const afterGap = source.icon.x <= target.icon.x ? run(source, target) : run(target, source);
    if (afterGap < required - EPSILON) return true;
  }
  return false;
}

function ancestors(doc: DiagramDocument, id: ID): ID[] {
  const result: ID[] = [];
  let parent = getGroup(doc, id)?.parent ?? doc.resources.find((resource) => resource.id === id)?.parent;
  while (parent) {
    result.push(parent);
    parent = getGroup(doc, parent)?.parent;
  }
  return result;
}

function centreOf(rect: Rect, axis: "x" | "y"): number {
  return rect[axis] + rect[axis === "x" ? "w" : "h"] / 2;
}

function translateNodeAxis(node: NodeGeom, axis: "x" | "y", delta: number): void {
  for (const rect of [node.icon, node.label, node.obstacle]) rect[axis] += delta;
}

function cloneNode(node: NodeGeom): NodeGeom {
  return {
    ...node,
    icon: { ...node.icon },
    label: { ...node.label },
    obstacle: { ...node.obstacle },
  };
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.w <= outer.x + outer.w + EPSILON &&
    inner.y + inner.h <= outer.y + outer.h + EPSILON
  );
}

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.w - EPSILON &&
    right.x < left.x + left.w - EPSILON &&
    left.y < right.y + right.h - EPSILON &&
    right.y < left.y + left.h - EPSILON
  );
}
