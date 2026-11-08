import { getCatalogEntry } from "../catalog/index.js";
import { getDefaultView, getGroup, getResource, isPrimaryFlowEdge } from "../core/index.js";
import type { DiagramDocument, Group, GroupGeom, ID, LayoutResult, NodeGeom, Rect, Resource } from "../core/index.js";
import { GRAMMAR, GROUP_STYLES, snap } from "../grammar-aws/index.js";

import type { LayoutState } from "./internal.js";
import { finalizeAbsoluteLayout } from "./absolute.js";
import { LAYOUT_METRICS } from "./metrics.js";
import { findDiagramRoots, orderRootsForFlow } from "./roots.js";
import { childFlowLayers } from "./flow-layers.js";
import { alignAutomaticIconCentres, isSimpleAutomaticGridFlow } from "./automatic-grid.js";

interface Measured {
  w: number;
  h: number;
}

const H_GAP = LAYOUT_METRICS.horizontalGap;
const V_GAP = LAYOUT_METRICS.verticalGap;
const RESOURCE_GAP = LAYOUT_METRICS.resourceGap;
const RESOURCE_LABEL_MAX_WIDTH = 176;

type LayoutChild = {
  id: ID;
  group?: Group;
  resource?: Resource;
  w: number;
  h: number;
};

type RegionColumn = "left" | "feed" | "center" | "right";

export function layoutDocument(doc: DiagramDocument, options: { compoundFlow?: boolean } = {}): LayoutResult {
  const state: LayoutState = {
    compoundFlow: options.compoundFlow,
    hideResourceLabels: doc.hideResourceLabels,
    nodeGeoms: new Map(),
    groupGeoms: new Map(),
  };

  const roots = orderRootsForFlow(doc, findDiagramRoots(doc), options.compoundFlow);
  for (const rootId of roots) {
    const group = getGroup(doc, rootId);
    const resource = getResource(doc, rootId);
    if (group) layoutGroup(doc, group.id, state);
    else if (resource) measureResource(resource, state);
  }

  equalizeSymmetry(doc, state);
  const layout = finalizeAbsoluteLayout(doc, state);
  applyPinnedViewOverrides(doc, layout);
  const aligned = isSimpleAutomaticGridFlow(doc) ? alignAutomaticIconCentres(doc, layout) : layout;
  sortLayoutByZIndex(doc, aligned);
  return aligned;
}

function layoutGroup(doc: DiagramDocument, groupId: ID, state: LayoutState): Measured {
  const group = getGroup(doc, groupId)!;
  const style = GROUP_STYLES[group.kind];

  if (state.compoundFlow && !["az", "subnet", "subnet-public", "subnet-private"].includes(group.kind)) {
    const layers = childFlowLayers(doc, group);
    if (
      layers &&
      group.children.length >= 3 &&
      group.children.some((id) => getGroup(doc, id)) &&
      group.children.some((id) => getResource(doc, id))
    ) {
      const regionChildren = group.children.filter((id) => getGroup(doc, id)?.kind === "region");
      const satellites = group.children.filter((id) => getResource(doc, id));
      if (regionChildren.length === 1 && satellites.length === group.children.length - 1 && satellites.length >= 2) {
        return layoutRegionalSatellites(doc, group, state, regionChildren[0]!, satellites);
      }
      if (group.kind !== "account") return layoutCompoundFlowGroup(doc, group, state, layers);
    }
  }

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
  if (group.kind === "account") {
    return layoutAccountGroup(doc, group, state);
  }
  if (group.kind === "subnet" || group.kind === "subnet-public" || group.kind === "subnet-private") {
    return layoutSubnetGroup(doc, group, state);
  }

  return layoutGenericGroup(doc, group, state, style.padding);
}

/** Global services sit outside, but alongside the regional stages they serve. */
function layoutRegionalSatellites(
  doc: DiagramDocument,
  group: Group,
  state: LayoutState,
  regionId: ID,
  satelliteIds: ID[],
): Measured {
  const style = GROUP_STYLES[group.kind];
  const children = measureChildren(doc, group.children, state);
  const region = children.find((child) => child.id === regionId)!;
  const regionalNodes = new Map(childResources(doc, region, state).map((node) => [node.id, node]));
  const satellites = satelliteIds.map((id) => children.find((child) => child.id === id)!);
  const desired = satellites
    .map((child, index) => {
      const neighbors = doc.edges.flatMap((edge) => {
        const other = edge.source === child.id ? edge.target : edge.target === child.id ? edge.source : undefined;
        const node = other ? regionalNodes.get(other) : undefined;
        return node ? [node.icon.x + node.icon.w / 2] : [];
      });
      const center = neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : region.w;
      return { child, center, index };
    })
    .sort((a, b) => a.center - b.center || a.index - b.index);
  const totalW = satellites.reduce((sum, child) => sum + child.w, 0) + (satellites.length - 1) * (H_GAP + 16);
  const contentW = Math.max(region.w, totalW, groupLabelContentWidth(group, style));
  const bandH = Math.max(...satellites.map((child) => child.h)) + 64;
  const regionX = (contentW - region.w) / 2;
  let x = 0;
  for (const [index, { child, center }] of desired.entries()) {
    const remaining =
      desired.slice(index).reduce((sum, item) => sum + item.child.w, 0) + (desired.length - index - 1) * (H_GAP + 16);
    x = Math.max(x, Math.min(contentW - remaining, regionX + center - child.w / 2));
    placeLayoutChild(state, child, x, (bandH - 64 - child.h) / 2, doc);
    x += child.w + H_GAP + 16;
  }
  placeLayoutChild(state, region, regionX, bandH, doc);
  const w = contentW + style.padding * 2;
  const h = bandH + region.h + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

/** Arrange compound branches by connectivity, with one shared icon baseline. */
function layoutCompoundFlowGroup(doc: DiagramDocument, group: Group, state: LayoutState, layers: ID[][]): Measured {
  const style = GROUP_STYLES[group.kind];
  const children = measureChildren(doc, group.children, state);
  const childById = new Map(children.map((child) => [child.id, child]));
  const columns = layers.map((layer) => layer.map((id) => childById.get(id)!));
  const sizes = columns.map((column) => {
    let y = 0;
    const placements = column.map((child) => {
      const item = { child, y };
      y += child.h + V_GAP + 24;
      return item;
    });
    const h = y - V_GAP - 24;
    const anchors = placements.flatMap(({ child, y: itemY }) =>
      childResources(doc, child, state).map(({ icon }) => itemY + icon.y + icon.h / 2),
    );
    const anchor = anchors.length ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length : h / 2;
    return { placements, h, w: Math.max(...column.map((child) => child.w)), anchor };
  });
  const above = Math.max(...sizes.map((size) => size.anchor));
  const below = Math.max(...sizes.map((size) => size.h - size.anchor));
  let x = 0;
  for (const [index, size] of sizes.entries()) {
    for (const { child, y } of size.placements) {
      placeLayoutChild(state, child, x + (size.w - child.w) / 2, above - size.anchor + y, doc);
    }
    const next = columns[index + 1];
    x += size.w;
    if (next) {
      x += Math.max(
        H_GAP + 24,
        ...columns[index]!.flatMap((left) => next.map((right) => genericChildGap(doc, left, right, state))),
      );
    }
  }
  const w = Math.max(100, groupLabelContentWidth(group, style), x) + style.padding * 2;
  const h = Math.max(40, above + below) + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutAccountGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES.account;
  const children = measureChildren(doc, group.children, state);
  const parent = group.parent ? getGroup(doc, group.parent) : undefined;
  const shouldCompact = doc.flow === "lr" && parent?.kind === "cloud" && children.length >= 5;
  if (!shouldCompact) {
    return layoutGenericGroup(doc, group, state, style.padding);
  }

  const chain = longestChildFlow(doc, group);
  const chainIds = new Set(chain);
  const orderedIds = [...chain, ...group.children.filter((id) => !chainIds.has(id))];
  const ordered = orderedIds
    .map((id) => children.find((child) => child.id === id))
    .filter((child): child is LayoutChild => Boolean(child));
  const followsFlow = chain.length >= 4;
  const columns = followsFlow ? 3 : 2;
  const rows = Math.ceil(ordered.length / columns);
  const archedFlowCells =
    followsFlow && columns === 3 && rows === 3 && chain.length === 5
      ? [
          { row: 2, column: 0 },
          { row: 1, column: 0 },
          { row: 1, column: 1 },
          { row: 1, column: 2 },
          { row: 2, column: 2 },
        ]
      : undefined;
  const remainingArchedCells = archedFlowCells
    ? [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 2 },
        { row: 2, column: 1 },
      ]
    : [];
  const cells = ordered.map((child, index) => {
    if (archedFlowCells) {
      return {
        child,
        ...(index < archedFlowCells.length
          ? archedFlowCells[index]!
          : remainingArchedCells[index - archedFlowCells.length]!),
      };
    }
    if (!followsFlow) {
      return { child, row: Math.floor(index / columns), column: index % columns };
    }
    const rowFromBottom = Math.floor(index / columns);
    const offset = index % columns;
    return {
      child,
      row: rows - 1 - rowFromBottom,
      column: rowFromBottom % 2 === 0 ? offset : columns - 1 - offset,
    };
  });
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(0, ...cells.filter((cell) => cell.column === column).map((cell) => cell.child.w)),
  );
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(0, ...cells.filter((cell) => cell.row === row).map((cell) => cell.child.h)),
  );
  const columnX = columnWidths.map(
    (_, column) => columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0) + column * H_GAP,
  );
  const rowY = rowHeights.map(
    (_, row) => rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) + row * V_GAP,
  );

  for (const { child, row, column } of cells) {
    placeLayoutChild(
      state,
      child,
      columnX[column]! + (columnWidths[column]! - child.w) / 2,
      rowY[row]! + (rowHeights[row]! - child.h) / 2,
      doc,
    );
  }

  const contentW = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * H_GAP;
  const contentH = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * V_GAP;
  const w = Math.max(contentW, 100) + style.padding * 2;
  const h = Math.max(contentH, 40) + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function longestChildFlow(doc: DiagramDocument, group: Group): ID[] {
  const ownerByResource = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    const resource = getResource(doc, id);
    if (resource) {
      ownerByResource.set(resource.id, owner);
      return;
    }
    const childGroup = getGroup(doc, id);
    if (!childGroup) return;
    for (const childId of childGroup.children) collect(childId, owner);
  };
  for (const childId of group.children) collect(childId, childId);

  const adjacency = new Map<ID, ID[]>();
  for (const childId of group.children) adjacency.set(childId, []);
  for (const edge of doc.edges) {
    if (edge.style === "dashed" || edge.kind === "fail") continue;
    const source = ownerByResource.get(edge.source);
    const target = ownerByResource.get(edge.target);
    if (!source || !target || source === target) continue;
    const targets = adjacency.get(source)!;
    if (!targets.includes(target)) targets.push(target);
  }

  const colors = new Map<ID, "active" | "done">();
  const memo = new Map<ID, ID[]>();
  const bestFrom = (id: ID): ID[] => {
    if (colors.get(id) === "done") return memo.get(id)!;

    colors.set(id, "active");
    let best: ID[] = [id];
    for (const target of adjacency.get(id) ?? []) {
      // A back-edge to an active node would close a cycle, so ignore it.
      if (colors.get(target) === "active") continue;
      const suffix = bestFrom(target);
      const candidate = [id, ...suffix];
      // Strict comparison preserves authored adjacency order on ties.
      if (candidate.length > best.length) best = candidate;
    }
    colors.set(id, "done");
    memo.set(id, best);
    return best;
  };

  return group.children.reduce<ID[]>((best, id) => {
    const candidate = bestFrom(id);
    return candidate.length > best.length ? candidate : best;
  }, []);
}

