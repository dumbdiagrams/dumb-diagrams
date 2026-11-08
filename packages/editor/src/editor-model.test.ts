import { describe, expect, it } from "vitest";

import { DIAGRAM_LIMITS, getDefaultView } from "@dumb-diagrams/runtime/core";
import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";
import { GROUP_STYLES } from "@dumb-diagrams/runtime/grammar-aws";

import { compileDiagramSource } from "./diagram-compiler.js";

import {
  addAnnotation,
  addText,
  alignSelection,
  annotationSize,
  annotationStyle,
  clearView,
  deleteSelection,
  isSelected,
  MAX_EDGE_STEP,
  moveSelection,
  needsAutoFix,
  nudgeSelection,
  primarySelection,
  reconnectEdge,
  renameResource,
  resourceIconSize,
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
  removeSelectionPreservingGroupContents,
  setRoute,
  setResourceIconSize,
  setTitle,
  swapEdgeDirection,
  updateEdge,
  updateEdgePreservingLayout,
} from "./editor-model.js";
import { addGroupResult, addResourceResult, canPlaceCatalogEntry } from "./model/catalog-placement.js";
import { importSvgAssetResult } from "./model/asset-import.js";
import { pasteClipboardResult, serializeClipboardResult } from "./model/clipboard.js";
import { canGroupSelection, groupSelection, reparentPreservingAbsolutePosition, ungroup } from "./model/grouping.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

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

    expect(updateEdge(doc, "e1", { step: MAX_EDGE_STEP }).edges.find((edge) => edge.id === "e1")?.step).toBe(
      MAX_EDGE_STEP,
    );
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
    const placedServiceResult = addResourceResult(doc, service, "use1", { x: 2_000, y: 48 });
    expect(placedServiceResult.isOk()).toBe(true);
    if (placedServiceResult.isErr()) return;
    const placedService = placedServiceResult.value;
    expect(placedService.doc.resources.find((resource) => resource.id === placedService.id)).toMatchObject({
      type: service.type,
      parent: "use1",
    });

    expect(boundary.allowRoot).toBe(false);
    expect(canPlaceCatalogEntry(doc, boundary)).toEqual({ ok: true });
    const placedBoundaryResult = addGroupResult(
      doc,
      "vpc",
      boundary.name,
      undefined,
      { x: 2_000, y: 48 },
      boundary.type,
    );
    expect(placedBoundaryResult.isOk()).toBe(true);
    if (placedBoundaryResult.isErr()) return;
    const placedBoundary = placedBoundaryResult.value;
    expect(placedBoundary.doc.groups.find((group) => group.id === placedBoundary.id)).toMatchObject({
      type: boundary.type,
      parent: undefined,
    });
  });

  it("returns catalog placement failures without mutating the document", () => {
    const doc = createAsyncDocsFixture();
    const service = getCatalogEntry("aws.elastic-container-service")!;
    const group = getCatalogEntry("aws.vpc")!;

    const missingResourceParent = addResourceResult(doc, service, "missing", { x: 40, y: 80 });
    expect(missingResourceParent.isErr()).toBe(true);
    if (missingResourceParent.isOk()) return;
    expect(missingResourceParent.error).toEqual({
      code: "parent-not-found",
      message: "The selected parent group no longer exists.",
    });

    const missingGroupParent = addGroupResult(doc, "vpc", group.name, "missing", { x: 40, y: 80 }, group.type);
    expect(missingGroupParent.isErr()).toBe(true);
    if (missingGroupParent.isOk()) return;
    expect(missingGroupParent.error.code).toBe("parent-not-found");

    const resourceAsGroup = addGroupResult(doc, "logical", service.name, undefined, { x: 40, y: 80 }, service.type);
    expect(resourceAsGroup.isErr()).toBe(true);
    if (resourceAsGroup.isOk()) return;
    expect(resourceAsGroup.error).toEqual({
      code: "not-a-group",
      message: `${service.name} is not a group.`,
    });
    expect(doc.groups.some((candidate) => candidate.type === service.type)).toBe(false);
  });

  it("renames resources without changing ids", () => {
    const doc = createAsyncDocsFixture();
    const next = renameResource(doc, "client", "Browser");
    expect(next.resources.find((resource) => resource.id === "client")?.label.role).toBe("Browser");
  });

  it("renames custom-icon resources through their service label and removes the fallback role", () => {
    const doc = createAsyncDocsFixture();
    const resource = doc.resources.find((candidate) => candidate.id === "client")!;
    resource.props.iconAsset = "icon-1";
    resource.label = { service: "Pasted image", role: "Pasted image" };

    const next = renameResource(doc, "client", "Company logo");

    expect(next.resources.find((candidate) => candidate.id === "client")?.label).toMatchObject({
      service: "Company logo",
      role: undefined,
    });
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
    const next = nudgeSelection(doc, [{ kind: "resource", id: "client" }], 1, 1, { snapToGrid: true });
    expect(getDefaultView(next).places.client).toMatchObject({ x: 48, y: 48, pin: true });
  });

  it("auto-fix clears manual placement and routes without changing hierarchy", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.main = { x: 12, y: 18, pin: true };
    view.places.api_alb = { x: 24, y: 30, pin: true };
    view.routes.e1 = {
      pin: true,
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    };

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
    const next = moveSelection(doc, [{ kind: "group", id: "appA" }], 8, 16, layoutDocument(doc));
    expect(getDefaultView(next).places.appA).toMatchObject({ x: 208, y: 216 });
    expect(getDefaultView(next).places.apiA).toMatchObject({ x: 248, y: 256 });
    expect(getDefaultView(next).places.workerA).toMatchObject({ x: 288, y: 256 });
  });

  it("keeps a dragged resource at its pinned drop position", () => {
    const doc = createAsyncDocsFixture();
    const before = layoutDocument(doc);
    const next = moveSelection(doc, [{ kind: "resource", id: "apiA" }], 112, 64, before);
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
    const next = moveSelection(doc, [{ kind: "resource", id: "apiA" }], 48, 24, before);

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
    const serialized = serializeClipboardResult(doc, [{ kind: "group", id: "appA" }]);
    expect(serialized.isOk()).toBe(true);
    if (serialized.isErr()) return;
    const pasted = pasteClipboardResult(doc, serialized.value, { x: 600, y: 600 });
    expect(pasted.isOk()).toBe(true);
    if (pasted.isErr()) return;
    const result = pasted.value;
    const pastedGroupId = result.selection.find((item) => item.kind === "group")?.id;
    const pastedGroup = result.doc.groups.find((group) => group.id === pastedGroupId);
    expect(pastedGroup).toBeTruthy();
    expect(new Set(pastedGroup?.children).size).toBe(pastedGroup?.children.length);
    expect(pastedGroup?.children).toHaveLength(2);
  });

  it("keeps a copied nested resource inside copied ancestor groups", () => {
    const doc = createAsyncDocsFixture();
    const serialized = serializeClipboardResult(doc, [{ kind: "resource", id: "artifacts" }]);
    expect(serialized.isOk()).toBe(true);
    if (serialized.isErr()) return;
    const pasted = pasteClipboardResult(doc, serialized.value, { x: 600, y: 600 });
    expect(pasted.isOk()).toBe(true);
    if (pasted.isErr()) return;
    const result = pasted.value;
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
    const first = importSvgAssetResult(doc, svg);
    expect(first.isOk()).toBe(true);
    if (first.isErr()) return;
    const second = importSvgAssetResult(first.value.doc, svg);
    expect(second.isOk()).toBe(true);
    if (second.isErr()) return;
    expect(first.value.assetId).toBe(second.value.assetId);
    expect(first.value.doc.assets).toHaveLength(1);
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
          resourceType: "cloud-agnostic.actor",
          serviceLabel: "Client",
        },
        {
          id: "api_alb",
          type: "resource" as const,
          icon: { x: 80, y: 40, w: 64, h: 64 },
          label: { x: 80, y: 104, w: 64, h: 24 },
          obstacle: { x: 80, y: 40, w: 64, h: 88 },
          role: "primary" as const,
          resourceType: "aws.elastic-load-balancing",
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
    getDefaultView(doc).routes.e2 = {
      pin: true,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    };
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
    const result = groupSelection(
      doc,
      [
        { kind: "resource", id: "jobs_dlq" },
        { kind: "resource", id: "jobs" },
      ],
      before,
      "Processing",
    );

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
      y:
        Math.min(beforeGeometry.get("jobs")!.y, beforeGeometry.get("jobs_dlq")!.y) - style.headerHeight - style.padding,
    };
    expect(getDefaultView(next).places[result!.id]).toMatchObject(expected);
  });

  it("uses a selected enclosing group as the parent instead of creating another wrapper", () => {
    const doc = createAsyncDocsFixture();
    doc.groups.unshift({
      id: "cloud",
      kind: "cloud",
      type: "aws.cloud",
      label: "AWS Cloud",
      children: [],
    });
    const layout = layoutDocument(doc);
    const cloud = layout.groups.find((group) => group.id === "cloud")!;
    const region = layout.groups.find((group) => group.id === "use1")!.bounds;
    const client = layout.nodes.find((node) => node.id === "client")!.obstacle;
    const beforeGeometry = new Map([
      ["use1", structuredClone(region)],
      ["client", structuredClone(client)],
    ]);
    const minX = Math.min(region.x, client.x);
    const minY = Math.min(region.y, client.y);
    const maxX = Math.max(region.x + region.w, client.x + client.w);
    const maxY = Math.max(region.y + region.h, client.y + client.h);
    cloud.bounds = {
      x: minX - 64,
      y: minY - 64,
      w: maxX - minX + 128,
      h: maxY - minY + 128,
    };

    const beforeGroupCount = doc.groups.length;
    const result = groupSelection(
      doc,
      [
        { kind: "group", id: "cloud" },
        { kind: "group", id: "use1" },
        { kind: "resource", id: "client" },
      ],
      layout,
    );

    expect(result?.id).toBe("cloud");
    expect(result?.doc.groups).toHaveLength(beforeGroupCount);
    expect(result?.doc.groups.find((group) => group.id === "cloud")?.children.sort()).toEqual(["client", "use1"]);
    expect(result?.doc.groups.find((group) => group.id === "use1")?.parent).toBe("cloud");
    expect(result?.doc.resources.find((resource) => resource.id === "client")?.parent).toBe("cloud");
    expect(result?.doc.groups.some((group) => group.label === "Group")).toBe(false);
    expect(getDefaultView(result!.doc).places.cloud).toMatchObject({
      ...cloud.bounds,
      pin: true,
      manual: true,
    });
    const after = layoutDocument(result!.doc);
    const afterRegion = after.groups.find((group) => group.id === "use1")!.bounds;
    const afterClient = after.nodes.find((node) => node.id === "client")!.obstacle;
    for (const key of ["x", "y", "w", "h"] as const) {
      expect(Math.abs(afterRegion[key] - beforeGeometry.get("use1")![key])).toBeLessThanOrEqual(4);
      expect(Math.abs(afterClient[key] - beforeGeometry.get("client")![key])).toBeLessThanOrEqual(4);
    }
  });

  it("groups nested siblings and rejects invalid or ancestor selections", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);

    const nested = groupSelection(
      doc,
      [
        { kind: "group", id: "queues" },
        { kind: "group", id: "storage" },
      ],
      layout,
    );
    expect(nested).toBeTruthy();
    expect(nested!.doc.groups.find((group) => group.id === nested!.id)?.children).toEqual(["queues", "storage"]);
    expect(nested!.doc.groups.find((group) => group.id === "use1")?.children).toEqual(["main", nested!.id]);
    expect(
      groupSelection(
        doc,
        [
          { kind: "edge", id: "e1" },
          { kind: "resource", id: "apiA" },
        ],
        layout,
      ),
    ).toBeNull();
    expect(
      groupSelection(
        doc,
        [
          { kind: "resource", id: "apiA" },
          { kind: "resource", id: "missing" },
        ],
        layout,
      ),
    ).toBeNull();
    expect(
      groupSelection(
        doc,
        [
          { kind: "resource", id: "apiA" },
          { kind: "resource", id: "apiB" },
        ],
        layout,
      ),
    ).toBeNull();
    expect(
      groupSelection(
        doc,
        [
          { kind: "group", id: "azA" },
          { kind: "group", id: "appA" },
        ],
        layout,
      ),
    ).toBeNull();
    expect(groupSelection(doc, [{ kind: "resource", id: "apiA" }], layout)).toBeNull();
  });

  it("centralizes group eligibility for sibling resources and groups", () => {
    const doc = createAsyncDocsFixture();

    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "jobs" },
        { kind: "resource", id: "jobs_dlq" },
      ]),
    ).toBe(true);
    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "apiA" },
        { kind: "resource", id: "apiB" },
      ]),
    ).toBe(false);
    expect(
      canGroupSelection(doc, [
        { kind: "group", id: "appA" },
        { kind: "resource", id: "apiA" },
      ]),
    ).toBe(false);
    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "jobs" },
        { kind: "edge", id: "e1" },
      ]),
    ).toBe(false);
    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "jobs" },
        { kind: "resource", id: "jobs_dlq" },
        { kind: "edge", id: "e6" },
      ]),
    ).toBe(true);
    expect(
      canGroupSelection(doc, [
        { kind: "group", id: "queues" },
        { kind: "group", id: "storage" },
        { kind: "edge", id: "e1" },
      ]),
    ).toBe(true);
    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "missing" },
        { kind: "resource", id: "jobs" },
      ]),
    ).toBe(false);
  });

  it("ungroups while promoting direct children and preserving connections", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.appA = { x: 12, y: 18, w: 200, h: 160, pin: true, manual: true };
    getDefaultView(doc).routes.e2 = {
      pin: true,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    };
    const { doc: next, selection } = ungroup(doc, "appA");

    expect(selection).toEqual([
      { kind: "resource", id: "apiA" },
      { kind: "resource", id: "workerA" },
    ]);
    expect(next.groups.some((group) => group.id === "appA")).toBe(true);
    expect(next.groups.find((group) => group.id === "appA")?.children).toEqual([]);
    expect(next.groups.find((group) => group.id === "azA")?.children).toEqual(
      expect.arrayContaining(["pubA", "appA", "apiA", "workerA"]),
    );
    expect(next.resources.find((resource) => resource.id === "apiA")?.parent).toBe("azA");
    expect(next.resources.find((resource) => resource.id === "workerA")?.parent).toBe("azA");
    expect(getDefaultView(next).places.appA).toMatchObject(getDefaultView(doc).places.appA!);
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
    expect(
      deleteSelection(doc, [{ kind: "group", id: "appA" }]).resources.some((resource) => resource.id === "apiA"),
    ).toBe(false);
  });

  it("groups mixed selections by projecting eligible sibling roots", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const mixed = [
      { kind: "group" as const, id: "queues" },
      { kind: "group" as const, id: "storage" },
      { kind: "resource" as const, id: "jobs" },
      { kind: "edge" as const, id: "e1" },
    ];

    expect(canGroupSelection(doc, mixed)).toBe(true);
    const grouped = groupSelection(doc, mixed, layout);
    expect(grouped).toBeTruthy();
    const wrapper = grouped!.doc.groups.find((group) => group.id === grouped!.id);
    expect(wrapper?.children).toEqual(expect.arrayContaining(["queues", "storage"]));
    expect(wrapper?.children).toHaveLength(2);
    expect(grouped!.doc.edges).toHaveLength(doc.edges.length);
  });

  it("rejects projected grouping candidates with fewer than two roots or different parents", () => {
    const doc = createAsyncDocsFixture();
    expect(
      canGroupSelection(doc, [
        { kind: "group", id: "queues" },
        { kind: "resource", id: "jobs" },
        { kind: "edge", id: "e6" },
      ]),
    ).toBe(false);
    expect(
      canGroupSelection(doc, [
        { kind: "resource", id: "client" },
        { kind: "group", id: "queues" },
      ]),
    ).toBe(false);
  });

  it("ungroups a parsed curated aws cloud while preserving descendants, edges, and geometry", () => {
    const doc = parseDgm(`diagram simple-serverless-web-application {
  grammar aws
  flow lr
  title "Simple serverless web application"

  cloud-agnostic.client web_client "Web client"

  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary frontend "Frontend services" {
      aws.cloudfront cdn "Web delivery"
      aws.simple-storage-service static_assets "Static web assets"
    }

    aws.api-gateway gateway
    aws.aws-lambda handler "Request handler"
    aws.dynamodb app_data "Application data"
  }

  web_client -> cdn { id client_to_cdn step 1 }
  cdn -> static_assets { id cdn_to_assets label "static content" }
  cdn -> gateway { id cdn_to_api step 2 }
  gateway -> handler { id api_to_handler step 3 }
  handler -> app_data { id handler_to_data step 4 }
}
`);
    const beforeLayout = layoutDocument(doc);
    const beforePositions = new Map(beforeLayout.nodes.map((node) => [node.id, node.obstacle]));
    for (const group of beforeLayout.groups) beforePositions.set(group.id, group.bounds);
    const edgeCount = doc.edges.length;

    const { doc: next, selection } = ungroup(doc, "aws_cloud", beforeLayout);

    const cloudGroup = next.groups.find((group) => group.id === "aws_cloud");
    expect(cloudGroup).toBeTruthy();
    expect(cloudGroup?.children).toEqual([]);
    expect(next.groups.some((group) => group.id === "frontend")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "gateway")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "handler")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "app_data")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "web_client")).toBe(true);
    expect(next.edges).toHaveLength(edgeCount);
    expect(selection.map((item) => item.id).sort()).toEqual(["app_data", "frontend", "gateway", "handler"].sort());

    const afterLayout = layoutDocument(next);
    const view = getDefaultView(next);
    for (const id of ["frontend", "gateway", "handler", "app_data", "cdn", "static_assets"]) {
      const before = beforePositions.get(id);
      expect(before, id).toBeTruthy();
      const place = view.places[id];
      expect(place?.pin).toBe(true);
      expect(Math.abs((place?.x ?? 0) - before!.x)).toBeLessThan(4);
      expect(Math.abs((place?.y ?? 0) - before!.y)).toBeLessThan(4);
    }
    expect(afterLayout.nodes.some((node) => node.id === "gateway")).toBe(true);
  });

  it("round-trips aws cloud ungroup through print and studio compile with visible nodes", () => {
    const doc = parseDgm(`diagram simple-serverless-web-application {
  grammar aws
  flow lr
  cloud-agnostic.client web_client "Web client"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary frontend "Frontend services" {
      aws.cloudfront cdn "Web delivery"
      aws.simple-storage-service static_assets "Static web assets"
    }
    aws.api-gateway gateway
    aws.aws-lambda handler "Request handler"
    aws.dynamodb app_data "Application data"
  }
  web_client -> cdn { id client_to_cdn step 1 }
  cdn -> static_assets { id cdn_to_assets label "static content" }
  cdn -> gateway { id cdn_to_api step 2 }
  gateway -> handler { id api_to_handler step 3 }
  handler -> app_data { id handler_to_data step 4 }
}
`);
    const beforeLayout = layoutDocument(doc);
    const { doc: next } = ungroup(doc, "aws_cloud", beforeLayout);
    expect(next.resources.find((resource) => resource.id === "gateway")?.parent).toBeUndefined();
    expect(next.groups.find((group) => group.id === "frontend")?.parent).toBeUndefined();
    expect("parent" in (next.resources.find((resource) => resource.id === "gateway") ?? {})).toBe(false);
    expect("parent" in (next.groups.find((group) => group.id === "frontend") ?? {})).toBe(false);
    const view = getDefaultView(next);
    expect(Object.keys(view.places).sort()).toEqual(
      ["app_data", "aws_cloud", "cdn", "frontend", "gateway", "handler", "static_assets"].sort(),
    );
    const source = printDgm(next);
    expect(source).toContain("aws.cloud aws_cloud");
    expect(source).toContain("aws.api-gateway gateway");
    expect(source).toContain("place gateway {");

    const compiled = compileDiagramSource(source, true);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    for (const id of ["frontend", "gateway", "handler", "app_data", "cdn", "static_assets", "web_client"]) {
      expect(
        compiled.layout.nodes.some((node) => node.id === id) || compiled.layout.groups.some((group) => group.id === id),
        id,
      ).toBe(true);
    }
    expect(compiled.svg).toContain('id="res-gateway"');
    expect(compiled.svg).toContain('id="group-frontend"');
  });

  it("ungroups image thumbnail pipeline aws cloud with all nested content visible", () => {
    const initialSource = `diagram image-thumbnail-pipeline {
  grammar aws
  flow lr
  title "Image thumbnail pipeline"
  cloud-agnostic.client image_uploader "Image uploader"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary upload_experience "Upload experience" {
      aws.cloudfront cdn "Web delivery"
      aws.simple-storage-service upload_ui "Upload UI"
    }
    cloud-agnostic.boundary upload_storage "Upload storage" {
      aws.simple-storage-service original_images "Original images"
    }
    cloud-agnostic.boundary processing "Processing" {
      aws.aws-lambda thumbnail_processor "Thumbnail processor"
    }
    cloud-agnostic.boundary processed_assets "Processed assets" {
      aws.simple-storage-service thumbnail_images "Thumbnail images"
      aws.dynamodb image_metadata "Image metadata"
    }
  }
  image_uploader -> cdn { id uploader_to_cdn step 1 }
  cdn -> upload_ui { id cdn_to_upload_ui label "static content" }
  image_uploader -> original_images { id uploader_to_originals label "direct multipart upload" }
  original_images -> thumbnail_processor { id originals_to_processor step 2 style dashed label "object-created event" }
  thumbnail_processor -> thumbnail_images { id processor_to_thumbnails step 3 }
  thumbnail_processor -> image_metadata { id processor_to_metadata step 4 }
}
`;
    const doc = parseDgm(initialSource);
    const compiledBefore = compileDiagramSource(initialSource, true);
    expect(compiledBefore.ok).toBe(true);
    if (!compiledBefore.ok) return;
    const { doc: next, selection } = ungroup(doc, "aws_cloud", compiledBefore.layout);
    expect(next.groups.find((group) => group.id === "aws_cloud")?.children).toEqual([]);
    expect(selection.map((item) => item.id).sort()).toEqual(
      ["processed_assets", "processing", "upload_experience", "upload_storage"].sort(),
    );
    for (const id of ["upload_experience", "upload_storage", "processing", "processed_assets"]) {
      expect(next.groups.find((group) => group.id === id)?.parent).toBeUndefined();
    }
    const source = printDgm(next);
    expect(source).toContain("aws.cloud aws_cloud");
    expect(source).toContain('boundary upload_experience "Upload experience"');
    expect(source).toContain("aws.aws-lambda thumbnail_processor");
    const reparsed = parseDgm(source);
    expect(reparsed.groups.some((group) => group.id === "upload_experience")).toBe(true);
    expect(reparsed.resources.some((resource) => resource.id === "thumbnail_processor")).toBe(true);
    const compiled = compileDiagramSource(source, true);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    for (const id of [
      "image_uploader",
      "cdn",
      "upload_ui",
      "original_images",
      "thumbnail_processor",
      "thumbnail_images",
      "image_metadata",
      "upload_experience",
      "upload_storage",
      "processing",
      "processed_assets",
    ]) {
      expect(
        compiled.layout.nodes.some((node) => node.id === id) || compiled.layout.groups.some((group) => group.id === id),
        id,
      ).toBe(true);
    }
    expect(compiled.svg).toContain('id="res-cdn"');
    expect(compiled.svg).toContain('id="group-upload_experience"');
  });

  it("ungroups a provider cloud in one pass without requiring a second action", () => {
    const initialSource = `diagram image-thumbnail-pipeline {
  grammar aws
  flow lr
  cloud-agnostic.client image_uploader "Image uploader"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary upload_experience "Upload experience" {
      aws.cloudfront cdn "Web delivery"
      aws.simple-storage-service upload_ui "Upload UI"
    }
    cloud-agnostic.boundary upload_storage "Upload storage" {
      aws.simple-storage-service original_images "Original images"
    }
    cloud-agnostic.boundary processing "Processing" {
      aws.aws-lambda thumbnail_processor "Thumbnail processor"
    }
    cloud-agnostic.boundary processed_assets "Processed assets" {
      aws.simple-storage-service thumbnail_images "Thumbnail images"
      aws.dynamodb image_metadata "Image metadata"
    }
  }
  image_uploader -> cdn { id uploader_to_cdn step 1 }
  cdn -> upload_ui { id cdn_to_upload_ui label "static content" }
  image_uploader -> original_images { id uploader_to_originals label "direct multipart upload" }
  original_images -> thumbnail_processor { id originals_to_processor step 2 style dashed label "object-created event" }
  thumbnail_processor -> thumbnail_images { id processor_to_thumbnails step 3 }
  thumbnail_processor -> image_metadata { id processor_to_metadata step 4 }
}
`;
    const before = compileDiagramSource(initialSource, true);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const once = ungroup(before.doc, "aws_cloud", before.layout);
    const afterOnce = compileDiagramSource(printDgm(once.doc), true);
    expect(afterOnce.ok).toBe(true);
    if (!afterOnce.ok) return;

    expect(once.doc.groups.find((group) => group.id === "aws_cloud")?.children).toEqual([]);
    expect(once.doc.groups.find((group) => group.id === "upload_experience")?.parent).toBeUndefined();
    expect(afterOnce.doc.groups.find((group) => group.id === "upload_experience")?.parent).toBeUndefined();
    expect(printDgm(once.doc)).toContain('cloud-agnostic.boundary upload_experience "Upload experience"');
    expect(printDgm(once.doc)).toContain('  aws.cloud aws_cloud "AWS Cloud"\n');

    const twice = ungroup(afterOnce.doc, "aws_cloud", afterOnce.layout);
    expect(twice.doc.groups.find((group) => group.id === "aws_cloud")?.children).toEqual([]);
    expect(twice.doc.groups.find((group) => group.id === "upload_experience")?.parent).toBeUndefined();
  });

  it("removeSelectionPreservingGroupContents deletes a retained empty boundary shell", () => {
    const doc = parseDgm(`diagram simple-serverless-web-application {
  grammar aws
  flow lr
  cloud-agnostic.client web_client "Web client"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary frontend "Frontend services" {
      aws.cloudfront cdn "Web delivery"
    }
    aws.api-gateway gateway
  }
  web_client -> cdn { id client_to_cdn step 1 }
  cdn -> gateway { id cdn_to_api step 2 }
}
`);
    const { doc: ungrouped } = ungroup(doc, "aws_cloud", layoutDocument(doc));
    expect(ungrouped.groups.find((group) => group.id === "aws_cloud")?.children).toEqual([]);

    const next = removeSelectionPreservingGroupContents(ungrouped, [{ kind: "group", id: "aws_cloud" }]);
    expect(next.groups.some((group) => group.id === "aws_cloud")).toBe(false);
    expect(next.groups.some((group) => group.id === "frontend")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "gateway")).toBe(true);
  });

  it("clearView after ungroup preserves detached empty boundary geometry", () => {
    const doc = parseDgm(`diagram simple-serverless-web-application {
  grammar aws
  flow lr
  cloud-agnostic.client web_client "Web client"
  aws.cloud aws_cloud "AWS Cloud" {
    aws.api-gateway gateway
  }
  web_client -> gateway { id client_to_api step 1 }
}
`);
    const layout = layoutDocument(doc);
    const { doc: ungrouped } = ungroup(doc, "aws_cloud", layout);
    const cloudPlace = getDefaultView(ungrouped).places.aws_cloud;
    expect(cloudPlace?.x).toBeDefined();

    const fixed = clearView(ungrouped);
    expect(getDefaultView(fixed).places.aws_cloud).toMatchObject({
      x: cloudPlace!.x,
      y: cloudPlace!.y,
      w: cloudPlace!.w,
      h: cloudPlace!.h,
    });

    const afterLayout = layoutDocument(fixed);
    const cloudBounds = afterLayout.groups.find((group) => group.id === "aws_cloud")!.bounds;
    expect(Math.abs(cloudBounds.x - cloudPlace!.x!)).toBeLessThan(4);
    expect(Math.abs(cloudBounds.y - cloudPlace!.y!)).toBeLessThan(4);
  });

  it("clearView after grouping mixed siblings preserves left-to-right architecture order", () => {
    const doc = createAsyncDocsFixture();
    doc.groups.unshift({
      id: "cloud",
      kind: "cloud",
      type: "aws.cloud",
      label: "AWS Cloud",
      children: [],
    });
    const layout = layoutDocument(doc);
    const cloud = layout.groups.find((group) => group.id === "cloud")!;
    const region = layout.groups.find((group) => group.id === "use1")!.bounds;
    const client = layout.nodes.find((node) => node.id === "client")!.obstacle;
    cloud.bounds = {
      x: Math.min(region.x, client.x) - 64,
      y: Math.min(region.y, client.y) - 64,
      w: Math.max(region.x + region.w, client.x + client.w) - Math.min(region.x, client.x) + 128,
      h: Math.max(region.y + region.h, client.y + client.h) - Math.min(region.y, client.y) + 128,
    };

    const grouped = groupSelection(
      doc,
      [
        { kind: "group", id: "cloud" },
        { kind: "group", id: "use1" },
        { kind: "resource", id: "client" },
      ],
      layout,
    );
    expect(grouped?.doc.groups.find((group) => group.id === "cloud")?.children).toEqual(["client", "use1"]);

    const fixed = clearView(grouped!.doc);
    const after = layoutDocument(fixed);
    const clientNode = after.nodes.find((node) => node.id === "client")!;
    const regionGroup = after.groups.find((group) => group.id === "use1")!;
    expect(clientNode.obstacle.x).toBeLessThan(regionGroup.bounds.x);
  });

  it("clearView after ungroup keeps promoted architecture in causal flow order", () => {
    const doc = parseDgm(`diagram simple-serverless-web-application {
  grammar aws
  flow lr
  cloud-agnostic.client web_client "Web client"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary frontend "Frontend services" {
      aws.cloudfront cdn "Web delivery"
    }
    aws.api-gateway gateway
    aws.aws-lambda handler "Request handler"
    aws.dynamodb app_data "Application data"
  }
  web_client -> cdn { id client_to_cdn step 1 }
  cdn -> gateway { id cdn_to_api step 2 }
  gateway -> handler { id api_to_handler step 3 }
  handler -> app_data { id handler_to_data step 4 }
}
`);
    const { doc: ungrouped } = ungroup(doc, "aws_cloud", layoutDocument(doc));
    const fixed = clearView(ungrouped);
    const layout = layoutDocument(fixed);
    const positions = new Map<string, number>();
    for (const node of layout.nodes) positions.set(node.id, node.obstacle.x);
    for (const group of layout.groups) {
      if (group.id !== "aws_cloud") positions.set(group.id, group.bounds.x);
    }
    expect(positions.get("web_client")!).toBeLessThan(positions.get("gateway")!);
    expect(positions.get("gateway")!).toBeLessThan(positions.get("handler")!);
    expect(positions.get("handler")!).toBeLessThan(positions.get("app_data")!);
  });

  it("infers parent-pointer-only direct children when ungrouping", () => {
    const doc = createAsyncDocsFixture();
    const group = doc.groups.find((candidate) => candidate.id === "queues");
    expect(group).toBeTruthy();
    group!.children = [];
    group!.borderChildren = [];
    const layout = layoutDocument(doc);
    const { doc: next, selection } = ungroup(doc, "queues", layout);

    expect(next.groups.some((candidate) => candidate.id === "queues")).toBe(true);
    expect(next.groups.find((candidate) => candidate.id === "queues")?.children).toEqual([]);
    expect(next.resources.some((resource) => resource.id === "jobs")).toBe(true);
    expect(next.resources.some((resource) => resource.id === "jobs_dlq")).toBe(true);
    expect(selection.map((item) => item.id).sort()).toEqual(["jobs", "jobs_dlq"]);
  });

  it("round-trips group and ungroup without losing document members", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const grouped = groupSelection(
      doc,
      [
        { kind: "resource", id: "jobs" },
        { kind: "resource", id: "jobs_dlq" },
      ],
      layout,
    );
    expect(grouped).toBeTruthy();

    const regroupedLayout = layoutDocument(grouped!.doc);
    const ungrouped = ungroup(grouped!.doc, grouped!.id, regroupedLayout);
    expect(ungrouped.doc.resources.some((resource) => resource.id === "jobs")).toBe(true);
    expect(ungrouped.doc.resources.some((resource) => resource.id === "jobs_dlq")).toBe(true);
    expect(ungrouped.doc.edges).toHaveLength(doc.edges.length);
    expect(ungrouped.selection).toEqual([
      { kind: "resource", id: "jobs" },
      { kind: "resource", id: "jobs_dlq" },
    ]);
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
    const moved = points.map((point, index) => (index === 1 ? { x: point.x + 32, y: point.y + 16 } : point));
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
    expect(normal.resources.find((candidate) => candidate.id === "client")?.role).toBe("primary");
    expect(resourceIconSize(normal.resources.find((c) => c.id === "client")!)).toBe("normal");
  });

  it("rejects oversized and structurally invalid clipboard payloads", () => {
    const doc = createAsyncDocsFixture();
    const oversized = pasteClipboardResult(doc, "x".repeat(DIAGRAM_LIMITS.clipboardBytes + 1), { x: 0, y: 0 });
    expect(oversized.isErr() && oversized.error.code).toBe("clipboard-too-large");
    const malformed = pasteClipboardResult(
      doc,
      JSON.stringify({
        type: "dumb-diagrams/clipboard",
        resources: [{ resource: { id: 42 } }],
      }),
      { x: 0, y: 0 },
    );
    expect(malformed.isErr() && malformed.error.code).toBe("clipboard-invalid-resource");
  });

  it("rejects a paste when the merged document would exceed an object limit", () => {
    const doc = createAsyncDocsFixture();
    while (doc.resources.length < DIAGRAM_LIMITS.resources) {
      const id = `extra-${doc.resources.length}`;
      doc.resources.push({ id, type: "cloud-agnostic.actor", label: { role: id }, role: "primary", props: {} });
    }
    const source = createAsyncDocsFixture();
    const serialized = serializeClipboardResult(source, [{ kind: "resource", id: source.resources[0]!.id }]);
    expect(serialized.isOk()).toBe(true);
    if (serialized.isErr()) return;
    const pasted = pasteClipboardResult(doc, serialized.value, { x: 0, y: 0 });
    expect(pasted.isErr() && pasted.error.code).toBe("clipboard-document-invalid");
    expect(doc.resources).toHaveLength(DIAGRAM_LIMITS.resources);
  });
});
