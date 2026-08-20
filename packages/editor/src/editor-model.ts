import type {
  DiagramDocument,
  DiagramAsset,
  Edge,
  EdgeBadgeSide,
  EdgeKind,
  EdgeStyle,
  GroupKind,
  LayoutResult,
  PlaceOverride,
  Point,
  Rect,
  ResourceRole,
  Side,
} from "@dumb-diagrams/core";
import { getDefaultView } from "@dumb-diagrams/core";
import { getCatalogEntry, type CatalogEntry } from "@dumb-diagrams/catalog";
import { sanitizeSvg } from "@dumb-diagrams/render";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/route";

import { snapCoordinate } from "./grid.js";

export type SelectionKind = "resource" | "group" | "edge" | "annotation";

export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export type Selection = SelectionItem[];

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

export function canPlaceCatalogEntry(
  doc: DiagramDocument,
  entry: CatalogEntry,
  parentId?: string,
): PlacementCheck {
  if (!parentId) {
    return entry.allowRoot
      ? { ok: true }
      : { ok: false, reason: `${entry.name} must be placed inside a compatible group.` };
  }
  const parent = doc.groups.find((candidate) => candidate.id === parentId);
  if (!parent) return { ok: false, reason: "The selected parent group no longer exists." };
  if (!entry.allowedParents.includes(parent.kind)) {
    return {
      ok: false,
      reason: `${entry.name} cannot be placed inside a ${parent.kind} group.`,
    };
  }
  return { ok: true };
}

export function isSelected(
  selection: Selection,
  kind: SelectionKind,
  id: string,
): boolean {
  return selection.some((item) => item.kind === kind && item.id === id);
}

export function primarySelection(selection: Selection): SelectionItem | null {
  return selection[0] ?? null;
}

export function toggleSelectionItem(
  selection: Selection,
  item: SelectionItem,
  additive: boolean,
): Selection {
  const exists = isSelected(selection, item.kind, item.id);
  if (!additive) return exists ? selection : [item];
  if (exists) {
    const next = selection.filter(
      (candidate) => !(candidate.kind === item.kind && candidate.id === item.id),
    );
    return next;
  }
  return [...selection, item];
}

export function setTitle(doc: DiagramDocument, title: string): DiagramDocument {
  const next = cloneDocument(doc);
  next.title = title.trim() || undefined;
  return next;
}

export function setPlace(
  doc: DiagramDocument,
  id: string,
  x: number,
  y: number,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const place = view.places[id] ?? {};
  if (place.locked) return doc;
  view.places[id] = {
    ...place,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    pin: true,
  };
  return next;
}

export const MAX_SVG_BYTES = 256 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 2 * 1024 * 1024;

export type ResourceIconSize = "normal" | "small";

export function resourceIconSize(resource: { role: ResourceRole }): ResourceIconSize {
  return resource.role === "secondary" ? "small" : "normal";
}

export function setResourceIconSize(
  doc: DiagramDocument,
  id: string,
  size: ResourceIconSize,
): DiagramDocument {
  const next = cloneDocument(doc);
  const resource = next.resources.find((candidate) => candidate.id === id);
  if (!resource) return doc;
  resource.role = size === "small" ? "secondary" : "primary";
  const view = getDefaultView(next);
  const place = view.places[id];
  if (place) {
    delete place.w;
    delete place.h;
  }
  return next;
}

export function setSize(
  doc: DiagramDocument,
  id: string,
  w: number,
  h: number,
  options: { unlockAspect?: boolean } = {},
): DiagramDocument {
  const next = cloneDocument(doc);
  if (next.resources.some((candidate) => candidate.id === id)) {
    return doc;
  }
  const view = getDefaultView(next);
  const place = view.places[id] ?? {};
  if (place.locked) return doc;

  let nextW = Math.max(32, Math.round(w));
  let nextH = Math.max(32, Math.round(h));

  if (!options.unlockAspect) {
    const resource = next.resources.find((candidate) => candidate.id === id);
    const assetId = resource?.props.iconAsset as string | undefined;
    if (assetId) {
      const asset = next.assets?.find((candidate) => candidate.id === assetId);
      if (asset?.intrinsicW && asset.intrinsicH) {
        const ratio = asset.intrinsicW / asset.intrinsicH;
        const prevW = place.w ?? nextW;
        const prevH = place.h ?? nextH;
        const dw = Math.abs(nextW - prevW);
        const dh = Math.abs(nextH - prevH);
        if (dw >= dh) nextH = Math.max(32, Math.round(nextW / ratio));
        else nextW = Math.max(32, Math.round(nextH * ratio));
      }
    }
  }

  view.places[id] = {
    ...place,
    w: nextW,
    h: nextH,
    pin: true,
  };
  return next;
}

