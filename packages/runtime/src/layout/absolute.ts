import { getDefaultView, getGroup, getResource } from "../core/index.js";
import type {
  DiagramDocument,
  GroupGeom,
  ID,
  LayoutResult,
  NodeGeom,
} from "../core/index.js";
import { GROUP_STYLES } from "../grammar-aws/index.js";

import type { LayoutState } from "./internal.js";
import { LAYOUT_METRICS } from "./metrics.js";

export function finalizeAbsoluteLayout(
  doc: DiagramDocument,
  state: LayoutState,
  canvasX = LAYOUT_METRICS.canvasPadding,
  canvasY = LAYOUT_METRICS.canvasPadding,
): LayoutResult {
  const nodes: NodeGeom[] = [];
  const groups: GroupGeom[] = [];

  const roots = findPositionRoots(doc);
  const view = getDefaultView(doc);
  const flowingRoots = roots.filter((id) => {
    const place = view.places[id];
    return !place?.pin || !place.manual;
  });
  const stagedRoots = roots.filter((id) => !flowingRoots.includes(id));
  const rootHeight = Math.max(
    0,
    ...flowingRoots.map((rootId) => {
      const group = getGroup(doc, rootId);
      if (group) return state.groupGeoms.get(group.id)?.bounds.h ?? 0;
      const resource = getResource(doc, rootId);
      return resource ? state.nodeGeoms.get(resource.id)?.obstacle.h ?? 0 : 0;
    }),
  );
  let cursorX = canvasX;

  for (const rootId of flowingRoots) {
    const group = getGroup(doc, rootId);
    const resource = getResource(doc, rootId);
    const height = group
      ? state.groupGeoms.get(group.id)?.bounds.h ?? 0
      : resource
        ? state.nodeGeoms.get(resource.id)?.obstacle.h ?? 0
        : 0;
    const rootY = canvasY + Math.max(0, (rootHeight - height) / 2);
    if (group) {
      const w = positionGroupTree(doc, state, group.id, cursorX, rootY, nodes, groups);
      cursorX += w + LAYOUT_METRICS.rootGap;
    } else if (resource) {
      const node = state.nodeGeoms.get(resource.id);
      if (node) {
        const abs = translateNode(node, cursorX, rootY);
        nodes.push(abs);
        cursorX += abs.obstacle.w + LAYOUT_METRICS.rootGap;
      }
    }
  }

  // Authored root objects already have explicit absolute coordinates. Measure
  // and emit them so pinned overrides can place them, but do not let them take
  // a slot in the automatic root row or displace existing diagram geometry.
  for (const rootId of stagedRoots) {
    const group = getGroup(doc, rootId);
    const resource = getResource(doc, rootId);
    if (group) {
      positionGroupTree(doc, state, group.id, canvasX, canvasY, nodes, groups);
    } else if (resource) {
      const node = state.nodeGeoms.get(resource.id);
      if (node) nodes.push(translateNode(node, canvasX, canvasY));
    }
  }

  const allRects = [
    ...nodes.map((n) => n.obstacle),
    ...groups.map((g) => g.bounds),
  ];
  const bounds = union(allRects);

  return {
    nodes,
    groups,
    edges: [],
    width: Math.max(
      Math.ceil(bounds.x + bounds.w + LAYOUT_METRICS.canvasPadding),
      LAYOUT_METRICS.minCanvasWidth,
    ),
    height: Math.max(
      Math.ceil(bounds.y + bounds.h + LAYOUT_METRICS.canvasPadding),
      LAYOUT_METRICS.minCanvasHeight,
    ),
    symmetries: [],
  };
}

