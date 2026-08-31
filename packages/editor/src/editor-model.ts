import type {
  DiagramDocument,
  DiagramAsset,
  Edge,
  EdgeBadgeSide,
  EdgeColor,
  EdgeLabelSide,
  EdgeKind,
  EdgeStyle,
  AnnotationStyle,
  BoundaryFill,
  GroupKind,
  GroupLabelPosition,
  LayoutResult,
  PlaceOverride,
  Point,
  Rect,
  ResourceRole,
  ResourceLabelPosition,
  Side,
  TextAlign,
  TextFontFamily,
} from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, getDefaultView, hasErrors, normalizePortOffset, utf8ByteLength, validateDocument } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry, getCatalogMap, type CatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { GROUP_STYLES } from "@dumb-diagrams/runtime/grammar-aws";
import { sanitizeSvg } from "@dumb-diagrams/runtime/render";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";

import { snapCoordinate } from "./grid.js";

export type SelectionKind = "resource" | "group" | "edge" | "annotation";

export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export type Selection = SelectionItem[];

export const MAX_EDGE_STEP = 99;

export const ANNOTATION_STYLES: Array<{
  id: AnnotationStyle;
  label: string;
  description: string;
  w: number;
  h: number;
}> = [
  { id: "paper", label: "Paper", description: "Warm pinned note", w: 220, h: 96 },
  { id: "text", label: "Text", description: "Plain editable text", w: 240, h: 48 },
  { id: "code", label: "Code snippet", description: "Monospace dark card", w: 300, h: 160 },
  { id: "callout", label: "Callout", description: "Focused explanation", w: 280, h: 104 },
  { id: "checklist", label: "Checklist", description: "Actionable items", w: 260, h: 152 },
];

export function annotationStyle(
  annotation: { style?: AnnotationStyle },
): AnnotationStyle {
  return annotation.style ?? "paper";
}

export function annotationSize(style: AnnotationStyle): { w: number; h: number } {
  return ANNOTATION_STYLES.find((candidate) => candidate.id === style) ?? ANNOTATION_STYLES[0]!;
}

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
    // Catalog containment rules guide generated diagrams. Manual placement is
    // intentionally permissive so users can stage an item before deciding
    // where it belongs; the core validator remains strict by default.
    return { ok: true };
  }
  const parent = doc.groups.find((candidate) => candidate.id === parentId);
  if (!parent) return { ok: false, reason: "The selected parent group no longer exists." };
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
    x: Math.round(x),
    y: Math.round(y),
    pin: true,
    manual: true,
  };
  return next;
}

export const MAX_SVG_BYTES = DIAGRAM_LIMITS.svgBytes;
export const MAX_TOTAL_ASSET_BYTES = DIAGRAM_LIMITS.totalAssetBytes;

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

export function setResourceLabelPosition(
  doc: DiagramDocument,
  id: string,
  position: ResourceLabelPosition,
): DiagramDocument {
  const next = cloneDocument(doc);
  const resource = next.resources.find((candidate) => candidate.id === id);
  if (!resource) return doc;
  resource.label = { ...resource.label, position };
  return next;
}

export function setGroupLabelPosition(
  doc: DiagramDocument,
  id: string,
  position: GroupLabelPosition,
): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.labelPosition = position;
  return next;
}

export function setGroupIconHidden(
  doc: DiagramDocument,
  id: string,
  hidden: boolean,
): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  if (hidden) group.hideIcon = true;
  else delete group.hideIcon;
  return next;
}

export function setBoundaryAppearance(
  doc: DiagramDocument,
  id: string,
  patch: { style?: EdgeStyle; color?: EdgeColor; fill?: BoundaryFill },
): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  if ("style" in patch) {
    if (patch.style) group.style = patch.style;
    else delete group.style;
  }
  if ("color" in patch) {
    if (patch.color) group.color = patch.color;
    else delete group.color;
  }
  if ("fill" in patch) {
    if (patch.fill) group.fill = patch.fill;
    else delete group.fill;
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
    place.x = Math.round(place.x + dx);
    place.y = Math.round(place.y + dy);
  }
  return next;
}