export function setGroupPlace(
  doc: DiagramDocument,
  id: string,
  x: number,
  y: number,
  dx: number,
  dy: number,
): DiagramDocument {
  const view = getDefaultView(doc);
  const wasPinned = Boolean(view.places[id]?.pin);
  const next = setPlace(doc, id, x, y);
  if (!wasPinned || (dx === 0 && dy === 0)) return next;

  const descendants = new Set<string>();
  collectChildren(next, id, descendants);
  const movedView = getDefaultView(next);
  for (const childId of descendants) {
    const place = movedView.places[childId];
    if (!place || place.locked || place.x === undefined || place.y === undefined) {
      continue;
    }
    place.x = Math.max(0, Math.round(place.x + dx));
    place.y = Math.max(0, Math.round(place.y + dy));
  }
  return next;
}

/** Move a complete selection once, including nested descendants. */
export function moveSelection(
  doc: DiagramDocument,
  selection: Selection,
  dx: number,
  dy: number,
  layout?: LayoutResult,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const selectedGroups = new Set(
    selection.filter((item) => item.kind === "group").map((item) => item.id),
  );
  const moving = new Set<string>();

  for (const item of selection) {
    if (item.kind === "group") {
      let parent = next.groups.find((group) => group.id === item.id)?.parent;
      let nested = false;
      while (parent) {
        if (selectedGroups.has(parent)) {
          nested = true;
          break;
        }
        parent = next.groups.find((group) => group.id === parent)?.parent;
      }
      if (!nested) collectChildren(next, item.id, moving);
      moving.add(item.id);
    } else if (item.kind === "resource") {
      const resource = next.resources.find((candidate) => candidate.id === item.id);
      let parent = resource?.parent;
      let nested = false;
      while (parent) {
        if (selectedGroups.has(parent)) {
          nested = true;
          break;
        }
        parent = next.groups.find((group) => group.id === parent)?.parent;
      }
      if (!nested) moving.add(item.id);
    } else if (item.kind === "annotation") {
      moving.add(item.id);
    }
  }

  for (const id of moving) {
    const group = next.groups.find((candidate) => candidate.id === id);
    const resource = next.resources.find((candidate) => candidate.id === id);
    if (group || resource) {
      const place = view.places[id] ?? {};
      if (place.locked) continue;
      const bounds = group
        ? layout?.groups.find((candidate) => candidate.id === id)?.bounds
        : layout?.nodes.find((candidate) => candidate.id === id)?.obstacle;
      view.places[id] = {
        ...place,
        x: Math.max(0, Math.round((place.x ?? bounds?.x ?? 0) + dx)),
        y: Math.max(0, Math.round((place.y ?? bounds?.y ?? 0) + dy)),
        pin: true,
      };
      continue;
    }
    const annotation = next.annotations.find((candidate) => candidate.id === id);
    if (annotation) {
      const place = view.annotations?.[id] ?? {};
      if (place.locked) continue;
      if (!view.annotations) view.annotations = {};
      view.annotations[id] = {
        ...place,
        x: Math.max(0, Math.round((place.x ?? 0) + dx)),
        y: Math.max(0, Math.round((place.y ?? 0) + dy)),
        pin: true,
      };
    }
  }
  return next;
}

function placeableIds(doc: DiagramDocument): string[] {
  return [
    ...doc.groups.map((group) => group.id),
    ...doc.resources.map((resource) => resource.id),
    ...doc.edges.map((edge) => edge.id),
    ...doc.annotations.map((annotation) => annotation.id),
  ];
}

function zIndexFor(doc: DiagramDocument, id: string): number {
  const view = getDefaultView(doc);
  return view.places[id]?.zIndex ?? view.annotations?.[id]?.zIndex ?? 0;
}

function setZIndex(doc: DiagramDocument, id: string, zIndex: number): void {
  const view = getDefaultView(doc);
  if (doc.annotations.some((annotation) => annotation.id === id)) {
    if (!view.annotations) view.annotations = {};
    view.annotations[id] = { ...view.annotations[id], zIndex };
  } else {
    view.places[id] = { ...view.places[id], zIndex };
  }
}

export function sendToFront(doc: DiagramDocument, id: string): DiagramDocument {
  const ids = placeableIds(doc);
  if (!ids.includes(id)) return doc;
  const maxZ = Math.max(0, ...ids.map((itemId) => zIndexFor(doc, itemId)));
  const next = cloneDocument(doc);
  setZIndex(next, id, maxZ + 1);
  return next;
}

