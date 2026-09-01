import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";
import {
  createAsyncDocsFixture,
  createTransferHubFixture,
  createEmptyDocument,
  getDefaultView,
} from "../core/index.js";
import type { LayoutResult } from "../core/index.js";
import { compileDiagram, renderSvg } from "../render/index.js";
import { layoutDocument } from "../layout/index.js";
import { parseDgm } from "../dsl/index.js";
import { GRAMMAR, GROUP_STYLES } from "../grammar-aws/index.js";
import {
  eraseOrthogonalRouteLoops,
  normalizeOrthogonalRoute,
  routeEdges,
  attachRoutes,
} from "../route/index.js";
import { checkInvariants } from "./invariants.js";

describe("async-docs fixture", () => {
  it("compiles a top-level external boundary beside a provider cloud", () => {
    const doc = parseDgm(`diagram gcp-data-analytics {
  grammar gcp
  flow lr
  cloud-agnostic.boundary sources "Data sources" {
    cloud-agnostic.container applications "Applications"
    cloud-agnostic.repository files "Files"
  }
  gcp.organization gcp_cloud "Google Cloud" {
    gcp.project project "Analytics project" {
      gcp.bigquery bigquery "BigQuery"
    }
  }
  applications -> bigquery { id ingest label "events" }
}`);

    const result = compileDiagram(doc);

    expect(result.ok).toBe(true);
    expect(result.svg).toContain("<svg");
  });

  it("renders Azure subscriptions with provider defaults while honoring authored colors", () => {
    const doc = parseDgm(`diagram azure-subscription {\n  grammar azure\n  azure.subscription subscription "Azure Subscription" {}\n}`);
    const defaultSvg = renderSvg(doc, layoutDocument(doc));
    expect(defaultSvg).toContain('stroke="#FF9300"');
    expect(defaultSvg).toContain('fill="rgba(255,147,0,0.04)"');

    doc.groups[0]!.color = "purple";
    const authoredSvg = renderSvg(doc, layoutDocument(doc));
    expect(authoredSvg).toContain('stroke="#7C3AED"');
    expect(authoredSvg).toContain('fill="rgba(124,58,237,0.045)"');
  });

  it("compiles without validation errors", () => {
    const result = compileDiagram(createAsyncDocsFixture());
    expect(result.ok).toBe(true);
    expect(result.svg).toContain("<svg");
  });

  it("renders authored boundary appearance and keeps the canonical boundary iconless", () => {
    const doc = createAsyncDocsFixture();
    const group = doc.groups[0]!;
    group.type = "cloud-agnostic.boundary";
    group.style = "dashed";
    group.color = "purple";
    group.fill = "none";

    const svg = renderSvg(doc, layoutDocument(doc));
    const renderedGroup = svg.match(new RegExp(`<g id="group-${group.id}">([\\s\\S]*?)</g>`))?.[1] ?? "";
    expect(renderedGroup).toContain('stroke="#7C3AED"');
    expect(renderedGroup).toContain('fill="transparent"');
    expect(renderedGroup).toContain('stroke-dasharray=');
    expect(renderedGroup).not.toContain("<image");
  });

  it("adds a contrast halo for dark structural group strokes without changing the canonical stroke", () => {
    const doc = createEmptyDocument("cloud-contrast");
    doc.groups = [{ id: "cloud", kind: "cloud", label: "AWS Cloud", children: [] }];

    const svg = renderSvg(doc, layoutDocument(doc));
    expect(svg).toContain('class="group-border-contrast"');
    expect(svg).toContain('class="group-border"');
    expect(svg).toContain('stroke="#2a3542"');
    expect(svg).toContain('stroke="rgba(255,255,255,0.25)"');
  });

  it("renders connector labels without an opaque backing box", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.label = "authorize payment";

    const svg = compileDiagram(doc).svg;

    expect(svg).toContain('class="edge-label"');
    expect(svg).not.toContain('class="edge-label-background"');
  });

  it("renders each note style as an explicit SVG variant", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations = [
      { id: "paper", text: "A paper note" },
      { id: "text", text: "A plain text item", style: "text", font: "serif", fontSize: 20, align: "center" },
      { id: "code", text: "const ready = true", style: "code" },
      { id: "callout", text: "Keep this private", style: "callout" },
      { id: "checklist", text: "Review IAM", style: "checklist" },
    ];
    const view = getDefaultView(doc);
    view.annotations = {
      paper: { x: 40, y: 40, w: 220, h: 96 },
      text: { x: 40, y: 150, w: 240, h: 48 },
      code: { x: 280, y: 40, w: 300, h: 160 },
      callout: { x: 620, y: 40, w: 280, h: 104 },
      checklist: { x: 40, y: 180, w: 260, h: 152 },
    };

    const svg = renderSvg(doc, layoutDocument(doc));
    expect(svg.match(/<g[^>]*data-annotation-style=/g)).toHaveLength(5);
    expect(svg).toContain('data-annotation-style="paper"');
    expect(svg).toContain('data-annotation-style="text"');
    expect(svg).toContain('data-annotation-style="code"');
    expect(svg).toContain('data-annotation-style="callout"');
    expect(svg).toContain('data-annotation-style="checklist"');
    expect(svg).toContain('font-family="Georgia, Cambria, Times New Roman, serif"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('text-anchor="middle"');
  });

  it("has no connector collisions, detached ports, or reverse overlaps", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const edges = routeEdges(doc, layout);
    const full = attachRoutes(layout, edges);
    const failures = checkInvariants(full);
    expect(failures).toEqual([]);
  });

  it("reports a strict connector crossing as a routing invariant failure", () => {
    const layout = {
      nodes: [],
      groups: [],
      edges: [
        {
          id: "horizontal",
          source: "a",
          target: "b",
          points: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
          style: "solid",
        },
        {
          id: "vertical",
          source: "c",
          target: "d",
          points: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
          style: "solid",
        },
      ],
      width: 100,
      height: 100,
      symmetries: [],
    } satisfies LayoutResult;

    expect(checkInvariants(layout)).toContainEqual({
      code: "edge-crossing",
      message: "Edges horizontal and vertical cross",
      elementIds: ["horizontal", "vertical"],
    });
  });

  it("keeps curated Bedrock automatic routes inside the rendered canvas", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/bedrock-claims-processing/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const result = compileDiagram(doc);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = result.layout.canvasBounds ?? {
      x: 0,
      y: 0,
      w: result.layout.width,
      h: result.layout.height,
    };
    for (const edge of result.layout.edges) {
      for (const point of edge.points) {
        expect(point.x, `${edge.id} x`).toBeGreaterThanOrEqual(bounds.x);
        expect(point.x, `${edge.id} x`).toBeLessThanOrEqual(bounds.x + bounds.w);
        expect(point.y, `${edge.id} y`).toBeGreaterThanOrEqual(bounds.y);
        expect(point.y, `${edge.id} y`).toBeLessThanOrEqual(bounds.y + bounds.h);
      }
    }
    expect(result.invariantFailures).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-icon-collision",
        elementIds: expect.arrayContaining([
          "workflow_to_state",
          expect.stringMatching(/^(extractor|fraud_model)$/),
        ]),
      }),
    ]));
    expect(result.svg).toContain(
      `viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}"`,
    );
  });

  it("expands runtime canvas bounds for perimeter route points", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const routed = routeEdges(doc, layout);
    const first = routed[0]!;
    const outside = {
      ...first,
      points: [
        { x: -48, y: first.points[0]!.y },
        { x: layout.width + 48, y: first.points.at(-1)!.y },
      ],
    };
    const full = attachRoutes(layout, [outside]);
    const svg = renderSvg(doc, full);
    const padding = GRAMMAR.edgeStroke;

    expect(full.canvasBounds).toEqual({
      x: -48 - padding,
      y: Math.min(0, first.points[0]!.y) - padding,
      w: layout.width + 96 + padding * 2,
      h: Math.max(layout.height, first.points[0]!.y, first.points.at(-1)!.y) -
        Math.min(0, first.points[0]!.y) + padding * 2,
    });
    expect(svg).toContain(
      `viewBox="${full.canvasBounds!.x} ${full.canvasBounds!.y} ${full.canvasBounds!.w} ${full.canvasBounds!.h}"`,
    );
  });

  it("keeps decorated cross-boundary labels clear in the thumbnail pipeline", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/image-thumbnail-pipeline/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const result = compileDiagram(doc);

    expect(result.ok).toBe(true);
    expect(result.invariantFailures).toEqual([]);
  });

  it("reports collisions among edge decorations, resources, and connectors", () => {
    const layout = {
      nodes: [{
        id: "service",
        type: "resource",
        icon: { x: 40, y: 40, w: 48, h: 48 },
        label: { x: 20, y: 92, w: 88, h: 20 },
        obstacle: { x: 20, y: 40, w: 88, h: 72 },
        role: "primary",
        resourceType: "generic.server",
        serviceLabel: "Service",
      }],
      groups: [],
      edges: [
        {
          id: "first",
          source: "a",
          target: "b",
          points: [{ x: 0, y: 60 }, { x: 160, y: 60 }],
          label: "first",
          labelRect: { x: 44, y: 48, w: 52, h: 14 },
          badge: { x: 52, y: 52 },
          style: "solid",
        },
        {
          id: "second",
          source: "c",
          target: "d",
          points: [{ x: 70, y: 0 }, { x: 70, y: 140 }],
          label: "second",
          labelRect: { x: 48, y: 50, w: 60, h: 14 },
          badge: { x: 56, y: 54 },
          style: "solid",
        },
      ],
      width: 180,
      height: 160,
      symmetries: [],
    } satisfies LayoutResult;

    const failures = checkInvariants(layout);
    const codes = new Set(failures.map((failure) => failure.code));
    expect(codes.has("edge-label-node-collision")).toBe(true);
    expect(codes.has("edge-label-overlap")).toBe(true);
    expect(codes.has("edge-badge-overlap")).toBe(true);
    expect(failures.every((failure) => failure.elementIds.length > 0)).toBe(true);
    expect(failures).toContainEqual(expect.objectContaining({
      code: "edge-label-node-collision",
      elementIds: ["first", "service"],
    }));
    expect(failures).toContainEqual(expect.objectContaining({
      code: "edge-label-overlap",
      elementIds: ["first", "second"],
    }));
  });

  it("equalizes AZ dimensions", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const azs = layout.groups.filter((g) => g.kind === "az");
    expect(azs.length).toBe(2);
    expect(azs[0]!.bounds.w).toBe(azs[1]!.bounds.w);
    expect(azs[0]!.bounds.h).toBe(azs[1]!.bounds.h);
  });

  it("lays out resource labels above icons and group labels at the top right", () => {
    const doc = createAsyncDocsFixture();
    const client = doc.resources.find((resource) => resource.id === "client")!;
    const region = doc.groups.find((group) => group.id === "use1")!;
    client.label.position = "top";
    region.labelPosition = "top-right";

    const layout = layoutDocument(doc);
    const node = layout.nodes.find((candidate) => candidate.id === "client")!;
    const group = layout.groups.find((candidate) => candidate.id === "use1")!;

    expect(node.label.y + node.label.h).toBeLessThanOrEqual(node.icon.y);
    expect(group.labelRect!.x + group.labelRect!.w).toBe(group.bounds.x + group.bounds.w);
    expect(group.labelRect!.y).toBe(group.bounds.y);
  });

  it("anchors iconless group labels to the selected corner", () => {
    const doc = createAsyncDocsFixture();
    const queues = doc.groups.find((group) => group.id === "queues")!;
    queues.labelPosition = "top-right";

    const layout = layoutDocument(doc);
    const group = layout.groups.find((candidate) => candidate.id === "queues")!;
    const svg = renderSvg(doc, layout);

    expect(group.labelRect!.x + group.labelRect!.w).toBe(group.bounds.x + group.bounds.w);
    expect(svg).toMatch(
      new RegExp(`id="group-queues"[\\s\\S]*text-anchor="end"[\\s\\S]*>${queues.label}<\\/text>`),
    );
  });

  it("mirrors icon-bearing group labels flush against the right boundary", () => {
    const doc = createAsyncDocsFixture();
    const region = doc.groups.find((group) => group.id === "use1")!;
    region.labelPosition = "top-right";

    const layout = layoutDocument(doc);
    const group = layout.groups.find((candidate) => candidate.id === region.id)!;
    const svg = renderSvg(doc, layout);
    const renderedGroup = svg.match(
      new RegExp(`<g id="group-${region.id}">([\\s\\S]*?)<\\/g>`),
    )?.[1] ?? "";

    expect(renderedGroup).toContain(
      `x="${group.bounds.x + group.bounds.w - GROUP_STYLES[group.kind].iconSize}"`,
    );
    expect(renderedGroup).toContain('text-anchor="end"');
  });

  it("does not add a catalog icon to shorthand logical groups", () => {
    const doc = createEmptyDocument("iconless-group");
    doc.groups = [{
      id: "boundary",
      kind: "logical",
      label: "Logical boundary",
      children: [],
    }];

    const svg = renderSvg(doc, layoutDocument(doc));

    expect(svg).toContain('id="group-boundary"');
    expect(svg).not.toContain("<image");
  });

  it("can hide the icon on a typed cloud-agnostic group", () => {
    const doc = createEmptyDocument("hidden-group-icon");
    doc.groups = [{
      id: "boundary",
      kind: "logical",
      type: "cloud-agnostic.boundary",
      label: "Boundary",
      hideIcon: true,
      children: [],
    }];

    const svg = renderSvg(doc, layoutDocument(doc));

    expect(svg).toContain('id="group-boundary"');
    expect(svg).not.toContain("<image");
  });

  it("uses the compact AWS hierarchy orientation", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const azA = layout.groups.find((group) => group.id === "azA")!;
    const azB = layout.groups.find((group) => group.id === "azB")!;
    const publicA = layout.groups.find((group) => group.id === "pubA")!;
    const appA = layout.groups.find((group) => group.id === "appA")!;
    const api = layout.nodes.find((node) => node.id === "apiA")!;
    const worker = layout.nodes.find((node) => node.id === "workerA")!;
    const alb = layout.nodes.find((node) => node.id === "api_alb")!;

    expect(azA.bounds.x).toBe(azB.bounds.x);
    expect(azA.bounds.y).toBeLessThan(azB.bounds.y);
    expect(publicA.bounds.y).toBe(appA.bounds.y);
    expect(publicA.bounds.x).toBeLessThan(appA.bounds.x);
    expect(api.obstacle.x).toBeLessThan(worker.obstacle.x);
    expect(alb.obstacle.x).toBeGreaterThan(publicA.bounds.x);
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
      /id="group-main"[\s\S]*?<rect class="group-border" x="([^"]+)" y="([^"]+)"[\s\S]*?<image[^>]* x="\1" y="\2"/,
    );
  });

  it("renders numbered badges on groups", () => {
    const doc = createAsyncDocsFixture();
    doc.groups.find((group) => group.id === "queues")!.step = 3;
    const svg = renderSvg(doc, layoutDocument(doc));
    expect(svg).toContain('class="group-badge-circle"');
    expect(svg).toContain('class="group-badge-text"');
    expect(svg).toMatch(/class="group-badge-text"[\s\S]*?>3<\/text>/);
  });

  it("repacks overlapping pinned siblings inside their group", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.jobs = { x: 720, y: 160, pin: true };
    view.places.jobs_dlq = { x: 720, y: 160, pin: true };
    const layout = layoutDocument(doc);
    const jobs = layout.nodes.find((node) => node.id === "jobs")!.obstacle;
    const dlq = layout.nodes.find((node) => node.id === "jobs_dlq")!.obstacle;
    const overlaps = !(
      jobs.x + jobs.w <= dlq.x || dlq.x + dlq.w <= jobs.x ||
      jobs.y + jobs.h <= dlq.y || dlq.y + dlq.h <= jobs.y
    );
    expect(overlaps).toBe(false);
  });

  it("repacks pinned siblings that extend outside their group", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.jobs = { x: 720, y: 980, pin: true };
    const layout = layoutDocument(doc);
    const group = layout.groups.find((candidate) => candidate.id === "queues");
    const node = layout.nodes.find((candidate) => candidate.id === "jobs");
    expect(group).toBeDefined();
    expect(node).toBeDefined();
    expect(node!.obstacle.x).toBeGreaterThanOrEqual(group!.content.x);
    expect(node!.obstacle.y).toBeGreaterThanOrEqual(group!.content.y);
    expect(node!.obstacle.x + node!.obstacle.w).toBeLessThanOrEqual(
      group!.content.x + group!.content.w,
    );
    expect(node!.obstacle.y + node!.obstacle.h).toBeLessThanOrEqual(
      group!.content.y + group!.content.h,
    );
  });

  it("moves a pinned direct resource clear of nested child groups", () => {
    const doc = createAsyncDocsFixture();
    doc.resources.push({
      id: "gateway",
      type: "aws.vpc-internet-gateway",
      parent: "main",
      label: {},
      role: "primary",
      props: {},
    });
    doc.groups.find((group) => group.id === "main")!.children.push("gateway");
    getDefaultView(doc).places.gateway = { x: 128, y: 160, pin: true };
    const layout = layoutDocument(doc);
    const gateway = layout.nodes.find((node) => node.id === "gateway")!.obstacle;
    const childGroups = layout.groups.filter((group) => group.id === "azA" || group.id === "azB");
    for (const child of childGroups) {
      const overlaps = !(
        gateway.x + gateway.w + 8 <= child.bounds.x ||
        child.bounds.x + child.bounds.w + 8 <= gateway.x ||
        gateway.y + gateway.h + 8 <= child.bounds.y ||
        child.bounds.y + child.bounds.h + 8 <= gateway.y
      );
      expect(overlaps).toBe(false);
    }
  });

  it("keeps connectors simple and gives dashed failure edges a red arrowhead", () => {
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
    expect(result.svg).toMatch(/id="edge-e6"[\s\S]*marker-end="url\(#arrow-red\)"/);
  });

  it("renders connector colors and authored connector meanings", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.kind = "peer";
    doc.edges[0]!.color = "teal";

    const result = compileDiagram(doc);
    expect(result.ok).toBe(true);
    const peerEdge = result.svg?.match(/<g id="edge-e1"[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(peerEdge).toContain('class="edge edge-peer edge-solid"');
    expect(peerEdge).toContain('stroke="#0F766E"');
    expect(peerEdge).not.toContain("marker-end=");

    doc.edges[1]!.kind = "bidirectional";
    const bidirectionalResult = compileDiagram(doc);
    expect(bidirectionalResult.ok).toBe(true);
    const bidirectionalEdge = bidirectionalResult.svg?.match(/<g id="edge-e2"[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(bidirectionalEdge).toContain('class="edge edge-bidirectional edge-solid"');
    expect(bidirectionalEdge).toContain('marker-start="url(#arrow-start)"');
    expect(bidirectionalEdge).toContain('marker-end="url(#arrow)"');
    expect(bidirectionalResult.svg).toContain('id="arrow-start"');
    expect(bidirectionalResult.svg).toContain('orient="auto-start-reverse"');

    doc.edges[1]!.kind = "bidirectional";
    doc.edges[1]!.style = "dashed";
    doc.edges[1]!.color = "teal";
    const coloredDashedResult = compileDiagram(doc);
    expect(coloredDashedResult.ok).toBe(true);
    const coloredDashedEdge = coloredDashedResult.svg?.match(/<g id="edge-e2"[\s\S]*?<\/g>/)?.[0] ?? "";
    expect(coloredDashedEdge).toContain('marker-start="url(#arrow-teal-start)"');
    expect(coloredDashedEdge).toContain('marker-end="url(#arrow-teal)"');
    expect(coloredDashedEdge).toContain('<path d="M');
    expect(coloredDashedEdge.match(/marker-start="url\(#arrow-teal-start\)"/g)).toHaveLength(2);
    expect(coloredDashedEdge.match(/marker-end="url\(#arrow-teal\)"/g)).toHaveLength(2);
  });

  it("repairs unsafe pinned places and removes loops from pinned routes", () => {
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
    const publicSubnet = layout.groups.find((group) => group.id === "pubA")!;
    expect(api.obstacle.x).toBeGreaterThanOrEqual(publicSubnet.content.x);
    expect(api.obstacle.y).toBeGreaterThanOrEqual(publicSubnet.content.y);
    expect(api.obstacle.x + api.obstacle.w).toBeLessThanOrEqual(
      publicSubnet.content.x + publicSubnet.content.w,
    );
    expect(api.obstacle.y + api.obstacle.h).toBeLessThanOrEqual(
      publicSubnet.content.y + publicSubnet.content.h,
    );

    const edges = routeEdges(doc, layout);
    const edge = edges.find((candidate) => candidate.id === "e2")!;
    expect(edge.points).toEqual(
      eraseOrthogonalRouteLoops(normalizeOrthogonalRoute([
        edge.points[0]!,
        ...view.routes.e2!.waypoints!,
        edge.points.at(-1)!,
      ])),
    );
    expect(edge.points.length).toBeLessThan(6);
  });
});

describe("transfer-hub fixture", () => {
  it("compiles with numbered steps", () => {
    const result = compileDiagram(createTransferHubFixture());
    expect(result.ok).toBe(true);
    expect(result.layout?.edges.filter((e) => e.step).length).toBeGreaterThan(0);
  });
});