/** Persist an authored rectangle for a group without changing its contents. */
export function setGroupBounds(
  doc: DiagramDocument,
  groupId: string,
  bounds: Rect,
): DiagramDocument {
  const group = doc.groups.find((candidate) => candidate.id === groupId);
  if (!group || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)) {
    return doc;
  }
  const current = getDefaultView(doc).places[groupId];
  if (current?.locked) return doc;
  const next = cloneDocument(doc);
  getDefaultView(next).places[groupId] = {
    ...getDefaultView(next).places[groupId],
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    w: Math.max(0, Math.round(bounds.w)),
    h: Math.max(0, Math.round(bounds.h)),
    pin: true,
    manual: true,
  };
  return next;
}

/** Fit a group around its currently rendered descendants, without relayout. */
export function fitGroupToContents(
  doc: DiagramDocument,
  groupId: string,
  layout: LayoutResult,
): DiagramDocument {
  const group = doc.groups.find((candidate) => candidate.id === groupId);
  if (!group) return doc;

  const descendants = new Set<string>();
  collectChildren(doc, groupId, descendants);
  const geometry = [...descendants]
    .map((id) =>
      layout.groups.find((candidate) => candidate.id === id)?.bounds ??
      layout.nodes.find((candidate) => candidate.id === id)?.obstacle,
    )
    .filter((rect): rect is Rect => Boolean(rect));
  if (geometry.length === 0) return doc;

  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const minX = Math.min(...geometry.map((rect) => rect.x));
  const minY = Math.min(...geometry.map((rect) => rect.y));
  const maxX = Math.max(...geometry.map((rect) => rect.x + rect.w));
  const maxY = Math.max(...geometry.map((rect) => rect.y + rect.h));
  return setGroupBounds(doc, groupId, {
    x: minX - style.padding,
    y: minY - style.headerHeight - style.padding,
    w: maxX - minX + style.padding * 2,
    h: maxY - minY + style.headerHeight + style.padding * 2,
  });
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
      // Unpinned x/y values can be stale layout hints. A drag starts from the
      // geometry the user can actually see; only an already pinned placement
      // is authoritative on subsequent moves.
      const pinnedX = place.pin ? place.x : undefined;
      const pinnedY = place.pin ? place.y : undefined;
      view.places[id] = {
        ...place,
        x: Math.round((pinnedX ?? bounds?.x ?? 0) + dx),
        y: Math.round((pinnedY ?? bounds?.y ?? 0) + dy),
        pin: true,
        manual: true,
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
        x: Math.round((place.x ?? 0) + dx),
        y: Math.round((place.y ?? 0) + dy),
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
      const x = snapCoordinate(previousX + dx, Boolean(options.snapToGrid));
      const y = snapCoordinate(previousY + dy, Boolean(options.snapToGrid));
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
      const x = snapCoordinate((place.x ?? 0) + dx, Boolean(options.snapToGrid));
      const y = snapCoordinate((place.y ?? 0) + dy, Boolean(options.snapToGrid));
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

export function setEdgeLabelPosition(
  doc: DiagramDocument,
  edgeId: string,
  t: number,
  side: EdgeLabelSide,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const current = view.routes[edgeId] ?? {};
  view.routes[edgeId] = {
    ...current,
    labelT: Math.max(0, Math.min(1, t)),
    labelSide: side,
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
  if (
    existing?.badgeT !== undefined ||
    existing?.badgeSide !== undefined ||
    existing?.labelT !== undefined ||
    existing?.labelSide !== undefined
  ) {
    view.routes[edgeId] = {
      badgeT: existing.badgeT,
      badgeSide: existing.badgeSide,
      labelT: existing.labelT,
      labelSide: existing.labelSide,
    };
  } else {
    delete view.routes[edgeId];
  }
  return next;
}

export function reconnectEdge(
  doc: DiagramDocument,
  edgeId: string,
  patch: Partial<
    Pick<
      Edge,
      | "source"
      | "target"
      | "sourcePort"
      | "targetPort"
      | "sourcePortOffset"
      | "targetPortOffset"
    >
  >,
): DiagramDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return doc;
  Object.assign(edge, patch);
  if (patch.sourcePortOffset !== undefined) {
    edge.sourcePortOffset = normalizePortOffset(patch.sourcePortOffset);
  }
  if (patch.targetPortOffset !== undefined) {
    edge.targetPortOffset = normalizePortOffset(patch.targetPortOffset);
  }
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
  const prevSourcePortOffset = edge.sourcePortOffset;
  const prevTargetPortOffset = edge.targetPortOffset;
  edge.source = prevTarget;
  edge.target = prevSource;
  edge.sourcePort = prevTargetPort;
  edge.targetPort = prevSourcePort;
  edge.sourcePortOffset = prevTargetPortOffset;
  edge.targetPortOffset = prevSourcePortOffset;
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

/** Whether Auto-fix would remove authored node geometry or connector overrides. */
export function needsAutoFix(doc: DiagramDocument): boolean {
  return doc.views.some((view) =>
    Object.values(view.places).some((place) =>
      place.x !== undefined ||
      place.y !== undefined ||
      place.w !== undefined ||
      place.h !== undefined ||
      place.pin !== undefined ||
      place.manual !== undefined
    ) || Object.keys(view.routes).length > 0,
  );
}

export function renameResource(
  doc: DiagramDocument,
  id: string,
  label: string,
): DiagramDocument {
  const next = cloneDocument(doc);
  const resource = next.resources.find((candidate) => candidate.id === id);
  if (!resource) return doc;
  resource.label = { ...resource.label, role: label || undefined };
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

export function updateGroupStep(
  doc: DiagramDocument,
  id: string,
  step?: number,
): DiagramDocument {
  if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > MAX_EDGE_STEP)) {
    return doc;
  }
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.step = step;
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
    label: {},
    role: "primary",
    props: {},
  });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
    manual: true,
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
    manual: true,
  };
  return { doc: next, id };
}