function positionGroupTree(
  doc: DiagramDocument,
  state: LayoutState,
  groupId: ID,
  x: number,
  y: number,
  nodes: NodeGeom[],
  groups: GroupGeom[],
): number {
  const group = getGroup(doc, groupId)!;
  const local = state.groupGeoms.get(groupId);
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const w = local?.bounds.w ?? 200;
  const h = local?.bounds.h ?? 120;
  const labelPosition = group.labelPosition ?? "top-left";
  const bottom = labelPosition.startsWith("bottom");

  const bounds = { x, y, w, h };
  const header = { x, y: bottom ? y + h - style.headerHeight : y, w, h: style.headerHeight };
  const content = {
    x: x + style.padding,
    y: y + (bottom ? style.padding / 2 : style.headerHeight + style.padding / 2),
    w: w - style.padding * 2,
    h: h - style.headerHeight - style.padding * 1.5,
  };
  const textW = group.label.length * style.fontSize * 0.62;
  const labelW = Math.min(w, Math.max(80, style.iconSize + 12 + textW + 12));
  const labelRect = {
    x: labelPosition.endsWith("right") ? x + w - labelW : x,
    y: bottom ? header.y - 10 : header.y,
    w: labelW,
    h: style.headerHeight + 10,
  };

  groups.push({
    id: groupId,
    kind: group.kind,
    bounds,
    header,
    labelRect,
    content,
    label: group.label,
    labelPosition,
  });

  if (
    group.kind === "region" ||
    group.kind === "vpc" ||
    group.kind === "az" ||
    group.kind === "logical"
  ) {
    positionMixedChildren(doc, state, group, content, nodes, groups);
    return w;
  }
  if (
    group.kind === "subnet" ||
    group.kind === "subnet-public" ||
    group.kind === "subnet-private"
  ) {
    positionSubnetChildren(doc, state, group, content, nodes, groups);
    return w;
  }
  for (const childId of group.children) {
    const childGroup = getGroup(doc, childId);
    const childRes = getResource(doc, childId);
    if (childGroup) {
      const childGeom = state.groupGeoms.get(childGroup.id);
      positionGroupTree(
        doc,
        state,
        childGroup.id,
        content.x + (childGeom?.bounds.x ?? 0),
        content.y + (childGeom?.bounds.y ?? 0),
        nodes,
        groups,
      );
    } else if (childRes) {
      const node = state.nodeGeoms.get(childRes.id);
      if (node) {
        nodes.push(
          moveNodeTo(
            node,
            content.x + node.obstacle.x,
            content.y + node.obstacle.y,
          ),
        );
      }
    }
  }

  return w;
}

function positionSubnetChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number; w?: number },
  nodes: NodeGeom[],
  _groups: GroupGeom[],
): number {
  let maxW = 0;
  for (const childId of group.children) {
    const r = getResource(doc, childId);
    if (!r) continue;
    const node = state.nodeGeoms.get(r.id);
    if (!node) continue;
    nodes.push(
      moveNodeTo(
        node,
        content.x + node.obstacle.x,
        content.y + node.obstacle.y,
      ),
    );
    maxW = Math.max(maxW, node.obstacle.x + node.obstacle.w);
  }
  return maxW;
}

function positionMixedChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number },
  nodes: NodeGeom[],
  groups: GroupGeom[],
): number {
  let maxW = 0;
  for (const childId of group.children) {
    const childGroup = getGroup(doc, childId);
    const childResource = getResource(doc, childId);
    if (childGroup) {
      const local = state.groupGeoms.get(childGroup.id);
      positionGroupTree(
        doc,
        state,
        childGroup.id,
        content.x + (local?.bounds.x ?? 0),
        content.y + (local?.bounds.y ?? 0),
        nodes,
        groups,
      );
      maxW = Math.max(maxW, (local?.bounds.x ?? 0) + (local?.bounds.w ?? 0));
    } else if (childResource) {
      const node = state.nodeGeoms.get(childResource.id);
      if (!node) continue;
      nodes.push(moveNodeTo(node, content.x + node.obstacle.x, content.y + node.obstacle.y));
      maxW = Math.max(maxW, node.obstacle.x + node.obstacle.w);
    }
  }
  return maxW;
}

function moveNodeTo(node: NodeGeom, absX: number, absY: number): NodeGeom {
  return translateNode(node, absX - node.obstacle.x, absY - node.obstacle.y);
}

function translateNode(node: NodeGeom, dx: number, dy: number): NodeGeom {
  return {
    ...node,
    icon: { ...node.icon, x: node.icon.x + dx, y: node.icon.y + dy },
    label: { ...node.label, x: node.label.x + dx, y: node.label.y + dy },
    obstacle: {
      ...node.obstacle,
      x: node.obstacle.x + dx,
      y: node.obstacle.y + dy,
    },
  };
}

function findPositionRoots(doc: DiagramDocument): ID[] {
  const referenced = new Set<ID>();
  for (const g of doc.groups) {
    for (const c of g.children) referenced.add(c);
  }
  const roots: ID[] = [];
  for (const r of doc.resources) {
    if (!referenced.has(r.id) && !r.parent) roots.push(r.id);
  }
  for (const g of doc.groups) {
    if (!referenced.has(g.id) && !g.parent) roots.push(g.id);
  }
  return roots;
}

function union(rects: Array<{ x: number; y: number; w: number; h: number }>) {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
