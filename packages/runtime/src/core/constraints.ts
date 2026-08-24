import type { DiagramDocument, ValidationIssue } from "./types.js";

export const DIAGRAM_LIMITS = Object.freeze({
  sourceBytes: 1024 * 1024,
  idCharacters: 128,
  titleCharacters: 120,
  labelCharacters: 120,
  annotationCharacters: 4_000,
  filenameCharacters: 128,
  resources: 500,
  groups: 200,
  edges: 1_000,
  annotations: 200,
  assets: 50,
  views: 10,
  hierarchyDepth: 20,
  routePoints: 200,
  coordinateMagnitude: 1_000_000,
  minimumDimension: 1,
  maximumDimension: 10_000,
  svgBytes: 256 * 1024,
  totalAssetBytes: 2 * 1024 * 1024,
  clipboardBytes: 512 * 1024,
  clipboardItems: 250,
  searchCharacters: 200,
  workspaceBytes: 5 * 1024 * 1024,
});

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function characterLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeSingleLineText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMultilineText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .trim();
}

export function validateDocumentConstraints(doc: DiagramDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  checkCount(issues, "resources", doc.resources, DIAGRAM_LIMITS.resources);
  checkCount(issues, "groups", doc.groups, DIAGRAM_LIMITS.groups);
  checkCount(issues, "edges", doc.edges, DIAGRAM_LIMITS.edges);
  checkCount(issues, "annotations", doc.annotations, DIAGRAM_LIMITS.annotations);
  checkCount(issues, "assets", doc.assets ?? [], DIAGRAM_LIMITS.assets);
  checkCount(issues, "views", doc.views, DIAGRAM_LIMITS.views);

  checkText(issues, "diagram id", doc.id, DIAGRAM_LIMITS.idCharacters, doc.id, "invalid-id");
  if (doc.title !== undefined) {
    checkText(issues, "diagram title", doc.title, DIAGRAM_LIMITS.titleCharacters, doc.id, "text-limit");
  }

  for (const group of doc.groups) {
    checkText(issues, "group id", group.id, DIAGRAM_LIMITS.idCharacters, group.id, "invalid-id");
    checkText(issues, "group label", group.label, DIAGRAM_LIMITS.labelCharacters, group.id, "text-limit");
    if (group.labelPosition !== undefined && !isGroupLabelPosition(group.labelPosition)) {
      issues.push({ level: "error", code: "invalid-label-position", message: `Invalid group label position: ${group.labelPosition}`, id: group.id });
    }
    checkOptionalNumber(issues, group.step, "group step", group.id, 0, 99);
    if (group.parent) checkText(issues, "parent id", group.parent, DIAGRAM_LIMITS.idCharacters, group.id, "invalid-id");
    for (const child of group.children) checkText(issues, "child id", child, DIAGRAM_LIMITS.idCharacters, group.id, "invalid-id");
  }
  for (const resource of doc.resources) {
    checkText(issues, "resource id", resource.id, DIAGRAM_LIMITS.idCharacters, resource.id, "invalid-id");
    checkText(issues, "resource type", resource.type, DIAGRAM_LIMITS.idCharacters, resource.id, "invalid-id");
    if (resource.parent) checkText(issues, "parent id", resource.parent, DIAGRAM_LIMITS.idCharacters, resource.id, "invalid-id");
    if (resource.label.service !== undefined) checkText(issues, "service label", resource.label.service, DIAGRAM_LIMITS.labelCharacters, resource.id, "text-limit");
    if (resource.label.role !== undefined) checkText(issues, "resource label", resource.label.role, DIAGRAM_LIMITS.labelCharacters, resource.id, "text-limit");
    if (resource.label.position !== undefined && !isResourceLabelPosition(resource.label.position)) {
      issues.push({ level: "error", code: "invalid-label-position", message: `Invalid resource label position: ${resource.label.position}`, id: resource.id });
    }
  }
  for (const edge of doc.edges) {
    checkText(issues, "edge id", edge.id, DIAGRAM_LIMITS.idCharacters, edge.id, "invalid-id");
    checkText(issues, "edge source", edge.source, DIAGRAM_LIMITS.idCharacters, edge.id, "invalid-id");
    checkText(issues, "edge target", edge.target, DIAGRAM_LIMITS.idCharacters, edge.id, "invalid-id");
    if (edge.label !== undefined) checkText(issues, "edge label", edge.label, DIAGRAM_LIMITS.labelCharacters, edge.id, "text-limit");
    checkOptionalNumber(issues, edge.step, "edge step", edge.id);
    checkOptionalNumber(issues, edge.sourcePortOffset, "source port offset", edge.id, 0, 1);
    checkOptionalNumber(issues, edge.targetPortOffset, "target port offset", edge.id, 0, 1);
  }
  for (const annotation of doc.annotations) {
    checkText(issues, "annotation id", annotation.id, DIAGRAM_LIMITS.idCharacters, annotation.id, "invalid-id");
    checkText(issues, "annotation text", annotation.text, DIAGRAM_LIMITS.annotationCharacters, annotation.id, "text-limit");
    if (annotation.anchor) checkText(issues, "annotation anchor", annotation.anchor, DIAGRAM_LIMITS.idCharacters, annotation.id, "invalid-id");
  }

  let totalAssetBytes = 0;
  for (const asset of doc.assets ?? []) {
    checkText(issues, "asset id", asset.id, DIAGRAM_LIMITS.idCharacters, asset.id, "invalid-id");
    const bytes = utf8ByteLength(asset.content);
    totalAssetBytes += bytes;
    if (bytes > DIAGRAM_LIMITS.svgBytes) {
      issues.push(limitIssue("asset-size-limit", `Asset ${asset.id} exceeds the 256 KiB limit`, asset.id));
    }
    checkDimension(issues, asset.intrinsicW, "asset width", asset.id);
    checkDimension(issues, asset.intrinsicH, "asset height", asset.id);
  }
  if (totalAssetBytes > DIAGRAM_LIMITS.totalAssetBytes) {
    issues.push(limitIssue("total-asset-size-limit", "Embedded assets exceed the 2 MiB total limit"));
  }

  for (const view of doc.views) {
    checkText(issues, "view id", view.id, DIAGRAM_LIMITS.idCharacters, view.id, "invalid-id");
    for (const [id, place] of [...Object.entries(view.places), ...Object.entries(view.annotations ?? {})]) {
      checkText(issues, "place id", id, DIAGRAM_LIMITS.idCharacters, id, "invalid-id");
      checkCoordinate(issues, place.x, "x", id);
      checkCoordinate(issues, place.y, "y", id);
      checkDimension(issues, place.w, "width", id, true);
      checkDimension(issues, place.h, "height", id, true);
      checkOptionalNumber(issues, place.zIndex, "z-index", id, -DIAGRAM_LIMITS.coordinateMagnitude, DIAGRAM_LIMITS.coordinateMagnitude);
    }
    for (const [id, route] of Object.entries(view.routes)) {
      const points = route.points ?? route.waypoints ?? [];
      if (points.length > DIAGRAM_LIMITS.routePoints) {
        issues.push(limitIssue("route-point-limit", `Route ${id} exceeds ${DIAGRAM_LIMITS.routePoints} points`, id));
      }
      for (const point of points) {
        checkCoordinate(issues, point.x, "route x", id);
        checkCoordinate(issues, point.y, "route y", id);
      }
      checkOptionalNumber(issues, route.badgeT, "badge position", id, 0, 1);
      checkOptionalNumber(issues, route.labelT, "label position", id, 0, 1);
    }
  }

  validateHierarchy(doc, issues);
  return issues;
}