export function addAnnotation(
  doc: DiagramDocument,
  text: string,
  at: Point,
  anchor?: string,
  style: AnnotationStyle = "paper",
): { doc: DiagramDocument; id: string } {
  const next = cloneDocument(doc);
  const id = uniqueId(next, "note");
  next.annotations.push({
    id,
    text,
    anchor,
    ...(style === "paper" ? {} : { style }),
  });
  const size = annotationSize(style);
  const view = getDefaultView(next);
  if (!view.annotations) view.annotations = {};
  const maxZ = Math.max(
    0,
    ...placeableIds(next)
      .filter((candidate) => candidate !== id)
      .map((candidate) => zIndexFor(next, candidate)),
  );
  view.annotations[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: size.w,
    h: size.h,
    pin: true,
    zIndex: maxZ + 1,
  };
  return { doc: next, id };
}

/** Add a free-form text item using the plain, editable text treatment. */
export function addText(
  doc: DiagramDocument,
  text: string,
  at: Point,
  format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign } = {},
): { doc: DiagramDocument; id: string } {
  const result = addAnnotation(doc, text, at, undefined, "text");
  return { doc: updateTextFormat(result.doc, result.id, format), id: result.id };
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
    x: Math.round(x),
    y: Math.round(y),
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

export function updateTextFormat(
  doc: DiagramDocument,
  id: string,
  format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign },
): DiagramDocument {
  const next = cloneDocument(doc);
  const annotation = next.annotations.find((candidate) => candidate.id === id);
  if (!annotation || annotationStyle(annotation) !== "text") return doc;
  if (format.font !== undefined) annotation.font = format.font;
  if (format.fontSize !== undefined) {
    if (!Number.isFinite(format.fontSize) || format.fontSize < 10 || format.fontSize > 48) return doc;
    annotation.fontSize = Math.round(format.fontSize);
  }
  if (format.align !== undefined) annotation.align = format.align;
  return next;
}

export function setAnnotationStyle(
  doc: DiagramDocument,
  id: string,
  style: AnnotationStyle,
): DiagramDocument {
  const next = cloneDocument(doc);
  const annotation = next.annotations.find((candidate) => candidate.id === id);
  if (!annotation) return doc;

  const previousStyle = annotationStyle(annotation);
  const view = getDefaultView(next);
  const place = view.annotations?.[id];
  const previousSize = annotationSize(previousStyle);
  const shouldUseNewSize =
    place &&
    (place.w === previousSize.w || place.w === undefined) &&
    (place.h === previousSize.h || place.h === undefined);

  if (style === "paper") delete annotation.style;
  else annotation.style = style;

  if (place && shouldUseNewSize) {
    const size = annotationSize(style);
    if (!view.annotations) view.annotations = {};
    view.annotations[id] = { ...place, w: size.w, h: size.h };
  }
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
    manual: true,
  };
  return { doc: next, id };
}

