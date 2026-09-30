import type { DiagramDocument, ID, PlaceOverride } from "@dumb-diagrams/runtime/core";

export function cloneDocument(doc: DiagramDocument): DiagramDocument {
  return structuredClone(doc);
}

export function collectChildren(
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

export function shiftedPlace(
  place: PlaceOverride | undefined,
  dx: number,
  dy: number,
): PlaceOverride {
  return {
    ...(place ?? {}),
    x: Math.round((place?.x ?? 0) + dx),
    y: Math.round((place?.y ?? 0) + dy),
    pin: true,
    manual: true,
  };
}

export function uniqueId(doc: DiagramDocument, base: string): ID {
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