export function sendToBack(doc: DiagramDocument, id: string): DiagramDocument {
  const ids = placeableIds(doc);
  if (!ids.includes(id)) return doc;
  const minZ = Math.min(0, ...ids.map((itemId) => zIndexFor(doc, itemId)));
  const next = cloneDocument(doc);
  setZIndex(next, id, minZ - 1);
  return next;
}

export function nudgeSelection(
  doc: DiagramDocument,
  selection: Selection,
  dx: number,
  dy: number,
  options: { snapToGrid?: boolean } = {},
): DiagramDocument {
  let next = doc;
  for (const item of selection) {
    if (item.kind === "resource" || item.kind === "group") {
      const view = getDefaultView(next);
      const place = view.places[item.id];
      if (!place || place.locked) continue;
      const previousX = place.x ?? 0;
      const previousY = place.y ?? 0;
      const x = Math.max(0, snapCoordinate(previousX + dx, Boolean(options.snapToGrid)));
      const y = Math.max(0, snapCoordinate(previousY + dy, Boolean(options.snapToGrid)));
      const actualDx = x - previousX;
      const actualDy = y - previousY;
      next =
        item.kind === "group"
          ? setGroupPlace(next, item.id, x, y, actualDx, actualDy)
          : setPlace(next, item.id, x, y);
    }
    if (item.kind === "annotation") {
      const view = getDefaultView(next);
      const place = view.annotations?.[item.id];
      if (!place || place.locked) continue;
      if (!view.annotations) view.annotations = {};
      const x = Math.max(
        0,
        snapCoordinate((place.x ?? 0) + dx, Boolean(options.snapToGrid)),
      );
      const y = Math.max(
        0,
        snapCoordinate((place.y ?? 0) + dy, Boolean(options.snapToGrid)),
      );
      view.annotations[item.id] = {
        ...place,
        x: Math.round(x),
        y: Math.round(y),
        pin: true,
      };
    }
  }
  return next;
}

export function setRoute(
  doc: DiagramDocument,
  edgeId: string,
  points: Point[],
  mode: "auto" | "manual" = "manual",
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const existing = view.routes[edgeId];
  const normalized = normalizeOrthogonalRoute(points);
  view.routes[edgeId] = {
    ...existing,
    waypoints: normalized.slice(1, -1).map((point) => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
    })),
    points: normalized.map((point) => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
    })),
    pin: true,
    mode,
  };
  return next;
}

export function setEdgeBadgePosition(
  doc: DiagramDocument,
  edgeId: string,
  t: number,
  side: EdgeBadgeSide,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const current = view.routes[edgeId] ?? {};
  view.routes[edgeId] = {
    ...current,
    badgeT: Math.max(0, Math.min(1, t)),
    badgeSide: side,
  };
  return next;
}

export function clearRoute(
  doc: DiagramDocument,
  edgeId: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const existing = view.routes[edgeId];
  if (existing?.badgeT !== undefined || existing?.badgeSide !== undefined) {
    view.routes[edgeId] = {
      badgeT: existing.badgeT,
      badgeSide: existing.badgeSide,
    };
  } else {
    delete view.routes[edgeId];
  }
  return next;
}

export function reconnectEdge(
  doc: DiagramDocument,
  edgeId: string,
  patch: Partial<Pick<Edge, "source" | "target" | "sourcePort" | "targetPort">>,
): DiagramDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return doc;
  Object.assign(edge, patch);
  delete getDefaultView(next).routes[edgeId];
  return next;
}

export function swapEdgeDirection(
  doc: DiagramDocument,
  edgeId: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return doc;
  const prevSource = edge.source;
  const prevTarget = edge.target;
  const prevSourcePort = edge.sourcePort;
  const prevTargetPort = edge.targetPort;
  edge.source = prevTarget;
  edge.target = prevSource;
  edge.sourcePort = prevTargetPort;
  edge.targetPort = prevSourcePort;
  delete getDefaultView(next).routes[edgeId];
  return next;
}

export function clearView(doc: DiagramDocument): DiagramDocument {
  const next = cloneDocument(doc);
  for (const view of next.views) {
    view.places = Object.fromEntries(
      Object.entries(view.places).map(([id, place]) => [
        id,
        {
          locked: place.locked,
          visible: place.visible,
          zIndex: place.zIndex,
        },
      ]),
    );
    view.routes = {};
    // Notes keep their authored position, visibility, and lock state when
    // automatic layout is recalculated.
    view.annotations = view.annotations
      ? Object.fromEntries(
          Object.entries(view.annotations).map(([id, place]) => [id, { ...place }]),
        )
      : undefined;
  }
  return next;
}