function isResourceLabelPosition(value: string): boolean {
  return value === "top" || value === "bottom" || value === "left" || value === "right";
}

function isGroupLabelPosition(value: string): boolean {
  return value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right";
}

function checkCount(issues: ValidationIssue[], name: string, values: unknown[], limit: number): void {
  if (values.length > limit) issues.push(limitIssue("object-count-limit", `Diagram exceeds the ${limit}-${name} limit`));
}

function checkText(issues: ValidationIssue[], name: string, value: unknown, limit: number, id: string, code: string): void {
  const invalidId = code === "invalid-id" && typeof value === "string" && !/^[A-Za-z_./-][A-Za-z0-9_./-]*$/.test(value);
  const multilineOnly = name === "annotation text";
  const invalidLineBreak = !multilineOnly && typeof value === "string" && /[\r\n\t]/.test(value);
  if (typeof value !== "string" || !value || characterLength(value) > limit || invalidId || invalidLineBreak || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) {
    issues.push(limitIssue(code, `${name} must be non-empty, free of control characters, and at most ${limit} characters`, id));
  }
}

function checkOptionalNumber(issues: ValidationIssue[], value: number | undefined, name: string, id: string, min: number = -DIAGRAM_LIMITS.coordinateMagnitude, max: number = DIAGRAM_LIMITS.coordinateMagnitude): void {
  if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) {
    issues.push(limitIssue("numeric-range", `${name} for ${id} must be finite and between ${min} and ${max}`, id));
  }
}

function checkCoordinate(issues: ValidationIssue[], value: number | undefined, name: string, id: string): void {
  checkOptionalNumber(issues, value, name, id);
}

function checkDimension(issues: ValidationIssue[], value: number | undefined, name: string, id: string, optional = false): void {
  if (value === undefined && optional) return;
  if (value === undefined || !Number.isFinite(value) || value < DIAGRAM_LIMITS.minimumDimension || value > DIAGRAM_LIMITS.maximumDimension) {
    issues.push(limitIssue("dimension-range", `${name} for ${id} must be between ${DIAGRAM_LIMITS.minimumDimension} and ${DIAGRAM_LIMITS.maximumDimension}`, id));
  }
}

function validateHierarchy(doc: DiagramDocument, issues: ValidationIssue[]): void {
  const parents = new Map(doc.groups.map((group) => [group.id, group.parent]));
  for (const group of doc.groups) {
    const seen = new Set<string>();
    let current: string | undefined = group.id;
    let depth = 0;
    let depthReported = false;
    while (current) {
      if (seen.has(current)) {
        issues.push(limitIssue("hierarchy-cycle", `Group hierarchy contains a cycle at ${current}`, group.id));
        break;
      }
      seen.add(current);
      depth++;
      if (depth > DIAGRAM_LIMITS.hierarchyDepth && !depthReported) {
        issues.push(limitIssue("hierarchy-depth-limit", `Group ${group.id} exceeds the maximum hierarchy depth of ${DIAGRAM_LIMITS.hierarchyDepth}`, group.id));
        depthReported = true;
      }
      current = parents.get(current);
    }
  }
}

function limitIssue(code: string, message: string, id?: string): ValidationIssue {
  return { level: "error", code, message, ...(id ? { id } : {}) };
}
