import {
  createAsyncDocsFixture,
  getDefaultView,
} from "@dumb-diagrams/runtime/core";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { eraseOrthogonalRouteLoops } from "@dumb-diagrams/runtime/route";
import { describe, expect, it } from "vitest";

import { compileDiagramSource, STUDIO_CANVAS_PADDING } from "./diagram-compiler";
import { addResource, moveSelection, needsAutoFix, setRoute } from "./editor-model";
import { DIAGRAM_EXAMPLES } from "./examples";
import { leftStagingInsertionPoint } from "./grid";

describe("diagram compilation canvas bounds", () => {
  it("always reserves generous free space around the laid-out canvas", () => {
    const result = compileDiagramSource(printDgm(createAsyncDocsFixture()), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bounds = result.layout.canvasBounds!;
    expect(bounds.x).toBe(-STUDIO_CANVAS_PADDING);
    expect(bounds.y).toBe(-STUDIO_CANVAS_PADDING);
    expect(bounds.x + bounds.w - result.layout.width).toBe(STUDIO_CANVAS_PADDING);
    expect(bounds.y + bounds.h - result.layout.height).toBe(STUDIO_CANVAS_PADDING);
  });

  it("propagates invariant failures from the final expanded layout", () => {
    const doc = createAsyncDocsFixture();
    const baseline = compileDiagramSource(printDgm(doc), false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const source = baseline.layout.nodes.find((node) => node.id === "apiA")!;
    const target = baseline.layout.nodes.find((node) => node.id === "jobs")!;
    const collision = baseline.layout.nodes.find((node) => node.id === "workerA")!;
    const start = {
      x: source.icon.x + source.icon.w,
      y: source.icon.y + source.icon.h / 2,
    };
    const finish = {
      x: target.icon.x,
      y: target.icon.y + target.icon.h / 2,
    };
    const collisionX = collision.icon.x + collision.icon.w / 2;
    const collisionY = collision.icon.y + collision.icon.h / 2;
    getDefaultView(doc).routes.e3 = {
      pin: true,
      mode: "manual",
      points: [
        start,
        { x: collisionX, y: start.y },
        { x: collisionX, y: collisionY },
        finish,
      ],
    };

    const result = compileDiagramSource(printDgm(doc), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invariantFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-icon-collision",
        elementIds: expect.arrayContaining(["e3", "workerA"]),
      }),
    ]));
  });

  it("uses the canonical prompt/brief/reference roles for AWS examples", () => {
    expect(DIAGRAM_EXAMPLES).toHaveLength(8);
    expect(DIAGRAM_EXAMPLES.map((example) => example.id)).toEqual([
      "bedrock-claims-processing",
      "aws-data-transfer-hub",
      "aws-high-availability-web-app",
      "simple-serverless-web-application",
      "image-thumbnail-pipeline",
      "asynchronous-report-generation",
      "event-driven-order-fulfillment",
      "azure-private-app-service",
    ]);
    const awsIds = new Set([
      "bedrock-claims-processing",
      "aws-data-transfer-hub",
      "aws-high-availability-web-app",
      "simple-serverless-web-application",
      "image-thumbnail-pipeline",
      "asynchronous-report-generation",
      "event-driven-order-fulfillment",
    ]);
    for (const example of DIAGRAM_EXAMPLES) {
      expect(example.prompt.trim().length, example.id).toBeGreaterThan(40);
      expect(example.prompt).not.toMatch(
        /(?:replicate (?:it|this|from)|reference (?:image|screenshot)|attached (?:image|screenshot)|based on (?:the|this) image)/i,
      );
      if (awsIds.has(example.id)) {
        expect(example.architectureBrief?.trim().length, example.id).toBeGreaterThan(80);
        expect(example.referenceSpec?.trim().length, example.id).toBeGreaterThan(500);
        expect(example.prompt, example.id).not.toMatch(
          /(?:connector sides?|exact (?:row|column|x|y)|automatic layout|routing instructions?|place .* (?:left|right|above|below))/i,
        );
      } else {
        expect(example.architectureBrief, example.id).toBeUndefined();
        expect(example.referenceSpec, example.id).toBeUndefined();
      }
    }
  });

  it("ships every bundled example in the auto-fixed state", () => {
    for (const example of DIAGRAM_EXAMPLES) {
      expect(needsAutoFix(parseDgm(example.source)), example.id).toBe(false);
    }
  });

  it("keeps the Bedrock example compact and wraps long service names", () => {
    const example = DIAGRAM_EXAMPLES.find(
      (candidate) => candidate.id === "bedrock-claims-processing",
    );
    expect(example).toBeDefined();
    const result = compileDiagramSource(example!.source, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.layout.width).toBeLessThanOrEqual(1_600);
    expect(result.layout.height).toBeLessThanOrEqual(960);
    expect(result.svg).toContain(">Amazon Bedrock Data</text>");
    expect(result.svg).toContain(">Automation</text>");
    expect(result.svg).not.toContain(">Amazon Bedrock Data Automation</text>");
  });

  it("keeps the Bedrock workflow as wide bands with distinct, straight routes", () => {
    const example = DIAGRAM_EXAMPLES.find(
      (candidate) => candidate.id === "bedrock-claims-processing",
    );
    expect(example).toBeDefined();
    const result = compileDiagramSource(example!.source, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.layout.width / result.layout.height).toBeGreaterThan(1.5);
    const nodes = new Map(result.layout.nodes.map((node) => [node.id, node]));
    expect(nodes.get("sample_docs")!.obstacle.x).toBeLessThan(
      nodes.get("blueprint_generation")!.obstacle.x,
    );
    expect(nodes.get("claims_docs")!.obstacle.x).toBeLessThan(
      nodes.get("extractor")!.obstacle.x,
    );
    expect(nodes.get("extractor")!.obstacle.x).toBeLessThan(nodes.get("sns")!.obstacle.x);

    const edges = new Map(result.layout.edges.map((edge) => [edge.id, edge]));
    const extraction = edges.get("claims_to_extract")!;
    const workflow = edges.get("workflow_to_state")!;
    const clientRequest = edges.get("client_to_claims")!;
    const clientNotification = edges.get("notify_client")!;
    expect(sharedOrthogonalLength(extraction.points, workflow.points)).toBe(0);
    expect(sharedOrthogonalLength(clientRequest.points, clientNotification.points)).toBe(0);

    const notification = edges.get("sns_to_email")!;
    expect(notification.points).toHaveLength(2);
    expect(notification.points[0]!.x).toBe(notification.points[1]!.x);

    // The long workflow edge must route around the extraction cards. This is
    // an automatic route in the curated source, so a content collision is a
    // router regression rather than an intentional authored warning.
    expect(result.invariantFailures).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-icon-collision",
        elementIds: expect.arrayContaining([
          "workflow_to_state",
          expect.stringMatching(/^(extractor|fraud_model)$/),
        ]),
      }),
    ]));
  });

  it("compiles the claims workflow with the editor grid enabled", () => {
    const example = DIAGRAM_EXAMPLES.find(
      (candidate) => candidate.id === "bedrock-claims-processing",
    );
    expect(example).toBeDefined();
    const source = example!.source
      .replace("diagram bedrock-claims-processing", "diagram claims-processing-workflow")
      .replace(
        "email -> web_client { id notify_client from s to e }",
        "email -> claims_analyst { id notify_analyst from s to e }",
      );

    const result = compileDiagramSource(source, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const workflow = result.layout.edges.find((edge) => edge.id === "workflow_to_state");
    expect(workflow?.points.length).toBeGreaterThan(1);
    expect(result.invariantFailures).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "edge-icon-collision",
        elementIds: expect.arrayContaining([
          "workflow_to_state",
          expect.stringMatching(/^(extractor|fraud_model)$/),
        ]),
      }),
    ]));
  });

  it("keeps Data Transfer Hub compact and free of connector dead ends", () => {
    const example = DIAGRAM_EXAMPLES.find((candidate) => candidate.id === "aws-data-transfer-hub")!;
    const result = compileDiagramSource(example.source, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.layout.width / result.layout.height).toBeLessThan(2.6);
    const groups = new Map(result.layout.groups.map((group) => [group.id, group]));
    expect(groups.get("customer")!.bounds.h / groups.get("customer")!.bounds.w).toBeGreaterThan(0.5);
    expect(groups.get("managed")!.bounds.h / groups.get("managed")!.bounds.w).toBeGreaterThan(0.9);

    const nodes = new Map(result.layout.nodes.map((node) => [node.id, node]));
    expect(Math.abs(
      nodes.get("cognito")!.icon.y - nodes.get("oidc")!.icon.y,
    )).toBeLessThanOrEqual(16);
    for (const edge of result.layout.edges) {
      expect(edge.points, edge.id).toEqual(eraseOrthogonalRouteLoops(edge.points));
    }
  });

  it("grows the artboard when an authored annotation is moved beyond the layout", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations.push({ id: "far-note", text: "Moved note", style: "paper" });
    const view = getDefaultView(doc);
    view.annotations = {
      ...view.annotations,
      "far-note": { x: 2_400, y: 1_500, w: 220, h: 96, pin: true },
    };

    const result = compileDiagramSource(printDgm(doc), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.width).toBeGreaterThanOrEqual(2_400 + 220 + 128);
    expect(result.layout.height).toBeGreaterThanOrEqual(1_500 + 96 + 128);
  });

  it("grows the artboard above and to the left of the initial layout", () => {
    const doc = createAsyncDocsFixture();
    doc.annotations.push({ id: "far-note", text: "Moved note", style: "paper" });
    const view = getDefaultView(doc);
    view.annotations = {
      ...view.annotations,
      "far-note": { x: -240, y: -144, w: 220, h: 96, pin: true },
    };

    const result = compileDiagramSource(printDgm(doc), false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.canvasBounds).toEqual(expect.objectContaining({
      x: -368,
      y: -272,
    }));
    expect(result.layout.canvasBounds!.w).toBe(result.layout.width + 496);
    expect(result.layout.canvasBounds!.h).toBe(result.layout.height + 400);
    expect(result.svg).toContain(
      `viewBox="-368 -272 ${result.layout.canvasBounds!.w} ${result.layout.canvasBounds!.h}"`,
    );
  });

  it("keeps existing routes stable when a new root resource enters the left staging lane", () => {
    const doc = createAsyncDocsFixture();
    const before = compileDiagramSource(printDgm(doc), false);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const entry = getCatalogEntry("aws.simple-storage-service")!;
    const at = leftStagingInsertionPoint(before.layout, 240);
    const added = addResource(doc, entry, undefined, at);
    const after = compileDiagramSource(printDgm(added.doc), false);
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    const routesBefore = new Map(before.layout.edges.map((edge) => [edge.id, edge.points]));
    for (const edge of after.layout.edges) {
      expect(edge.points, edge.id).toEqual(routesBefore.get(edge.id));
    }
    expect(after.layout.nodes.find((node) => node.id === added.id)!.obstacle.x)
      .toBeLessThan(Math.min(
        ...before.layout.groups.map((group) => group.bounds.x),
        ...before.layout.nodes.map((node) => node.obstacle.x),
        ...before.layout.edges.flatMap((edge) => edge.points.map((point) => point.x)),
      ));
  });

  it("keeps routes stable when an unrelated staged resource moves", () => {
    const example = DIAGRAM_EXAMPLES.find(
      (candidate) => candidate.id === "simple-serverless-web-application",
    )!;
    const doc = parseDgm(example.source);
    const entry = getCatalogEntry("azure.abs-member")!;
    const added = addResource(doc, entry, undefined, { x: -320, y: 720 });
    // Documents authored before explicit editor placements were marked as
    // manual still contain pinned root items in this form.
    delete getDefaultView(added.doc).places[added.id]!.manual;
    const legacy = compileDiagramSource(printDgm(added.doc), false);
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    const autoRoute = legacy.layout.edges.find((edge) => edge.id === "cdn_to_api")!;
    const start = autoRoute.points[0]!;
    const target = autoRoute.points.at(-1)!;
    const detourY = Math.max(start.y, target.y) + 480;
    const adjusted = setRoute(added.doc, autoRoute.id, [
      start,
      { x: start.x + 32, y: start.y },
      { x: start.x + 32, y: detourY },
      { x: target.x - 32, y: detourY },
      { x: target.x - 32, y: target.y },
      target,
    ]);
    const before = compileDiagramSource(printDgm(adjusted), false);
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const moved = moveSelection(
      adjusted,
      [{ kind: "resource", id: added.id }],
      0,
      -560,
      before.layout,
    );
    const after = compileDiagramSource(printDgm(moved), false);
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    expect(new Map(after.layout.edges.map((edge) => [edge.id, edge.points])))
      .toEqual(new Map(before.layout.edges.map((edge) => [edge.id, edge.points])));
  });
});

function sharedOrthogonalLength(
  first: Array<{ x: number; y: number }>,
  second: Array<{ x: number; y: number }>,
): number {
  let length = 0;
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex++) {
    const a = first[firstIndex]!;
    const b = first[firstIndex + 1]!;
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex++) {
      const c = second[secondIndex]!;
      const d = second[secondIndex + 1]!;
      if (a.x === b.x && c.x === d.x && a.x === c.x) {
        length += Math.max(
          0,
          Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
            Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)),
        );
      } else if (a.y === b.y && c.y === d.y && a.y === c.y) {
        length += Math.max(
          0,
          Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
            Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)),
        );
      }
    }
  }
  return length;
}