export function renameResource(
  doc: DiagramDocument,
  id: string,
  label: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const resource = next.resources.find((candidate) => candidate.id === id);
  if (!resource) return doc;
  resource.label = { ...resource.label, role: label };
  return next;
}

export function renameGroup(
  doc: DiagramDocument,
  id: string,
  label: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.label = label;
  return next;
}

export function renameEdge(
  doc: DiagramDocument,
  id: string,
  label: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === id);
  if (!edge) return doc;
  edge.label = label || undefined;
  return next;
}

export function setLocked(
  doc: DiagramDocument,
  kind: "resource" | "group" | "edge" | "annotation",
  id: string,
  locked: boolean,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  if (kind === "annotation") {
    if (!view.annotations) view.annotations = {};
    view.annotations[id] = { ...view.annotations[id], locked };
    return next;
  }
  view.places[id] = { ...view.places[id], locked };
  return next;
}

export function setVisible(
  doc: DiagramDocument,
  kind: "resource" | "group" | "edge" | "annotation",
  id: string,
  visible: boolean,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  if (kind === "annotation") {
    if (!view.annotations) view.annotations = {};
    view.annotations[id] = { ...view.annotations[id], visible };
    return next;
  }
  view.places[id] = { ...view.places[id], visible };
  return next;
}

export function addResource(
  doc: DiagramDocument,
  entry: CatalogEntry,
  parent: string | undefined,
  at: Point,
): { doc: DiagramDocument; id: string } {
  const check = canPlaceCatalogEntry(doc, entry, parent);
  if (!check.ok) throw new Error(check.reason);
  const next = cloneDocument(doc);
  const id = uniqueId(next, entry.type.split(".").at(-1) ?? "resource");
  next.resources.push({
    id,
    type: entry.type,
    parent,
    label: { service: entry.serviceName },
    role: "primary",
    props: {},
  });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
  };
  return { doc: next, id };
}

export function addGroup(
  doc: DiagramDocument,
  kind: GroupKind,
  label: string,
  parent: string | undefined,
  at: Point,
  type?: string,
): { doc: DiagramDocument; id: string } {
  const entry = type ? getCatalogEntry(type) : undefined;
  if (entry) {
    if (entry.assetKind !== "group") throw new Error(`${entry.name} is not a group.`);
    if (entry.groupKind && entry.groupKind !== kind) {
      throw new Error(`${entry.name} does not support the ${kind} group kind.`);
    }
    const check = canPlaceCatalogEntry(doc, entry, parent);
    if (!check.ok) throw new Error(check.reason);
  }
  const next = cloneDocument(doc);
  const id = uniqueId(next, kind.replace("subnet-", "subnet"));
  next.groups.push({ id, kind, type, label, parent, children: [] });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
  };
  return { doc: next, id };
}

export function addAnnotation(
  doc: DiagramDocument,
  text: string,
  at: Point,
  anchor?: string,
): { doc: DiagramDocument; id: string } {
  const next = cloneDocument(doc);
  const id = uniqueId(next, "note");
  next.annotations.push({ id, text, anchor });
  const view = getDefaultView(next);
  if (!view.annotations) view.annotations = {};
  view.annotations[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: 160,
    h: 48,
    pin: true,
  };
  return { doc: next, id };
}

export function setAnnotationPlace(
  doc: DiagramDocument,
  id: string,
  x: number,
  y: number,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  if (!view.annotations) view.annotations = {};
  const place = view.annotations[id] ?? {};
  if (place.locked) return doc;
  view.annotations[id] = {
    ...place,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    pin: true,
  };
  return next;
}

export function updateAnnotationText(
  doc: DiagramDocument,
  id: string,
  text: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const annotation = next.annotations.find((candidate) => candidate.id === id);
  if (!annotation) return doc;
  annotation.text = text;
  return next;
}