export function addEdge(
  doc: DiagramDocument,
  source: string,
  target: string,
  sourcePort?: Side,
  targetPort?: Side,
  sourcePortOffset?: number,
  targetPortOffset?: number,
): { doc: DiagramDocument; id: string } {
  const next = cloneDocument(doc);
  const id = uniqueId(next, `${source}-${target}`);
  next.edges.push({
    id,
    source,
    target,
    sourcePort,
    targetPort,
    sourcePortOffset: sourcePortOffset === undefined
      ? undefined
      : normalizePortOffset(sourcePortOffset),
    targetPortOffset: targetPortOffset === undefined
      ? undefined
      : normalizePortOffset(targetPortOffset),
    style: "solid",
    kind: "flow",
  });
  return { doc: next, id };
}

export function updateEdge(
  doc: DiagramDocument,
  id: string,
  patch: Partial<
    Pick<
      Edge,
      | "sourcePort"
      | "targetPort"
      | "sourcePortOffset"
      | "targetPortOffset"
      | "style"
      | "kind"
      | "color"
      | "label"
      | "step"
    >
  >,
): DiagramDocument {
  if (
    patch.step !== undefined &&
    (!Number.isInteger(patch.step) || patch.step < 0 || patch.step > MAX_EDGE_STEP)
  ) {
    return doc;
  }
  const next = cloneDocument(doc);
  const edge = next.edges.find((candidate) => candidate.id === id);
  if (edge) {
    Object.assign(edge, patch);
    if (patch.sourcePortOffset !== undefined) {
      edge.sourcePortOffset = normalizePortOffset(patch.sourcePortOffset);
    }
    if (patch.targetPortOffset !== undefined) {
      edge.targetPortOffset = normalizePortOffset(patch.targetPortOffset);
    }
  }
  return next;
}

/**
 * Change connector semantics without letting kind-sensitive automatic layout
 * rotate the composition that is already on screen. The saved coordinates are
 * the same geometry the user approved immediately before the edit; routing is
 * still recalculated against those stable nodes and boundaries.
 */
