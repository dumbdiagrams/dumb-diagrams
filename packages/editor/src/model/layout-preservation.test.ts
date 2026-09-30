import { describe, expect, it } from "vitest";
import { createEmptyDocument, getDefaultView, type DiagramDocument, type LayoutResult } from "@dumb-diagrams/runtime/core";

import { compileDocument } from "../diagram-compiler";
import {
  preserveManualLayout,
  preserveUnplacedManualLayout,
  reconcileManualRouteMoves,
} from "./layout-preservation";

function fixture(): { doc: DiagramDocument; layout: LayoutResult } {
  const doc = createEmptyDocument("preservation");
  doc.resources = [
    { id: "source", type: "cloud-agnostic.server", label: {}, role: "primary", props: {} },
    { id: "target", type: "cloud-agnostic.server", label: {}, role: "primary", props: {} },
    { id: "other", type: "cloud-agnostic.server", label: {}, role: "primary", props: {} },
  ];
  doc.edges = [
    { id: "main", source: "source", target: "target", style: "solid" },
    { id: "other_edge", source: "target", target: "other", style: "solid" },
    { id: "new_edge", source: "source", target: "other", style: "solid" },
  ];
  const view = getDefaultView(doc);
  view.places.source = { x: 40, y: 40, pin: true };
  view.places.target = { x: 240, y: 40, pin: true };
  view.places.other = { x: 340, y: 40, pin: true };
  view.routes.main = {
    waypoints: [{ x: 140, y: 80 }],
    badgeT: 0.25,
    labelSide: "bottom",
  };
  view.routes.other_edge = {
    pin: true,
    mode: "manual",
    points: [{ x: 240, y: 40 }, { x: 340, y: 40 }],
    badgeT: 0.75,
    badgeSide: "top",
  };
  view.routes.deleted = { pin: true, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };

  const layout = {
    width: 500,
    height: 300,
    symmetries: [],
    nodes: [],
    groups: [],
    edges: [
      {
        id: "main",
        source: "source",
        target: "target",
        points: [{ x: 80, y: 64 }, { x: 140, y: 64 }, { x: 140, y: 160 }, { x: 240, y: 160 }],
        badgeT: 0.6,
        badgeSide: "top" as const,
        labelT: 0.4,
        labelSide: "top" as const,
        style: "solid" as const,
      },
      {
        id: "other_edge",
        source: "target",
        target: "other",
        points: [{ x: 240, y: 40 }, { x: 340, y: 40 }],
        style: "solid" as const,
      },
      {
        id: "new_edge",
        source: "source",
        target: "other",
        points: [{ x: 80, y: 64 }, { x: 340, y: 40 }],
        style: "solid" as const,
      },
    ],
  } satisfies LayoutResult;
  return { doc, layout };
}

function compilableDocument(grouped = false): DiagramDocument {
  const doc = createEmptyDocument("compiled-preservation");
  doc.flow = "lr";
  doc.resources = [
    { id: "source", type: "cloud-agnostic.actor", label: { service: "Source" }, role: "primary", props: {}, ...(grouped ? { parent: "services" } : {}) },
    { id: "target", type: "cloud-agnostic.server", label: { service: "Target" }, role: "primary", props: {}, ...(grouped ? { parent: "services" } : {}) },
    { id: "other", type: "cloud-agnostic.database", label: { service: "Other" }, role: "primary", props: {} },
  ];
  if (grouped) {
    doc.groups = [{ id: "services", kind: "logical", label: "Services", children: ["source", "target"] }];
    getDefaultView(doc).places.source = { x: 80, y: 80, pin: true };
    getDefaultView(doc).places.target = { x: 320, y: 280, pin: true };
  }
  doc.edges = [
    { id: "main", source: "source", target: "target", style: "solid", kind: "flow" },
    { id: "other_edge", source: "target", target: "other", style: "solid", kind: "flow" },
  ];
  return doc;
}

function edgeLayout(compilation: ReturnType<typeof compileDocument>, id: string) {
  expect(compilation.ok).toBe(true);
  if (!compilation.ok) throw new Error(compilation.issues.map((issue) => issue.message).join("; "));
  return compilation.layout.edges.find((edge) => edge.id === id)!;
}