export function importSvgAsset(
  doc: DiagramDocument,
  rawSvg: string,
): { doc: DiagramDocument; assetId: string } {
  if (rawSvg.length > MAX_SVG_BYTES) {
    throw new Error(`SVG exceeds ${Math.round(MAX_SVG_BYTES / 1024)}KB limit`);
  }
  const sanitized = sanitizeSvg(rawSvg);
  const next = cloneDocument(doc);
  if (!next.assets) next.assets = [];
  const totalBytes = next.assets.reduce((sum, asset) => sum + asset.content.length, 0);
  if (totalBytes + sanitized.content.length > MAX_TOTAL_ASSET_BYTES) {
    throw new Error("Total embedded asset size limit reached");
  }
  const existing = next.assets.find((asset) => asset.hash === sanitized.hash);
  if (existing) return { doc: next, assetId: existing.id };
  const id = uniqueId(next, "icon");
  const asset: DiagramAsset = {
    id,
    kind: "svg",
    content: sanitized.content,
    intrinsicW: sanitized.intrinsicW,
    intrinsicH: sanitized.intrinsicH,
    hash: sanitized.hash,
  };
  next.assets.push(asset);
  return { doc: next, assetId: id };
}

export function addCustomResource(
  doc: DiagramDocument,
  assetId: string,
  label: string,
  parent: string | undefined,
  at: Point,
): { doc: DiagramDocument; id: string } {
  const entry = getCatalogEntry("generic.custom");
  if (entry) {
    const check = canPlaceCatalogEntry(doc, entry, parent);
    if (!check.ok) throw new Error(check.reason);
  }
  const next = cloneDocument(doc);
  const id = uniqueId(next, "custom");
  next.resources.push({
    id,
    type: "generic.custom",
    parent,
    label: { role: label },
    role: "primary",
    props: { iconAsset: assetId },
  });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
  };
  return { doc: next, id };
}

export function addEdge(
  doc: DiagramDocument,
  source: string,
  target: string,
  sourcePort?: Side,
  targetPort?: Side,
): { doc: DiagramDocument; id: string } {
  const next = cloneDocument(doc);
  const id = uniqueId(next, `${source}-${target}`);
  next.edges.push({
    id,
    source,
    target,
    sourcePort,
    targetPort,
    style: "solid",
    kind: "flow",
  });
  return { doc: next, id };
}

export function updateEdge(
  doc: DiagramDocument,
  id: string,
  patch: Partial<
    Pick<Edge, "sourcePort" | "targetPort" | "style" | "kind" | "label" | "step">
  >,
): DiagramDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === id);
  if (edge) Object.assign(edge, patch);
  return next;
}

export function duplicateSelection(
  doc: DiagramDocument,
  selection: Selection,
): { doc: DiagramDocument; selection: Selection } {
  const view = getDefaultView(doc);
  const first = selection
    .map((item) => item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id])
    .find(Boolean);
  return pasteClipboard(doc, serializeClipboard(doc, selection), {
    x: (first?.x ?? 0) + 24,
    y: (first?.y ?? 0) + 24,
  });
}

export function deleteSelection(
  doc: DiagramDocument,
  selection: Selection,
): DiagramDocument {
  let next = doc;
  for (const item of selection) {
    next = deleteOne(next, item);
  }
  return next;
}

function deleteOne(
  doc: DiagramDocument,
  selection: SelectionItem,
): DiagramDocument {
  const next = cloneDocument(doc);
  if (selection.kind === "edge") {
    next.edges = next.edges.filter((edge) => edge.id !== selection.id);
    for (const view of next.views) delete view.routes[selection.id];
    return next;
  }
  if (selection.kind === "annotation") {
    next.annotations = next.annotations.filter(
      (annotation) => annotation.id !== selection.id,
    );
    for (const view of next.views) delete view.annotations?.[selection.id];
    return next;
  }

  const ids = new Set([selection.id]);
  if (selection.kind === "group") collectChildren(next, selection.id, ids);
  next.resources = next.resources.filter((resource) => !ids.has(resource.id));
  next.groups = next.groups
    .filter((group) => !ids.has(group.id))
    .map((group) => ({
      ...group,
      children: group.children.filter((id) => !ids.has(id)),
      borderChildren: group.borderChildren?.filter((child) => !ids.has(child.id)),
      overlayTargets: group.overlayTargets?.filter((id) => !ids.has(id)),
    }));
  next.edges = next.edges.filter(
    (edge) => !ids.has(edge.source) && !ids.has(edge.target),
  );
  for (const view of next.views) {
    for (const id of ids) delete view.places[id];
    for (const id of ids) delete view.annotations?.[id];
  }
  return next;
}