export function updateEdgePreservingLayout(
  doc: DiagramDocument,
  id: string,
  patch: Parameters<typeof updateEdge>[2],
  layout: LayoutResult,
): DiagramDocument {
  const edge = doc.edges.find((candidate) => candidate.id === id);
  const changesKind = patch.kind !== undefined && patch.kind !== edge?.kind;
  const next = updateEdge(doc, id, patch);
  if (next === doc || !changesKind) return next;

  const view = getDefaultView(next);
  for (const group of layout.groups) {
    view.places[group.id] = {
      ...view.places[group.id],
      x: Math.round(group.bounds.x),
      y: Math.round(group.bounds.y),
      w: Math.round(group.bounds.w),
      h: Math.round(group.bounds.h),
      pin: true,
      manual: true,
    };
  }
  for (const node of layout.nodes) {
    view.places[node.id] = {
      ...view.places[node.id],
      x: Math.round(node.obstacle.x),
      y: Math.round(node.obstacle.y),
      pin: true,
      manual: true,
    };
  }
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

/** Move an item between semantic groups while leaving all authored geometry absolute. */
export function reparentPreservingAbsolutePosition(
  doc: DiagramDocument,
  item: SelectionItem | string,
  newParentId?: string,
): DiagramDocument {
  const id = typeof item === "string" ? item : item.id;
  const kind = typeof item === "string"
    ? (doc.groups.some((group) => group.id === id) ? "group" : "resource")
    : item.kind;
  if (kind !== "group" && kind !== "resource") return doc;

  const movedGroup = kind === "group"
    ? doc.groups.find((group) => group.id === id)
    : undefined;
  const movedResource = kind === "resource"
    ? doc.resources.find((resource) => resource.id === id)
    : undefined;
  if (!movedGroup && !movedResource) return doc;

  const newParent = newParentId
    ? doc.groups.find((group) => group.id === newParentId)
    : undefined;
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
    const resource = item.kind === "resource"
      ? doc.resources.find((candidate) => candidate.id === item.id)
      : undefined;
    const group = item.kind === "group"
      ? doc.groups.find((candidate) => candidate.id === item.id)
      : undefined;
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
  const selectedIds = [...ids].sort((a, b) =>
    (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) ||
    selectionIndex.get(a)! - selectionIndex.get(b)!,
  );

  const descendantIds = new Set<string>();
  for (const record of records) {
    descendantIds.add(record.item.id);
    if (record.group) collectChildren(doc, record.group.id, descendantIds);
  }

  const layoutById = new Map<string, Rect>();
  for (const group of layout.groups) layoutById.set(group.id, group.bounds);
  for (const node of layout.nodes) layoutById.set(node.id, node.obstacle);
  const geometry = [...descendantIds]
    .map((id) => layoutById.get(id))
    .filter((rect): rect is Rect => Boolean(rect));
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

  // If one of the selected sibling groups already encloses every other
  // selected item, treat that boundary as the intended parent. This matches
  // direct-manipulation editors: drawing or positioning a boundary around
  // content and then grouping should populate that boundary, not wrap it in a
  // second anonymous group.
  const enclosingGroup = records
    .filter((record): record is typeof record & { group: NonNullable<typeof record.group> } => Boolean(record.group))
    .filter((record) => {
      const outer = layoutById.get(record.group.id)!;
      return records.every((candidate) =>
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
    destination.children = [
      ...destination.children.filter((id) => !adoptedIds.includes(id)),
      ...adoptedIds,
    ];
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
  const destination = parentId
    ? next.groups.find((group) => group.id === parentId)
    : undefined;
  if (destination) {
    const ordinaryIndices = parent!.children
      .map((id, index) => selectedIds.includes(id) ? index : -1)
      .filter((index) => index >= 0);
    const insertionIndex = ordinaryIndices.length
      ? Math.min(...ordinaryIndices)
      : destination.children.length;
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
        ...selectedIds
          .map((id) => doc.groups.findIndex((group) => group.id === id))
          .filter((index) => index >= 0),
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

/**
 * Return whether a selection can be grouped or adopted by an enclosing group.
 *
 * Grouping only accepts existing resource/group entities that are direct
 * siblings. An ancestor and one of its descendants cannot be grouped
 * together: doing so would make the resulting hierarchy ambiguous and would
 * otherwise silently reparent the descendant twice.
 */
export function canGroupSelection(
  doc: DiagramDocument,
  selection: Selection,
): boolean {
  return normalizeGroupingSelection(doc, selection) !== null;
}

/**
 * Project a mixed selection onto resource/group hierarchy roots suitable for
 * grouping. Connectors and annotations are ignored. When both an ancestor
 * group and its descendants are selected, only the ancestor is kept.
 */
function projectGroupingCandidates(
  doc: DiagramDocument,
  selection: Selection,
): SelectionItem[] {
  const candidates: SelectionItem[] = [];
  const seen = new Set<string>();
  for (const item of selection) {
    if (item.kind !== "resource" && item.kind !== "group") continue;
    if (!item.id) continue;
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    const resource = item.kind === "resource"
      ? doc.resources.find((candidate) => candidate.id === item.id)
      : undefined;
    const group = item.kind === "group"
      ? doc.groups.find((candidate) => candidate.id === item.id)
      : undefined;
    if (!resource && !group) continue;
    seen.add(key);
    candidates.push(item);
  }
  if (candidates.length < 2) return [];

  const selectedGroups = new Set(
    candidates.filter((item) => item.kind === "group").map((item) => item.id),
  );
  return candidates.filter((item) =>
    !hasSelectedGroupAncestor(doc, item.id, selectedGroups),
  );
}

function hasSelectedGroupAncestor(
  doc: DiagramDocument,
  id: string,
  selectedGroups: ReadonlySet<string>,
): boolean {
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

function normalizeGroupingSelection(
  doc: DiagramDocument,
  selection: Selection,
): SelectionItem[] | null {
  const normalized = projectGroupingCandidates(doc, selection);
  if (normalized.length < 2) return null;

  const ids = normalized.map((item) => item.id);
  if (new Set(ids).size !== ids.length) return null;

  const records = normalized.map((item) => {
    const resource = item.kind === "resource"
      ? doc.resources.find((candidate) => candidate.id === item.id)
      : undefined;
    const group = item.kind === "group"
      ? doc.groups.find((candidate) => candidate.id === item.id)
      : undefined;
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

  const parentId = group.parent && doc.groups.some((candidate) => candidate.id === group.parent)
    ? group.parent
    : undefined;
  const originalParent = parentId
    ? doc.groups.find((candidate) => candidate.id === parentId)
    : undefined;
  const parentChildIndex = originalParent?.children.indexOf(groupId) ?? -1;
  const parentBorderIndex = originalParent?.borderChildren?.findIndex((child) => child.id === groupId) ?? -1;
  const borderChildren = new Map<string, Side>();
  for (const child of group.borderChildren ?? []) {
    // Boundary metadata is more specific than the ordinary membership list.
    // Keep the side even when a malformed document lists the same item in both
    // places; it must remain a border child after ungrouping.
    borderChildren.set(child.id, child.side);
  }
  const ordinaryChildren = [...new Set(group.children)].filter((id) => !borderChildren.has(id));

  // Membership arrays are normally the source of ordering, but older or
  // hand-edited documents can retain only the child's parent pointer. Infer
  // those direct children so ungrouping cannot orphan them. A strict equality
  // check intentionally excludes descendants of the group.
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
    const pinnedIds = new Set<string>();
    pinnedIds.add(groupId);
    collectChildren(doc, groupId, pinnedIds);
    const layoutById = new Map<string, Rect>();
    for (const candidate of layout.groups) layoutById.set(candidate.id, candidate.bounds);
    for (const node of layout.nodes) layoutById.set(node.id, node.obstacle);
    for (const id of pinnedIds) {
      const rect = layoutById.get(id);
      if (!rect) continue;
      const existing = sourceView.places[id] ?? {};
      const isGroup = doc.groups.some((candidate) => candidate.id === id);
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
  }

  // Remove every stale reference to the boundary or its promoted members
  // before rebuilding the destination membership lists.
  for (const candidate of next.groups) {
    candidate.children = candidate.children.filter(
      (childId) => childId !== groupId && !promotedIds.includes(childId),
    );
    candidate.borderChildren = candidate.borderChildren?.filter(
      (child) => child.id !== groupId && !promotedIds.includes(child.id),
    );
    candidate.overlayTargets = candidate.overlayTargets?.filter((id) => id !== groupId);
  }

  const destination = parentId
    ? next.groups.find((candidate) => candidate.id === parentId)
    : undefined;
  const validPromotedIds: string[] = [];
  for (const childId of promotedIds) {
    const childGroup = next.groups.find((candidate) => candidate.id === childId);
    const childResource = next.resources.find((candidate) => candidate.id === childId);
    if (!childGroup && !childResource) continue;
    if (childGroup) childGroup.parent = parentId;
    if (childResource) childResource.parent = parentId;
    validPromotedIds.push(childId);
  }
  if (destination) {
    const promotedOrdinary = validPromotedIds.filter((id) =>
      ordinaryChildren.includes(id) || inferredChildren.includes(id),
    );
    const childIndex = parentChildIndex >= 0
      ? Math.min(parentChildIndex, destination.children.length)
      : destination.children.length;
    destination.children.splice(childIndex, 0, ...promotedOrdinary);
    const promotedBorders = validPromotedIds
      .filter((id) => borderChildren.has(id))
      .map((id) => ({ id, side: borderChildren.get(id)! }));
    if (promotedBorders.length > 0) {
      const borderIndex = parentBorderIndex >= 0
        ? Math.min(parentBorderIndex, destination.borderChildren?.length ?? 0)
        : destination.borderChildren?.length ?? 0;
      const currentBorders = destination.borderChildren ?? [];
      currentBorders.splice(borderIndex, 0, ...promotedBorders);
      destination.borderChildren = currentBorders;
    }
  }

  next.groups = next.groups.filter((candidate) => candidate.id !== groupId);
  for (const view of next.views) delete view.places[groupId];

  const selection: Selection = validPromotedIds.map((id) => (
    next.groups.some((candidate) => candidate.id === id)
      ? { kind: "group" as const, id }
      : { kind: "resource" as const, id }
  ));
  return { doc: next, selection };
}

/** Keyboard/context-menu removal: preserve selected group contents. */
export function removeSelectionPreservingGroupContents(
  doc: DiagramDocument,
  selection: Selection,
  layout?: LayoutResult,
): DiagramDocument {
  const selectedGroupIds = [...new Set(
    selection
      .filter((item) => item.kind === "group")
      .map((item) => item.id)
      .filter((id) => doc.groups.some((group) => group.id === id)),
  )];
  const depth = (id: string): number => {
    let current = doc.groups.find((group) => group.id === id);
    let result = 0;
    const seen = new Set<string>();
    while (current?.parent && !seen.has(current.parent)) {
      seen.add(current.parent);
      current = doc.groups.find((group) => group.id === current!.parent);
      if (current) result++;
    }
    return result;
  };
  // Deepest first makes nested selected groups deterministic: every selected
  // boundary is removed exactly once, independent of selection order.
  selectedGroupIds.sort((a, b) => depth(b) - depth(a) || a.localeCompare(b));

  let next = doc;
  for (const groupId of selectedGroupIds) {
    next = ungroup(next, groupId, layout).doc;
  }
  for (const item of selection) {
    if (item.kind !== "group") next = deleteOne(next, item);
  }
  return next;
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
  const itemCount = copiedGroups.length + copiedResources.length + copiedEdges.length + copiedAnnotations.length;
  if (itemCount > DIAGRAM_LIMITS.clipboardItems) {
    throw new Error(`Selection exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object clipboard limit`);
  }
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
  const serialized = JSON.stringify(payload);
  if (utf8ByteLength(serialized) > DIAGRAM_LIMITS.clipboardBytes) {
    throw new Error("Selection exceeds the 512 KiB clipboard limit");
  }
  return serialized;
}

export function pasteClipboard(
  doc: DiagramDocument,
  payload: string,
  at: Point,
): { doc: DiagramDocument; selection: Selection } {
  if (utf8ByteLength(payload) > DIAGRAM_LIMITS.clipboardBytes) {
    throw new Error("Clipboard payload exceeds the 512 KiB limit");
  }
  const parsed: unknown = JSON.parse(payload);
  const data = decodeClipboardPayload(parsed) as {
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
  const itemCount = groups.length + resources.length + edges.length + annotations.length;
  if (itemCount > DIAGRAM_LIMITS.clipboardItems) {
    throw new Error(`Clipboard payload exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object limit`);
  }
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
    const sanitized = sanitizeSvg(asset.content);
    const id = uniqueId(next, asset.id);
    assetMap.set(asset.id, id);
    next.assets = [...(next.assets ?? []), {
      id,
      kind: "svg",
      content: sanitized.content,
      intrinsicW: sanitized.intrinsicW,
      intrinsicH: sanitized.intrinsicH,
      hash: sanitized.hash,
    }];
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
  const issues = validateDocument(next, getCatalogMap(), { enforceCatalogRules: false });
  if (hasErrors(issues)) throw new Error(issues[0]?.message ?? "Clipboard payload is invalid");
  return { doc: next, selection: created };
}

function decodeClipboardPayload(input: unknown): Record<string, unknown> {
  if (!isRecord(input) || input.type !== "dumb-diagrams/clipboard") {
    throw new Error("Unsupported clipboard payload");
  }
  for (const key of ["groups", "resources", "edges", "annotations", "assets", "items", "ancestorGroups"] as const) {
    if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error(`Clipboard ${key} must be an array`);
  }
  const groups = input.groups as unknown[] | undefined;
  const resources = input.resources as unknown[] | undefined;
  const edges = input.edges as unknown[] | undefined;
  const annotations = input.annotations as unknown[] | undefined;
  const assets = input.assets as unknown[] | undefined;
  const modernItemCount = (groups?.length ?? 0) + (resources?.length ?? 0) + (edges?.length ?? 0) + (annotations?.length ?? 0);
  const legacyItemCount = (input.items as unknown[] | undefined)?.length ?? 0;
  if (modernItemCount > DIAGRAM_LIMITS.clipboardItems || legacyItemCount > DIAGRAM_LIMITS.clipboardItems) {
    throw new Error(`Clipboard payload exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object limit`);
  }
  if (groups?.some((item) => !isRecord(item) || !validGroup(item.group) || !validPlace(item.place))) throw new Error("Clipboard contains an invalid group");
  if (resources?.some((item) => !isRecord(item) || !validResource(item.resource) || !validPlace(item.place))) throw new Error("Clipboard contains an invalid resource");
  if (edges?.some((item) => !validEdge(item))) throw new Error("Clipboard contains an invalid edge");
  if (annotations?.some((item) => !isRecord(item) || !validAnnotation(item.annotation) || !validPlace(item.place))) throw new Error("Clipboard contains an invalid annotation");
  if (assets?.some((item) => !validAsset(item))) throw new Error("Clipboard contains an invalid asset");
  if ((input.ancestorGroups as unknown[] | undefined)?.some((id) => typeof id !== "string")) throw new Error("Clipboard ancestor group ids must be strings");
  if ((input.items as unknown[] | undefined)?.some((item) => !validLegacyClipboardItem(item))) throw new Error("Clipboard legacy items are invalid");
  return input;
}

function validLegacyClipboardItem(value: unknown): boolean {
  if (!isRecord(value) || !validPlace(value.place)) return false;
  if (typeof value.id === "string" && (value.kind === "group" || value.kind === "resource" || value.kind === "edge" || value.kind === "annotation")) return true;
  if (value.kind === "group") return validGroup(value.group);
  if (value.kind === "resource") return validResource(value.resource);
  if (value.kind === "edge") return validEdge(value.edge);
  if (value.kind === "annotation") return validAnnotation(value.annotation);
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validGroup(value: unknown): boolean {
  const groupKinds = new Set(["cloud", "account", "region", "vpc", "az", "subnet", "subnet-public", "subnet-private", "logical", "overlay"]);
  return isRecord(value) && typeof value.id === "string" && typeof value.kind === "string" && groupKinds.has(value.kind) && typeof value.label === "string" &&
    Array.isArray(value.children) && value.children.every((id) => typeof id === "string") &&
    (value.parent === undefined || typeof value.parent === "string") &&
    (value.labelPosition === undefined || value.labelPosition === "top-left" || value.labelPosition === "top-right") &&
    (value.hideIcon === undefined || typeof value.hideIcon === "boolean") &&
    (value.style === undefined || value.style === "solid" || value.style === "dashed") &&
    (value.color === undefined || value.color === "graphite" || value.color === "blue" || value.color === "teal" || value.color === "purple" || value.color === "amber" || value.color === "red" || value.color === "green") &&
    (value.fill === undefined || value.fill === "subtle" || value.fill === "none") &&
    (value.step === undefined || (typeof value.step === "number" && Number.isInteger(value.step) && value.step >= 0 && value.step <= MAX_EDGE_STEP));
}

function validResource(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && isRecord(value.label) &&
    (value.label.service === undefined || typeof value.label.service === "string") && (value.label.role === undefined || typeof value.label.role === "string") &&
    (value.label.position === undefined || value.label.position === "top" || value.label.position === "bottom") &&
    (value.role === "primary" || value.role === "secondary" || value.role === "border") && isRecord(value.props) &&
    (value.parent === undefined || typeof value.parent === "string");
}

function validEdge(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.source === "string" && typeof value.target === "string" &&
    (value.style === "solid" || value.style === "dashed") &&
    (value.kind === undefined || value.kind === "flow" || value.kind === "bidirectional" || value.kind === "peer" || value.kind === "fail") &&
    (value.color === undefined || value.color === "graphite" || value.color === "blue" || value.color === "teal" ||
      value.color === "purple" || value.color === "amber" || value.color === "red" || value.color === "green");
}

function validAnnotation(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.text === "string" &&
    (value.anchor === undefined || typeof value.anchor === "string") &&
    (value.style === undefined || value.style === "text" || value.style === "paper" || value.style === "code" || value.style === "callout" || value.style === "checklist") &&
    (value.font === undefined || value.font === "sans" || value.font === "serif" || value.font === "mono") &&
    (value.fontSize === undefined || typeof value.fontSize === "number" && value.fontSize >= 10 && value.fontSize <= 48) &&
    (value.align === undefined || value.align === "left" || value.align === "center" || value.align === "right");
}

function validAsset(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && value.kind === "svg" && typeof value.content === "string" &&
    typeof value.intrinsicW === "number" && typeof value.intrinsicH === "number";
}

function validPlace(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ["x", "y", "w", "h", "zIndex"].every((key) => value[key] === undefined || typeof value[key] === "number" && Number.isFinite(value[key]));
}

function shiftedPlace(
  place: { x?: number; y?: number; w?: number; h?: number; pin?: boolean; manual?: boolean; locked?: boolean; visible?: boolean; zIndex?: number } | undefined,
  dx: number,
  dy: number,
) {
  return {
    ...(place ?? {}),
    x: Math.round((place?.x ?? 0) + dx),
    y: Math.round((place?.y ?? 0) + dy),
    pin: true,
    manual: true,
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
  const childIds = [
    ...(group?.children ?? []),
    ...(group?.borderChildren?.map((child) => child.id) ?? []),
  ];
  for (const childId of childIds) {
    if (ids.has(childId)) continue;
    ids.add(childId);
    if (doc.groups.some((candidate) => candidate.id === childId)) {
      collectChildren(doc, childId, ids);
    }
  }
}

function isDescendant(
  doc: DiagramDocument,
  ancestorId: string,
  candidateId: string,
): boolean {
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