function regionFlowParticipants(doc: DiagramDocument, group: Group): ID[] {
  const owners = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    const resource = getResource(doc, id);
    if (resource) {
      owners.set(resource.id, owner);
      return;
    }
    for (const child of getGroup(doc, id)?.children ?? []) collect(child, owner);
  };
  for (const child of group.children) collect(child, child);

  const active = new Set<ID>();
  for (const edge of doc.edges) {
    if (!isPrimaryFlowEdge(edge)) continue;
    const source = owners.get(edge.source);
    const target = owners.get(edge.target);
    if (source && target && source !== target) {
      active.add(source);
      active.add(target);
    }
  }
  return group.children.filter((id) => active.has(id));
}

function layoutRegionGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES.region;
  const children = measureChildren(doc, group.children, state);
  const participants = regionFlowParticipants(doc, group);
  if (doc.grammar !== "aws" && doc.flow === "lr" && participants.length >= 3) {
    // Provider catalog columns are useful when a region has no causal spine,
    // but they must not override an explicit multi-stage pipeline. Preserve
    // authored child order on the primary axis and move dashed-only support
    // boundaries (IAM, monitoring, telemetry, and similar concerns) below it.
    const participantIds = new Set(participants);
    const rank = new Map((childFlowLayers(doc, group) ?? []).flatMap((layer, index) => layer.map((id) => [id, index])));
    const primary = children
      .filter((child) => participantIds.has(child.id))
      .map((child, index) => ({ child, index }))
      .sort((a, b) => (rank.get(a.child.id) ?? 0) - (rank.get(b.child.id) ?? 0) || a.index - b.index)
      .map(({ child }) => child);
    const support = children.filter((child) => !participantIds.has(child.id));
    const gaps = primary.slice(1).map((child, index) => genericChildGap(doc, primary[index]!, child, state));
    const primaryW = primary.reduce((sum, item, index) => sum + item.w + (index ? gaps[index - 1]! : 0), 0);
    const resourceRow = measureResourceRow(doc, primary, state);
    const primaryIds = new Set(primary.map((item) => item.id));
    const decorationLane =
      resourceRow &&
      doc.edges.some((edge) => edge.step !== undefined && primaryIds.has(edge.source) && primaryIds.has(edge.target))
        ? 16
        : 0;
    const primaryH = decorationLane + Math.max(40, resourceRow?.height ?? 0, ...primary.map((item) => item.h));
    const supportW = support.reduce((sum, item, index) => sum + item.w + (index ? H_GAP : 0), 0);
    const supportH = Math.max(0, ...support.map((item) => item.h));
    const contentW = Math.max(120, groupLabelContentWidth(group, style), primaryW, supportW);
    const contentH = primaryH + (support.length ? V_GAP + supportH : 0);
    let cursor = 0;
    for (const [index, item] of primary.entries()) {
      const y = resourceRow
        ? decorationLane + resourceRow.yFor(item, (primaryH - decorationLane - resourceRow.height) / 2)
        : (primaryH - item.h) / 2;
      placeLayoutChild(state, item, cursor, y, doc);
      cursor += item.w + (gaps[index] ?? 0);
    }
    cursor = (contentW - supportW) / 2;
    for (const item of support) {
      placeLayoutChild(state, item, cursor, primaryH + V_GAP, doc);
      cursor += item.w + H_GAP;
    }
    const w = contentW + style.padding * 2;
    const h = contentH + style.headerHeight + style.padding * 2;
    storeGroupGeom(state, group, 0, 0, w, h);
    return { w, h };
  }
  const columns: Record<RegionColumn, LayoutChild[]> = {
    left: [],
    feed: [],
    center: [],
    right: [],
  };

  const feeders = vpcFeeders(doc, group);
  for (const child of children) {
    const column = regionColumn(doc, child);
    columns[column === "right" && feeders.has(child.id) ? "feed" : column].push(child);
  }

  const columnSizes = (items: LayoutChild[]) => ({
    w: Math.max(0, ...items.map((item) => item.w)),
    h: items.reduce((height, item, index) => height + item.h + (index > 0 ? V_GAP : 0), 0),
  });
  const left = columnSizes(columns.left);
  const center = columnSizes(columns.center);
  const right = columnSizes(columns.right);
  const contentH = Math.max(left.h, center.h, right.h, 40);
  const activeColumns = (["left", "feed", "center", "right"] as RegionColumn[]).filter(
    (column) => columns[column].length > 0,
  );
  const contentW = activeColumns.reduce(
    (width, column, index) => width + (index > 0 ? H_GAP : 0) + columnSizes(columns[column]).w,
    0,
  );

  let x = 0;
  for (const column of activeColumns) {
    const items = columns[column];
    const size = columnSizes(items);
    let y = (contentH - size.h) / 2;
    for (const item of items) {
      // Direct services in the outer rails should hug the relevant side of
      // the architecture instead of floating in the middle of a much wider
      // sibling group. In particular, right-rail outputs such as email stay
      // aligned beneath the final service in the main processing band.
      const alignmentOffset = item.resource
        ? column === "right"
          ? size.w - item.w
          : column === "left"
            ? 0
            : (size.w - item.w) / 2
        : (size.w - item.w) / 2;
      placeLayoutChild(state, item, x + alignmentOffset, y, doc);
      y += item.h + V_GAP;
    }
    x += size.w + H_GAP;
  }

  const w = contentW + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutVpcGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES.vpc;
  const children = measureChildren(doc, group.children, state);
  const availabilityZones = children.filter((child) => child.group?.kind === "az");
  const leftRail = children.filter((child) => child.resource);
  const rightRail = children.filter((child) => child.group && child.group.kind !== "az");
  if (
    doc.flow === "lr" &&
    availabilityZones.length === 0 &&
    rightRail.length === 0 &&
    (leftRail.length === 2 ||
      (leftRail.length === 3 &&
        leftRail.some(
          (child) =>
            new Set(
              doc.edges
                .filter((edge) => edge.source === child.id && leftRail.some((item) => item.id === edge.target))
                .map((edge) => edge.target),
            ).size === 2,
        ))) &&
    hasHorizontalChildFlow(doc, group)
  ) {
    return layoutGenericGroup(doc, group, state, style.padding);
  }

  // A VPC reads as a frame around a centered AZ stack. Direct resources such
  // as an ALB live in a narrow left rail; any other direct groups stay in a
  // right rail instead of displacing the AZs into a long horizontal strip.
  const stackSize = (items: LayoutChild[]) => ({
    w: Math.max(0, ...items.map((item) => item.w)),
    h: items.reduce((height, item, index) => height + item.h + (index > 0 ? V_GAP : 0), 0),
  });
  const azSize = stackSize(availabilityZones);
  const leftSize = stackSize(leftRail);
  const rightSize = stackSize(rightRail);

  // Azure VNets without zones keep flow order: subnet boundaries on the left,
  // the bank of Private Endpoints on the right (the AWS rails reverse it).
  if (group.type === "azure.vnet" && availabilityZones.length === 0 && leftRail.length > 0 && rightRail.length > 0) {
    const endpointOffset = leftRail.length > 1 ? 72 : 0;
    const contentH = Math.max(leftSize.h + endpointOffset, rightSize.h, 40);
    const resourceX = rightSize.w + azureVnetRailGap(doc, group);
    const contentW = Math.max(LAYOUT_METRICS.minVpcContentWidth, resourceX + leftSize.w);
    placeStack(state, rightRail, 0, 0, doc);
    placeStack(state, leftRail, resourceX, endpointOffset, doc);
    const w = contentW + style.padding * 2;
    const h = contentH + style.headerHeight + style.padding * 2;
    storeGroupGeom(state, group, 0, 0, w, h);
    return { w, h };
  }

  const contentH = Math.max(azSize.h, leftSize.h, rightSize.h, 40);
  const hasAzs = availabilityZones.length > 0;
  const azX = leftRail.length ? leftSize.w + H_GAP : 0;
  const rightX = azX + (hasAzs ? azSize.w : 0) + (hasAzs || leftRail.length ? H_GAP : 0);
  const compactAzureSingletonEndpoint =
    group.type === "azure.vnet" && !hasAzs && rightRail.length === 0 && leftRail.length === 1;
  const contentW = Math.max(
    compactAzureSingletonEndpoint ? groupLabelContentWidth(group, style) : LAYOUT_METRICS.minVpcContentWidth,
    rightRail.length ? rightX + rightSize.w : azX + azSize.w,
    leftRail.length ? leftSize.w : 0,
  );

  placeStack(state, leftRail, 0, (contentH - leftSize.h) / 2, doc);
  placeStack(state, availabilityZones, azX, (contentH - azSize.h) / 2, doc);
  placeStack(state, rightRail, rightX, (contentH - rightSize.h) / 2, doc);

  const w = contentW + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function azureVnetRailGap(doc: DiagramDocument, group: Group): number {
  const ownerByResource = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    const resource = getResource(doc, id);
    if (resource) {
      ownerByResource.set(id, owner);
      return;
    }
    const child = getGroup(doc, id);
    if (!child) return;
    for (const childId of child.children) collect(childId, owner);
  };
  for (const childId of group.children) collect(childId, childId);

  let gap: number = H_GAP;
  for (const edge of doc.edges) {
    const sourceOwner = ownerByResource.get(edge.source);
    const targetOwner = ownerByResource.get(edge.target);
    if (!sourceOwner || !targetOwner || sourceOwner === targetOwner) continue;
    const labelWidth = edge.label ? estimateTextWidth(edge.label, 11) : 0;
    const badgeWidth = edge.step === undefined ? 0 : GRAMMAR.badgeRadius * 2 + 16;
    gap = Math.max(gap, labelWidth + badgeWidth + 40);
  }
  return Math.ceil(gap / GRAMMAR.grid) * GRAMMAR.grid;
}

function layoutAzGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES.az;
  const children = measureChildren(doc, group.children, state);
  const contentW = Math.max(
    LAYOUT_METRICS.minAzContentWidth,
    children.reduce((width, item, index) => width + item.w + (index > 0 ? H_GAP : 0), 0),
  );
  const resourceRow = measureResourceRow(doc, children, state);
  const contentH = Math.max(
    LAYOUT_METRICS.minAzContentHeight,
    resourceRow?.height ?? 0,
    Math.max(0, ...children.map((item) => item.h)),
  );

  let x = 0;
  for (const item of children) {
    const y = resourceRow ? resourceRow.yFor(item, (contentH - resourceRow.height) / 2) : (contentH - item.h) / 2;
    placeLayoutChild(state, item, x, y, doc);
    x += item.w + H_GAP;
  }

  const w = contentW + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutSubnetGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.subnet;
  const children = measureChildren(doc, group.children, state).filter((child) => child.resource);
  const contentW = Math.max(
    140,
    groupLabelContentWidth(group, style),
    children.reduce((width, item, index) => width + item.w + (index > 0 ? RESOURCE_GAP : 0), 0),
  );
  const resourceRow = measureResourceRow(doc, children, state);
  const contentH = Math.max(80, resourceRow?.height ?? 0, Math.max(0, ...children.map((item) => item.h)));

  let x = 0;
  for (const item of children) {
    const y = resourceRow ? resourceRow.yFor(item, (contentH - resourceRow.height) / 2) : (contentH - item.h) / 2;
    placeLayoutChild(state, item, x, y, doc);
    x += item.w + RESOURCE_GAP;
  }

  const w = contentW + style.padding * 2;
  const h = contentH + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function layoutLogicalGroup(doc: DiagramDocument, group: Group, state: LayoutState): Measured {
  const style = GROUP_STYLES.logical;
  const children = measureChildren(doc, group.children, state);
  // Keep the diagram's primary left-to-right direction for a real flow within
  // the group. Parallel siblings reached from outside the group use the cross
  // axis instead, which keeps fan-out tiers compact and avoids implying that
  // the siblings call one another.
  const horizontal = doc.flow === "lr" && hasHorizontalChildFlow(doc, group);
  const connectorLane = horizontal ? horizontalConnectorLane(doc, group) : 0;
  const supporting = horizontal ? children.filter((child) => child.resource && isSupportingSink(doc, child.id)) : [];
  const mainChildren = supporting.length ? children.filter((child) => !supporting.includes(child)) : children;
  if (supporting.length && mainChildren.length) {
    const mainGaps = mainChildren
      .slice(1)
      .map((child, index) => horizontalChildGap(doc, mainChildren[index]!, child, state));
    const mainW = mainChildren.reduce(
      (width, item, index) => width + item.w + (index > 0 ? mainGaps[index - 1]! : 0),
      0,
    );
    const mainRow = measureResourceRow(doc, mainChildren, state);
    const mainRowH = Math.max(60, mainRow?.height ?? 0, ...mainChildren.map((item) => item.h));
    const mainH = connectorLane + mainRowH;
    const supportW = supporting.reduce((width, item, index) => width + item.w + (index > 0 ? H_GAP : 0), 0);
    const supportH = Math.max(...supporting.map((item) => item.h));
    const contentW = Math.max(120, groupLabelContentWidth(group, style), mainW, supportW);
    const contentH = mainH + V_GAP + supportH;

    let x = 0;
    for (const [index, item] of mainChildren.entries()) {
      const y =
        connectorLane +
        (mainRow ? mainRow.yFor(item, (mainRowH - mainRow.height) / 2) : (mainH - connectorLane - item.h) / 2);
      placeLayoutChild(state, item, x, y, doc);
      x += item.w + (mainGaps[index] ?? 0);
    }
    x = (contentW - supportW) / 2;
    for (const item of supporting) {
      placeLayoutChild(state, item, x, mainH + V_GAP, doc);
      x += item.w + H_GAP;
    }

    const w = contentW + style.padding * 2;
    const h = contentH + style.headerHeight + style.padding * 2;
    storeGroupGeom(state, group, 0, 0, w, h);
    return { w, h };
  }
  const childGaps = horizontal
    ? children.slice(1).map((child, index) => horizontalChildGap(doc, children[index]!, child, state))
    : [];
  const contentW = horizontal
    ? Math.max(
        120,
        groupLabelContentWidth(group, style),
        children.reduce((width, item, index) => width + item.w + (index > 0 ? childGaps[index - 1]! : 0), 0),
      )
    : Math.max(120, groupLabelContentWidth(group, style), Math.max(0, ...children.map((item) => item.w)));
  const resourceRow = horizontal ? measureResourceRow(doc, children, state) : undefined;
  const horizontalRowH = Math.max(60, resourceRow?.height ?? 0, ...children.map((item) => item.h));
  const contentH = horizontal
    ? connectorLane + horizontalRowH
    : Math.max(
        60,
        children.reduce((height, item, index) => height + item.h + (index > 0 ? V_GAP : 0), 0),
      );

  let cursor = 0;
  for (const [index, item] of children.entries()) {
    const x = horizontal ? cursor : (contentW - item.w) / 2;
    const y = horizontal
      ? connectorLane +
        (resourceRow
          ? resourceRow.yFor(item, (horizontalRowH - resourceRow.height) / 2)
          : (horizontalRowH - item.h) / 2)
      : cursor;
    placeLayoutChild(state, item, x, y, doc);
    cursor += (horizontal ? item.w : item.h) + (horizontal ? (childGaps[index] ?? 0) : V_GAP);
  }

  const w = Math.max(contentW, 120) + style.padding * 2;
  const h =
    Math.max(horizontal ? connectorLane + horizontalRowH : contentH, 60) + style.headerHeight + style.padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

function isSupportingSink(doc: DiagramDocument, id: ID): boolean {
  const incident = doc.edges.filter((edge) => edge.source === id || edge.target === id);
  return incident.length > 0 && incident.every((edge) => edge.target === id && edge.style === "dashed");
}

/** Measure a horizontal row around endpoint icon centers, leaving room for whole child boundaries. */
function measureResourceRow(
  doc: DiagramDocument,
  children: LayoutChild[],
  state: LayoutState,
): { height: number; yFor: (child: LayoutChild, offset: number) => number } | undefined {
  if (!children.length) return undefined;
  const view = getDefaultView(doc);
  const allResources = children.every((child) => child.resource);
  const owners = new Map<ID, ChildResourceGeom[]>();
  for (const child of children) {
    const resources = childResources(doc, child, state);
    if (!resources.length) return undefined;
    owners.set(child.id, resources);
    if (view.places[child.id]?.pin || resources.some((resource) => view.places[resource.id]?.pin)) return undefined;
  }

  let endpointByOwner = new Map<ID, ID>();
  if (!allResources) {
    if (doc.flow !== "lr" || children.some((child) => !child.resource && !child.group)) return undefined;
    const ownerByResource = new Map<ID, ID>();
    for (const [owner, resources] of owners) for (const resource of resources) ownerByResource.set(resource.id, owner);
    const neighbors = new Map(children.map((child) => [child.id, new Set<ID>()]));
    const endpoints = new Map(children.map((child) => [child.id, new Set<ID>()]));
    for (const edge of doc.edges) {
      if (edge.style === "dashed" || edge.kind === "fail" || edge.kind === "peer") continue;
      const sourceOwner = ownerByResource.get(edge.source);
      const targetOwner = ownerByResource.get(edge.target);
      if (!sourceOwner || !targetOwner || sourceOwner === targetOwner) continue;
      neighbors.get(sourceOwner)!.add(targetOwner);
      neighbors.get(targetOwner)!.add(sourceOwner);
      endpoints.get(sourceOwner)!.add(edge.source);
      endpoints.get(targetOwner)!.add(edge.target);
    }
    const active = children.filter((child) => neighbors.get(child.id)!.size > 0);
    const pairCount = active.reduce((sum, child) => sum + neighbors.get(child.id)!.size, 0) / 2;
    if (
      active.length !== children.length ||
      pairCount !== children.length - 1 ||
      active.some((child) => neighbors.get(child.id)!.size > 2 || endpoints.get(child.id)!.size !== 1)
    )
      return undefined;
    const visited = new Set<ID>();
    const visit = (id: ID): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const neighbor of neighbors.get(id)!) visit(neighbor);
    };
    visit(children[0]!.id);
    if (visited.size !== children.length) return undefined;
    endpointByOwner = new Map(children.map((child) => [child.id, [...endpoints.get(child.id)!][0]!]));
  }

  const measures = children.map((child) => {
    const resources = owners.get(child.id)!;
    const endpointId = endpointByOwner.get(child.id);
    const endpoint = resources.find((resource) => resource.id === endpointId) ?? resources[0]!;
    const center = child.resource
      ? state.nodeGeoms.get(child.id)!.icon.y -
        state.nodeGeoms.get(child.id)!.obstacle.y +
        state.nodeGeoms.get(child.id)!.icon.h / 2
      : endpoint.icon.y + endpoint.icon.h / 2;
    return { child, center, above: center, below: child.h - center };
  });
  const above = Math.max(...measures.map((item) => item.above));
  const below = Math.max(...measures.map((item) => item.below));
  return {
    height: above + below,
    yFor: (child, offset) => {
      const item = measures.find((measure) => measure.child.id === child.id)!;
      return offset + above - item.center;
    },
  };
}

