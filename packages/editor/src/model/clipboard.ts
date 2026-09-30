import type {
  DiagramAsset,
  DiagramDocument,
  PlaceOverride,
  Point,
  Side,
} from "@dumb-diagrams/runtime/core";
import {
  DIAGRAM_LIMITS,
  getDefaultView,
  hasErrors,
  utf8ByteLength,
  validateDocument,
} from "@dumb-diagrams/runtime/core";
import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { sanitizeSvgResult } from "@dumb-diagrams/runtime/render";
import { err, ok, type Result } from "neverthrow";

import { collectChildren, cloneDocument, shiftedPlace, uniqueId } from "./document-structure";
import { isSelectionItem, type Selection } from "./types";

export type ClipboardErrorCode =
  | "clipboard-too-large"
  | "clipboard-invalid-json"
  | "clipboard-unsupported"
  | "clipboard-object-limit"
  | "clipboard-invalid-group"
  | "clipboard-invalid-resource"
  | "clipboard-invalid-edge"
  | "clipboard-invalid-annotation"
  | "clipboard-invalid-asset"
  | "clipboard-invalid-ancestor"
  | "clipboard-invalid-legacy-item"
  | "clipboard-document-invalid";

export type ClipboardError = {
  readonly code: ClipboardErrorCode;
  readonly message: string;
};

export type ClipboardPasteResult = {
  doc: DiagramDocument;
  selection: Selection;
};

type ClipboardResult<T> = Result<T, ClipboardError>;

const clipboardError = (code: ClipboardErrorCode, message: string): ClipboardError => ({ code, message });

export function serializeClipboardResult(
  doc: DiagramDocument,
  selection: Selection,
): ClipboardResult<string> {
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
    return err(clipboardError(
      "clipboard-object-limit",
      `Selection exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object clipboard limit`,
    ));
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
    items: selection,
  };
  const serialized = JSON.stringify(payload);
  if (utf8ByteLength(serialized) > DIAGRAM_LIMITS.clipboardBytes) {
    return err(clipboardError("clipboard-too-large", "Selection exceeds the 512 KiB clipboard limit"));
  }
  return ok(serialized);
}

export function duplicateSelectionResult(doc: DiagramDocument, selection: Selection) {
  const view = getDefaultView(doc);
  const first = selection
    .map((item) => item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id])
    .find(Boolean);
  return serializeClipboardResult(doc, selection).andThen((payload) => pasteClipboardResult(doc, payload, {
    x: (first?.x ?? 0) + 24,
    y: (first?.y ?? 0) + 24,
  }));
}

