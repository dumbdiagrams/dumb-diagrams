import type {
  DiagramDocument,
  Edge,
  ID,
  EdgeBadgeSide,
  EdgeColor,
  EdgeLabelSide,
  EdgeStyle,
  AnnotationStyle,
  BoundaryFill,
  GroupLabelPosition,
  LayoutResult,
  Point,
  Rect,
  ResourceRole,
  ResourceLabelPosition,
  Side,
  TextAlign,
  TextFontFamily,
} from "@dumb-diagrams/runtime/core";
import { getDefaultView, normalizePortOffset } from "@dumb-diagrams/runtime/core";
import { getAnnotationTheme, resolveAnnotationBounds } from "@dumb-diagrams/runtime/render";
import { GROUP_STYLES } from "@dumb-diagrams/runtime/grammar-aws";

import { isEmptyRootBoundary } from "@dumb-diagrams/runtime/layout";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";

import { snapCoordinate } from "./grid.js";
import { cloneDocument, collectChildren, uniqueId } from "./model/document-structure";
import { ungroup } from "./model/grouping";
import { type Selection, type SelectionItem, type SelectionKind } from "./model/types";

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
  { id: "code", label: "Code snippet", description: "Monospace dark card", w: 420, h: 160 },
  { id: "callout", label: "Callout", description: "Focused explanation", w: 280, h: 104 },
  { id: "checklist", label: "Checklist", description: "Actionable items", w: 260, h: 152 },
];

export function annotationStyle(annotation: { style?: AnnotationStyle }): AnnotationStyle {
  return annotation.style ?? "paper";
}

export function annotationSize(style: AnnotationStyle): { w: number; h: number } {
  return ANNOTATION_STYLES.find((candidate) => candidate.id === style) ?? ANNOTATION_STYLES[0]!;
}

export function isSelected(selection: Selection, kind: SelectionKind, id: string): boolean {
  return selection.some((item) => item.kind === kind && item.id === id);
}

export function primarySelection(selection: Selection): SelectionItem | null {
  return selection[0] ?? null;
}

export function toggleSelectionItem(selection: Selection, item: SelectionItem, additive: boolean): Selection {
  const exists = isSelected(selection, item.kind, item.id);
  if (!additive) return exists ? selection : [item];
  if (exists) {
    const next = selection.filter((candidate) => !(candidate.kind === item.kind && candidate.id === item.id));
    return next;
  }
  return [...selection, item];
}

export function setTitle(doc: DiagramDocument, title: string): DiagramDocument {
  const next = cloneDocument(doc);
  next.title = title.trim() || undefined;
  return next;
}

