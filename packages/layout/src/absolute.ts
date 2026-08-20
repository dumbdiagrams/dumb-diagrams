import { getGroup, getResource } from "@dumb-diagrams/core";
import type {
  DiagramDocument,
  GroupGeom,
  ID,
  LayoutResult,
  NodeGeom,
} from "@dumb-diagrams/core";
import { GROUP_STYLES } from "@dumb-diagrams/grammar-aws";

import type { LayoutState } from "./internal.js";

export function finalizeAbsoluteLayout(
  doc: DiagramDocument,
  state: LayoutState,
  canvasX = 48,
  canvasY = 48,
): LayoutResult {
  const nodes: NodeGeom[] = [];
  const groups: GroupGeom[] = [];

  const roots = findPositionRoots(doc);
  let cursorX = canvasX;

  for (const rootId of roots) {
    const group = getGroup(doc, rootId);
    const resource = getResource(doc, rootId);
    if (group) {
      const w = positionGroupTree(doc, state, group.id, cursorX, canvasY, nodes, groups);
      cursorX += w + 48;
    } else if (resource) {
      const node = state.nodeGeoms.get(resource.id);
      if (node) {
        const abs = translateNode(node, cursorX, canvasY);
        nodes.push(abs);
        cursorX += abs.obstacle.w + 48;
      }
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
    width: Math.max(Math.ceil(bounds.x + bounds.w + 48), 800),
    height: Math.max(Math.ceil(bounds.y + bounds.h + 48), 600),
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

  const bounds = { x, y, w, h };
  const header = { x, y, w, h: style.headerHeight };
  const content = {
    x: x + style.padding,
    y: y + style.headerHeight + style.padding / 2,
    w: w - style.padding * 2,
    h: h - style.headerHeight - style.padding * 1.5,
  };

  groups.push({
    id: groupId,
    kind: group.kind,
    bounds,
    header,
    content,
    label: group.label,
  });

  if (group.kind === "region") {
    return positionRegionChildren(doc, state, group, content, nodes, groups);
  }
  if (group.kind === "vpc") {
    return positionVpcChildren(doc, state, group, content, nodes, groups);
  }
  if (group.kind === "az") {
    return positionAzChildren(doc, state, group, content, nodes, groups);
  }
  if (
    group.kind === "subnet" ||
    group.kind === "subnet-public" ||
    group.kind === "subnet-private"
  ) {
    return positionSubnetChildren(doc, state, group, content, nodes, groups);
  }
  if (group.kind === "logical") {
    return positionLogicalChildren(doc, state, group, content, nodes, groups);
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

function positionRegionChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number; w: number; h: number },
  nodes: NodeGeom[],
  groups: GroupGeom[],
): number {
  const vpcChildren = group.children
    .map((id) => getGroup(doc, id))
    .filter((g) => g && g.kind === "vpc");
  const others = group.children.filter(
    (id) => !vpcChildren.some((v) => v!.id === id),
  );

  let x = content.x;
  let maxW = 0;
  let maxH = 0;

  for (const vpc of vpcChildren) {
    if (!vpc) continue;
    const local = state.groupGeoms.get(vpc.id);
    const w = local?.bounds.w ?? 300;
    const h = local?.bounds.h ?? 200;
    positionGroupTree(doc, state, vpc.id, x, content.y, nodes, groups);
    x += w + 32;
    maxW = x - content.x - 32;
    maxH = Math.max(maxH, h);
  }

  let sideY = content.y;
  const sideX = content.x + maxW + 48;
  for (const childId of others) {
    const g = getGroup(doc, childId);
    const r = getResource(doc, childId);
    if (g) {
      const local = state.groupGeoms.get(g.id);
      const h = local?.bounds.h ?? 100;
      positionGroupTree(doc, state, g.id, sideX, sideY, nodes, groups);
      sideY += h + 24;
      maxH = Math.max(maxH, sideY - content.y);
    } else if (r) {
      const node = state.nodeGeoms.get(r.id);
      if (node) {
        nodes.push(translateNode(node, sideX, sideY));
        sideY += node.obstacle.h + 24;
      }
    }
  }

  return Math.max(maxW + 48 + 160, state.groupGeoms.get(group.id)?.bounds.w ?? 400);
}

function positionVpcChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number },
  nodes: NodeGeom[],
  groups: GroupGeom[],
): number {
  const azs = group.children
    .map((id) => getGroup(doc, id))
    .filter((g) => g && g.kind === "az");

  const widths = azs.map((az) => state.groupGeoms.get(az!.id)?.bounds.w ?? 200);
  const maxW = Math.max(...widths, 200);

  let x = content.x;
  for (const az of azs) {
    if (!az) continue;
    positionGroupTree(doc, state, az.id, x, content.y, nodes, groups);
    x += maxW + 24;
  }

  return azs.length * (maxW + 24);
}

function positionAzChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number },
  nodes: NodeGeom[],
  groups: GroupGeom[],
): number {
  const subnets = group.children
    .map((id) => getGroup(doc, id))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .sort((a, b) => {
      const order = (k: string) =>
        k === "subnet-public" ? 0 : k === "subnet-private" ? 1 : 2;
      return order(a.kind) - order(b.kind);
    });

  let y = content.y;
  let maxW = 0;
  for (const subnet of subnets) {
    const local = state.groupGeoms.get(subnet.id);
    const w = local?.bounds.w ?? 160;
    const h = local?.bounds.h ?? 100;
    positionGroupTree(doc, state, subnet.id, content.x, y, nodes, groups);
    y += h + 20;
    maxW = Math.max(maxW, w);
  }
  return maxW;
}

function positionSubnetChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number; w?: number },
  nodes: NodeGeom[],
  _groups: GroupGeom[],
): number {
  const groupGeom = state.groupGeoms.get(group.id);
  const contentW = groupGeom?.content.w ?? content.w ?? 160;
  let maxW = 0;
  for (const childId of group.children) {
    const r = getResource(doc, childId);
    if (!r) continue;
    const node = state.nodeGeoms.get(r.id);
    if (!node) continue;
    const targetIconX = Math.round(content.x + (contentW - node.icon.w) / 2);
    const localIconX = node.icon.x - node.obstacle.x;
    const absY = content.y + node.obstacle.y;
    nodes.push(moveNodeTo(node, targetIconX - localIconX, absY));
    maxW = Math.max(maxW, node.obstacle.w);
  }
  return maxW;
}

function positionLogicalChildren(
  doc: DiagramDocument,
  state: LayoutState,
  group: ReturnType<typeof getGroup> & object,
  content: { x: number; y: number; w?: number },
  nodes: NodeGeom[],
  _groups: GroupGeom[],
): number {
  const groupGeom = state.groupGeoms.get(group.id);
  const contentW = groupGeom?.content.w ?? content.w ?? 120;
  let maxW = 0;
  const resources = group.children
    .map((id) => getResource(doc, id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => {
      if (a.role === "secondary") return 1;
      if (b.role === "secondary") return -1;
      return 0;
    });

  for (const r of resources) {
    const node = state.nodeGeoms.get(r.id);
    if (!node) continue;
    const targetIconX = Math.round(content.x + (contentW - node.icon.w) / 2);
    const localIconX = node.icon.x - node.obstacle.x;
    const absY = content.y + node.obstacle.y;
    nodes.push(moveNodeTo(node, targetIconX - localIconX, absY));
    maxW = Math.max(maxW, node.obstacle.w);
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
