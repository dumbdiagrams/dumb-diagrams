import type { DiagramDocument, LayoutResult, Point } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";

export type InteractionCandidates = {
  nodes: LayoutResult["nodes"];
  edges: LayoutResult["edges"];
  groups: LayoutResult["groups"];
  annotations: DiagramDocument["annotations"];
};

type InteractionBucket = {
  nodes: Set<LayoutResult["nodes"][number]>;
  edges: Set<LayoutResult["edges"][number]>;
  groups: Set<LayoutResult["groups"][number]>;
  annotations: Set<DiagramDocument["annotations"][number]>;
};

const INTERACTION_CELL_SIZE = 160;
const MAX_INDEXED_CELLS_PER_ITEM = 512;
const entityVisibilityCache = new WeakMap<DiagramDocument, WeakMap<object, ReadonlyMap<string, boolean>>>();

export function isEntityVisible(doc: DiagramDocument, view: ReturnType<typeof getDefaultView>, id: string): boolean {
  if (view.places[id]?.visible === false || view.annotations?.[id]?.visible === false) return false;
  let byView = entityVisibilityCache.get(doc);
  if (!byView) {
    byView = new WeakMap();
    entityVisibilityCache.set(doc, byView);
  }
  let visibility = byView.get(view);
  if (!visibility) {
    visibility = buildEntityVisibility(doc, view);
    byView.set(view, visibility);
  }
  return visibility.get(id) ?? true;
}

export function createInteractionIndex(
  layout: LayoutResult,
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
): { at: (point: Point) => InteractionCandidates } {
  const buckets = new Map<string, InteractionBucket>();
  const overflow = createInteractionBucket();
  const addRect = <K extends keyof InteractionBucket>(
    kind: K,
    item: Parameters<InteractionBucket[K]["add"]>[0],
    rect: { x: number; y: number; w: number; h: number },
    padding: number,
  ) => {
    const minX = Math.floor((rect.x - padding) / INTERACTION_CELL_SIZE);
    const maxX = Math.floor((rect.x + rect.w + padding) / INTERACTION_CELL_SIZE);
    const minY = Math.floor((rect.y - padding) / INTERACTION_CELL_SIZE);
    const maxY = Math.floor((rect.y + rect.h + padding) / INTERACTION_CELL_SIZE);
    const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (cellCount > MAX_INDEXED_CELLS_PER_ITEM) {
      (overflow[kind] as Set<typeof item>).add(item);
      return;
    }
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = createInteractionBucket();
          buckets.set(key, bucket);
        }
        (bucket[kind] as Set<typeof item>).add(item);
      }
    }
  };

  for (const node of layout.nodes) addRect("nodes", node, node.obstacle, 6);
  for (const group of layout.groups) {
    const bounds = group.bounds;
    addRect("groups", group, { x: bounds.x, y: bounds.y, w: bounds.w, h: 0 }, 18);
    addRect("groups", group, { x: bounds.x, y: bounds.y + bounds.h, w: bounds.w, h: 0 }, 18);
    addRect("groups", group, { x: bounds.x, y: bounds.y, w: 0, h: bounds.h }, 18);
    addRect("groups", group, { x: bounds.x + bounds.w, y: bounds.y, w: 0, h: bounds.h }, 18);
  }
  for (const edge of layout.edges) {
    for (let index = 1; index < edge.points.length; index += 1) {
      const start = edge.points[index - 1]!;
      const end = edge.points[index]!;
      addRect(
        "edges",
        edge,
        {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
        },
        16,
      );
    }
    if (edge.labelRect) addRect("edges", edge, edge.labelRect, 0);
  }
  for (const annotation of doc.annotations) {
    const place = view.annotations?.[annotation.id];
    addRect(
      "annotations",
      annotation,
      {
        x: place?.x ?? 48,
        y: place?.y ?? 48,
        w: place?.w ?? 160,
        h: place?.h ?? 48,
      },
      16,
    );
  }

  return {
    at: (point) => {
      const bucket = buckets.get(
        `${Math.floor(point.x / INTERACTION_CELL_SIZE)}:${Math.floor(point.y / INTERACTION_CELL_SIZE)}`,
      );
      return {
        nodes: [...(bucket?.nodes ?? []), ...overflow.nodes],
        edges: [...(bucket?.edges ?? []), ...overflow.edges],
        groups: [...(bucket?.groups ?? []), ...overflow.groups],
        annotations: [...(bucket?.annotations ?? []), ...overflow.annotations],
      };
    },
  };
}

function buildEntityVisibility(
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
): ReadonlyMap<string, boolean> {
  const parents = new Map<string, string | undefined>();
  for (const resource of doc.resources) parents.set(resource.id, resource.parent);
  for (const group of doc.groups) parents.set(group.id, group.parent);

  const visibility = new Map<string, boolean>();
  const resolving = new Set<string>();
  const resolve = (id: string): boolean => {
    const cached = visibility.get(id);
    if (cached !== undefined) return cached;
    if (view.places[id]?.visible === false || view.annotations?.[id]?.visible === false) {
      visibility.set(id, false);
      return false;
    }
    const parent = parents.get(id);
    if (!parent) {
      visibility.set(id, true);
      return true;
    }
    if (resolving.has(id)) return false;
    resolving.add(id);
    const visible = resolve(parent);
    resolving.delete(id);
    visibility.set(id, visible);
    return visible;
  };

  for (const id of parents.keys()) resolve(id);
  for (const annotation of doc.annotations) resolve(annotation.id);
  return visibility;
}

function createInteractionBucket(): InteractionBucket {
  return {
    nodes: new Set(),
    edges: new Set(),
    groups: new Set(),
    annotations: new Set(),
  };
}