export function alignSelection(
  doc: DiagramDocument,
  selection: Selection,
  layout: LayoutResult,
  axis: "left" | "center" | "right" | "top" | "middle" | "bottom",
): DiagramDocument {
  const rects = selection
    .map((item) => boundsFor(item, layout, doc))
    .filter((rect): rect is Rect => Boolean(rect));
  if (rects.length < 2) return doc;
  let next = doc;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  for (const item of selection) {
    const rect = boundsFor(item, layout, doc);
    if (!rect) continue;
    let x = rect.x;
    let y = rect.y;
    if (axis === "left") x = minX;
    if (axis === "center") x = Math.round(midX - rect.w / 2);
    if (axis === "right") x = maxX - rect.w;
    if (axis === "top") y = minY;
    if (axis === "middle") y = Math.round(midY - rect.h / 2);
    if (axis === "bottom") y = maxY - rect.h;
    if (item.kind === "group") {
      const place = getDefaultView(doc).places[item.id];
      const dx = x - (place?.x ?? rect.x);
      const dy = y - (place?.y ?? rect.y);
      next = setGroupPlace(next, item.id, x, y, dx, dy);
    } else if (item.kind === "resource") {
      next = setPlace(next, item.id, x, y);
    }
  }
  return next;
}

export function distributeSelection(
  doc: DiagramDocument,
  selection: Selection,
  layout: LayoutResult,
  axis: "horizontal" | "vertical",
): DiagramDocument {
  const items = selection
    .map((item) => ({ item, rect: boundsFor(item, layout, doc) }))
    .filter((entry): entry is { item: SelectionItem; rect: Rect } =>
      Boolean(entry.rect),
    );
  if (items.length < 3) return doc;
  items.sort((a, b) =>
    axis === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
  );
  const first = items[0]!.rect;
  const last = items.at(-1)!.rect;
  const span =
    axis === "horizontal"
      ? last.x + last.w - first.x
      : last.y + last.h - first.y;
  const totalSize = items.reduce(
    (sum, entry) => sum + (axis === "horizontal" ? entry.rect.w : entry.rect.h),
    0,
  );
  const gap = (span - totalSize) / (items.length - 1);
  let cursor = axis === "horizontal" ? first.x : first.y;
  let next = doc;
  for (const entry of items) {
    const x = axis === "horizontal" ? cursor : entry.rect.x;
    const y = axis === "vertical" ? cursor : entry.rect.y;
    if (entry.item.kind === "group") {
      const place = getDefaultView(doc).places[entry.item.id];
      const dx = x - (place?.x ?? entry.rect.x);
      const dy = y - (place?.y ?? entry.rect.y);
      next = setGroupPlace(next, entry.item.id, x, y, dx, dy);
    } else if (entry.item.kind === "resource") {
      next = setPlace(next, entry.item.id, x, y);
    }
    cursor += (axis === "horizontal" ? entry.rect.w : entry.rect.h) + gap;
  }
  return next;
}

export function serializeClipboard(doc: DiagramDocument, selection: Selection): string {
  const included = new Set<string>();
  const selectedEdges = new Set<string>();
  const selectedAnnotations = new Set<string>();
  for (const item of selection) {
    if (item.kind === "edge") selectedEdges.add(item.id);
    else if (item.kind === "annotation") selectedAnnotations.add(item.id);
    else {
      included.add(item.id);
      if (item.kind === "group") collectChildren(doc, item.id, included);
    }
  }
  const groupById = new Map(doc.groups.map((group) => [group.id, group]));
  const copiedGroupIds = new Set(
    doc.groups.filter((group) => included.has(group.id)).map((group) => group.id),
  );
  const parentIds = [
    ...doc.resources
      .filter((resource) => included.has(resource.id))
      .map((resource) => resource.parent),
    ...doc.groups
      .filter((group) => included.has(group.id))
      .map((group) => group.parent),
  ];
  for (const parentId of parentIds) {
    let currentId = parentId;
    while (currentId) {
      const parent = groupById.get(currentId);
      if (!parent) break;
      copiedGroupIds.add(parent.id);
      currentId = parent.parent;
    }
  }
  const copiedResources = doc.resources.filter((resource) => included.has(resource.id));
  const copiedGroups = doc.groups
    .filter((group) => copiedGroupIds.has(group.id))
    .map((group) => ({
      ...group,
      // Ancestor groups are copied as minimal shells so nested resources and
      // groups keep a valid hierarchy when pasted into the document.
      children: group.children.filter(
        (childId) => included.has(childId) || copiedGroupIds.has(childId),
      ),
      borderChildren: group.borderChildren?.filter(
        (child) => included.has(child.id) || copiedGroupIds.has(child.id),
      ),
      overlayTargets: group.overlayTargets?.filter(
        (targetId) => included.has(targetId) || copiedGroupIds.has(targetId),
      ),
    }));
  const copiedEdges = doc.edges.filter(
    (edge) => selectedEdges.has(edge.id) || (included.has(edge.source) && included.has(edge.target)),
  );
  const copiedAnnotations = doc.annotations.filter((annotation) => selectedAnnotations.has(annotation.id));
  const assetIds = new Set(
    copiedResources
      .map((resource) => resource.props.iconAsset)
      .filter((value): value is string => typeof value === "string"),
  );
  const payload = {
    type: "dumb-diagrams/clipboard",
    groups: copiedGroups.map((group) => ({ group, place: getDefaultView(doc).places[group.id] })),
    ancestorGroups: [...copiedGroupIds].filter((id) => !included.has(id)),
    resources: copiedResources.map((resource) => ({ resource, place: getDefaultView(doc).places[resource.id] })),
    edges: copiedEdges,
    annotations: copiedAnnotations.map((annotation) => ({
      annotation,
      place: getDefaultView(doc).annotations?.[annotation.id],
    })),
    assets: (doc.assets ?? []).filter((asset) => assetIds.has(asset.id)),
    // Keep the old shape readable by older builds, but make the new shape
    // explicit so nested copy/paste can remap every reference.
    items: selection,
  };
  return JSON.stringify(payload);
}

