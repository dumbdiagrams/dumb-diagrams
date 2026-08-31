import { getDefaultView, getGroup, getResource } from "../core/index.js";
import type { DiagramDocument, ID } from "../core/index.js";

/** Root entities are not listed in any parent's membership arrays. */
export function findDiagramRoots(doc: DiagramDocument): ID[] {
  const childIds = new Set<ID>();
  for (const group of doc.groups) {
    for (const childId of group.children) childIds.add(childId);
    for (const child of group.borderChildren ?? []) childIds.add(child.id);
  }
  const roots: ID[] = [];
  for (const group of doc.groups) {
    if (!group.parent && !childIds.has(group.id)) roots.push(group.id);
  }
  for (const resource of doc.resources) {
    if (!resource.parent && !childIds.has(resource.id)) roots.push(resource.id);
  }
  if (roots.length === 0) {
    for (const resource of doc.resources) {
      if (!resource.parent) roots.push(resource.id);
    }
    for (const group of doc.groups) {
      if (!group.parent) roots.push(group.id);
    }
  }
  return roots;
}

export function isEmptyRootBoundary(doc: DiagramDocument, id: ID): boolean {
  const group = getGroup(doc, id);
  if (!group || group.parent) return false;
  return group.children.length === 0 && (group.borderChildren?.length ?? 0) === 0;
}

function rootOwner(doc: DiagramDocument, id: ID, roots: ReadonlySet<ID>): ID | undefined {
  if (roots.has(id)) return id;
  const resource = getResource(doc, id);
  if (resource?.parent) return rootOwner(doc, resource.parent, roots);
  const group = getGroup(doc, id);
  if (group?.parent) return rootOwner(doc, group.parent, roots);
  return undefined;
}

function compareByFlowAxis(
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  a: ID,
  b: ID,
): number {
  const horizontal = doc.flow === "lr";
  const placeA = view.places[a];
  const placeB = view.places[b];
  if (placeA?.x !== undefined && placeB?.x !== undefined) {
    const primary = horizontal
      ? placeA.x - placeB.x
      : (placeA.y ?? 0) - (placeB.y ?? 0);
    if (primary !== 0) return primary;
    const secondary = horizontal
      ? (placeA.y ?? 0) - (placeB.y ?? 0)
      : placeA.x - placeB.x;
    if (secondary !== 0) return secondary;
  }
  return a.localeCompare(b);
}

/**
 * Order top-level diagram roots for automatic layout. Connected architecture
 * follows declared flow; detached decorative boundaries stay at the end.
 */
export function orderRootsForFlow(doc: DiagramDocument, roots: ID[]): ID[] {
  if (roots.length <= 1) return [...roots];

  const view = getDefaultView(doc);
  const rootSet = new Set(roots);
  const ownerByResource = new Map<ID, ID>();
  for (const rootId of roots) {
    const collect = (id: ID, owner: ID): void => {
      const resource = getResource(doc, id);
      if (resource) {
        ownerByResource.set(resource.id, owner);
        return;
      }
      const group = getGroup(doc, id);
      if (!group) return;
      for (const childId of group.children) collect(childId, owner);
      for (const child of group.borderChildren ?? []) collect(child.id, owner);
    };
    collect(rootId, rootId);
  }

  const adjacency = new Map<ID, Set<ID>>();
  const inDegree = new Map<ID, number>();
  for (const rootId of roots) {
    adjacency.set(rootId, new Set());
    inDegree.set(rootId, 0);
  }
  for (const edge of doc.edges) {
    if (edge.style === "dashed" && edge.kind !== "peer") continue;
    const source = ownerByResource.get(edge.source) ?? rootOwner(doc, edge.source, rootSet);
    const target = ownerByResource.get(edge.target) ?? rootOwner(doc, edge.target, rootSet);
    if (!source || !target || source === target) continue;
    if (!adjacency.get(source)!.has(target)) {
      adjacency.get(source)!.add(target);
      inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
    }
  }

  const architectureRoots = roots.filter((id) => !isEmptyRootBoundary(doc, id));
  const decorativeRoots = roots.filter((id) => isEmptyRootBoundary(doc, id));
  const ordered: ID[] = [];
  const queue = architectureRoots
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort((a, b) => compareByFlowAxis(doc, view, a, b));

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const target of [...adjacency.get(id) ?? []].sort((a, b) =>
      compareByFlowAxis(doc, view, a, b),
    )) {
      inDegree.set(target, (inDegree.get(target) ?? 0) - 1);
      if (inDegree.get(target) === 0) {
        queue.push(target);
        queue.sort((a, b) => compareByFlowAxis(doc, view, a, b));
      }
    }
  }

  for (const id of architectureRoots) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  decorativeRoots.sort((a, b) => compareByFlowAxis(doc, view, a, b));
  return [...ordered, ...decorativeRoots];
}
