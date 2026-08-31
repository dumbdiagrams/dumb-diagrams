import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture, DIAGRAM_LIMITS, getDefaultView } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";
import { GROUP_STYLES } from "@dumb-diagrams/runtime/grammar-aws";

import {
  addAnnotation,
  addText,
  addGroup,
  addResource,
  alignSelection,
  annotationSize,
  annotationStyle,
  canPlaceCatalogEntry,
  clearView,
  deleteSelection,
  importSvgAsset,
  isSelected,
  MAX_EDGE_STEP,
  moveSelection,
  needsAutoFix,
  nudgeSelection,
  primarySelection,
  pasteClipboard,
  reconnectEdge,
  renameResource,
  resourceIconSize,
  serializeClipboard,
  sendToBack,
  sendToFront,
  setEdgeBadgePosition,
  setEdgeLabelPosition,
  setAnnotationStyle,
  setGroupLabelPosition,
  setGroupIconHidden,
  setBoundaryAppearance,
  setPlace,
  setResourceLabelPosition,
  setSize,
  toggleSelectionItem,
  updateTextFormat,
  setGroupPlace,
  setGroupBounds,
  fitGroupToContents,
  canGroupSelection,
  groupSelection,
  reparentPreservingAbsolutePosition,
  ungroup,
  removeSelectionPreservingGroupContents,
  setRoute,
  setResourceIconSize,
  setTitle,
  swapEdgeDirection,
  updateEdge,
  updateEdgePreservingLayout,
} from "./editor-model.js";