export function pasteClipboard(
  doc: DiagramDocument,
  payload: string,
  at: Point,
): { doc: DiagramDocument; selection: Selection } {
  const data = JSON.parse(payload) as {
    type: string;
    items?: Array<Record<string, unknown>>;
    groups?: Array<{ group: DiagramDocument["groups"][number]; place?: DiagramDocument["views"][number]["places"][string] }>;
    ancestorGroups?: string[];
    resources?: Array<{ resource: DiagramDocument["resources"][number]; place?: DiagramDocument["views"][number]["places"][string] }>;
    edges?: DiagramDocument["edges"];
    annotations?: Array<{ annotation: DiagramDocument["annotations"][number]; place?: PlaceOverride }>;
    assets?: DiagramAsset[];
  };
  if (data.type !== "dumb-diagrams/clipboard") {
    throw new Error("Unsupported clipboard payload");
  }
  let next = cloneDocument(doc);
  const view = getDefaultView(next);
  const groups = data.groups ?? legacyClipboardGroups(data.items ?? []);
  const ancestorGroups = new Set(data.ancestorGroups ?? []);
  const resources = data.resources ?? legacyClipboardResources(data.items ?? []);
  const edges = data.edges ?? legacyClipboardEdges(data.items ?? []);
  const annotations = data.annotations ?? legacyClipboardAnnotations(data.items ?? []);
  const assets = data.assets ?? [];
  const idMap = new Map<string, string>();
  const assetMap = new Map<string, string>();
  const created: Selection = [];
  const sourcePlaces = [
    ...groups.map((item) => item.place),
    ...resources.map((item) => item.place),
    ...annotations.map((item) => item.place),
  ];
  const origin = sourcePlaces.find((place) => place?.x !== undefined && place?.y !== undefined);
  const dx = at.x - (origin?.x ?? 0);
  const dy = at.y - (origin?.y ?? 0);

  for (const asset of assets) {
    const id = uniqueId(next, asset.id);
    assetMap.set(asset.id, id);
    next.assets = [...(next.assets ?? []), { ...structuredClone(asset), id }];
  }
  for (const item of groups) idMap.set(item.group.id, uniqueId(next, item.group.id));
  for (const item of resources) idMap.set(item.resource.id, uniqueId(next, item.resource.id));
  for (const item of annotations) idMap.set(item.annotation.id, uniqueId(next, item.annotation.id));

  for (const item of groups) {
    const group = structuredClone(item.group);
    const id = idMap.get(group.id)!;
    group.id = id;
    group.parent = group.parent ? idMap.get(group.parent) : undefined;
    group.children = group.children.map((child) => idMap.get(child)).filter((child): child is string => Boolean(child));
    group.borderChildren = group.borderChildren
      ?.map((child) => ({ ...child, id: idMap.get(child.id) }))
      .filter((child): child is { id: string; side: Side } => Boolean(child.id));
    group.overlayTargets = group.overlayTargets?.map((target) => idMap.get(target)).filter((target): target is string => Boolean(target));
    next.groups.push(group);
    view.places[id] = shiftedPlace(item.place, dx, dy);
    if (!ancestorGroups.has(item.group.id)) created.push({ kind: "group", id });
  }
  for (const item of resources) {
    const resource = structuredClone(item.resource);
    const id = idMap.get(resource.id)!;
    resource.id = id;
    resource.parent = resource.parent ? idMap.get(resource.parent) : undefined;
    if (typeof resource.props.iconAsset === "string") {
      resource.props.iconAsset = assetMap.get(resource.props.iconAsset) ?? resource.props.iconAsset;
    }
    next.resources.push(resource);
    if (resource.parent) {
      const parent = next.groups.find((group) => group.id === resource.parent);
      if (parent && !parent.children.includes(id)) parent.children.push(id);
    }
    view.places[id] = shiftedPlace(item.place, dx, dy);
    created.push({ kind: "resource", id });
  }
  for (const edge of edges) {
    const cloned = structuredClone(edge);
    cloned.id = uniqueId(next, cloned.id);
    cloned.source = idMap.get(cloned.source) ?? cloned.source;
    cloned.target = idMap.get(cloned.target) ?? cloned.target;
    next.edges.push(cloned);
    created.push({ kind: "edge", id: cloned.id });
  }
  for (const item of annotations) {
    const annotation = structuredClone(item.annotation);
    const id = idMap.get(annotation.id)!;
    annotation.id = id;
    annotation.anchor = annotation.anchor ? idMap.get(annotation.anchor) : undefined;
    next.annotations.push(annotation);
    if (!view.annotations) view.annotations = {};
    view.annotations[id] = shiftedPlace(item.place, dx, dy);
    created.push({ kind: "annotation", id });
  }
  return { doc: next, selection: created };
}