describe("manual layout preservation", () => {
  it("snapshots rendered paths without mutating the source or authored pinned routes", () => {
    const { doc, layout } = fixture();
    const before = structuredClone(doc);

    const next = preserveManualLayout(doc, layout);
    const view = getDefaultView(next);

    expect(doc).toEqual(before);
    expect(view.routes.main).toEqual({
      waypoints: [{ x: 140, y: 80 }],
      points: layout.edges[0]!.points,
      pin: true,
      mode: "manual",
      badgeT: 0.25,
      badgeSide: "top",
      labelSide: "bottom",
      labelT: 0.4,
    });
    expect(view.routes.other_edge).toEqual(getDefaultView(doc).routes.other_edge);
    expect(view.routes.deleted).toEqual(getDefaultView(doc).routes.deleted);
    expect(view.routes.new_edge?.points).toEqual(layout.edges[2]!.points);
  });

  it("keeps unplaced route entries stable while leaving new, missing, and deleted IDs alone", () => {
    const { doc, layout } = fixture();
    const baseline = structuredClone(doc);
    baseline.edges = baseline.edges.filter((edge) => edge.id !== "new_edge");
    const view = getDefaultView(doc);
    view.places.source = { x: 8, y: 9, pin: true, manual: true };
    view.routes.other_edge = { badgeT: 0.3, badgeSide: "bottom" };

    const next = preserveUnplacedManualLayout(doc, layout, baseline);
    const nextView = getDefaultView(next);

    expect(nextView.places.source).toEqual(view.places.source);
    expect(nextView.routes.main).toEqual({
      ...view.routes.main,
      points: layout.edges[0]!.points,
      pin: true,
      mode: "manual",
      badgeSide: "top",
      labelT: 0.4,
      labelSide: "bottom",
    });
    expect(nextView.routes.other_edge).toEqual(view.routes.other_edge);
    expect(nextView.routes.new_edge).toBeUndefined();
    expect(nextView.routes.deleted).toEqual(view.routes.deleted);
  });

  it("reconciles a common endpoint move while preserving explicit route edits", () => {
    const { doc } = fixture();
    const after = structuredClone(doc);
    const afterView = getDefaultView(after);
    afterView.places.target = { x: 272, y: 24, pin: true };
    afterView.places.other = { x: 372, y: 24, pin: true };

    const next = reconcileManualRouteMoves(doc, after);
    expect(getDefaultView(next).routes.other_edge?.points).toEqual([
      { x: 272, y: 24 },
      { x: 372, y: 24 },
    ]);

    afterView.routes.main = {
      ...afterView.routes.main,
      pin: true,
      points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    };
    const explicitlyEdited = reconcileManualRouteMoves(doc, after);
    expect(getDefaultView(explicitlyEdited).routes.main?.points).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it("drops a connector's stale path, keeping its decorations, when only one endpoint moves", () => {
    const { doc } = fixture();
    const after = structuredClone(doc);
    getDefaultView(after).places.other = { x: 400, y: 120, pin: true };

    const next = reconcileManualRouteMoves(doc, after);
    expect(getDefaultView(next).routes.other_edge).toEqual({ badgeT: 0.75, badgeSide: "top" });
  });

  it("accepts subpixel differences from independently rounded common endpoint moves", () => {
    const { doc } = fixture();
    const before = structuredClone(doc);
    const beforeView = getDefaultView(before);
    beforeView.places.target = { x: 240.4, y: 40.4, pin: true };
    beforeView.places.other = { x: 340.6, y: 40.6, pin: true };
    const after = structuredClone(before);
    const afterView = getDefaultView(after);
    afterView.places.target = { x: 260, y: 56, pin: true };
    afterView.places.other = { x: 360, y: 56, pin: true };

    const next = reconcileManualRouteMoves(before, after);
    expect(getDefaultView(next).routes.other_edge?.points).toEqual([
      { x: 259.6, y: 55.6 },
      { x: 359.6, y: 55.6 },
    ]);
  });

  it("keeps an unrelated compiled path exact while a moved endpoint reanchors", () => {
    const doc = compilableDocument();
    const baseline = compileDocument(doc, false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const manual = preserveManualLayout(doc, baseline.layout);
    const moved = structuredClone(manual);
    getDefaultView(moved).places.source!.x! += 64;
    const after = compileDocument(moved, false);
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    const beforeMain = edgeLayout(baseline, "main");
    const afterMain = edgeLayout(after, "main");
    const source = after.layout.nodes.find((node) => node.id === "source")!.obstacle;
    const endpoint = afterMain.points[0]!;
    expect(endpoint).not.toEqual(beforeMain.points[0]);
    expect(endpoint.x).toBeGreaterThanOrEqual(source.x);
    expect(endpoint.x).toBeLessThanOrEqual(source.x + source.w);
    expect(endpoint.y).toBeGreaterThanOrEqual(source.y);
    expect(endpoint.y).toBeLessThanOrEqual(source.y + source.h);
    const sourceIcon = after.layout.nodes.find((node) => node.id === "source")!.icon;
    const neighbor = afterMain.points[1]!;
    expect(endpoint.x === sourceIcon.x ? neighbor.x < endpoint.x && neighbor.y === endpoint.y
      : endpoint.x === sourceIcon.x + sourceIcon.w ? neighbor.x > endpoint.x && neighbor.y === endpoint.y
        : endpoint.y === sourceIcon.y ? neighbor.y < endpoint.y && neighbor.x === endpoint.x
          : neighbor.y > endpoint.y && neighbor.x === endpoint.x).toBe(true);
    expect(edgeLayout(after, "other_edge").points).toEqual(edgeLayout(baseline, "other_edge").points);
  });

  it("translates an internal compiled route when a group moves both endpoints", () => {
    const doc = compilableDocument(true);
    const baseline = compileDocument(doc, false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const before = preserveManualLayout(doc, baseline.layout);
    const after = structuredClone(before);
    const afterView = getDefaultView(after);
    const group = afterView.places.services!;
    group.x! += 48;
    group.y! += 24;
    for (const id of ["source", "target"]) {
      afterView.places[id]!.x! += 48;
      afterView.places[id]!.y! += 24;
    }
    const reconciled = reconcileManualRouteMoves(before, after);
    const compiled = compileDocument(reconciled, false);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const manualBefore = compileDocument(before, false);
    expect(manualBefore.ok).toBe(true);
    if (!manualBefore.ok) return;
    const baselineMainRoute = edgeLayout(manualBefore, "main");
    const movedMain = edgeLayout(compiled, "main");
    expect(movedMain.points).toEqual(baselineMainRoute.points.map((point) => ({ x: point.x + 48, y: point.y + 24 })));
    expect(movedMain.points.length).toBeGreaterThan(2);
  });
});
