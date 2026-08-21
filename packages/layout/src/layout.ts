import { getCatalogEntry } from "@dumb-diagrams/catalog";
import {
  getDefaultView,
  getGroup,
  getResource,
} from "@dumb-diagrams/core";
import type {
  DiagramDocument,
  Group,
  GroupGeom,
  ID,
  LayoutResult,
  NodeGeom,
  Rect,
  Resource,
} from "@dumb-diagrams/core";
import { GRAMMAR, GROUP_STYLES, snap } from "@dumb-diagrams/grammar-aws";

import type { LayoutState } from "./internal.js";
import { finalizeAbsoluteLayout } from "./absolute.js";

interface Measured {
  w: number;
  h: number;
}

const H_GAP = 32;
const V_GAP = 24;
const RESOURCE_GAP = 36;

export function layoutDocument(doc: DiagramDocument): LayoutResult {
  const state: LayoutState = {
    nodeGeoms: new Map(),
    groupGeoms: new Map(),
  };

  const roots = findRoots(doc);
  for (const rootId of roots) {
    const group = getGroup(doc, rootId);
    const resource = getResource(doc, rootId);
    if (group) layoutGroup(doc, group.id, state);
    else if (resource) measureResource(doc, resource, state);
  }

  equalizeSymmetry(doc, state);
  const layout = finalizeAbsoluteLayout(doc, state);
  applyPinnedViewOverrides(doc, layout);
  sortLayoutByZIndex(doc, layout);
  return layout;
}

function findRoots(doc: DiagramDocument): ID[] {
  const childIds = new Set<ID>();
  for (const g of doc.groups) {
    for (const c of g.children) childIds.add(c);
    for (const b of g.borderChildren ?? []) childIds.add(b.id);
  }
  const roots: ID[] = [];
  for (const g of doc.groups) {
    if (!g.parent && !childIds.has(g.id)) roots.push(g.id);
  }
  for (const r of doc.resources) {
    if (!r.parent && !childIds.has(r.id)) roots.push(r.id);
  }
  if (roots.length === 0) {
    for (const r of doc.resources) {
      if (!r.parent) roots.push(r.id);
    }
    for (const g of doc.groups) {
      if (!g.parent) roots.push(g.id);
    }
  }
  return roots;
}

function layoutGroup(
  doc: DiagramDocument,
  groupId: ID,
  state: LayoutState,
): Measured {
  const group = getGroup(doc, groupId)!;
  const style = GROUP_STYLES[group.kind];

  if (group.kind === "az") {
    return layoutAzGroup(doc, group, state);
  }
  if (group.kind === "vpc") {
    return layoutVpcGroup(doc, group, state);
  }
  if (group.kind === "region") {
    return layoutRegionGroup(doc, group, state);
  }
  if (group.kind === "logical") {
    return layoutLogicalGroup(doc, group, state);
  }
  if (
    group.kind === "subnet" ||
    group.kind === "subnet-public" ||
    group.kind === "subnet-private"
  ) {
    return layoutSubnetGroup(doc, group, state);
  }

  return layoutGenericGroup(doc, group, state, style.padding);
}

function layoutRegionGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
): Measured {
  const style = GROUP_STYLES.region;
  const vpcChildren = group.children
    .map((id) => getGroup(doc, id))
    .filter((g): g is Group => !!g && g.kind === "vpc");
  const otherChildren = group.children.filter(
    (id) => !vpcChildren.some((v) => v.id === id),
  );

  let contentW = 0;
  let contentH = 0;
  let x = 0;

  for (const vpc of vpcChildren) {
    const size = layoutGroup(doc, vpc.id, state);
    placeGroup(state, vpc.id, x, 0, getDefaultView(doc));
    x += size.w + H_GAP;
    contentW = x - H_GAP;
    contentH = Math.max(contentH, size.h);
  }

  let sideX = contentW > 0 ? contentW + H_GAP : 0;
  let sideY = 0;
  for (const childId of otherChildren) {
    const g = getGroup(doc, childId);
    const r = getResource(doc, childId);
    if (g) {
      const size = layoutGroup(doc, g.id, state);
      placeGroup(state, g.id, sideX, sideY, getDefaultView(doc));
      contentW = Math.max(contentW, sideX + size.w);
      contentH = Math.max(contentH, sideY + size.h);
      sideY += size.h + V_GAP;
    } else if (r) {
      measureResource(doc, r, state);
      placeResource(state, r.id, sideX, sideY, getDefaultView(doc));
      const geom = state.nodeGeoms.get(r.id)!;
      contentW = Math.max(contentW, sideX + geom.obstacle.w);
      contentH = Math.max(contentH, sideY + geom.obstacle.h);
      sideY += geom.obstacle.h + V_GAP;
    }
  }

  const w = contentW + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutVpcGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
): Measured {
  const style = GROUP_STYLES.vpc;
  let contentW = 0;
  let contentH = 0;
  let x = 0;

  for (const childId of group.children) {
    const childGroup = getGroup(doc, childId);
    const childResource = getResource(doc, childId);
    if (childGroup) {
      const size = layoutGroup(doc, childGroup.id, state);
      placeGroup(state, childGroup.id, x, 0, getDefaultView(doc));
      x += size.w + H_GAP;
      contentW = x - H_GAP;
      contentH = Math.max(contentH, size.h);
    } else if (childResource) {
      const size = measureResource(doc, childResource, state);
      placeResource(state, childResource.id, x, 0, getDefaultView(doc));
      x += size.w + H_GAP;
      contentW = x - H_GAP;
      contentH = Math.max(contentH, size.h);
    }
  }

  const w = Math.max(contentW, 200) + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutAzGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
): Measured {
  const style = GROUP_STYLES.az;
  let contentW = 0;
  let contentH = 0;
  let y = 0;

  for (const childId of group.children) {
    const childGroup = getGroup(doc, childId);
    const childResource = getResource(doc, childId);
    if (childGroup) {
      const size = layoutGroup(doc, childGroup.id, state);
      placeGroup(state, childGroup.id, 0, y, getDefaultView(doc));
      contentW = Math.max(contentW, size.w);
      y += size.h + V_GAP;
      contentH = y - V_GAP;
    } else if (childResource) {
      const size = measureResource(doc, childResource, state);
      placeResource(state, childResource.id, 0, y, getDefaultView(doc));
      contentW = Math.max(contentW, size.w);
      y += size.h + V_GAP;
      contentH = y - V_GAP;
    }
  }

  const w = Math.max(contentW, 180) + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutSubnetGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
): Measured {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.subnet;
  let contentW = 0;
  let contentH = 0;
  let y = 0;

  for (const childId of group.children) {
    const r = getResource(doc, childId);
    if (!r) continue;
    measureResource(doc, r, state);
    placeResource(state, r.id, 0, y, getDefaultView(doc));
    const geom = state.nodeGeoms.get(r.id)!;
    contentW = Math.max(contentW, geom.obstacle.w);
    y += geom.obstacle.h + RESOURCE_GAP;
    contentH = y - RESOURCE_GAP;
  }

  const w = Math.max(contentW, 140) + style.padding * 2;
  const h = Math.max(contentH, 80) + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutLogicalGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
): Measured {
  const style = GROUP_STYLES.logical;
  let contentW = 0;
  let contentH = 0;
  let y = 0;

  for (const childId of group.children) {
    const childGroup = getGroup(doc, childId);
    const childResource = getResource(doc, childId);
    if (childGroup) {
      const size = layoutGroup(doc, childGroup.id, state);
      placeGroup(state, childGroup.id, 0, y, getDefaultView(doc));
      contentW = Math.max(contentW, size.w);
      y += size.h + V_GAP;
      contentH = y - V_GAP;
    } else if (childResource) {
      const size = measureResource(doc, childResource, state);
      placeResource(state, childResource.id, 0, y, getDefaultView(doc));
      contentW = Math.max(contentW, size.w);
      y += size.h + RESOURCE_GAP;
      contentH = y - RESOURCE_GAP;
    }
  }

  const w = Math.max(contentW, 120) + style.padding * 2;
  const h = Math.max(contentH, 60) + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutGenericGroup(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
  padding: number,
): Measured {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  let contentW = 0;
  let contentH = 0;
  let x = 0;

  for (const childId of group.children) {
    const g = getGroup(doc, childId);
    const r = getResource(doc, childId);
    if (g) {
      const size = layoutGroup(doc, g.id, state);
      placeGroup(state, g.id, x, 0, getDefaultView(doc));
      x += size.w + H_GAP;
      contentW = x - H_GAP;
      contentH = Math.max(contentH, size.h);
    } else if (r) {
      measureResource(doc, r, state);
      placeResource(state, r.id, x, 0, getDefaultView(doc));
      const geom = state.nodeGeoms.get(r.id)!;
      x += geom.obstacle.w + H_GAP;
      contentW = x - H_GAP;
      contentH = Math.max(contentH, geom.obstacle.h);
    }
  }

  const w = Math.max(contentW, 100) + padding * 2;
  const h = contentH + style.headerHeight + padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function measureResource(
  doc: DiagramDocument,
  resource: Resource,
  state: LayoutState,
): Measured {
  if (state.nodeGeoms.has(resource.id)) {
    const g = state.nodeGeoms.get(resource.id)!;
    return { w: g.obstacle.w, h: g.obstacle.h };
  }

  const entry = getCatalogEntry(resource.type);
  const iconSize =
    resource.role === "secondary"
      ? GRAMMAR.iconSecondary
      : GRAMMAR.iconPrimary;
  const serviceLabel =
    resource.label.service ?? entry?.serviceName ?? resource.type;
  const roleLabel = isDuplicateCatalogLabel(resource.label.role, serviceLabel, entry?.aliases)
    ? undefined
    : resource.label.role;
  const labelWidth = Math.max(
    estimateTextWidth(serviceLabel, GRAMMAR.serviceFontSize),
    roleLabel ? estimateTextWidth(roleLabel, GRAMMAR.roleFontSize) : 0,
  );
  const labelHeight =
    GRAMMAR.labelLineHeight +
    (roleLabel ? GRAMMAR.labelLineHeight + 6 : 0) +
    GRAMMAR.labelPad;

  const w = Math.max(iconSize, labelWidth) + 16;
  const h = iconSize + labelHeight;
  const iconX = Math.round((w - iconSize) / 2);

  const icon: Rect = {
    x: iconX,
    y: 0,
    w: iconSize,
    h: iconSize,
  };
  const label: Rect = {
    x: (w - labelWidth) / 2,
    y: iconSize + 4,
    w: labelWidth,
    h: labelHeight,
  };
  const obstacle: Rect = {
    x: 0,
    y: 0,
    w,
    h: h + GRAMMAR.labelPad,
  };

  state.nodeGeoms.set(resource.id, {
    id: resource.id,
    type: "resource",
    icon,
    label,
    obstacle,
    role: resource.role,
    resourceType: resource.type,
    serviceLabel,
    roleLabel,
  });

  return { w: obstacle.w, h: obstacle.h };
}

function isDuplicateCatalogLabel(
  label: string | undefined,
  serviceLabel: string,
  aliases: string[] | undefined,
): boolean {
  if (!label) return false;
  const normalized = normalizeLabel(label);
  return [serviceLabel, ...(aliases ?? [])].some((candidate) => normalizeLabel(candidate) === normalized);
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\b(?:amazon|aws)\b/g, "").replace(/[^a-z0-9]+/g, "");
}

function placeResource(
  state: LayoutState,
  id: ID,
  localX: number,
  localY: number,
  view: ReturnType<typeof getDefaultView>,
): void {
  const geom = state.nodeGeoms.get(id)!;
  const override = view.places[id];
  const x = snap(override?.pin ? localX : override?.x ?? localX);
  const y = snap(override?.pin ? localY : override?.y ?? localY);
  offsetNodeGeom(geom, x, y);
}

function placeGroup(
  state: LayoutState,
  id: ID,
  localX: number,
  localY: number,
  view: ReturnType<typeof getDefaultView>,
): void {
  const geom = state.groupGeoms.get(id);
  if (!geom) return;
  const override = view.places[id];
  const x = snap(override?.pin ? localX : override?.x ?? localX);
  const y = snap(override?.pin ? localY : override?.y ?? localY);
  const dx = x - geom.bounds.x;
  const dy = y - (geom.bounds.y);
  offsetGroupGeom(state, id, dx, dy);
}

function storeGroupGeom(
  state: LayoutState,
  group: Group,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const bounds: Rect = { x, y, w, h };
  const header: Rect = {
    x,
    y,
    w,
    h: style.headerHeight,
  };
  const content: Rect = {
    x: x + style.padding,
    y: y + style.headerHeight + style.padding / 2,
    w: w - style.padding * 2,
    h: h - style.headerHeight - style.padding * 1.5,
  };
  state.groupGeoms.set(group.id, {
    id: group.id,
    kind: group.kind,
    bounds,
    header,
    content,
    label: group.label,
  });
}

function offsetNodeGeom(geom: NodeGeom, x: number, y: number): void {
  const dx = x - geom.obstacle.x;
  const dy = y - geom.obstacle.y;
  geom.icon = { ...geom.icon, x: geom.icon.x + dx, y: geom.icon.y + dy };
  geom.label = { ...geom.label, x: geom.label.x + dx, y: geom.label.y + dy };
  geom.obstacle = { ...geom.obstacle, x, y };
}

function offsetGroupGeom(state: LayoutState, groupId: ID, dx: number, dy: number): void {
  const g = state.groupGeoms.get(groupId);
  if (!g) return;
  g.bounds = {
    ...g.bounds,
    x: g.bounds.x + dx,
    y: g.bounds.y + dy,
  };
  g.header = { ...g.header, x: g.header.x + dx, y: g.header.y + dy };
  g.content = { ...g.content, x: g.content.x + dx, y: g.content.y + dy };
}

function equalizeSymmetry(doc: DiagramDocument, state: LayoutState): void {
  const azGroups = doc.groups.filter((g) => g.kind === "az");
  if (azGroups.length < 2) return;

  const widths = azGroups.map((g) => state.groupGeoms.get(g.id)?.bounds.w ?? 0);
  const heights = azGroups.map((g) => state.groupGeoms.get(g.id)?.bounds.h ?? 0);
  const maxW = Math.max(...widths);
  const maxH = Math.max(...heights);

  for (const az of azGroups) {
    const geom = state.groupGeoms.get(az.id);
    if (!geom) continue;
    const dw = maxW - geom.bounds.w;
    const dh = maxH - geom.bounds.h;
    if (dw > 0 || dh > 0) {
      geom.bounds.w = maxW;
      geom.bounds.h = maxH;
      geom.header.w = maxW;
      geom.content.w += dw;
      geom.content.h += dh;
    }
    const subnetPad = GROUP_STYLES.az.padding;
    const innerW = maxW - subnetPad * 2;
    for (const childId of az.children) {
      const child = getGroup(doc, childId);
      if (!child) continue;
      if (
        child.kind !== "subnet" &&
        child.kind !== "subnet-public" &&
        child.kind !== "subnet-private"
      ) {
        continue;
      }
      const subnet = state.groupGeoms.get(child.id);
      if (!subnet) continue;
      const extra = innerW - subnet.bounds.w;
      if (extra > 0) {
        subnet.bounds.w = innerW;
        subnet.header.w = innerW;
        subnet.content.w += extra;
      }
    }
  }
}

function findSymmetrySets(doc: DiagramDocument): ID[][] {
  const azs = doc.groups.filter((g) => g.kind === "az").map((g) => g.id);
  return azs.length >= 2 ? [azs] : [];
}

function applyPinnedViewOverrides(
  doc: DiagramDocument,
  layout: LayoutResult,
): void {
  const view = getDefaultView(doc);
  const groupDepth = (id: ID): number => {
    const group = getGroup(doc, id);
    return group?.parent ? 1 + groupDepth(group.parent) : 0;
  };

  for (const group of [...layout.groups].sort(
    (a, b) => groupDepth(a.id) - groupDepth(b.id),
  )) {
    const place = view.places[group.id];
    if (!place?.pin || (place.x === undefined && place.y === undefined)) continue;
    const dx = (place.x ?? group.bounds.x) - group.bounds.x;
    const dy = (place.y ?? group.bounds.y) - group.bounds.y;
    const descendants = new Set<ID>([group.id]);
    collectDescendants(doc, group.id, descendants);
    for (const candidate of layout.groups) {
      if (!descendants.has(candidate.id)) continue;
      shiftRect(candidate.bounds, dx, dy);
      shiftRect(candidate.header, dx, dy);
      shiftRect(candidate.content, dx, dy);
    }
    for (const node of layout.nodes) {
      if (descendants.has(node.id)) shiftAbsoluteNode(node, dx, dy);
    }
  }

  for (const [id, place] of Object.entries(view.places)) {
    if (!place.pin) continue;
    const node = layout.nodes.find((candidate) => candidate.id === id);
    if (!node || (place.x === undefined && place.y === undefined)) continue;
    const dx = (place.x ?? node.obstacle.x) - node.obstacle.x;
    const dy = (place.y ?? node.obstacle.y) - node.obstacle.y;
    shiftAbsoluteNode(node, dx, dy);
  }

  for (const node of layout.nodes) {
    const place = view.places[node.id];
    if (!place?.w && !place?.h) continue;
    if (getResource(doc, node.id)) continue;
    applyNodeSize(node, place.w, place.h);
  }

  for (const group of layout.groups) {
    const place = view.places[group.id];
    if (!place?.w && !place?.h) continue;
    if (place.w) group.bounds.w = Math.max(80, snap(place.w));
    if (place.h) group.bounds.h = Math.max(48, snap(place.h));
    group.content.w = Math.max(24, group.bounds.w - 24);
    group.content.h = Math.max(24, group.bounds.h - group.header.h - 12);
  }

  organizeSiblingResources(doc, layout);

  const right = [
    ...layout.nodes.map((node) => node.obstacle.x + node.obstacle.w),
    ...layout.groups.map((group) => group.bounds.x + group.bounds.w),
  ];
  const bottom = [
    ...layout.nodes.map((node) => node.obstacle.y + node.obstacle.h),
    ...layout.groups.map((group) => group.bounds.y + group.bounds.h),
  ];
  layout.width = Math.max(layout.width, Math.ceil(Math.max(0, ...right) + 32));
  layout.height = Math.max(layout.height, Math.ceil(Math.max(0, ...bottom) + 32));
}

function organizeSiblingResources(doc: DiagramDocument, layout: LayoutResult): void {
  const nodeById = new Map(layout.nodes.map((node) => [node.id, node]));
  const groupById = new Map(layout.groups.map((group) => [group.id, group]));
  const view = getDefaultView(doc);
  const gapX = 24;
  const gapY = 28;

  for (const model of doc.groups) {
    const group = groupById.get(model.id);
    if (!group) continue;
    const nodes = model.children
      .map((id) => nodeById.get(id))
      .filter((node): node is NodeGeom => Boolean(node));
    const childGroups = model.children
      .map((id) => groupById.get(id))
      .filter((child): child is GroupGeom => Boolean(child));
    if (!nodes.length) continue;
    // Automatic layout already reserves measured label widths. This repair is
    // specifically for authored/LLM pins that bypass those safe placements.
    if (!nodes.some((node) => view.places[node.id]?.pin)) continue;

    let overlap = nodes.some((node, index) =>
      nodes.slice(index + 1).some((other) => rectsOverlap(node.obstacle, other.obstacle, 12)),
    );
    let groupOverlap = nodes.some((node) =>
      childGroups.some((child) => rectsOverlap(node.obstacle, child.bounds, 8)),
    );
    const outOfBounds = nodes.some((node) => !rectContains(group.content, node.obstacle));
    if (!overlap && !groupOverlap && !outOfBounds) continue;

    // A harmless pin just beyond the right/bottom edge should grow its
    // boundary, not jump to the top of the group where it could obscure a
    // nested subnet or Availability Zone.
    if (!overlap && !groupOverlap) {
      for (const node of nodes) {
        const safeX = Math.max(node.obstacle.x, group.content.x);
        const safeY = Math.max(node.obstacle.y, group.content.y);
        if (safeX !== node.obstacle.x || safeY !== node.obstacle.y) {
          shiftAbsoluteNode(node, safeX - node.obstacle.x, safeY - node.obstacle.y);
        }
        growGroupToContain(doc, groupById, model, node.obstacle, 8);
      }
      overlap = nodes.some((node, index) =>
        nodes.slice(index + 1).some((other) => rectsOverlap(node.obstacle, other.obstacle, 12)),
      );
      groupOverlap = nodes.some((node) =>
        childGroups.some((child) => rectsOverlap(node.obstacle, child.bounds, 8)),
      );
      if (!overlap && !groupOverlap) continue;
    }

    if (groupOverlap && !overlap) {
      const offenders = nodes.filter((node) =>
        childGroups.some((child) => rectsOverlap(node.obstacle, child.bounds, 8)),
      );
      const shelfY = Math.max(...childGroups.map((child) => child.bounds.y + child.bounds.h)) + gapY;
      const cellH = Math.max(...offenders.map((node) => node.obstacle.h));
      offenders.forEach((node, index) => {
        const x = Math.min(
          Math.max(node.obstacle.x, group.content.x),
          group.content.x + group.content.w - node.obstacle.w,
        );
        const y = shelfY + index * (cellH + 8);
        growGroupToContain(doc, groupById, model, { x, y, w: node.obstacle.w, h: node.obstacle.h }, 8);
        shiftAbsoluteNode(node, snap(x) - node.obstacle.x, snap(y) - node.obstacle.y);
      });
      for (const node of nodes) {
        if (!offenders.includes(node) && !rectContains(group.content, node.obstacle)) {
          growGroupToContain(doc, groupById, model, node.obstacle, 8);
        }
      }
      continue;
    }

    const cellW = Math.max(...nodes.map((node) => node.obstacle.w));
    const cellH = Math.max(...nodes.map((node) => node.obstacle.h));
    const columns = Math.max(1, Math.floor((group.content.w + gapX) / (cellW + gapX)));
    const rows = Math.ceil(nodes.length / columns);
    const minimumGapY = 8;
    const shelfY = childGroups.length
      ? Math.max(...childGroups.map((child) => child.bounds.y + child.bounds.h)) + gapY
      : group.content.y;
    const requiredContentH = rows * cellH + Math.max(0, rows - 1) * minimumGapY;
    growGroupToContain(doc, groupById, model, {
      x: group.content.x,
      y: shelfY,
      w: Math.min(group.content.w, columns * cellW + Math.max(0, columns - 1) * gapX),
      h: requiredContentH,
    }, 8);
    const fittedGapY = rows <= 1
      ? gapY
      : Math.max(
          minimumGapY,
          Math.min(gapY, (group.content.h - rows * cellH) / (rows - 1)),
        );

    nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = childGroups.length && !overlap
        ? Math.min(
            Math.max(node.obstacle.x, group.content.x),
            group.content.x + group.content.w - node.obstacle.w,
          )
        : group.content.x + column * (cellW + gapX) + (cellW - node.obstacle.w) / 2;
      const y = shelfY + row * (cellH + fittedGapY);
      const safeX = Math.min(
        Math.max(snap(x), group.content.x),
        group.content.x + group.content.w - node.obstacle.w,
      );
      const safeY = Math.min(
        Math.max(snap(y), group.content.y),
        group.content.y + group.content.h - node.obstacle.h,
      );
      shiftAbsoluteNode(node, safeX - node.obstacle.x, safeY - node.obstacle.y);
    });
  }
}