function horizontalConnectorLane(doc: DiagramDocument, group: Group): number {
  const ownerByResource = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    const resource = getResource(doc, id);
    if (resource) {
      ownerByResource.set(id, owner);
      return;
    }
    const childGroup = getGroup(doc, id);
    if (!childGroup) return;
    for (const childId of childGroup.children) collect(childId, owner);
  };
  for (const childId of group.children) collect(childId, childId);

  const hasDecoratedInternalConnector = doc.edges.some((edge) => {
    if (!edge.label && edge.step === undefined) return false;
    const sourceOwner = ownerByResource.get(edge.source);
    const targetOwner = ownerByResource.get(edge.target);
    return Boolean(sourceOwner && targetOwner && sourceOwner !== targetOwner);
  });
  // A label is 14px high and automatic badges use a 10px radius. Forty-eight
  // pixels leaves a real lane between the boundary heading and the icon row,
  // including the renderer's content clearances on both sides.
  return hasDecoratedInternalConnector ? 48 : 0;
}

/**
 * Give a labelled connector between adjacent resources enough visible run to
 * carry its copy. Resource cards are wider than their icons, so the ordinary
 * child gap can leave a perfectly valid route whose label sits under both
 * endpoints (for example, "static content" between CloudFront and S3).
 */
function horizontalChildGap(doc: DiagramDocument, left: LayoutChild, right: LayoutChild, state: LayoutState): number {
  if (!left.resource || !right.resource) return H_GAP;
  const edge = doc.edges.find(
    (candidate) =>
      candidate.label &&
      ((candidate.source === left.id && candidate.target === right.id) ||
        (candidate.source === right.id && candidate.target === left.id)),
  );
  if (!edge?.label) return H_GAP;

  const leftNode = state.nodeGeoms.get(left.id);
  const rightNode = state.nodeGeoms.get(right.id);
  if (!leftNode || !rightNode) return H_GAP;

  const labelWidth = Math.max(16, estimateTextWidth(edge.label, 11));
  const badgeWidth = edge.step === undefined ? 0 : GRAMMAR.badgeRadius * 2 + 16;
  const requiredIconGap = labelWidth + badgeWidth + 16;
  // A group measured again after placement already holds positioned cards.
  const iconGapAtBaseline =
    left.w -
    (leftNode.icon.x - leftNode.obstacle.x + leftNode.icon.w) +
    H_GAP +
    rightNode.icon.x -
    rightNode.obstacle.x;
  const extra = Math.max(0, requiredIconGap - iconGapAtBaseline);
  return H_GAP + Math.ceil(extra / GRAMMAR.grid) * GRAMMAR.grid;
}

