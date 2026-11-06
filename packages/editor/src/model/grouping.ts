import type { DiagramDocument, LayoutResult, Rect, Side } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { GROUP_STYLES } from "@dumb-diagrams/runtime/grammar-aws";

import { cloneDocument, collectChildren, uniqueId } from "./document-structure";
import type { Selection, SelectionItem } from "./types";

/** Move an item between semantic groups while leaving all authored geometry absolute. */
export function reparentPreservingAbsolutePosition(
  doc: DiagramDocument,
  item: SelectionItem | string,
  newParentId?: string,
): DiagramDocument {
  const id = typeof item === "string" ? item : item.id;
  const kind =
    typeof item === "string" ? (doc.groups.some((group) => group.id === id) ? "group" : "resource") : item.kind;
  if (kind !== "group" && kind !== "resource") return doc;

  const movedGroup = kind === "group" ? doc.groups.find((group) => group.id === id) : undefined;
  const movedResource = kind === "resource" ? doc.resources.find((resource) => resource.id === id) : undefined;
  if (!movedGroup && !movedResource) return doc;

  const newParent = newParentId ? doc.groups.find((group) => group.id === newParentId) : undefined;
  if (newParentId && !newParent) return doc;
  if (newParentId === id) return doc;
  if (movedGroup && newParent && isDescendant(doc, movedGroup.id, newParent.id)) return doc;

  const next = cloneDocument(doc);
  for (const group of next.groups) {
    group.children = group.children.filter((childId) => childId !== id);
    group.borderChildren = group.borderChildren?.filter((child) => child.id !== id);
  }
  if (movedGroup) next.groups.find((group) => group.id === id)!.parent = newParentId;
  if (movedResource) next.resources.find((resource) => resource.id === id)!.parent = newParentId;
  if (newParent) {
    const destination = next.groups.find((group) => group.id === newParent.id)!;
    destination.children = [...destination.children.filter((childId) => childId !== id), id];
  }
  return next;
}

/**
 * Group a set of direct siblings using their rendered geometry.
 *
 * A selected group that fully encloses the other items becomes their parent;
 * otherwise the items are wrapped in a new logical group. Grouping is a
 * hierarchy-only operation: selected items and their laid-out descendants are
 * pinned to their current absolute geometry before their parent changes.
 */