function shiftedPlace(
  place: { x?: number; y?: number; w?: number; h?: number; pin?: boolean; locked?: boolean; visible?: boolean; zIndex?: number } | undefined,
  dx: number,
  dy: number,
) {
  return {
    ...(place ?? {}),
    x: Math.round((place?.x ?? 0) + dx),
    y: Math.round((place?.y ?? 0) + dy),
    pin: true,
  };
}

function legacyClipboardGroups(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "group" && item.group).map((item) => ({ group: item.group as DiagramDocument["groups"][number], place: item.place as DiagramDocument["views"][number]["places"][string] }));
}

function legacyClipboardResources(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "resource" && item.resource).map((item) => ({ resource: item.resource as DiagramDocument["resources"][number], place: item.place as DiagramDocument["views"][number]["places"][string] }));
}

function legacyClipboardEdges(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "edge" && item.edge).map((item) => item.edge as DiagramDocument["edges"][number]);
}

function legacyClipboardAnnotations(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "annotation" && item.annotation).map((item) => ({ annotation: item.annotation as DiagramDocument["annotations"][number], place: item.place as PlaceOverride }));
}

export function createOrthogonalRoute(points: Point[]): Point[] {
  return normalizeOrthogonalRoute(points);
}

function boundsFor(
  item: SelectionItem,
  layout: LayoutResult,
  doc: DiagramDocument,
): Rect | null {
  if (item.kind === "resource") {
    const node = layout.nodes.find((candidate) => candidate.id === item.id);
    return node?.obstacle ?? null;
  }
  if (item.kind === "group") {
    const group = layout.groups.find((candidate) => candidate.id === item.id);
    return group?.bounds ?? null;
  }
  if (item.kind === "annotation") {
    const place = getDefaultView(doc).annotations?.[item.id];
    if (!place) return null;
    return {
      x: place.x ?? 0,
      y: place.y ?? 0,
      w: place.w ?? 160,
      h: place.h ?? 48,
    };
  }
  return null;
}

function cloneDocument(doc: DiagramDocument): DiagramDocument {
  return structuredClone(doc);
}

function collectChildren(
  doc: DiagramDocument,
  groupId: string,
  ids: Set<string>,
): void {
  const group = doc.groups.find((candidate) => candidate.id === groupId);
  for (const childId of group?.children ?? []) {
    ids.add(childId);
    if (doc.groups.some((candidate) => candidate.id === childId)) {
      collectChildren(doc, childId, ids);
    }
  }
}

function uniqueId(doc: DiagramDocument, base: string): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const used = new Set([
    ...doc.resources.map((resource) => resource.id),
    ...doc.groups.map((group) => group.id),
    ...doc.edges.map((edge) => edge.id),
    ...doc.annotations.map((annotation) => annotation.id),
    ...(doc.assets ?? []).map((asset) => asset.id),
  ]);
  if (!used.has(clean)) return clean;
  let index = 2;
  while (used.has(`${clean}-${index}`)) index++;
  return `${clean}-${index}`;
}