function hasHorizontalChildFlow(doc: DiagramDocument, group: Group): boolean {
  if (group.children.length < 2) return false;
  const ownerByResource = new Map<ID, ID>();

  const collect = (id: ID, owner: ID): void => {
    const resource = getResource(doc, id);
    if (resource) {
      ownerByResource.set(resource.id, owner);
      return;
    }
    const childGroup = getGroup(doc, id);
    if (!childGroup) return;
    for (const childId of childGroup.children) collect(childId, owner);
  };

  for (const childId of group.children) collect(childId, childId);
  const hasInternalFlow = doc.edges.some((edge) => {
    if (edge.kind === "fail") return false;
    if (edge.style === "dashed" && edge.kind !== "peer") return false;
    const sourceOwner = ownerByResource.get(edge.source);
    const targetOwner = ownerByResource.get(edge.target);
    return Boolean(sourceOwner && targetOwner && sourceOwner !== targetOwner);
  });
  if (hasInternalFlow) return true;

  // Explicit peer alternatives fed by the same external source are choices,
  // not a processing fan-out. Keep those side by side; ordinary flow/event
  // branches use the vertical cross-axis handled above.
  const peerTargetsByExternalSource = new Map<ID, Set<ID>>();
  for (const edge of doc.edges) {
    if (edge.kind !== "peer") continue;
    const sourceOwner = ownerByResource.get(edge.source);
    const targetOwner = ownerByResource.get(edge.target);
    if (sourceOwner || !targetOwner) continue;
    const targets = peerTargetsByExternalSource.get(edge.source) ?? new Set<ID>();
    targets.add(targetOwner);
    peerTargetsByExternalSource.set(edge.source, targets);
  }
  return [...peerTargetsByExternalSource.values()].some((targets) => targets.size >= 2);
}

function layoutGenericGroup(doc: DiagramDocument, group: Group, state: LayoutState, padding: number): Measured {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const children = measureChildren(doc, group.children, state);
  const flowLayers = directResourceFlowLayers(doc, group, children);
  if (flowLayers) {
    const columnWidths = flowLayers.map((layer) => Math.max(...layer.map((child) => child.w)));
    const columnGaps = flowLayers
      .slice(1)
      .map((layer, index) =>
        Math.max(
          H_GAP,
          ...flowLayers[index]!.flatMap((left) => layer.map((right) => genericChildGap(doc, left, right, state))),
        ),
      );
    const columnHeights = flowLayers.map((layer) =>
      layer.reduce((height, child, index) => height + child.h + (index ? V_GAP : 0), 0),
    );
    const contentW = Math.max(
      100,
      groupLabelContentWidth(group, style),
      columnWidths.reduce((width, columnWidth, index) => width + columnWidth + (index ? columnGaps[index - 1]! : 0), 0),
    );
    const contentH = Math.max(40, ...columnHeights);
    let x = 0;
    for (const [column, layer] of flowLayers.entries()) {
      let y = (contentH - columnHeights[column]!) / 2;
      for (const child of layer) {
        placeLayoutChild(state, child, x + (columnWidths[column]! - child.w) / 2, y, doc);
        y += child.h + V_GAP;
      }
      x += columnWidths[column]! + (columnGaps[column] ?? 0);
    }
    const w = contentW + padding * 2;
    const h = contentH + style.headerHeight + padding * 2;
    storeGroupGeom(state, group, 0, 0, w, h);
    return { w, h };
  }
  const childGaps = children.slice(1).map((child, index) => genericChildGap(doc, children[index]!, child, state));
  const contentW = Math.max(
    100,
    groupLabelContentWidth(group, style),
    children.reduce((width, item, index) => width + item.w + (index > 0 ? childGaps[index - 1]! : 0), 0),
  );
  const contentH = Math.max(40, Math.max(0, ...children.map((item) => item.h)));
  const resourceRow = measureResourceRow(doc, children, state);
  const rowH = Math.max(contentH, resourceRow?.height ?? 0);

  let x = 0;
  for (const [index, item] of children.entries()) {
    placeLayoutChild(
      state,
      item,
      x,
      resourceRow ? resourceRow.yFor(item, (rowH - resourceRow.height) / 2) : (rowH - item.h) / 2,
      doc,
    );
    x += item.w + (childGaps[index] ?? 0);
  }

  const w = Math.max(contentW, 100) + padding * 2;
  const h = rowH + style.headerHeight + padding * 2;
  storeGroupGeom(state, group, 0, 0, w, h);
  return { w, h };
}

/**
 * A flat cloud assembled in Studio has no nested boundaries to express a
 * branch. Put direct resources with the same flow depth in one vertical tier
 * so Auto-fix cannot flatten that branch into unrelated connectors.
 */