export function groupSelection(
  doc: DiagramDocument,
  selection: Selection,
  layout: LayoutResult,
  label = "Group",
): { doc: DiagramDocument; id: string } | null {
  if (!canGroupSelection(doc, selection)) return null;
  const normalized = normalizeGroupingSelection(doc, selection);
  if (!normalized) return null;

  const ids = normalized.map((item) => item.id);
  const records = normalized.map((item) => {
    const resource = item.kind === "resource" ? doc.resources.find((candidate) => candidate.id === item.id) : undefined;
    const group = item.kind === "group" ? doc.groups.find((candidate) => candidate.id === item.id) : undefined;
    return { item, resource, group, parent: resource?.parent ?? group?.parent };
  });

  const parentId = records[0]!.parent;
  const parent = parentId ? doc.groups.find((group) => group.id === parentId) : undefined;
  const siblingOrder = parent
    ? [...parent.children, ...(parent.borderChildren?.map((child) => child.id) ?? [])]
    : [
        ...doc.groups.filter((group) => !group.parent).map((group) => group.id),
        ...doc.resources.filter((resource) => !resource.parent).map((resource) => resource.id),
      ];
  const order = new Map(siblingOrder.map((id, index) => [id, index]));
  const selectionIndex = new Map(normalized.map((item, index) => [item.id, index]));
  const layoutById = new Map<string, Rect>();
  for (const group of layout.groups) layoutById.set(group.id, group.bounds);
  for (const node of layout.nodes) layoutById.set(node.id, node.obstacle);
  const selectedIds = [...ids].sort((a, b) => {
    const aRect = layoutById.get(a);
    const bRect = layoutById.get(b);
    if (aRect && bRect) {
      const horizontal = doc.flow === "lr";
      const primary = horizontal ? aRect.x - bRect.x : aRect.y - bRect.y;
      if (primary !== 0) return primary;
      const secondary = horizontal ? aRect.y - bRect.y : aRect.x - bRect.x;
      if (secondary !== 0) return secondary;
    }
    return (
      (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) ||
      selectionIndex.get(a)! - selectionIndex.get(b)!
    );
  });

  const descendantIds = new Set<string>();
  for (const record of records) {
    descendantIds.add(record.item.id);
    if (record.group) collectChildren(doc, record.group.id, descendantIds);
  }

  const geometry = [...descendantIds].map((id) => layoutById.get(id)).filter((rect): rect is Rect => Boolean(rect));
  if (geometry.length !== descendantIds.size || geometry.length === 0) return null;

  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const sourceView = getDefaultView(doc);
  for (const id of descendantIds) {
    const rect = layoutById.get(id)!;
    const existing = sourceView.places[id] ?? {};
    const isGroup = doc.groups.some((group) => group.id === id);
    view.places[id] = isGroup
      ? {
          ...existing,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
          pin: true,
          manual: true,
        }
      : {
          ...existing,
          x: rect.x,
          y: rect.y,
          pin: true,
          manual: true,
        };
  }

  // If one selected sibling group already encloses every other selected item,
  // treat that boundary as the intended parent.
  const enclosingGroup = records
    .filter((record): record is typeof record & { group: NonNullable<typeof record.group> } => Boolean(record.group))
    .filter((record) => {
      const outer = layoutById.get(record.group.id)!;
      return records.every(
        (candidate) =>
          candidate.item.id === record.group.id || rectContainsRect(outer, layoutById.get(candidate.item.id)!),
      );
    })
    .sort((a, b) => {
      const aBounds = layoutById.get(a.group.id)!;
      const bBounds = layoutById.get(b.group.id)!;
      return aBounds.w * aBounds.h - bBounds.w * bBounds.h;
    })[0];

  if (enclosingGroup) {
    const destinationId = enclosingGroup.group.id;
    const adoptedIds = selectedIds.filter((id) => id !== destinationId);
    for (const candidate of next.groups) {
      candidate.children = candidate.children.filter((id) => !adoptedIds.includes(id));
      candidate.borderChildren = candidate.borderChildren?.filter((child) => !adoptedIds.includes(child.id));
    }
    const destination = next.groups.find((group) => group.id === destinationId)!;
    destination.children = [...destination.children.filter((id) => !adoptedIds.includes(id)), ...adoptedIds];
    for (const record of records) {
      if (record.item.id === destinationId) continue;
      if (record.group) next.groups.find((group) => group.id === record.group!.id)!.parent = destinationId;
      else next.resources.find((resource) => resource.id === record.resource!.id)!.parent = destinationId;
    }
    return { doc: next, id: destinationId };
  }

  const groupId = uniqueId(next, label.trim() || "Group");
  const minX = Math.min(...geometry.map((rect) => rect.x));
  const minY = Math.min(...geometry.map((rect) => rect.y));
  const maxX = Math.max(...geometry.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...geometry.map((rect) => rect.y + rect.h));
  const groupRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const style = GROUP_STYLES.logical;
  const boundary: Rect = {
    x: groupRect.x - style.padding,
    y: groupRect.y - style.headerHeight - style.padding,
    w: groupRect.w + style.padding * 2,
    h: groupRect.h + style.headerHeight + style.padding * 2,
  };

  for (const candidate of next.groups) {
    candidate.children = candidate.children.filter((id) => !selectedIds.includes(id));
    candidate.borderChildren = candidate.borderChildren?.filter((child) => !selectedIds.includes(child.id));
  }
  const destination = parentId ? next.groups.find((group) => group.id === parentId) : undefined;
  if (destination) {
    const ordinaryIndices = parent!.children
      .map((id, index) => (selectedIds.includes(id) ? index : -1))
      .filter((index) => index >= 0);
    const insertionIndex = ordinaryIndices.length ? Math.min(...ordinaryIndices) : destination.children.length;
    destination.children.splice(Math.min(insertionIndex, destination.children.length), 0, groupId);
  }

  for (const record of records) {
    if (record.group) next.groups.find((group) => group.id === record.group!.id)!.parent = groupId;
    else next.resources.find((resource) => resource.id === record.resource!.id)!.parent = groupId;
  }
  const newGroup = {
    id: groupId,
    kind: "logical" as const,
    label: label.trim() || "Group",
    parent: parentId,
    children: selectedIds,
  };
  const groupInsertIndex = parentId
    ? next.groups.length
    : Math.min(
        ...selectedIds.map((id) => doc.groups.findIndex((group) => group.id === id)).filter((index) => index >= 0),
        next.groups.length,
      );
  next.groups.splice(groupInsertIndex, 0, newGroup);
  view.places[groupId] = {
    x: boundary.x,
    y: boundary.y,
    w: boundary.w,
    h: boundary.h,
    pin: true,
    manual: true,
  };
  return { doc: next, id: groupId };
}

/** Return whether a selection can be grouped or adopted by an enclosing group. */
export function canGroupSelection(doc: DiagramDocument, selection: Selection): boolean {
  return normalizeGroupingSelection(doc, selection) !== null;
}