describe("editor commands", () => {
  it("keeps selection helpers and missing-target edits predictable", () => {
    const doc = createAsyncDocsFixture();
    const item = { kind: "resource" as const, id: "client" };
    const selection = [item];

    expect(annotationStyle({})).toBe("paper");
    expect(annotationStyle({ style: "code" })).toBe("code");
    expect(annotationSize("callout")).toMatchObject({ w: 280, h: 104 });
    expect(annotationSize("unknown" as never)).toMatchObject({ w: 220, h: 96 });
    expect(primarySelection([])).toBeNull();
    expect(primarySelection(selection)).toEqual(item);
    expect(isSelected(selection, "resource", "client")).toBe(true);
    expect(isSelected(selection, "resource", "missing")).toBe(false);
    expect(toggleSelectionItem(selection, item, false)).toBe(selection);
    expect(toggleSelectionItem(selection, { kind: "group", id: "main" }, false)).toEqual([
      { kind: "group", id: "main" },
    ]);
    expect(toggleSelectionItem(selection, item, true)).toEqual([]);
    expect(toggleSelectionItem(selection, { kind: "group", id: "main" }, true)).toHaveLength(2);

    const locked = structuredClone(doc);
    getDefaultView(locked).places.client = { locked: true };
    getDefaultView(locked).places.main = { locked: true };
    expect(setPlace(locked, "client", 10, 20)).toBe(locked);
    expect(setResourceIconSize(doc, "missing", "small")).toBe(doc);
    expect(setResourceLabelPosition(doc, "missing", "top")).toBe(doc);
    expect(setGroupLabelPosition(doc, "missing", "top-left")).toBe(doc);
    expect(setGroupIconHidden(doc, "missing", true)).toBe(doc);
    expect(setSize(doc, "client", 160, 160)).toBe(doc);
    expect(setSize(locked, "main", 160, 160)).toBe(locked);
    expect(setGroupPlace(doc, "main", 10, 20, 8, 8)).not.toBe(doc);
    expect(sendToFront(doc, "missing")).toBe(doc);
    expect(sendToBack(doc, "missing")).toBe(doc);
    expect(nudgeSelection(doc, [{ kind: "resource", id: "missing" }], 8, 8)).toBe(doc);
    expect(reconnectEdge(doc, "missing", {})).toBe(doc);
    expect(swapEdgeDirection(doc, "missing")).toBe(doc);
  });

  it("limits arrow numbers to the supported 0-99 range", () => {
    const doc = createAsyncDocsFixture();

    expect(updateEdge(doc, "e1", { step: MAX_EDGE_STEP }).edges.find((edge) => edge.id === "e1")?.step)
      .toBe(MAX_EDGE_STEP);
    expect(updateEdge(doc, "e1", { step: MAX_EDGE_STEP + 1 })).toBe(doc);
    expect(updateEdge(doc, "e1", { step: -1 })).toBe(doc);
  });

  it("changes connector meaning without rotating the approved layout", () => {
    const doc = createAsyncDocsFixture();
    const edge = doc.edges[0]!;
    edge.kind = "peer";
    const before = layoutDocument(doc);
    const next = updateEdgePreservingLayout(doc, edge.id, { kind: "flow" }, before);
    const after = layoutDocument(next);

    expect(after.groups.map((group) => ({ x: group.bounds.x, y: group.bounds.y }))).toEqual(
      before.groups.map((group) => ({
        x: Math.round(group.bounds.x),
        y: Math.round(group.bounds.y),
      })),
    );
    expect(after.nodes.map((node) => ({ x: node.obstacle.x, y: node.obstacle.y }))).toEqual(
      before.nodes.map((node) => ({
        x: Math.round(node.obstacle.x),
        y: Math.round(node.obstacle.y),
      })),
    );
  });

  it("allows manual catalog items to be staged outside generated containment rules", () => {
    const doc = createAsyncDocsFixture();
    const service = getCatalogEntry("aws.elastic-container-service")!;
    const boundary = getCatalogEntry("aws.vpc")!;

    expect(service.allowedParents).not.toContain("region");
    expect(canPlaceCatalogEntry(doc, service, "use1")).toEqual({ ok: true });
    const placedService = addResource(doc, service, "use1", { x: 2_000, y: 48 });
    expect(placedService.doc.resources.find((resource) => resource.id === placedService.id)).toMatchObject({
      type: service.type,
      parent: "use1",
    });

    expect(boundary.allowRoot).toBe(false);
    expect(canPlaceCatalogEntry(doc, boundary)).toEqual({ ok: true });
    const placedBoundary = addGroup(
      doc,
      "vpc",
      boundary.name,
      undefined,
      { x: 2_000, y: 48 },
      boundary.type,
    );
    expect(placedBoundary.doc.groups.find((group) => group.id === placedBoundary.id)).toMatchObject({
      type: boundary.type,
      parent: undefined,
    });
  });

  it("renames resources without changing ids", () => {
    const doc = createAsyncDocsFixture();
    const next = renameResource(doc, "client", "Browser");
    expect(next.resources.find((resource) => resource.id === "client")?.label.role).toBe(
      "Browser",
    );
  });

  it("persists resource and group display-label positions", () => {
    const doc = createAsyncDocsFixture();
    const resource = setResourceLabelPosition(doc, "client", "top");
    const group = setGroupLabelPosition(resource, "use1", "top-right");

    expect(group.resources.find((candidate) => candidate.id === "client")?.label.position).toBe("top");
    expect(group.groups.find((candidate) => candidate.id === "use1")?.labelPosition).toBe("top-right");
  });

  it("persists group icon visibility independently of its catalog type", () => {
    const doc = createAsyncDocsFixture();
    doc.groups[0]!.type = "cloud-agnostic.boundary";

    const hidden = setGroupIconHidden(doc, "use1", true);
    expect(hidden.groups.find((group) => group.id === "use1")?.hideIcon).toBe(true);

    const shown = setGroupIconHidden(hidden, "use1", false);
    expect(shown.groups.find((group) => group.id === "use1")?.hideIcon).toBeUndefined();
  });

  it("persists boundary line, color, and fill customization", () => {
    const doc = createAsyncDocsFixture();
    const next = setBoundaryAppearance(doc, "use1", {
      style: "solid",
      color: "purple",
      fill: "none",
    });

    expect(next.groups.find((group) => group.id === "use1")).toMatchObject({
      style: "solid",
      color: "purple",
      fill: "none",
    });
    expect(setBoundaryAppearance(doc, "missing", { color: "red" })).toBe(doc);
  });

  it("sets diagram title independently from id", () => {
    const doc = createAsyncDocsFixture();
    const next = setTitle(doc, "Async Docs");
    expect(next.title).toBe("Async Docs");
    expect(next.id).toBe("async-docs");
  });

  it("persists note styles and gives each style a useful default size", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.client = { zIndex: 12 };
    const added = addAnnotation(doc, "const worker = await run()", { x: 80, y: 80 });
    const code = setAnnotationStyle(added.doc, added.id, "code");
    const codeNote = code.annotations.find((annotation) => annotation.id === added.id);

    expect(codeNote?.style).toBe("code");
    expect(getDefaultView(code).annotations?.[added.id]).toMatchObject({ w: 300, h: 160, zIndex: 13 });

    const paper = setAnnotationStyle(code, added.id, "paper");
    expect(paper.annotations.find((annotation) => annotation.id === added.id)?.style).toBeUndefined();
    expect(getDefaultView(paper).annotations?.[added.id]).toMatchObject({ w: 220, h: 96 });
  });

  it("adds plain text items with an editable text style", () => {
    const doc = createAsyncDocsFixture();
    const added = addText(doc, "A manual annotation", { x: 80, y: 80 });

    expect(added.doc.annotations.find((annotation) => annotation.id === added.id)).toMatchObject({
      text: "A manual annotation",
      style: "text",
    });
    expect(getDefaultView(added.doc).annotations?.[added.id]).toMatchObject({ w: 240, h: 48 });

    const formatted = updateTextFormat(added.doc, added.id, {
      font: "mono",
      fontSize: 20,
      align: "right",
    });
    expect(formatted.annotations.find((annotation) => annotation.id === added.id)).toMatchObject({
      font: "mono",
      fontSize: 20,
      align: "right",
    });
  });

  it("nudges pinned places", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 40, y: 40, pin: true };
    const next = nudgeSelection(doc, [{ kind: "resource", id: "client" }], 8, 8);
    expect(getDefaultView(next).places.client).toMatchObject({ x: 48, y: 48, pin: true });
  });

  it("nudges pinned places to the visible grid when enabled", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 40, y: 40, pin: true };
    const next = nudgeSelection(
      doc,
      [{ kind: "resource", id: "client" }],
      1,
      1,
      { snapToGrid: true },
    );
    expect(getDefaultView(next).places.client).toMatchObject({ x: 48, y: 48, pin: true });
  });

  it("auto-fix clears manual placement and routes without changing hierarchy", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.main = { x: 12, y: 18, pin: true };
    view.places.api_alb = { x: 24, y: 30, pin: true };
    view.routes.e1 = { pin: true, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };

    expect(needsAutoFix(doc)).toBe(true);
    const fixed = clearView(doc);
    const fixedView = getDefaultView(fixed);

    expect(fixed.groups.find((group) => group.id === "use1")?.children).toEqual(
      doc.groups.find((group) => group.id === "use1")?.children,
    );
    expect(fixed.groups.find((group) => group.id === "main")?.children).toEqual(
      doc.groups.find((group) => group.id === "main")?.children,
    );
    expect(fixedView.places.main).not.toHaveProperty("x");
    expect(fixedView.places.api_alb).not.toHaveProperty("y");
    expect(fixedView.routes).toEqual({});
    expect(needsAutoFix(fixed)).toBe(false);

    const layout = layoutDocument(fixed);
    const region = layout.groups.find((group) => group.id === "use1")!;
    const vpc = layout.groups.find((group) => group.id === "main")!;
    const subnet = layout.groups.find((group) => group.id === "pubA")!;
    const alb = layout.nodes.find((node) => node.id === "api_alb")!;

    expect(vpc.bounds.x).toBeGreaterThanOrEqual(region.content.x);
    expect(vpc.bounds.y).toBeGreaterThanOrEqual(region.content.y);
    expect(alb.obstacle.x).toBeGreaterThanOrEqual(subnet.content.x);
    expect(alb.obstacle.y).toBeGreaterThanOrEqual(subnet.content.y);
  });

  it("moves a selected group subtree once per gesture delta", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.appA = { x: 200, y: 200, pin: true };
    view.places.apiA = { x: 240, y: 240, pin: true };
    view.places.workerA = { x: 280, y: 240, pin: true };
    const next = moveSelection(
      doc,
      [{ kind: "group", id: "appA" }],
      8,
      16,
      layoutDocument(doc),
    );
    expect(getDefaultView(next).places.appA).toMatchObject({ x: 208, y: 216 });
    expect(getDefaultView(next).places.apiA).toMatchObject({ x: 248, y: 256 });
    expect(getDefaultView(next).places.workerA).toMatchObject({ x: 288, y: 256 });
  });

  it("keeps a dragged resource at its pinned drop position", () => {
    const doc = createAsyncDocsFixture();
    const before = layoutDocument(doc);
    const beforeNode = before.nodes.find((node) => node.id === "apiA")!;
    const next = moveSelection(
      doc,
      [{ kind: "resource", id: "apiA" }],
      112,
      64,
      before,
    );
    const afterNode = layoutDocument(next).nodes.find((node) => node.id === "apiA")!;
    const place = getDefaultView(next).places.apiA!;

    expect(afterNode.obstacle.x).toBe(place.x);
    expect(afterNode.obstacle.y).toBe(place.y);
  });

  it("moves from rendered geometry when an unpinned place has stale hints", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.apiA = { x: 8, y: 8, pin: false };
    const before = layoutDocument(doc);
    const beforeNode = before.nodes.find((node) => node.id === "apiA")!;
    const next = moveSelection(
      doc,
      [{ kind: "resource", id: "apiA" }],
      48,
      24,
      before,
    );

    expect(getDefaultView(next).places.apiA).toMatchObject({
      x: Math.round(beforeNode.obstacle.x + 48),
      y: Math.round(beforeNode.obstacle.y + 24),
      pin: true,
    });
  });

  it("preserves negative drop positions so the canvas can expand on every side", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations.push({ id: "note", text: "Move me", style: "text" });
    getDefaultView(doc).annotations = {
      note: { x: 48, y: 48, w: 240, h: 48, pin: true },
    };
    const layout = layoutDocument(doc);
    const node = layout.nodes.find((candidate) => candidate.id === "client")!;
    const next = moveSelection(
      doc,
      [
        { kind: "resource", id: "client" },
        { kind: "annotation", id: "note" },
      ],
      -Math.max(node.obstacle.x, 48) - 72,
      -Math.max(node.obstacle.y, 48) - 48,
      layout,
    );
    const view = getDefaultView(next);

    expect(view.places.client!.x).toBeLessThan(0);
    expect(view.places.client!.y).toBeLessThan(0);
    expect(view.annotations!.note!.x).toBeLessThan(0);
    expect(view.annotations!.note!.y).toBeLessThan(0);
  });

  it("pastes nested groups without duplicating child ids", () => {
    const doc = createAsyncDocsFixture();
    const payload = serializeClipboard(doc, [{ kind: "group", id: "appA" }]);
    const result = pasteClipboard(doc, payload, { x: 600, y: 600 });
    const pastedGroupId = result.selection.find((item) => item.kind === "group")?.id;
    const pastedGroup = result.doc.groups.find((group) => group.id === pastedGroupId);
    expect(pastedGroup).toBeTruthy();
    expect(new Set(pastedGroup?.children).size).toBe(pastedGroup?.children.length);
    expect(pastedGroup?.children).toHaveLength(2);
  });

  it("keeps a copied nested resource inside copied ancestor groups", () => {
    const doc = createAsyncDocsFixture();
    const payload = serializeClipboard(doc, [{ kind: "resource", id: "artifacts" }]);
    const result = pasteClipboard(doc, payload, { x: 600, y: 600 });
    const pastedResourceId = result.selection.find((item) => item.kind === "resource")?.id;
    const pastedResource = result.doc.resources.find((resource) => resource.id === pastedResourceId);
    const pastedParent = result.doc.groups.find((group) => group.id === pastedResource?.parent);

    expect(pastedResource?.parent).toBeTruthy();
    expect(pastedParent).toBeTruthy();
    expect(pastedParent?.children).toContain(pastedResourceId);
  });

  it("deletes multiple selected items", () => {
    const doc = createAsyncDocsFixture();
    const next = deleteSelection(doc, [
      { kind: "edge", id: "e1" },
      { kind: "edge", id: "e2" },
    ]);
    expect(next.edges.some((edge) => edge.id === "e1")).toBe(false);
    expect(next.edges.some((edge) => edge.id === "e2")).toBe(false);
  });

  it("imports sanitized svg assets with deduplication", () => {
    const doc = createAsyncDocsFixture();
    const svg = '<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
    const first = importSvgAsset(doc, svg);
    const second = importSvgAsset(first.doc, svg);
    expect(first.assetId).toBe(second.assetId);
    expect(first.doc.assets).toHaveLength(1);
  });

  it("aligns selection to a shared edge", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 10, y: 10, pin: true };
    view.places.api_alb = { x: 80, y: 40, pin: true };
    const layout = {
      nodes: [
        {
          id: "client",
          type: "resource" as const,
          icon: { x: 10, y: 10, w: 64, h: 64 },
          label: { x: 10, y: 74, w: 64, h: 24 },
          obstacle: { x: 10, y: 10, w: 64, h: 88 },
          role: "primary" as const,
          resourceType: "generic.user",
          serviceLabel: "Client",
        },
        {
          id: "api_alb",
          type: "resource" as const,
          icon: { x: 80, y: 40, w: 64, h: 64 },
          label: { x: 80, y: 104, w: 64, h: 24 },
          obstacle: { x: 80, y: 40, w: 64, h: 88 },
          role: "primary" as const,
          resourceType: "aws.alb",
          serviceLabel: "ALB",
        },
      ],
      groups: [],
      edges: [],
      width: 400,
      height: 300,
      symmetries: [],
    };
    const next = alignSelection(
      doc,
      [
        { kind: "resource", id: "client" },
        { kind: "resource", id: "api_alb" },
      ],
      layout,
      "top",
    );
    expect(getDefaultView(next).places.client?.y).toBe(10);
    expect(getDefaultView(next).places.api_alb?.y).toBe(10);
  });

  it("does not shift unpinned child places when first pinning a group", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.workerA = { x: 120, y: 88, pin: true };
    const layout = layoutDocument(doc);
    const group = layout.groups.find((candidate) => candidate.id === "appA");
    expect(group).toBeTruthy();
    const next = setGroupPlace(doc, "appA", group!.bounds.x, group!.bounds.y, 0, 0);
    expect(getDefaultView(next).places.workerA).toMatchObject({ x: 120, y: 88 });
  });

  it("persists explicit dimensions for a resized group", () => {
    const doc = createAsyncDocsFixture();
    const next = setSize(doc, "appA", 360, 240);
    const place = getDefaultView(next).places.appA;

    expect(place).toMatchObject({ w: 360, h: 240, pin: true });
    const group = layoutDocument(next).groups.find((candidate) => candidate.id === "appA");
    expect(group?.bounds).toMatchObject({ w: 360, h: 240 });
  });

  it("persists rounded manual group bounds without moving descendants", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.apiA = { x: 120, y: 140, pin: true };
    view.places.workerA = { x: 220, y: 180, pin: true };
    const next = setGroupBounds(doc, "appA", { x: 10.4, y: 20.6, w: 400.5, h: 250.2 });

    expect(view.places.apiA).toEqual({ x: 120, y: 140, pin: true });
    expect(getDefaultView(next).places.appA).toMatchObject({
      x: 10,
      y: 21,
      w: 401,
      h: 250,
      pin: true,
      manual: true,
    });
    expect(getDefaultView(next).places.apiA).toEqual(view.places.apiA);
    expect(setGroupBounds(doc, "missing", { x: 0, y: 0, w: 1, h: 1 })).toBe(doc);
  });

  it("fits a group around nested and border-child geometry using group style insets", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    doc.groups.find((group) => group.id === "appA")!.borderChildren = [{ id: "client", side: "e" }];
    const client = layout.nodes.find((node) => node.id === "client")!.obstacle;
    const api = layout.nodes.find((node) => node.id === "apiA")!.obstacle;
    const worker = layout.nodes.find((node) => node.id === "workerA")!.obstacle;
    const next = fitGroupToContents(doc, "appA", layout);
    const style = GROUP_STYLES["subnet-private"];
    const minX = Math.min(client.x, api.x, worker.x);
    const minY = Math.min(client.y, api.y, worker.y);
    const maxX = Math.max(client.x + client.w, api.x + api.w, worker.x + worker.w);
    const maxY = Math.max(client.y + client.h, api.y + api.h, worker.y + worker.h);

    expect(getDefaultView(next).places.appA).toMatchObject({
      x: Math.round(minX - style.padding),
      y: Math.round(minY - style.headerHeight - style.padding),
      w: Math.round(maxX - minX + style.padding * 2),
      h: Math.round(maxY - minY + style.headerHeight + style.padding * 2),
      pin: true,
      manual: true,
    });
    expect(getDefaultView(next).places.apiA).toEqual(getDefaultView(doc).places.apiA);
  });

  it("reparents groups and resources without changing absolute places or routes", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.apiA = { x: 120, y: 140, pin: true };
    getDefaultView(doc).routes.e2 = { pin: true, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const beforePlace = structuredClone(getDefaultView(doc).places.apiA);
    const beforeRoute = structuredClone(getDefaultView(doc).routes.e2);
    const next = reparentPreservingAbsolutePosition(doc, { kind: "resource", id: "apiA" }, "appB");

    expect(next.resources.find((resource) => resource.id === "apiA")?.parent).toBe("appB");
    expect(next.groups.find((group) => group.id === "appA")?.children).not.toContain("apiA");
    expect(next.groups.find((group) => group.id === "appB")?.children).toContain("apiA");
    expect(getDefaultView(next).places.apiA).toEqual(beforePlace);
    expect(getDefaultView(next).routes.e2).toEqual(beforeRoute);
    expect(reparentPreservingAbsolutePosition(doc, { kind: "group", id: "main" }, "appA")).toBe(doc);
    expect(reparentPreservingAbsolutePosition(doc, { kind: "resource", id: "apiA" }, "missing")).toBe(doc);
  });

  it("groups direct siblings while preserving hierarchy, geometry, and edge identity", () => {
    const doc = createAsyncDocsFixture();
    const before = layoutDocument(doc);
    const beforeGeometry = new Map([
      ...before.nodes.map((node) => [node.id, node.obstacle] as const),
      ...before.groups.map((group) => [group.id, group.bounds] as const),
    ]);
    const beforeEdges = structuredClone(doc.edges);
    const result = groupSelection(doc, [
      { kind: "resource", id: "jobs_dlq" },
      { kind: "resource", id: "jobs" },
    ], before, "Processing");

    expect(result).toBeTruthy();
    const next = result!.doc;
    const group = next.groups.find((candidate) => candidate.id === result!.id)!;
    expect(group).toMatchObject({ kind: "logical", label: "Processing", parent: "queues" });
    expect(group.children).toEqual(["jobs", "jobs_dlq"]);
    expect(next.groups.find((candidate) => candidate.id === "queues")?.children).toEqual([result!.id]);
    expect(next.resources.find((resource) => resource.id === "jobs")?.parent).toBe(result!.id);
    expect(next.resources.find((resource) => resource.id === "jobs_dlq")?.parent).toBe(result!.id);
    expect(next.edges).toEqual(beforeEdges);

    const after = layoutDocument(next);
    for (const id of ["jobs", "jobs_dlq"]) {
      expect(after.nodes.find((node) => node.id === id)?.obstacle).toEqual(beforeGeometry.get(id));
    }
    const style = GROUP_STYLES.logical;
    const expected = {
      x: Math.min(beforeGeometry.get("jobs")!.x, beforeGeometry.get("jobs_dlq")!.x) - style.padding,
      y: Math.min(beforeGeometry.get("jobs")!.y, beforeGeometry.get("jobs_dlq")!.y) - style.headerHeight - style.padding,
    };
    expect(getDefaultView(next).places[result!.id]).toMatchObject(expected);
  });

  it("groups nested siblings and rejects invalid or ancestor selections", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);

    const nested = groupSelection(doc, [
      { kind: "group", id: "queues" },
      { kind: "group", id: "storage" },
    ], layout);
    expect(nested).toBeTruthy();
    expect(nested!.doc.groups.find((group) => group.id === nested!.id)?.children).toEqual(["queues", "storage"]);
    expect(nested!.doc.groups.find((group) => group.id === "use1")?.children).toEqual(["main", nested!.id]);
    expect(groupSelection(doc, [{ kind: "edge", id: "e1" }, { kind: "resource", id: "apiA" }], layout)).toBeNull();
    expect(groupSelection(doc, [{ kind: "resource", id: "apiA" }, { kind: "resource", id: "missing" }], layout)).toBeNull();
    expect(groupSelection(doc, [{ kind: "resource", id: "apiA" }, { kind: "resource", id: "apiB" }], layout)).toBeNull();
    expect(groupSelection(doc, [{ kind: "group", id: "azA" }, { kind: "group", id: "appA" }], layout)).toBeNull();
    expect(groupSelection(doc, [{ kind: "resource", id: "apiA" }], layout)).toBeNull();
  });

  it("centralizes group eligibility for sibling resources and groups", () => {
    const doc = createAsyncDocsFixture();

    expect(canGroupSelection(doc, [
      { kind: "resource", id: "jobs" },
      { kind: "resource", id: "jobs_dlq" },
    ])).toBe(true);
    expect(canGroupSelection(doc, [
      { kind: "resource", id: "apiA" },
      { kind: "resource", id: "apiB" },
    ])).toBe(false);
    expect(canGroupSelection(doc, [
      { kind: "group", id: "appA" },
      { kind: "resource", id: "apiA" },
    ])).toBe(false);
    expect(canGroupSelection(doc, [
      { kind: "resource", id: "jobs" },
      { kind: "edge", id: "e1" },
    ])).toBe(false);
    expect(canGroupSelection(doc, [
      { kind: "resource", id: "missing" },
      { kind: "resource", id: "jobs" },
    ])).toBe(false);
  });

  it("ungroups while promoting direct children and preserving connections", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.appA = { x: 12, y: 18, w: 200, h: 160, pin: true, manual: true };
    getDefaultView(doc).routes.e2 = { pin: true, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const next = ungroup(doc, "appA");

    expect(next.groups.some((group) => group.id === "appA")).toBe(false);
    expect(next.groups.find((group) => group.id === "azA")?.children).toEqual(
      expect.arrayContaining(["pubA", "appA"].filter((id) => id !== "appA").concat(["apiA", "workerA"])),
    );
    expect(next.resources.find((resource) => resource.id === "apiA")?.parent).toBe("azA");
    expect(next.resources.find((resource) => resource.id === "workerA")?.parent).toBe("azA");
    expect(getDefaultView(next).places.appA).toBeUndefined();
    expect(getDefaultView(next).routes.e2).toEqual(getDefaultView(doc).routes.e2);
    expect(next.edges.find((edge) => edge.id === "e2")).toEqual(doc.edges.find((edge) => edge.id === "e2"));
  });

  it("safely removes selected groups while deleting selected ordinary items", () => {
    const doc = createAsyncDocsFixture();
    const selection = [
      { kind: "group", id: "main" } as const,
      { kind: "group", id: "azA" } as const,
      { kind: "resource", id: "client" } as const,
    ];
    const next = removeSelectionPreservingGroupContents(doc, [...selection].reverse());

    expect(next.groups.some((group) => group.id === "main" || group.id === "azA")).toBe(false);
    expect(next.resources.some((resource) => resource.id === "client")).toBe(false);
    expect(next.resources.some((resource) => resource.id === "apiA")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "workerA")).toBe(true);
    expect(removeSelectionPreservingGroupContents(doc, selection)).toEqual(next);
    expect(deleteSelection(doc, [{ kind: "group", id: "appA" }])).not.toEqual(doc);
    expect(deleteSelection(doc, [{ kind: "group", id: "appA" }]).resources.some((resource) => resource.id === "apiA")).toBe(false);
  });

  it("reorders z-index for send to front and back", () => {
    const doc = createAsyncDocsFixture();
    const front = sendToFront(doc, "client");
    const back = sendToBack(front, "api_alb");
    const view = getDefaultView(back);
    expect(view.places.client?.zIndex).toBeGreaterThan(view.places.api_alb?.zIndex ?? 0);
  });

  it("swaps edge source and target with ports", () => {
    const doc = createAsyncDocsFixture();
    const edge = doc.edges.find((candidate) => candidate.id === "e1");
    expect(edge).toBeTruthy();
    edge!.sourcePort = "e";
    edge!.targetPort = "w";
    edge!.sourcePortOffset = 0.25;
    edge!.targetPortOffset = 0.75;
    const next = swapEdgeDirection(doc, "e1");
    const swapped = next.edges.find((candidate) => candidate.id === "e1");
    expect(swapped?.source).toBe(edge!.target);
    expect(swapped?.target).toBe(edge!.source);
    expect(swapped?.sourcePort).toBe("w");
    expect(swapped?.targetPort).toBe("e");
    expect(swapped?.sourcePortOffset).toBe(0.75);
    expect(swapped?.targetPortOffset).toBe(0.25);
    expect(getDefaultView(next).routes.e1).toBeUndefined();
  });

  it("persists a reconnected endpoint on an explicit port anchor", () => {
    const doc = createAsyncDocsFixture();
    const next = reconnectEdge(doc, "e3", {
      target: "jobs",
      targetPort: "w",
      targetPortOffset: 0.26,
    });
    const edge = next.edges.find((candidate) => candidate.id === "e3");

    expect(edge).toMatchObject({
      target: "jobs",
      targetPort: "w",
      targetPortOffset: 0.25,
    });
    expect(getDefaultView(next).routes.e3).toBeUndefined();
  });

  it("persists numbered badge placement without pinning the route", () => {
    const doc = createAsyncDocsFixture();
    const next = setEdgeBadgePosition(doc, "e1", 0.75, "bottom");
    expect(getDefaultView(next).routes.e1).toMatchObject({
      badgeT: 0.75,
      badgeSide: "bottom",
    });
    expect(getDefaultView(next).routes.e1?.pin).toBeUndefined();
  });

  it("persists connector label placement without pinning the route", () => {
    const doc = createAsyncDocsFixture();
    const next = setEdgeLabelPosition(doc, "e1", 0.35, "bottom");
    expect(getDefaultView(next).routes.e1).toMatchObject({
      labelT: 0.35,
      labelSide: "bottom",
    });
    expect(getDefaultView(next).routes.e1?.pin).toBeUndefined();
  });

  it("persists moved connector turn points as a pinned route", () => {
    const doc = createAsyncDocsFixture();
    const points = [
      { x: 96, y: 144 },
      { x: 240, y: 144 },
      { x: 240, y: 288 },
      { x: 432, y: 288 },
    ];
    const moved = points.map((point, index) =>
      index === 1 ? { x: point.x + 32, y: point.y + 16 } : point,
    );
    const next = setRoute(doc, "e3", moved);
    const normalized = normalizeOrthogonalRoute(moved);
    expect(getDefaultView(next).routes.e3).toMatchObject({
      pin: true,
      mode: "manual",
      points: normalized,
      waypoints: normalized.slice(1, -1),
    });
  });

  it("toggles resource icon size via role and clears manual dimensions", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 10, y: 10, w: 96, h: 96, pin: true };
    const small = setResourceIconSize(doc, "client", "small");
    const resource = small.resources.find((candidate) => candidate.id === "client");
    expect(resource?.role).toBe("secondary");
    expect(getDefaultView(small).places.client?.w).toBeUndefined();
    const normal = setResourceIconSize(small, "client", "normal");
    expect(normal.resources.find((candidate) => candidate.id === "client")?.role).toBe(
      "primary",
    );
    expect(resourceIconSize(normal.resources.find((c) => c.id === "client")!)).toBe("normal");
  });

  it("rejects oversized and structurally invalid clipboard payloads", () => {
    const doc = createAsyncDocsFixture();
    expect(() => pasteClipboard(doc, "x".repeat(DIAGRAM_LIMITS.clipboardBytes + 1), { x: 0, y: 0 })).toThrow(/512 KiB/);
    expect(() => pasteClipboard(doc, JSON.stringify({
      type: "dumb-diagrams/clipboard",
      resources: [{ resource: { id: 42 } }],
    }), { x: 0, y: 0 })).toThrow(/invalid resource/);
  });

  it("rejects a paste when the merged document would exceed an object limit", () => {
    const doc = createAsyncDocsFixture();
    while (doc.resources.length < DIAGRAM_LIMITS.resources) {
      const id = `extra-${doc.resources.length}`;
      doc.resources.push({ id, type: "generic.user", label: { role: id }, role: "primary", props: {} });
    }
    const source = createAsyncDocsFixture();
    const payload = serializeClipboard(source, [{ kind: "resource", id: source.resources[0]!.id }]);
    expect(() => pasteClipboard(doc, payload, { x: 0, y: 0 })).toThrow(/500-resources/);
    expect(doc.resources).toHaveLength(DIAGRAM_LIMITS.resources);
  });
});