export function setPlace(doc: DiagramDocument, id: string, x: number, y: number): DiagramDocument {
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

export type ResourceIconSize = "normal" | "small";

export function resourceIconSize(resource: { role: ResourceRole }): ResourceIconSize {
  return resource.role === "secondary" ? "small" : "normal";
}

export function setResourceIconSize(doc: DiagramDocument, id: string, size: ResourceIconSize): DiagramDocument {
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

export function setGroupLabelPosition(doc: DiagramDocument, id: string, position: GroupLabelPosition): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.labelPosition = position;
  return next;
}

export function setGroupIconHidden(doc: DiagramDocument, id: string, hidden: boolean): DiagramDocument {
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
  const isAnnotation = next.annotations.some((annotation) => annotation.id === id);
  const places = isAnnotation ? (view.annotations ??= {}) : view.places;
  const place = places[id] ?? {};
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

  places[id] = {
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
export function setGroupBounds(doc: DiagramDocument, groupId: string, bounds: Rect): DiagramDocument {
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
export function fitGroupToContents(doc: DiagramDocument, groupId: string, layout: LayoutResult): DiagramDocument {
  const group = doc.groups.find((candidate) => candidate.id === groupId);
  if (!group) return doc;

  const descendants = new Set<string>();
  collectChildren(doc, groupId, descendants);
  const geometry = [...descendants]
    .map(
      (id) =>
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
  const annotationBounds = layout ? resolveAnnotationBounds(doc, layout) : {};
  const selectedGroups = new Set(selection.filter((item) => item.kind === "group").map((item) => item.id));
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
      const bounds = annotationBounds[id];
      view.annotations[id] = {
        ...place,
        x: Math.round((bounds?.x ?? place.x ?? 0) + dx),
        y: Math.round((bounds?.y ?? place.y ?? 0) + dy),
        pin: true,
        manual: true,
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
        item.kind === "group" ? setGroupPlace(next, item.id, x, y, actualDx, actualDy) : setPlace(next, item.id, x, y);
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

export function clearRoute(doc: DiagramDocument, edgeId: string): DiagramDocument {
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

/** Drop authored route geometry while preserving badge and label decoration prefs. */
export function clearAllRoutes(doc: DiagramDocument): DiagramDocument {
  let next = doc;
  for (const edgeId of Object.keys(getDefaultView(doc).routes)) {
    next = clearRoute(next, edgeId);
  }
  return next;
}

/** Remove manual placement for the listed entities and clear their incident routes. */
export function clearPlaces(doc: DiagramDocument, ids: ID[]): DiagramDocument {
  const unique = [...new Set(ids)];
  let next = cloneDocument(doc);
  const view = getDefaultView(next);
  for (const id of unique) {
    const place = view.places[id];
    if (!place) continue;
    if (isEmptyRootBoundary(next, id)) {
      view.places[id] = {
        x: place.x,
        y: place.y,
        w: place.w,
        h: place.h,
        pin: place.pin,
        manual: place.manual,
        locked: place.locked,
        visible: place.visible,
        zIndex: place.zIndex,
      };
    } else {
      view.places[id] = {
        locked: place.locked,
        visible: place.visible,
        zIndex: place.zIndex,
      };
    }
    for (const edge of next.edges) {
      if (edge.source === id || edge.target === id) {
        next = clearRoute(next, edge.id);
      }
    }
  }
  return next;
}

export function reconnectEdge(
  doc: DiagramDocument,
  edgeId: string,
  patch: Partial<
    Pick<Edge, "source" | "target" | "sourcePort" | "targetPort" | "sourcePortOffset" | "targetPortOffset">
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

export function swapEdgeDirection(doc: DiagramDocument, edgeId: string): DiagramDocument {
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
      Object.entries(view.places).map(([id, place]) => {
        if (isEmptyRootBoundary(next, id)) {
          return [
            id,
            {
              x: place.x,
              y: place.y,
              w: place.w,
              h: place.h,
              pin: place.pin,
              manual: place.manual,
              locked: place.locked,
              visible: place.visible,
              zIndex: place.zIndex,
            },
          ];
        }
        return [
          id,
          {
            locked: place.locked,
            visible: place.visible,
            zIndex: place.zIndex,
          },
        ];
      }),
    );
    view.routes = {};
    // Notes keep their authored position, visibility, and lock state when
    // automatic layout is recalculated.
    view.annotations = view.annotations
      ? Object.fromEntries(Object.entries(view.annotations).map(([id, place]) => [id, { ...place }]))
      : undefined;
  }
  return next;
}

/** Whether Auto-fix would remove authored node geometry or connector overrides. */
export function needsAutoFix(doc: DiagramDocument): boolean {
  return doc.views.some(
    (view) =>
      Object.values(view.places).some(
        (place) =>
          place.x !== undefined ||
          place.y !== undefined ||
          place.w !== undefined ||
          place.h !== undefined ||
          place.pin !== undefined ||
          place.manual !== undefined,
      ) || Object.keys(view.routes).length > 0,
  );
}

export function renameResource(doc: DiagramDocument, id: string, label: string): DiagramDocument {
  const next = cloneDocument(doc);
  const resource = next.resources.find((candidate) => candidate.id === id);
  if (!resource) return doc;
  if (resource.props.iconAsset) {
    resource.label = { ...resource.label, service: label || undefined, role: undefined };
    return next;
  }
  resource.label = { ...resource.label, role: label || undefined };
  return next;
}

export function renameGroup(doc: DiagramDocument, id: string, label: string): DiagramDocument {
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.label = label;
  return next;
}

export function updateGroupStep(doc: DiagramDocument, id: string, step?: number): DiagramDocument {
  if (step !== undefined && (!Number.isInteger(step) || step < 0 || step > MAX_EDGE_STEP)) {
    return doc;
  }
  const next = cloneDocument(doc);
  const group = next.groups.find((candidate) => candidate.id === id);
  if (!group) return doc;
  group.step = step;
  return next;
}

export function renameEdge(doc: DiagramDocument, id: string, label: string): DiagramDocument {
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

export function setAnnotationPlace(doc: DiagramDocument, id: string, x: number, y: number): DiagramDocument {
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
    manual: true,
  };
  return next;
}

export function updateAnnotationText(doc: DiagramDocument, id: string, text: string): DiagramDocument {
  const next = cloneDocument(doc);
  const annotation = next.annotations.find((candidate) => candidate.id === id);
  if (!annotation || getDefaultView(doc).annotations?.[id]?.locked || annotation.text === text) return doc;
  annotation.text = text;
  return next;
}

export function updateTextFormat(
  doc: DiagramDocument,
  id: string,
  format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign; theme?: string },
): DiagramDocument {
  const next = cloneDocument(doc);
  const annotation = next.annotations.find((candidate) => candidate.id === id);
  if (!annotation || getDefaultView(doc).annotations?.[id]?.locked) return doc;
  if (format.font !== undefined) annotation.font = format.font;
  if (format.fontSize !== undefined) {
    if (!Number.isFinite(format.fontSize) || format.fontSize < 10 || format.fontSize > 48) return doc;
    annotation.fontSize = Math.round(format.fontSize);
  }
  if (format.align !== undefined) annotation.align = format.align;
  if (format.theme !== undefined) {
    if (format.theme === "") {
      delete annotation.background;
      delete annotation.color;
    } else {
      const preset = getAnnotationTheme(format.theme);
      if (!preset) return doc;
      annotation.background = preset.background;
      annotation.color = preset.color;
    }
  }
  return next;
}

export function setAnnotationStyle(doc: DiagramDocument, id: string, style: AnnotationStyle): DiagramDocument {
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
    sourcePortOffset: sourcePortOffset === undefined ? undefined : normalizePortOffset(sourcePortOffset),
    targetPortOffset: targetPortOffset === undefined ? undefined : normalizePortOffset(targetPortOffset),
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
  if (patch.step !== undefined && (!Number.isInteger(patch.step) || patch.step < 0 || patch.step > MAX_EDGE_STEP)) {
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
/** Move an item between semantic groups while leaving all authored geometry absolute. */
export function removeSelectionPreservingGroupContents(
  doc: DiagramDocument,
  selection: Selection,
  layout?: LayoutResult,
): DiagramDocument {
  const selectedGroupIds = [
    ...new Set(
      selection
        .filter((item) => item.kind === "group")
        .map((item) => item.id)
        .filter((id) => doc.groups.some((group) => group.id === id)),
    ),
  ];
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
    next = deleteOne(next, { kind: "group", id: groupId });
  }
  for (const item of selection) {
    if (item.kind !== "group") next = deleteOne(next, item);
  }
  return next;
}

export function deleteSelection(doc: DiagramDocument, selection: Selection): DiagramDocument {
  let next = doc;
  for (const item of selection) {
    next = deleteOne(next, item);
  }
  return next;
}

function deleteOne(doc: DiagramDocument, selection: SelectionItem): DiagramDocument {
  const next = cloneDocument(doc);
  if (selection.kind === "edge") {
    next.edges = next.edges.filter((edge) => edge.id !== selection.id);
    for (const view of next.views) delete view.routes[selection.id];
    return next;
  }
  if (selection.kind === "annotation") {
    next.annotations = next.annotations.filter((annotation) => annotation.id !== selection.id);
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
  next.edges = next.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target));
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
  const annotationBounds = resolveAnnotationBounds(doc, layout);
  const rects = selection
    .map((item) => boundsFor(item, layout, annotationBounds))
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
    const rect = boundsFor(item, layout, annotationBounds);
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
    } else if (item.kind === "annotation") {
      next = setAnnotationPlace(next, item.id, x, y);
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
  const annotationBounds = resolveAnnotationBounds(doc, layout);
  const items = selection
    .map((item) => ({ item, rect: boundsFor(item, layout, annotationBounds) }))
    .filter((entry): entry is { item: SelectionItem; rect: Rect } => Boolean(entry.rect));
  if (items.length < 3) return doc;
  items.sort((a, b) => (axis === "horizontal" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y));
  const first = items[0]!.rect;
  const last = items.at(-1)!.rect;
  const span = axis === "horizontal" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const totalSize = items.reduce((sum, entry) => sum + (axis === "horizontal" ? entry.rect.w : entry.rect.h), 0);
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
    } else if (entry.item.kind === "annotation") {
      next = setAnnotationPlace(next, entry.item.id, x, y);
    }
    cursor += (axis === "horizontal" ? entry.rect.w : entry.rect.h) + gap;
  }
  return next;
}

function boundsFor(item: SelectionItem, layout: LayoutResult, annotationBounds: Record<string, Rect>): Rect | null {
  if (item.kind === "resource") {
    const node = layout.nodes.find((candidate) => candidate.id === item.id);
    return node?.obstacle ?? null;
  }
  if (item.kind === "group") {
    const group = layout.groups.find((candidate) => candidate.id === item.id);
    return group?.bounds ?? null;
  }
  if (item.kind === "annotation") {
    return annotationBounds[item.id] ?? null;
  }
  return null;
}