function projectGroupingCandidates(doc: DiagramDocument, selection: Selection): SelectionItem[] {
  const candidates: SelectionItem[] = [];
  const seen = new Set<string>();
  for (const item of selection) {
    if (item.kind !== "resource" && item.kind !== "group") continue;
    if (!item.id) continue;
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    const resource = item.kind === "resource" ? doc.resources.find((candidate) => candidate.id === item.id) : undefined;
    const group = item.kind === "group" ? doc.groups.find((candidate) => candidate.id === item.id) : undefined;
    if (!resource && !group) continue;
    seen.add(key);
    candidates.push(item);
  }
  if (candidates.length < 2) return [];
  const selectedGroups = new Set(candidates.filter((item) => item.kind === "group").map((item) => item.id));
  return candidates.filter((item) => !hasSelectedGroupAncestor(doc, item.id, selectedGroups));
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

function normalizeGroupingSelection(doc: DiagramDocument, selection: Selection): SelectionItem[] | null {
  const normalized = projectGroupingCandidates(doc, selection);
  if (normalized.length < 2) return null;
  const ids = normalized.map((item) => item.id);
  if (new Set(ids).size !== ids.length) return null;
  const records = normalized.map((item) => {
    const resource = item.kind === "resource" ? doc.resources.find((candidate) => candidate.id === item.id) : undefined;
    const group = item.kind === "group" ? doc.groups.find((candidate) => candidate.id === item.id) : undefined;
    return { item, resource, group, parent: resource?.parent ?? group?.parent };
  });
  if (records.some((record) => !record.resource && !record.group)) return null;
  const parentId = records[0]!.parent;
  if (records.some((record) => record.parent !== parentId)) return null;
  if (parentId && !doc.groups.some((group) => group.id === parentId)) return null;
  return normalized;
}

/** Remove a group's boundary while promoting its direct members. */
export function ungroup(
  doc: DiagramDocument,
  groupId: string,
  layout?: LayoutResult,
): { doc: DiagramDocument; selection: Selection } {
  const group = doc.groups.find((candidate) => candidate.id === groupId);
  if (!group) return { doc, selection: [] };

  const parentId =
    group.parent && doc.groups.some((candidate) => candidate.id === group.parent) ? group.parent : undefined;
  const originalParent = parentId ? doc.groups.find((candidate) => candidate.id === parentId) : undefined;
  const parentChildIndex = originalParent?.children.indexOf(groupId) ?? -1;
  const parentBorderIndex = originalParent?.borderChildren?.findIndex((child) => child.id === groupId) ?? -1;
  const borderChildren = new Map<string, Side>();
  for (const child of group.borderChildren ?? []) borderChildren.set(child.id, child.side);
  const ordinaryChildren = [...new Set(group.children)].filter((id) => !borderChildren.has(id));

  const listedIds = new Set([...ordinaryChildren, ...borderChildren.keys()]);
  const inferredChildren = [
    ...doc.groups
      .filter((candidate) => candidate.parent === groupId && !listedIds.has(candidate.id))
      .map((candidate) => candidate.id),
    ...doc.resources
      .filter((candidate) => candidate.parent === groupId && !listedIds.has(candidate.id))
      .map((candidate) => candidate.id),
  ];
  const promotedIds = [...ordinaryChildren, ...borderChildren.keys(), ...inferredChildren];
  const next = cloneDocument(doc);

  if (layout) {
    const view = getDefaultView(next);
    const sourceView = getDefaultView(doc);
    const pinnedIds = collectDescendantIds(doc, groupId);
    const layoutById = new Map<string, Rect>();
    for (const candidate of layout.groups) layoutById.set(candidate.id, candidate.bounds);
    for (const node of layout.nodes) layoutById.set(node.id, node.obstacle);
    for (const id of pinnedIds) {
      const rect = layoutById.get(id);
      if (!rect) continue;
      const existing = sourceView.places[id] ?? {};
      const isGroup = doc.groups.some((candidate) => candidate.id === id);
      view.places[id] = isGroup
        ? { ...existing, x: rect.x, y: rect.y, w: rect.w, h: rect.h, pin: true, manual: true }
        : { ...existing, x: rect.x, y: rect.y, pin: true, manual: true };
    }
  }

  for (const candidate of next.groups) {
    candidate.children = candidate.children.filter((childId) => childId !== groupId && !promotedIds.includes(childId));
    candidate.borderChildren = candidate.borderChildren?.filter(
      (child) => child.id !== groupId && !promotedIds.includes(child.id),
    );
    candidate.overlayTargets = candidate.overlayTargets?.filter((id) => id !== groupId);
  }

  const destination = parentId ? next.groups.find((candidate) => candidate.id === parentId) : undefined;
  const validPromotedIds: string[] = [];
  for (const childId of promotedIds) {
    const childGroup = next.groups.find((candidate) => candidate.id === childId);
    const childResource = next.resources.find((candidate) => candidate.id === childId);
    if (!childGroup && !childResource) continue;
    if (childGroup) {
      if (parentId) childGroup.parent = parentId;
      else delete childGroup.parent;
    }
    if (childResource) {
      if (parentId) childResource.parent = parentId;
      else delete childResource.parent;
    }
    validPromotedIds.push(childId);
  }
  if (destination) {
    const promotedOrdinary = validPromotedIds.filter(
      (id) => ordinaryChildren.includes(id) || inferredChildren.includes(id),
    );
    const childIndex =
      parentChildIndex >= 0 ? Math.min(parentChildIndex, destination.children.length) : destination.children.length;
    destination.children.splice(childIndex, 0, ...promotedOrdinary);
    const promotedBorders = validPromotedIds
      .filter((id) => borderChildren.has(id))
      .map((id) => ({ id, side: borderChildren.get(id)! }));
    if (promotedBorders.length > 0) {
      const borderIndex =
        parentBorderIndex >= 0
          ? Math.min(parentBorderIndex, destination.borderChildren?.length ?? 0)
          : (destination.borderChildren?.length ?? 0);
      const currentBorders = destination.borderChildren ?? [];
      currentBorders.splice(borderIndex, 0, ...promotedBorders);
      destination.borderChildren = currentBorders;
    }
  }

  const retainedGroup = next.groups.find((candidate) => candidate.id === groupId);
  if (retainedGroup) {
    retainedGroup.children = [];
    retainedGroup.borderChildren = [];
    retainedGroup.overlayTargets = retainedGroup.overlayTargets?.filter((id) => !promotedIds.includes(id));
    if (destination) {
      if (parentBorderIndex >= 0) {
        const borders = destination.borderChildren ?? [];
        if (!borders.some((child) => child.id === groupId)) {
          borders.splice(Math.min(parentBorderIndex, borders.length), 0, {
            id: groupId,
            side: borderChildren.get(groupId) ?? "n",
          });
          destination.borderChildren = borders;
        }
      } else if (!destination.children.includes(groupId)) {
        destination.children.splice(
          parentChildIndex >= 0 ? Math.min(parentChildIndex, destination.children.length) : destination.children.length,
          0,
          groupId,
        );
      }
    }
  }
  for (const resource of next.resources) {
    if (resource.parent === groupId) delete resource.parent;
  }
  for (const candidate of next.groups) {
    if (candidate.parent === groupId) delete candidate.parent;
  }

  const selection: Selection = validPromotedIds.map((id) =>
    next.groups.some((candidate) => candidate.id === id)
      ? { kind: "group" as const, id }
      : { kind: "resource" as const, id },
  );
  return { doc: next, selection };
}

function collectDescendantIds(doc: DiagramDocument, groupId: string): Set<string> {
  const ids = new Set<string>([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of doc.groups) {
      if (group.parent && ids.has(group.parent) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    }
    for (const resource of doc.resources) {
      if (resource.parent && ids.has(resource.parent) && !ids.has(resource.id)) {
        ids.add(resource.id);
        changed = true;
      }
    }
    for (const id of [...ids]) {
      const group = doc.groups.find((candidate) => candidate.id === id);
      if (!group) continue;
      for (const childId of group.children) {
        if (!ids.has(childId)) {
          ids.add(childId);
          changed = true;
        }
      }
      for (const child of group.borderChildren ?? []) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          changed = true;
        }
      }
    }
  }
  return ids;
}

function isDescendant(doc: DiagramDocument, ancestorId: string, candidateId: string): boolean {
  let current = doc.groups.find((group) => group.id === candidateId);
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    if (current.parent === ancestorId) return true;
    seen.add(current.id);
    current = doc.groups.find((group) => group.id === current!.parent);
  }
  const descendants = new Set<string>();
  collectChildren(doc, ancestorId, descendants);
  return descendants.has(candidateId);
}

function rectContainsRect(outer: Rect, inner: Rect, tolerance = 0.001): boolean {
  return (
    outer.x <= inner.x + tolerance &&
    outer.y <= inner.y + tolerance &&
    outer.x + outer.w >= inner.x + inner.w - tolerance &&
    outer.y + outer.h >= inner.y + inner.h - tolerance
  );
}