function growGroupToContain(
  doc: DiagramDocument,
  groupById: Map<ID, GroupGeom>,
  model: DiagramDocument["groups"][number],
  rect: Rect,
  padding: number,
): void {
  const group = groupById.get(model.id);
  if (!group) return;
  const growthX = Math.max(0, rect.x + rect.w + padding - (group.content.x + group.content.w));
  const growthY = Math.max(0, rect.y + rect.h + padding - (group.content.y + group.content.h));
  if (!growthX && !growthY) return;
  group.content.w += growthX;
  group.content.h += growthY;
  group.bounds.w += growthX;
  group.bounds.h += growthY;
  if (!model.parent) return;
  const parent = doc.groups.find((candidate) => candidate.id === model.parent);
  if (parent) growGroupToContain(doc, groupById, parent, group.bounds, padding);
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function rectsOverlap(a: Rect, b: Rect, margin: number): boolean {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function sortLayoutByZIndex(doc: DiagramDocument, layout: LayoutResult): void {
  const view = getDefaultView(doc);
  const zFor = (id: ID): number => view.places[id]?.zIndex ?? 0;
  layout.groups.sort((a, b) => zFor(a.id) - zFor(b.id));
  layout.nodes.sort((a, b) => zFor(a.id) - zFor(b.id));
}

function collectDescendants(
  doc: DiagramDocument,
  groupId: ID,
  ids: Set<ID>,
): void {
  const group = getGroup(doc, groupId);
  for (const childId of group?.children ?? []) {
    ids.add(childId);
    if (getGroup(doc, childId)) collectDescendants(doc, childId, ids);
  }
}

function shiftAbsoluteNode(node: NodeGeom, dx: number, dy: number): void {
  shiftRect(node.icon, dx, dy);
  shiftRect(node.label, dx, dy);
  shiftRect(node.obstacle, dx, dy);
}

function applyNodeSize(
  node: NodeGeom,
  width?: number,
  height?: number,
): void {
  const nextW = width ? Math.max(48, snap(width)) : node.obstacle.w;
  const nextH = height ? Math.max(48, snap(height)) : node.obstacle.h;
  const scaleX = nextW / node.obstacle.w;
  const scaleY = nextH / node.obstacle.h;
  node.icon = {
    x: node.obstacle.x + (node.icon.x - node.obstacle.x) * scaleX,
    y: node.obstacle.y + (node.icon.y - node.obstacle.y) * scaleY,
    w: node.icon.w * scaleX,
    h: node.icon.h * scaleY,
  };
  node.label = {
    x: node.obstacle.x + (node.label.x - node.obstacle.x) * scaleX,
    y: node.obstacle.y + (node.label.y - node.obstacle.y) * scaleY,
    w: node.label.w * scaleX,
    h: node.label.h * scaleY,
  };
  node.obstacle = {
    x: node.obstacle.x,
    y: node.obstacle.y,
    w: nextW,
    h: nextH,
  };
}

function shiftRect(rect: Rect, dx: number, dy: number): void {
  rect.x += dx;
  rect.y += dy;
}

function tightenGroups(state: LayoutState): void {
  for (const geom of state.groupGeoms.values()) {
    geom.bounds.w = snap(geom.bounds.w);
    geom.bounds.h = snap(geom.bounds.h);
  }
}

function unionBounds(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
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

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

export function absoluteNodeGeoms(
  doc: DiagramDocument,
  layout: LayoutResult,
): Map<ID, NodeGeom> {
  const result = new Map<ID, NodeGeom>();
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  for (const resource of doc.resources) {
    const local = nodeMap.get(resource.id);
    if (!local) continue;
    const offset = groupOffset(doc, resource.parent, layout);
    result.set(resource.id, translateNode(local, offset.x, offset.y));
  }
  return result;
}

function groupOffset(
  doc: DiagramDocument,
  parentId: ID | undefined,
  layout: LayoutResult,
): { x: number; y: number } {
  if (!parentId) return { x: 48, y: 48 };
  const group = layout.groups.find((g) => g.id === parentId);
  if (!group) return { x: 48, y: 48 };
  const parentGroup = getGroup(doc, parentId);
  const style = parentGroup
    ? GROUP_STYLES[parentGroup.kind]
  : GROUP_STYLES.logical;
  const parentOffset = parentGroup?.parent
    ? groupOffset(doc, parentGroup.parent, layout)
    : { x: 0, y: 0 };
  return {
    x: parentOffset.x + group.bounds.x + style.padding,
    y: parentOffset.y + group.bounds.y + style.headerHeight + style.padding / 2,
  };
}

function translateNode(node: NodeGeom, dx: number, dy: number): NodeGeom {
  return {
    ...node,
    icon: {
      ...node.icon,
      x: node.icon.x + dx,
      y: node.icon.y + dy,
    },
    label: {
      ...node.label,
      x: node.label.x + dx,
      y: node.label.y + dy,
    },
    obstacle: {
      ...node.obstacle,
      x: node.obstacle.x + dx,
      y: node.obstacle.y + dy,
    },
  };
}