export function pasteClipboardResult(
  doc: DiagramDocument,
  payload: string,
  at: Point,
): ClipboardResult<ClipboardPasteResult> {
  if (utf8ByteLength(payload) > DIAGRAM_LIMITS.clipboardBytes) {
    return err(clipboardError("clipboard-too-large", "Clipboard payload exceeds the 512 KiB limit"));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return err(clipboardError("clipboard-invalid-json", "Clipboard payload is not valid JSON"));
  }
  const decoded = decodeClipboardPayload(parsed);
  if (decoded.isErr()) return err(decoded.error);
  const data = decoded.value;
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
    return err(clipboardError(
      "clipboard-object-limit",
      `Clipboard payload exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object limit`,
    ));
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
    const sanitized = sanitizeSvgResult(asset.content);
    if (sanitized.isErr()) {
      return err(clipboardError("clipboard-invalid-asset", `Clipboard asset ${asset.id}: ${sanitized.error.message}`));
    }
    const id = uniqueId(next, asset.id);
    assetMap.set(asset.id, id);
    next.assets = [...(next.assets ?? []), {
      id,
      kind: "svg",
      content: sanitized.value.content,
      intrinsicW: sanitized.value.intrinsicW,
      intrinsicH: sanitized.value.intrinsicH,
      hash: sanitized.value.hash,
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
  if (hasErrors(issues)) {
    return err(clipboardError("clipboard-document-invalid", issues[0]?.message ?? "Clipboard payload is invalid"));
  }
  return ok({ doc: next, selection: created });
}

type ClipboardData = {
  type: string;
  items?: Array<Record<string, unknown>>;
  groups?: Array<{ group: DiagramDocument["groups"][number]; place?: PlaceOverride }>;
  ancestorGroups?: string[];
  resources?: Array<{ resource: DiagramDocument["resources"][number]; place?: PlaceOverride }>;
  edges?: DiagramDocument["edges"];
  annotations?: Array<{ annotation: DiagramDocument["annotations"][number]; place?: PlaceOverride }>;
  assets?: DiagramAsset[];
};

function decodeClipboardPayload(input: unknown): Result<ClipboardData, ClipboardError> {
  if (!isRecord(input) || input.type !== "dumb-diagrams/clipboard") {
    return err(clipboardError("clipboard-unsupported", "Unsupported clipboard payload"));
  }
  for (const key of ["groups", "resources", "edges", "annotations", "assets", "items", "ancestorGroups"] as const) {
    if (input[key] !== undefined && !Array.isArray(input[key])) {
      return err(clipboardError("clipboard-invalid-json", `Clipboard ${key} must be an array`));
    }
  }
  const groups = input.groups as unknown[] | undefined;
  const resources = input.resources as unknown[] | undefined;
  const edges = input.edges as unknown[] | undefined;
  const annotations = input.annotations as unknown[] | undefined;
  const assets = input.assets as unknown[] | undefined;
  const modernItemCount = (groups?.length ?? 0) + (resources?.length ?? 0) + (edges?.length ?? 0) + (annotations?.length ?? 0);
  const legacyItemCount = (input.items as unknown[] | undefined)?.length ?? 0;
  if (modernItemCount > DIAGRAM_LIMITS.clipboardItems || legacyItemCount > DIAGRAM_LIMITS.clipboardItems) {
    return err(clipboardError("clipboard-object-limit", `Clipboard payload exceeds the ${DIAGRAM_LIMITS.clipboardItems}-object limit`));
  }
  if (groups?.some((item) => !isRecord(item) || !validGroup(item.group) || !validPlace(item.place))) {
    return err(clipboardError("clipboard-invalid-group", "Clipboard contains an invalid group"));
  }
  if (resources?.some((item) => !isRecord(item) || !validResource(item.resource) || !validPlace(item.place))) {
    return err(clipboardError("clipboard-invalid-resource", "Clipboard contains an invalid resource"));
  }
  if (edges?.some((item) => !validEdge(item))) {
    return err(clipboardError("clipboard-invalid-edge", "Clipboard contains an invalid edge"));
  }
  if (annotations?.some((item) => !isRecord(item) || !validAnnotation(item.annotation) || !validPlace(item.place))) {
    return err(clipboardError("clipboard-invalid-annotation", "Clipboard contains an invalid annotation"));
  }
  if (assets?.some((item) => !validAsset(item))) {
    return err(clipboardError("clipboard-invalid-asset", "Clipboard contains an invalid asset"));
  }
  if ((input.ancestorGroups as unknown[] | undefined)?.some((id) => typeof id !== "string")) {
    return err(clipboardError("clipboard-invalid-ancestor", "Clipboard ancestor group ids must be strings"));
  }
  if ((input.items as unknown[] | undefined)?.some((item) => !validLegacyClipboardItem(item))) {
    return err(clipboardError("clipboard-invalid-legacy-item", "Clipboard legacy items are invalid"));
  }
  return ok(input as ClipboardData);
}

function validLegacyClipboardItem(value: unknown): boolean {
  if (!isRecord(value) || !validPlace(value.place)) return false;
  if (typeof value.id === "string" && isSelectionItem(value)) return true;
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
  const groupKinds = new Set(["cloud", "account", "region", "vpc", "az", "subnet", "subnet-public", "subnet-private", "logical", "overlay", "auto-scaling", "ec2-instance", "elastic-beanstalk", "spot-fleet", "step-functions"]);
  return isRecord(value) && typeof value.id === "string" && typeof value.kind === "string" && groupKinds.has(value.kind) && typeof value.label === "string" &&
    Array.isArray(value.children) && value.children.every((id) => typeof id === "string") &&
    (value.parent === undefined || typeof value.parent === "string") &&
    (value.labelPosition === undefined || value.labelPosition === "top-left" || value.labelPosition === "top-right") &&
    (value.hideIcon === undefined || typeof value.hideIcon === "boolean") &&
    (value.style === undefined || value.style === "solid" || value.style === "dashed") &&
    (value.color === undefined || value.color === "graphite" || value.color === "blue" || value.color === "teal" || value.color === "purple" || value.color === "amber" || value.color === "red" || value.color === "green") &&
    (value.fill === undefined || value.fill === "subtle" || value.fill === "none") &&
    (value.step === undefined || (typeof value.step === "number" && Number.isInteger(value.step) && value.step >= 0 && value.step <= 99));
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
    (value.color === undefined || value.color === "graphite" || value.color === "blue" || value.color === "teal" || value.color === "purple" || value.color === "amber" || value.color === "red" || value.color === "green");
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

function legacyClipboardGroups(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "group" && item.group).map((item) => ({ group: item.group as DiagramDocument["groups"][number], place: item.place as PlaceOverride }));
}

function legacyClipboardResources(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "resource" && item.resource).map((item) => ({ resource: item.resource as DiagramDocument["resources"][number], place: item.place as PlaceOverride }));
}

function legacyClipboardEdges(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "edge" && item.edge).map((item) => item.edge as DiagramDocument["edges"][number]);
}

function legacyClipboardAnnotations(items: Array<Record<string, unknown>>) {
  return items.filter((item) => item.kind === "annotation" && item.annotation).map((item) => ({ annotation: item.annotation as DiagramDocument["annotations"][number], place: item.place as PlaceOverride }));
}
