import type { DiagramDocument, LayoutResult, PlaceOverride } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";

import { cloneDocument } from "./document-structure";

/**
 * Copy the currently rendered entity geometry into a document view.
 *
 * Interactive document mutations use this snapshot to make the rendered
 * canvas the baseline for the next source edit. Connector routes are left
 * untouched so changing a resource or group does not accidentally turn an
 * automatically routed connector into an authored route.
 */
export function preserveLayout(doc: DiagramDocument, layout: LayoutResult): DiagramDocument {
  return snapshotLayout(doc, layout, false);
}

/**
 * Copy rendered geometry only for entities that are not already pinned.
 * Existing authored coordinates and flags therefore remain authoritative.
 */
export function preserveUnplacedLayout(doc: DiagramDocument, layout: LayoutResult): DiagramDocument {
  return snapshotLayout(doc, layout, true);
}

function snapshotLayout(
  doc: DiagramDocument,
  layout: LayoutResult,
  skipPinned: boolean,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const groupIds = new Set(doc.groups.map((group) => group.id));
  const resourceIds = new Set(doc.resources.map((resource) => resource.id));

  for (const group of layout.groups) {
    if (!groupIds.has(group.id)) continue;
    const existing = view.places[group.id];
    if (skipPinned && existing?.pin) continue;
    view.places[group.id] = {
      ...(existing ?? {}),
      x: group.bounds.x,
      y: group.bounds.y,
      w: group.bounds.w,
      h: group.bounds.h,
      pin: true,
      manual: true,
    };
  }

  for (const node of layout.nodes) {
    if (!resourceIds.has(node.id)) continue;
    const existing = view.places[node.id];
    if (skipPinned && existing?.pin) continue;
    const place: PlaceOverride = {
      ...(existing ?? {}),
      x: node.obstacle.x,
      y: node.obstacle.y,
      pin: true,
      manual: true,
    };
    view.places[node.id] = place;
  }

  return next;
}
