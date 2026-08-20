import { describe, it, expect } from "vitest";
import {
  createAsyncDocsFixture,
  createTransferHubFixture,
  getDefaultView,
} from "@dumb-diagrams/core";
import { compileDiagram, renderSvg } from "@dumb-diagrams/render";
import { checkInvariants } from "@dumb-diagrams/render";
import { layoutDocument } from "@dumb-diagrams/layout";
import { normalizeOrthogonalRoute, routeEdges, attachRoutes } from "@dumb-diagrams/route";

describe("async-docs fixture", () => {
  it("compiles without validation errors", () => {
    const result = compileDiagram(createAsyncDocsFixture());
    expect(result.ok).toBe(true);
    expect(result.svg).toContain("<svg");
  });

  it("renders each note style as an explicit SVG variant", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations = [
      { id: "paper", text: "A paper note" },
      { id: "code", text: "const ready = true", style: "code" },
      { id: "callout", text: "Keep this private", style: "callout" },
      { id: "checklist", text: "Review IAM", style: "checklist" },
    ];
    const view = getDefaultView(doc);
    view.annotations = {
      paper: { x: 40, y: 40, w: 220, h: 96 },
      code: { x: 280, y: 40, w: 300, h: 160 },
      callout: { x: 620, y: 40, w: 280, h: 104 },
      checklist: { x: 40, y: 180, w: 260, h: 152 },
    };

    const svg = renderSvg(doc, layoutDocument(doc));
    expect(svg.match(/data-annotation-style=/g)).toHaveLength(4);
    expect(svg).toContain('data-annotation-style="paper"');
    expect(svg).toContain('data-annotation-style="code"');
    expect(svg).toContain('data-annotation-style="callout"');
    expect(svg).toContain('data-annotation-style="checklist"');
  });

  it("has no connector collisions, detached ports, or reverse overlaps", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const edges = routeEdges(doc, layout);
    const full = attachRoutes(layout, edges);
    const failures = checkInvariants(full);
    expect(failures).toEqual([]);
  });

  it("equalizes AZ dimensions", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const azs = layout.groups.filter((g) => g.kind === "az");
    expect(azs.length).toBe(2);
    expect(azs[0]!.bounds.w).toBe(azs[1]!.bounds.w);
    expect(azs[0]!.bounds.h).toBe(azs[1]!.bounds.h);
  });

  it("keeps resources inside their parent groups", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const queues = layout.groups.find((g) => g.id === "queues")!;
    const storage = layout.groups.find((g) => g.id === "storage")!;
    const appA = layout.groups.find((g) => g.id === "appA")!;
    const jobs = layout.nodes.find((n) => n.id === "jobs")!;
    const dlq = layout.nodes.find((n) => n.id === "jobs_dlq")!;
    const worker = layout.nodes.find((n) => n.id === "workerA")!;
    const artifacts = layout.nodes.find((n) => n.id === "artifacts")!;

    const inside = (
      node: (typeof layout.nodes)[number],
      group: (typeof layout.groups)[number],
    ) =>
      node.icon.x >= group.bounds.x &&
      node.icon.y >= group.bounds.y &&
      node.icon.x + node.icon.w <= group.bounds.x + group.bounds.w &&
      node.icon.y + node.icon.h <= group.bounds.y + group.bounds.h;

    expect(inside(jobs, queues)).toBe(true);
    expect(inside(dlq, queues)).toBe(true);
    expect(inside(artifacts, storage)).toBe(true);
    expect(inside(worker, appA)).toBe(true);
  });

  it("places group icons flush with the border", () => {
    const result = compileDiagram(createAsyncDocsFixture());
    expect(result.ok).toBe(true);
    expect(result.svg).toMatch(
      /id="group-main"[\s\S]*?<rect x="([^"]+)" y="([^"]+)"[\s\S]*?<image[^>]* x="\1" y="\2"/,
    );
  });

  it("keeps connectors simple and gives dashed edges an arrowhead", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const edges = routeEdges(doc, layout);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const onBorder = (
      point: { x: number; y: number },
      icon: { x: number; y: number; w: number; h: number },
    ) => {
      const onVertical =
        (point.x === icon.x || point.x === icon.x + icon.w) &&
        point.y >= icon.y &&
        point.y <= icon.y + icon.h;
      const onHorizontal =
        (point.y === icon.y || point.y === icon.y + icon.h) &&
        point.x >= icon.x &&
        point.x <= icon.x + icon.w;
      return onVertical || onHorizontal;
    };

    for (const edge of edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      expect(edge.points.length).toBeLessThanOrEqual(6);
      expect(onBorder(edge.points[0]!, nodes.get(edge.source)!.icon)).toBe(true);
      expect(
        onBorder(edge.points[edge.points.length - 1]!, nodes.get(edge.target)!.icon),
      ).toBe(true);
    }

    const intoApi = edges.find((edge) => edge.id === "e2")!;
    const outOfApi = edges.find((edge) => edge.id === "e3")!;
    expect(intoApi.points[intoApi.points.length - 1]!.y).not.toBe(
      outOfApi.points[0]!.y,
    );

    const intoQueue = edges.find((edge) => edge.id === "e3")!;
    const outOfQueue = edges.find((edge) => edge.id === "e4")!;
    expect(intoQueue.points[intoQueue.points.length - 1]!.y).not.toBe(
      outOfQueue.points[0]!.y,
    );

    const result = compileDiagram(doc);
    expect(result.svg).toMatch(/id="edge-e6"[\s\S]*marker-end="url\(#arrow\)"/);
  });

  it("applies pinned places and routes as absolute view overrides", () => {
    const doc = createAsyncDocsFixture();
    const view = doc.views[0]!;
    view.places.api_alb = { x: 128, y: 96, pin: true };
    view.routes.e2 = {
      waypoints: [
        { x: 240, y: 120 },
        { x: 240, y: 280 },
      ],
      pin: true,
    };

    const layout = layoutDocument(doc);
    const api = layout.nodes.find((node) => node.id === "api_alb")!;
    expect(api.obstacle.x).toBe(128);
    expect(api.obstacle.y).toBe(96);

    const edges = routeEdges(doc, layout);
    const edge = edges.find((candidate) => candidate.id === "e2")!;
    expect(edge.points).toEqual(
      normalizeOrthogonalRoute([
        edge.points[0]!,
        ...view.routes.e2!.waypoints!,
        edge.points.at(-1)!,
      ]),
    );
    for (const waypoint of view.routes.e2!.waypoints!) {
      expect(edge.points).toContainEqual(waypoint);
    }
  });
});

describe("transfer-hub fixture", () => {
  it("compiles with numbered steps", () => {
    const result = compileDiagram(createTransferHubFixture());
    expect(result.ok).toBe(true);
    expect(result.layout?.edges.filter((e) => e.step).length).toBeGreaterThan(0);
  });
});