function directResourceFlowLayers(
  doc: DiagramDocument,
  group: Group,
  children: LayoutChild[],
): LayoutChild[][] | undefined {
  if (doc.flow !== "lr" || group.kind !== "cloud" || children.length < 3 || children.some((child) => !child.resource))
    return undefined;

  const childById = new Map(children.map((child) => [child.id, child]));
  const adjacency = new Map(children.map((child) => [child.id, new Set<ID>()]));
  const inDegree = new Map(children.map((child) => [child.id, 0]));
  const active = new Set<ID>();
  for (const edge of doc.edges) {
    if (
      edge.kind === "fail" ||
      edge.kind === "peer" ||
      edge.style === "dashed" ||
      !childById.has(edge.source) ||
      !childById.has(edge.target) ||
      edge.source === edge.target
    )
      continue;
    if (adjacency.get(edge.source)!.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    inDegree.set(edge.target, inDegree.get(edge.target)! + 1);
    active.add(edge.source);
    active.add(edge.target);
  }
  if (active.size !== children.length) return undefined;

  const rank = new Map(children.map((child) => [child.id, 0]));
  const queue = children.filter((child) => inDegree.get(child.id) === 0);
  let visited = 0;
  while (queue.length) {
    const source = queue.shift()!;
    visited += 1;
    for (const targetId of adjacency.get(source.id)!) {
      rank.set(targetId, Math.max(rank.get(targetId)!, rank.get(source.id)! + 1));
      inDegree.set(targetId, inDegree.get(targetId)! - 1);
      if (inDegree.get(targetId) === 0) queue.push(childById.get(targetId)!);
    }
  }
  if (visited !== children.length) return undefined;

  const layers = Array.from({ length: Math.max(...rank.values()) + 1 }, () => [] as LayoutChild[]);
  for (const child of children) layers[rank.get(child.id)!]!.push(child);
  return layers.some((layer) => layer.length > 1) ? layers : undefined;
}

/**
 * Generic groups may put the two endpoints of a decorated edge in separate
 * nested boundaries. Reserve a readable corridor between those immediate
 * child owners, using the endpoint resources' measured offsets inside their
 * cards rather than assuming the endpoints are direct children.
 */
function genericChildGap(doc: DiagramDocument, left: LayoutChild, right: LayoutChild, state: LayoutState): number {
  const leftResources = childResources(doc, left, state);
  const rightResources = childResources(doc, right, state);
  if (!leftResources.length || !rightResources.length) return H_GAP;

  // Parallel connectors between the same two resources run too close for their
  // decorations to stack, so they share the corridor end to end. A fan-out or
  // fan-in across this exact child boundary also needs its decoration capacity
  // measured between cards: the sibling routes consume the icon corridor while
  // they turn onto their separate lanes.
  const corridors = new Map<
    string,
    {
      run: number;
      iconGap: number;
      cardGap: number;
      contended: boolean;
    }
  >();
  const boundaryEdges = doc.edges.filter((edge) => {
    const sourceOnLeft = leftResources.some(({ id }) => id === edge.source);
    const sourceOnRight = rightResources.some(({ id }) => id === edge.source);
    const targetOnLeft = leftResources.some(({ id }) => id === edge.target);
    const targetOnRight = rightResources.some(({ id }) => id === edge.target);
    return (sourceOnLeft && targetOnRight) || (sourceOnRight && targetOnLeft);
  });
  const sourceDegree = new Map<ID, number>();
  const targetDegree = new Map<ID, number>();
  for (const edge of boundaryEdges) {
    sourceDegree.set(edge.source, (sourceDegree.get(edge.source) ?? 0) + 1);
    targetDegree.set(edge.target, (targetDegree.get(edge.target) ?? 0) + 1);
  }
  for (const edge of boundaryEdges) {
    if (!edge.label && edge.step === undefined) continue;
    const leftResource = leftResources.find(({ id }) => edge.source === id || edge.target === id);
    const rightResource = rightResources.find(({ id }) => edge.source === id || edge.target === id);
    if (!leftResource || !rightResource) continue;

    const labelWidth = edge.label ? Math.max(16, estimateTextWidth(edge.label, 11)) : 0;
    const badgeWidth = edge.step === undefined ? 0 : GRAMMAR.badgeRadius * 2 + 16;
    const key = `${leftResource.id}\0${rightResource.id}`;
    const corridor = corridors.get(key) ?? {
      run: 0,
      iconGap: left.w - (leftResource.icon.x + leftResource.icon.w) + H_GAP + rightResource.icon.x,
      contended: (sourceDegree.get(edge.source) ?? 0) >= 2 || (targetDegree.get(edge.target) ?? 0) >= 2,
      cardGap: left.w - (leftResource.obstacle.x + leftResource.obstacle.w) + H_GAP + rightResource.obstacle.x,
    };
    corridor.run += labelWidth + badgeWidth + 16;
    corridors.set(key, corridor);
  }
  let gap: number = H_GAP;
  for (const { run, iconGap, cardGap, contended } of corridors.values()) {
    const extra = contended
      ? // Keep one ordinary child gap for sibling routes to turn before the
        // decoration pocket. Without that lane, adding label width merely moves
        // a target-side elbow with the target and never creates usable space.
        Math.max(0, run + H_GAP - cardGap)
      : Math.max(0, run - iconGap);
    gap = Math.max(gap, H_GAP + Math.ceil(extra / GRAMMAR.grid) * GRAMMAR.grid);
  }
  return gap;
}

interface ChildResourceGeom {
  id: ID;
  icon: Rect;
  obstacle: Rect;
}

function childResources(doc: DiagramDocument, child: LayoutChild, state: LayoutState): ChildResourceGeom[] {
  if (child.resource) {
    const node = state.nodeGeoms.get(child.resource.id);
    return node
      ? [
          {
            id: child.resource.id,
            icon: { ...node.icon, x: node.icon.x - node.obstacle.x },
            obstacle: { ...node.obstacle, x: 0, y: 0 },
          },
        ]
      : [];
  }
  if (!child.group) return [];
  return descendantResourceGeoms(doc, child.group.id, state);
}

function descendantResourceGeoms(
  doc: DiagramDocument,
  groupId: ID,
  state: LayoutState,
  offsetX = 0,
  offsetY = 0,
): ChildResourceGeom[] {
  const group = getGroup(doc, groupId);
  if (!group) return [];
  const groupGeom = state.groupGeoms.get(groupId);
  const contentOffsetX = groupGeom ? groupGeom.content.x - groupGeom.bounds.x : 0;
  const contentOffsetY = groupGeom ? groupGeom.content.y - groupGeom.bounds.y : 0;
  const resourceOffsetX = offsetX + contentOffsetX;
  const resourceOffsetY = offsetY + contentOffsetY;
  const out: ChildResourceGeom[] = [];
  for (const childId of group.children) {
    const resource = getResource(doc, childId);
    if (resource) {
      const node = state.nodeGeoms.get(resource.id);
      if (node) {
        out.push({
          id: resource.id,
          icon: {
            ...node.icon,
            x: node.icon.x + resourceOffsetX,
            y: node.icon.y + resourceOffsetY,
          },
          obstacle: {
            ...node.obstacle,
            x: node.obstacle.x + resourceOffsetX,
            y: node.obstacle.y + resourceOffsetY,
          },
        });
      }
      continue;
    }
    const childGroup = getGroup(doc, childId);
    if (!childGroup) continue;
    const childGeom = state.groupGeoms.get(childGroup.id);
    out.push(
      ...descendantResourceGeoms(
        doc,
        childGroup.id,
        state,
        resourceOffsetX + (childGeom?.bounds.x ?? 0),
        resourceOffsetY + (childGeom?.bounds.y ?? 0),
      ),
    );
  }
  return out;
}

function measureChildren(doc: DiagramDocument, childIds: ID[], state: LayoutState): LayoutChild[] {
  const children: LayoutChild[] = [];
  for (const id of childIds) {
    const group = getGroup(doc, id);
    if (group) {
      const size = layoutGroup(doc, group.id, state);
      children.push({ id, group, w: size.w, h: size.h });
      continue;
    }
    const resource = getResource(doc, id);
    if (!resource) continue;
    const size = measureResource(resource, state);
    children.push({ id, resource, w: size.w, h: size.h });
  }
  return children;
}

function placeLayoutChild(state: LayoutState, child: LayoutChild, x: number, y: number, doc: DiagramDocument): void {
  const view = getDefaultView(doc);
  if (child.group) {
    placeGroup(state, child.group.id, x, y, view);
  } else if (child.resource) {
    placeResource(state, child.resource.id, x, y, view);
  }
}

function placeStack(state: LayoutState, items: LayoutChild[], x: number, y: number, doc: DiagramDocument): void {
  for (const item of items) {
    placeLayoutChild(state, item, x, y, doc);
    y += item.h + V_GAP;
  }
}

/** Region children whose solid flow reaches a VPC without first coming out of one. */
function vpcFeeders(doc: DiagramDocument, group: Group): Set<ID> {
  const owners = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    if (getResource(doc, id)) owners.set(id, owner);
    else for (const child of getGroup(doc, id)?.children ?? []) collect(child, owner);
  };
  for (const child of group.children) collect(child, child);
  const vpcs = group.children.filter((id) => getGroup(doc, id)?.kind === "vpc");
  const forward = new Map<ID, Set<ID>>();
  const backward = new Map<ID, Set<ID>>();
  for (const edge of doc.edges) {
    if (!isPrimaryFlowEdge(edge)) continue;
    const source = owners.get(edge.source);
    const target = owners.get(edge.target);
    if (!source || !target || source === target) continue;
    forward.set(source, (forward.get(source) ?? new Set()).add(target));
    backward.set(target, (backward.get(target) ?? new Set()).add(source));
  }
  const reach = (edges: Map<ID, Set<ID>>): Set<ID> => {
    const seen = new Set<ID>(vpcs);
    const queue = [...vpcs];
    for (let index = 0; index < queue.length; index++)
      for (const next of edges.get(queue[index]!) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    return seen;
  };
  const downstream = reach(forward);
  return new Set([...reach(backward)].filter((id) => !downstream.has(id)));
}

function regionColumn(doc: DiagramDocument, child: LayoutChild): RegionColumn {
  if (child.group?.kind === "vpc") return "center";

  const roles = new Set<string>();
  if (child.resource) {
    const role = getCatalogEntry(child.resource.type)?.column;
    if (role) roles.add(role);
  } else if (child.group) {
    collectColumnRoles(doc, child.group.id, roles, new Set<ID>());
  }

  if (roles.has("edge") || roles.has("ingress") || roles.has("auth")) {
    return "left";
  }
  return "right";
}

function collectColumnRoles(doc: DiagramDocument, groupId: ID, roles: Set<string>, visited: Set<ID>): void {
  if (visited.has(groupId)) return;
  visited.add(groupId);
  const group = getGroup(doc, groupId);
  if (!group) return;
  for (const childId of group.children) {
    const resource = getResource(doc, childId);
    if (resource) {
      const role = getCatalogEntry(resource.type)?.column;
      if (role) roles.add(role);
      continue;
    }
    if (getGroup(doc, childId)) collectColumnRoles(doc, childId, roles, visited);
  }
}

function measureResource(resource: Resource, state: LayoutState): Measured {
  if (state.nodeGeoms.has(resource.id)) {
    const g = state.nodeGeoms.get(resource.id)!;
    return { w: g.obstacle.w, h: g.obstacle.h };
  }

  const entry = getCatalogEntry(resource.type);
  const iconSize = resource.role === "secondary" ? GRAMMAR.iconSecondary : GRAMMAR.iconPrimary;
  const customIcon = Boolean(resource.props.iconAsset);
  const serviceLabel =
    resource.label.service ?? (customIcon ? (resource.label.role ?? "Custom") : (entry?.serviceName ?? resource.type));
  const roleLabel =
    customIcon || isDuplicateCatalogLabel(resource.label.role, serviceLabel, entry?.aliases)
      ? undefined
      : resource.label.role;
  const hidden = state.hideResourceLabels;
  const serviceLines = hidden ? [] : wrapResourceLabel(serviceLabel, GRAMMAR.serviceFontSize, RESOURCE_LABEL_MAX_WIDTH);
  const roleLines =
    roleLabel && !hidden ? wrapResourceLabel(roleLabel, GRAMMAR.roleFontSize, RESOURCE_LABEL_MAX_WIDTH) : [];
  const labelWidth = Math.max(
    0,
    ...serviceLines.map((line) => estimateTextWidth(line, GRAMMAR.serviceFontSize)),
    ...roleLines.map((line) => estimateTextWidth(line, GRAMMAR.roleFontSize)),
  );
  const labelHeight = hidden
    ? 0
    : serviceLines.length * GRAMMAR.labelLineHeight +
      (roleLines.length ? roleLines.length * GRAMMAR.labelLineHeight + 6 : 0) +
      GRAMMAR.labelPad;
  const labelPosition = resource.label.position ?? "bottom";
  const gap = 4;
  const w = Math.max(iconSize, labelWidth) + 16;
  const h = iconSize + labelHeight;
  const icon: Rect = {
    x: Math.round((w - iconSize) / 2),
    y: labelPosition === "top" ? labelHeight + gap : 0,
    w: iconSize,
    h: iconSize,
  };
  const label: Rect = {
    x: (w - labelWidth) / 2,
    y: labelPosition === "top" ? 0 : iconSize + gap,
    w: labelWidth,
    h: labelHeight,
  };
  const obstacle: Rect = {
    x: 0,
    y: 0,
    w,
    h: h + 10,
  };

  state.nodeGeoms.set(resource.id, {
    id: resource.id,
    type: "resource",
    icon,
    label,
    obstacle,
    role: resource.role,
    labelPosition,
    resourceType: resource.type,
    serviceLabel,
    serviceLines,
    roleLabel,
    roleLines: roleLines.length ? roleLines : undefined,
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
  return value
    .toLowerCase()
    .replace(/\b(?:amazon|aws)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
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
  const x = snap(override?.pin ? localX : (override?.x ?? localX));
  const y = snap(override?.pin ? localY : (override?.y ?? localY));
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
  const x = snap(override?.pin ? localX : (override?.x ?? localX));
  const y = snap(override?.pin ? localY : (override?.y ?? localY));
  const dx = x - geom.bounds.x;
  const dy = y - geom.bounds.y;
  offsetGroupGeom(state, id, dx, dy);
}

function storeGroupGeom(state: LayoutState, group: Group, x: number, y: number, w: number, h: number): void {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const bounds: Rect = { x, y, w, h };
  const labelPosition = group.labelPosition ?? "top-left";
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
  const textW = group.label.length * style.fontSize * 0.62;
  const labelW = Math.min(w, Math.max(80, style.iconSize + 12 + textW + 12));
  const labelRect: Rect = {
    x: labelPosition.endsWith("right") ? x + w - labelW : x,
    y: header.y,
    w: labelW,
    h: style.headerHeight + 10,
  };
  state.groupGeoms.set(group.id, {
    id: group.id,
    kind: group.kind,
    bounds,
    header,
    labelRect,
    content,
    label: group.label,
    labelPosition,
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
  if (g.labelRect) g.labelRect = { ...g.labelRect, x: g.labelRect.x + dx, y: g.labelRect.y + dy };
  g.content = { ...g.content, x: g.content.x + dx, y: g.content.y + dy };
}

function equalizeSymmetry(doc: DiagramDocument, state: LayoutState): void {
  const byParent = new Map<ID | undefined, Group[]>();
  for (const az of doc.groups.filter((candidate) => candidate.kind === "az")) {
    const siblings = byParent.get(az.parent) ?? [];
    siblings.push(az);
    byParent.set(az.parent, siblings);
  }

  for (const azGroups of byParent.values()) {
    if (azGroups.length < 2) continue;

    const subnetRows = azGroups.map((az) =>
      az.children
        .map((id) => getGroup(doc, id))
        .filter((child): child is Group => child !== undefined && isSubnetGroup(child)),
    );
    const columnCount = Math.max(0, ...subnetRows.map((row) => row.length));
    const columnWidths = Array.from({ length: columnCount }, (_, column) =>
      Math.max(0, ...subnetRows.map((row) => state.groupGeoms.get(row[column]?.id ?? "")?.bounds.w ?? 0)),
    );
    const columnHeights = Array.from({ length: columnCount }, (_, column) =>
      Math.max(0, ...subnetRows.map((row) => state.groupGeoms.get(row[column]?.id ?? "")?.bounds.h ?? 0)),
    );
    const rowW = columnWidths.reduce((width, value, index) => width + value + (index > 0 ? H_GAP : 0), 0);
    const contentW = Math.max(
      LAYOUT_METRICS.minAzContentWidth,
      rowW,
      ...azGroups.map((az) => state.groupGeoms.get(az.id)?.content.w ?? 0),
    );
    const contentH = Math.max(
      LAYOUT_METRICS.minAzContentHeight,
      ...columnHeights,
      ...azGroups.map((az) => state.groupGeoms.get(az.id)?.content.h ?? 0),
    );

    for (const [index, az] of azGroups.entries()) {
      const azGeom = state.groupGeoms.get(az.id);
      if (!azGeom) continue;
      resizeGroupGeom(
        azGeom,
        contentW + GROUP_STYLES.az.padding * 2,
        contentH + GROUP_STYLES.az.headerHeight + GROUP_STYLES.az.padding * 2,
      );

      let x = (contentW - rowW) / 2;
      for (let column = 0; column < subnetRows[index]!.length; column++) {
        const subnetModel = subnetRows[index]![column]!;
        const subnetGeom = state.groupGeoms.get(subnetModel.id);
        if (!subnetGeom) continue;
        const width = columnWidths[column]!;
        const height = columnHeights[column]!;
        resizeGroupGeom(subnetGeom, width, height);
        setGroupPosition(subnetGeom, x, (contentH - height) / 2);
        centerResourcesInGroup(subnetModel, subnetGeom, state);
        x += width + H_GAP;
      }
    }
  }
}

function isSubnetGroup(group: Group): boolean {
  return group.kind === "subnet" || group.kind === "subnet-public" || group.kind === "subnet-private";
}

function resizeGroupGeom(geom: GroupGeom, w: number, h: number): void {
  const style = GROUP_STYLES[geom.kind] ?? GROUP_STYLES.logical;
  const labelPosition = geom.labelPosition ?? "top-left";
  geom.bounds = { ...geom.bounds, w, h };
  geom.header = {
    x: geom.bounds.x,
    y: geom.bounds.y,
    w,
    h: style.headerHeight,
  };
  geom.content = {
    x: geom.bounds.x + style.padding,
    y: geom.bounds.y + style.headerHeight + style.padding / 2,
    w: Math.max(24, w - style.padding * 2),
    h: Math.max(24, h - style.headerHeight - style.padding * 1.5),
  };
  if (geom.labelRect) {
    geom.labelRect = {
      ...geom.labelRect,
      x: labelPosition.endsWith("right") ? geom.bounds.x + w - geom.labelRect.w : geom.bounds.x,
      y: geom.header.y,
    };
  }
}

function setGroupPosition(geom: GroupGeom, x: number, y: number): void {
  const dx = x - geom.bounds.x;
  const dy = y - geom.bounds.y;
  shiftRect(geom.bounds, dx, dy);
  shiftRect(geom.header, dx, dy);
  if (geom.labelRect) shiftRect(geom.labelRect, dx, dy);
  shiftRect(geom.content, dx, dy);
}

function centerResourcesInGroup(group: Group, geom: GroupGeom, state: LayoutState): void {
  const nodes = group.children.map((id) => state.nodeGeoms.get(id)).filter((node): node is NodeGeom => Boolean(node));
  if (!nodes.length) return;
  const minX = Math.min(...nodes.map((node) => node.obstacle.x));
  const minY = Math.min(...nodes.map((node) => node.obstacle.y));
  const maxX = Math.max(...nodes.map((node) => node.obstacle.x + node.obstacle.w));
  const maxY = Math.max(...nodes.map((node) => node.obstacle.y + node.obstacle.h));
  const dx = (geom.content.w - (maxX - minX)) / 2 - minX;
  const dy = (geom.content.h - (maxY - minY)) / 2 - minY;
  for (const node of nodes) {
    offsetNodeGeom(node, node.obstacle.x + dx, node.obstacle.y + dy);
  }
}

function applyPinnedViewOverrides(doc: DiagramDocument, layout: LayoutResult): void {
  const view = getDefaultView(doc);
  const groupDepth = (id: ID): number => {
    const group = getGroup(doc, id);
    return group?.parent ? 1 + groupDepth(group.parent) : 0;
  };

  for (const group of [...layout.groups].sort((a, b) => groupDepth(a.id) - groupDepth(b.id))) {
    const place = view.places[group.id];
    if (!place?.pin || (place.x === undefined && place.y === undefined)) continue;
    const dx = (place.x ?? group.bounds.x) - group.bounds.x;
    const dy = (place.y ?? group.bounds.y) - group.bounds.y;
    // Authored dimensions represent a boundary edit (including north/west
    // resize, where x/y move with the edge). Keep every descendant at its
    // existing absolute position. A position-only pin remains a group move
    // and translates the complete subtree as before.
    if (place.w !== undefined || place.h !== undefined) {
      shiftRect(group.bounds, dx, dy);
      shiftRect(group.header, dx, dy);
      if (group.labelRect) shiftRect(group.labelRect, dx, dy);
      shiftRect(group.content, dx, dy);
      continue;
    }
    const descendants = new Set<ID>([group.id]);
    collectDescendants(doc, group.id, descendants);
    for (const candidate of layout.groups) {
      if (!descendants.has(candidate.id)) continue;
      shiftRect(candidate.bounds, dx, dy);
      shiftRect(candidate.header, dx, dy);
      if (candidate.labelRect) shiftRect(candidate.labelRect, dx, dy);
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
    if (place.w) group.bounds.w = Math.max(80, place.manual ? place.w : snap(place.w));
    if (place.h) group.bounds.h = Math.max(48, place.manual ? place.h : snap(place.h));
    const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
    const labelPosition = group.labelPosition ?? "top-left";
    group.header = {
      ...group.header,
      x: group.bounds.x,
      y: group.bounds.y,
      w: group.bounds.w,
      h: style.headerHeight,
    };
    group.content = {
      x: group.bounds.x + style.padding,
      y: group.bounds.y + style.headerHeight + style.padding / 2,
      w: Math.max(24, group.bounds.w - style.padding * 2),
      h: Math.max(24, group.bounds.h - style.headerHeight - style.padding * 1.5),
    };
    const labelW = Math.min(group.bounds.w, group.labelRect?.w ?? 80);
    group.labelRect = {
      x: labelPosition.endsWith("right") ? group.bounds.x + group.bounds.w - labelW : group.bounds.x,
      y: group.header.y,
      w: labelW,
      h: style.headerHeight + 10,
    };
  }

  // Collision repair may rearrange siblings to make authored diagrams
  // readable, but an explicit pin is also the editor's promise that a drag
  // lands exactly where the user released it. Preserve those coordinates
  // across the repair pass and grow containing groups around them afterward.
  const pinnedNodePositions = new Map(
    layout.nodes
      .filter((node) => view.places[node.id]?.pin && view.places[node.id]?.manual)
      .map((node) => [node.id, { x: node.obstacle.x, y: node.obstacle.y }]),
  );
  organizeSiblingResources(doc, layout);
  const groupById = new Map(layout.groups.map((group) => [group.id, group]));
  for (const [id, position] of pinnedNodePositions) {
    const node = layout.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    shiftAbsoluteNode(node, position.x - node.obstacle.x, position.y - node.obstacle.y);
    const resource = getResource(doc, id);
    const parent = resource?.parent ? doc.groups.find((candidate) => candidate.id === resource.parent) : undefined;
    if (parent) growGroupToContain(doc, groupById, parent, node.obstacle, 8);
  }

  const right = [
    ...layout.nodes.map((node) => node.obstacle.x + node.obstacle.w),
    ...layout.groups.map((group) => group.bounds.x + group.bounds.w),
  ];
  const bottom = [
    ...layout.nodes.map((node) => node.obstacle.y + node.obstacle.h),
    ...layout.groups.map((group) => group.bounds.y + group.bounds.h),
  ];
  layout.width = Math.max(
    LAYOUT_METRICS.minCanvasWidth,
    Math.ceil(Math.max(0, ...right) + LAYOUT_METRICS.canvasPadding),
  );
  layout.height = Math.max(
    LAYOUT_METRICS.minCanvasHeight,
    Math.ceil(Math.max(0, ...bottom) + LAYOUT_METRICS.canvasPadding),
  );
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
    const nodes = model.children.map((id) => nodeById.get(id)).filter((node): node is NodeGeom => Boolean(node));
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
    let groupOverlap = nodes.some((node) => childGroups.some((child) => rectsOverlap(node.obstacle, child.bounds, 8)));
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
      groupOverlap = nodes.some((node) => childGroups.some((child) => rectsOverlap(node.obstacle, child.bounds, 8)));
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
    growGroupToContain(
      doc,
      groupById,
      model,
      {
        x: group.content.x,
        y: shelfY,
        w: Math.min(group.content.w, columns * cellW + Math.max(0, columns - 1) * gapX),
        h: requiredContentH,
      },
      8,
    );
    const fittedGapY =
      rows <= 1 ? gapY : Math.max(minimumGapY, Math.min(gapY, (group.content.h - rows * cellH) / (rows - 1)));

    nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x =
        childGroups.length && !overlap
          ? Math.min(Math.max(node.obstacle.x, group.content.x), group.content.x + group.content.w - node.obstacle.w)
          : group.content.x + column * (cellW + gapX) + (cellW - node.obstacle.w) / 2;
      const y = shelfY + row * (cellH + fittedGapY);
      const safeX = Math.min(Math.max(snap(x), group.content.x), group.content.x + group.content.w - node.obstacle.w);
      const safeY = Math.min(Math.max(snap(y), group.content.y), group.content.y + group.content.h - node.obstacle.h);
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
  const place = getDefaultView(doc).places[model.id];
  // A persisted group dimension is an authored boundary. Collision repair may
  // still move an offending child, but it must never silently turn a manual
  // resize into an auto-fit boundary (including when this helper is called
  // recursively for an auto-fit descendant).
  const authoredW = place?.w !== undefined;
  const authoredH = place?.h !== undefined;
  const growthX = Math.max(0, rect.x + rect.w + padding - (group.content.x + group.content.w));
  const growthY = Math.max(0, rect.y + rect.h + padding - (group.content.y + group.content.h));
  const appliedGrowthX = authoredW ? 0 : growthX;
  const appliedGrowthY = authoredH ? 0 : growthY;
  if (!appliedGrowthX && !appliedGrowthY) return;
  group.content.w += appliedGrowthX;
  group.content.h += appliedGrowthY;
  group.bounds.w += appliedGrowthX;
  group.bounds.h += appliedGrowthY;
  group.header.w += appliedGrowthX;
  const labelPosition = group.labelPosition ?? model.labelPosition ?? "top-left";
  if (labelPosition.endsWith("right") && group.labelRect) group.labelRect.x += appliedGrowthX;
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

function collectDescendants(doc: DiagramDocument, groupId: ID, ids: Set<ID>): void {
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

function applyNodeSize(node: NodeGeom, width?: number, height?: number): void {
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

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/**
 * Keep a long group header inside its boundary. Resource cards already grow
 * from their measured labels, but group headers used to stop at a small
 * content minimum and let the text paint past the right edge.
 */
function groupLabelContentWidth(group: Group, style: (typeof GROUP_STYLES)[Group["kind"]]): number {
  const iconSpace = group.type === "cloud-agnostic.boundary" || group.hideIcon ? 0 : style.iconSize + 12;
  const labelWidth = Math.max(80, iconSpace + estimateTextWidth(group.label, style.fontSize) + 16);
  return Math.max(0, labelWidth - style.padding * 2);
}

function wrapResourceLabel(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimateTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function absoluteNodeGeoms(doc: DiagramDocument, layout: LayoutResult): Map<ID, NodeGeom> {
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

function groupOffset(doc: DiagramDocument, parentId: ID | undefined, layout: LayoutResult): { x: number; y: number } {
  if (!parentId) return { x: 48, y: 48 };
  const group = layout.groups.find((g) => g.id === parentId);
  if (!group) return { x: 48, y: 48 };
  const parentGroup = getGroup(doc, parentId);
  const style = parentGroup ? GROUP_STYLES[parentGroup.kind] : GROUP_STYLES.logical;
  const parentOffset = parentGroup?.parent ? groupOffset(doc, parentGroup.parent, layout) : { x: 0, y: 0 };
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
