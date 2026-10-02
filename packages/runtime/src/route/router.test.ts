import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createEmptyDocument,
  nearestPortAnchor,
  portPoint,
} from "../core/index.js";
import { createAsyncDocsFixture } from "../../test-fixtures.js";
import { parseDgm } from "../dsl/index.js";
import type { DiagramDocument, LayoutResult, NodeGeom } from "../core/index.js";
import { layoutDocument } from "../layout/index.js";
import {
  collapseOrthogonalRouteArtifacts,
  eraseOrthogonalRouteLoops,
  anchorRouteEndpoints,
  getEdgeBadgePlacement,
  getEdgeLabelPlacementOnPath,
  normalizeOrthogonalRoute,
  projectPointToPolyline,
  routeConnectionPreview,
  routeEdgePreview,
  routeEdges,
} from "./router.js";

describe("routeEdgePreview", () => {
  it.each([
    { name: "crowded parallel route", label: "call API", headerWidth: 120, maxGap: 52 },
    { name: "parallel route with a clear nearby pocket", label: "call", headerWidth: 70, maxGap: 20 },
  ])("keeps automatic labels attached to their owner beside a $name", ({ label, headerWidth, maxGap }) => {
    const doc = createEmptyDocument("parallel-label-ownership");
    doc.resources = [
      routingResource("actor", "cloud-agnostic.client", "Actor"),
      routingResource("api", "cloud-agnostic.server", "API"),
      routingResource("s3", "cloud-agnostic.server", "S3"),
    ];
    doc.edges = [
      { id: "actor_api", source: "actor", target: "api", label, style: "solid", kind: "flow" },
      { id: "actor_s3", source: "actor", target: "s3", label: "a very long storage label", style: "solid", kind: "flow" },
    ];
    doc.views[0]!.routes.actor_api = { pin: true, mode: "manual", points: [{ x: 120, y: 397 }, { x: 220, y: 397 }] };
    doc.views[0]!.routes.actor_s3 = { pin: true, mode: "manual", points: [{ x: 120, y: 359 }, { x: 220, y: 359 }], labelT: 0.5, labelSide: "bottom" };
    const layout: LayoutResult = {
      nodes: [routingNode("actor", 72, 373, 48), routingNode("api", 220, 373, 48), routingNode("s3", 220, 335, 48)],
      groups: [{
        id: "storage",
        kind: "region",
        bounds: { x: 100, y: 400, w: headerWidth, h: 80 },
        header: { x: 100, y: 400, w: headerWidth, h: 24 },
        content: { x: 100, y: 424, w: headerWidth, h: 56 },
        label: "Storage",
        labelRect: { x: 100, y: 407, w: headerWidth, h: 14 },
      }],
      edges: [], width: 420, height: 500, symmetries: [],
    };
    const routes = routeEdges(doc, layout);
    const own = routes.find((edge) => edge.id === "actor_api")!;
    const foreign = routes.find((edge) => edge.id === "actor_s3")!;

    expect(own.labelPoint).toBeDefined();
    expect(distanceToPath(own.labelPoint!, own.points)).toBeLessThanOrEqual(maxGap);
    expect(distanceToPath(own.labelPoint!, own.points))
      .toBeLessThan(distanceToPath(own.labelPoint!, foreign.points));
    if (maxGap === 20) {
      // A clear pocket uses the drag preview's gap, avoiding an initial snap.
      expect(own.labelPoint).toEqual(getEdgeLabelPlacementOnPath(
        own.points,
        own.label!,
        own.labelT!,
        own.labelSide!,
      )?.point);
    }
  });
  it("routes blocked edges with an emergency elbow instead of throwing", () => {
    const doc = createEmptyDocument("blocked-edge");
    doc.resources = [
      routingResource("cloudfront", "aws.cloudfront", "CloudFront"),
      routingResource("simple-storage-service", "aws.simple-storage-service", "S3"),
    ];
    doc.edges = [{
      id: "cloudfront-simple-storage-service",
      source: "cloudfront",
      target: "simple-storage-service",
      style: "solid",
      kind: "flow",
    }];
    const layout: LayoutResult = {
      nodes: [
        routingNode("cloudfront", 100, 100, 104),
        routingNode("simple-storage-service", 100, 100, 104),
      ],
      groups: [],
      edges: [],
      width: 800,
      height: 600,
      symmetries: [],
    };

    expect(() => routeEdges(doc, layout)).not.toThrow();
    expect(routeEdges(doc, layout).find((edge) => edge.id === "cloudfront-simple-storage-service")?.points.length)
      .toBeGreaterThan(2);
  });

  it("routes an edge between coincident cards without throwing", () => {
    const doc = createEmptyDocument("coincident-edge");
    doc.resources = [
      routingResource("abs-member", "azure.abs-member", "ABS member"),
      routingResource("abs-member-2", "azure.abs-member", "ABS member"),
    ];
    doc.edges = [{
      id: "abs-member-2-abs-member",
      source: "abs-member-2",
      target: "abs-member",
      style: "solid",
      kind: "flow",
    }];
    const layout: LayoutResult = {
      nodes: [
        routingNode("abs-member", 100, 100, 104),
        routingNode("abs-member-2", 100, 100, 104),
      ],
      groups: [],
      edges: [],
      width: 800,
      height: 600,
      symmetries: [],
    };

    expect(() => routeEdges(doc, layout)).not.toThrow();
    const routed = routeEdges(doc, layout).find((edge) => edge.id === "abs-member-2-abs-member");
    expect(routed?.points.length).toBeGreaterThan(2);
  });

  it("returns a routed polyline for an existing edge", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const preview = routeEdgePreview(doc, layout, "e1");
    const routed = routeEdges(doc, layout).find((edge) => edge.id === "e1");
    expect(preview?.length).toBeGreaterThan(1);
    expect(preview?.[0]).toEqual(routed?.points[0]);
    expect(preview?.at(-1)).toEqual(routed?.points.at(-1));
  });

  it("keeps numbered badges offset from the path and supports both sides", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 160, y: 100 },
    ];
    const top = getEdgeBadgePlacement(points, 0.25, "top");
    const bottom = getEdgeBadgePlacement(points, 0.25, "bottom");
    expect(top?.point).toEqual({ x: 40, y: 84 });
    expect(bottom?.point).toEqual({ x: 40, y: 116 });
    expect(projectPointToPolyline({ x: 72, y: 111 }, points)?.t).toBeCloseTo(0.45);
  });

  it("biases default badges toward the target on vertical runs", () => {
    const badge = getEdgeBadgePlacement([
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(badge?.t).toBeCloseTo(0.75);
    expect(badge?.point).toEqual({ x: 84, y: 75 });
  });

  it("renders a badge for zero as well as positive step numbers", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.step = 0;
    const edge = routeEdges(doc, layoutDocument(doc)).find(
      (candidate) => candidate.id === doc.edges[0]!.id,
    );
    expect(edge?.badge).toBeDefined();
    expect(edge?.step).toBe(0);
  });

  it("keeps a connector label clear of its numbered badge", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.label = "Direct Connect";
    const edge = routeEdges(doc, layoutDocument(doc)).find(
      (candidate) => candidate.id === doc.edges[0]!.id,
    )!;
    expect(edge.badge).toBeDefined();
    expect(edge.labelRect).toBeDefined();
    const closestX = Math.max(
      edge.labelRect!.x,
      Math.min(edge.badge!.x, edge.labelRect!.x + edge.labelRect!.w),
    );
    const closestY = Math.max(
      edge.labelRect!.y,
      Math.min(edge.badge!.y, edge.labelRect!.y + edge.labelRect!.h),
    );
    expect(Math.hypot(edge.badge!.x - closestX, edge.badge!.y - closestY)).toBeGreaterThan(12);
  });

  it("moves an automatic badge around an independently authored label", () => {
    const doc = createEmptyDocument("shared-decoration-space");
    doc.resources = [
      routingResource("source", "cloud-agnostic.client", "Source"),
      routingResource("target", "cloud-agnostic.server", "Target"),
    ];
    doc.edges = [{
      id: "request",
      source: "source",
      target: "target",
      step: 1,
      label: "reserved label",
      style: "solid",
      kind: "flow",
    }];
    doc.views[0]!.routes.request = {
      pin: true,
      mode: "manual",
      points: [{ x: 48, y: 124 }, { x: 320, y: 124 }],
      labelT: 0.5,
      labelSide: "top",
    };
    const layout: LayoutResult = {
      nodes: [
        routingNode("source", 0, 100, 48),
        routingNode("target", 320, 100, 48),
      ],
      groups: [],
      edges: [],
      width: 400,
      height: 220,
      symmetries: [],
    };

    const edge = routeEdges(doc, layout).find((candidate) => candidate.id === "request")!;

    expect(edge.labelT).toBe(0.5);
    expect(edge.labelSide).toBe("top");
    expect({ t: edge.badgeT, side: edge.badgeSide }).not.toEqual({ t: 0.5, side: "top" });
    expect(circleIntersectsRectForTest(edge.badge!, 10, edge.labelRect!, 4)).toBe(false);

    const repeated = routeEdges(doc, layout).find((candidate) => candidate.id === "request")!;
    expect({
      badge: repeated.badge,
      badgeT: repeated.badgeT,
      badgeSide: repeated.badgeSide,
      labelPoint: repeated.labelPoint,
      labelRect: repeated.labelRect,
      labelT: repeated.labelT,
      labelSide: repeated.labelSide,
    }).toEqual({
      badge: edge.badge,
      badgeT: edge.badgeT,
      badgeSide: edge.badgeSide,
      labelPoint: edge.labelPoint,
      labelRect: edge.labelRect,
      labelT: edge.labelT,
      labelSide: edge.labelSide,
    });
  });

  it("keeps independently authored badge and label positions exact", () => {
    const doc = createAsyncDocsFixture();
    const edgeModel = doc.edges[0]!;
    edgeModel.label = "request";
    doc.views[0]!.routes[edgeModel.id] = {
      badgeT: 0.25,
      badgeSide: "bottom",
      labelT: 0.75,
      labelSide: "top",
    };

    const edge = routeEdges(doc, layoutDocument(doc)).find(
      (candidate) => candidate.id === edgeModel.id,
    )!;

    expect(edge.badgeT).toBe(0.25);
    expect(edge.badgeSide).toBe("bottom");
    expect(edge.labelT).toBe(0.75);
    expect(edge.labelSide).toBe("top");
  });

  it("moves a later badge to the clear side instead of covering an earlier arrow", () => {
    const doc = createEmptyDocument("badge-clearance");
    doc.resources = [
      routingResource("browser", "cloud-agnostic.client", "Browser"),
      routingResource("dns", "aws.route-53", "Route 53"),
      routingResource("identity", "aws.cognito", "Identity"),
    ];
    doc.edges = [
      {
        id: "request_dns",
        source: "browser",
        target: "dns",
        sourcePort: "e",
        targetPort: "w",
        step: 1,
        style: "solid",
        kind: "flow",
      },
      {
        id: "resolve_identity",
        source: "dns",
        target: "identity",
        sourcePort: "s",
        targetPort: "n",
        step: 2,
        style: "solid",
        kind: "flow",
      },
    ];
    doc.views[0]!.routes.resolve_identity = {
      pin: true,
      mode: "manual",
      points: [
        { x: 184, y: 148 },
        { x: 184, y: 144 },
        { x: 84, y: 144 },
        { x: 84, y: 180 },
      ],
    };
    const layout: LayoutResult = {
      nodes: [
        routingNode("browser", 0, 100, 48),
        routingNode("dns", 160, 100, 48),
        routingNode("identity", 60, 180, 48),
      ],
      groups: [],
      edges: [],
      width: 300,
      height: 280,
      symmetries: [],
    };

    const routes = routeEdges(doc, layout);
    const request = routes.find((edge) => edge.id === "request_dns")!;
    const resolve = routes.find((edge) => edge.id === "resolve_identity")!;
    expect(resolve.badgeSide).toBe("bottom");
    expect(resolve.badge!.y).toBeGreaterThan(144);
    expect(distanceToPath(resolve.badge!, request.points)).toBeGreaterThan(14);
  });

  it("keeps Azure step badges clear of resource cards and subnet headers", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/azure-private-app-service/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const groups = new Map(layout.groups.map((group) => [group.id, group]));
    const requestBadge = routes.find((edge) => edge.id === "https_requests")!.badge!;
    const readBadge = routes.find((edge) => edge.id === "cache_reads")!.badge!;

    expect(circleIntersectsRectForTest(
      requestBadge,
      10,
      nodes.get("client")!.obstacle,
      4,
    )).toBe(false);
    expect(circleIntersectsRectForTest(
      readBadge,
      10,
      groups.get("vnet")!.labelRect!,
      4,
    )).toBe(false);
  });

  it("keeps automatic badges at the same parent-edge distance used by dragging", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/image-thumbnail-pipeline/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const routes = routeEdges(doc, layoutDocument(doc));

    for (const edge of routes.filter((candidate) => candidate.step !== undefined)) {
      expect(edge.badge, edge.id).toBeDefined();
      expect(edge.badgeT, edge.id).toBeDefined();
      expect(edge.badgeSide, edge.id).toBeDefined();
      expect(edge.badge, edge.id).toEqual(getEdgeBadgePlacement(
        edge.points,
        edge.badgeT,
        edge.badgeSide,
      )?.point);
    }
  });

  it("keeps an Azure queue-trigger badge and label visibly separated", () => {
    const doc = parseDgm(`diagram azure-queue-trigger {
  grammar azure
  flow lr

  azure.subscription subscription "Azure subscription" {
    cloud-agnostic.boundary ingress "API ingress" {
      azure.api-management-services api "API Management"
      azure.function-apps ingest "Ingest function"
    }
    cloud-agnostic.boundary storage "Document storage" {
      azure.storage-accounts blob "Document blob storage"
    }
    cloud-agnostic.boundary messaging "Messaging" {
      azure.azure-service-bus queue "Document queue"
    }
    cloud-agnostic.boundary processing "Document processing" {
      azure.function-apps processor "Process function"
      azure.form-recognizers recognizer "Document Intelligence"
    }
    cloud-agnostic.boundary results "Results storage" {
      azure.azure-cosmos-db metadata "Document metadata"
    }
    azure.application-insights insights "Application Insights"
  }

  api -> ingest { id api_to_ingest step 2 }
  ingest -> blob { id ingest_to_blob step 3 label "store document" }
  ingest -> queue { id ingest_to_queue step 4 label "enqueue job" }
  queue -> processor { id queue_trigger step 5 style dashed label "queue trigger" }
  processor -> blob { id read_blob style dashed label "read document" }
  processor -> recognizer { id analyze step 6 label "analyze" }
  processor -> metadata { id save step 7 label "save results" }
  ingest -> insights { id ingest_telemetry style dashed label "telemetry" }
  processor -> insights { id processor_telemetry style dashed label "telemetry" }
}`);
    const routes = routeEdges(doc, layoutDocument(doc));
    const edge = routes.find(
      (candidate) => candidate.id === "queue_trigger",
    )!;
    const readBlob = routes.find((candidate) => candidate.id === "read_blob")!;

    expect(edge.badge).toBeDefined();
    expect(edge.labelRect).toBeDefined();
    expect(circleIntersectsRectForTest(
      edge.badge!,
      10,
      edge.labelRect!,
      4,
    )).toBe(false);
    expect(distanceToPath(edge.labelPoint!, edge.points)).toBeLessThanOrEqual(52);
    expect(readBlob.labelPoint).toBeDefined();
    expect(distanceToPath(readBlob.labelPoint!, readBlob.points)).toBeLessThanOrEqual(20);
  });

  it("moves a short run's badge aside rather than labelling a neighbouring arrow", () => {
    const doc = parseDgm(`diagram report-generation {
  grammar cloud-agnostic
  flow lr
  cloud-agnostic.actor user "User"
  cloud-agnostic.cloud application_cloud "Application" {
    cloud-agnostic.boundary web_tier "Web application" {
      cloud-agnostic.server web_application "Web application"
    }
    cloud-agnostic.boundary api_tier "API" {
      cloud-agnostic.server api "API"
    }
    cloud-agnostic.boundary async_processing "Async processing" {
      cloud-agnostic.queue report_jobs "Report jobs"
      cloud-agnostic.queue dead_letter_queue "Dead-letter queue" { role secondary }
      cloud-agnostic.function report_worker "Background worker"
    }
    cloud-agnostic.boundary data "Data" {
      cloud-agnostic.database job_database "Job database"
      cloud-agnostic.object-storage report_storage "Report storage"
    }
  }
  user -> web_application { id request_report step 1 label "request report" }
  web_application -> api { id submit_request step 2 label "report request" }
  api -> job_database { id create_job step 3 label "create job record" }
  api -> report_jobs { id enqueue_job step 4 label "enqueue job" }
  report_jobs -> report_worker { id consume_message step 1 label "consume message" }
  report_worker -> report_storage { id save_report step 2 label "save report" }
  report_worker -> job_database { id update_status step 3 label "update job status" }
  report_jobs -> dead_letter_queue { id failed_jobs style dashed label "failed jobs" }
  web_application -> api { id poll_status label "poll status" style dashed }
  api -> web_application { id download_link label "download link" style dashed }
}`);
    const routes = routeEdges(doc, layoutDocument(doc));
    const edge = routes.find((candidate) => candidate.id === "consume_message")!;
    const own = distanceToPath(edge.labelPoint!, edge.points);

    expect(own).toBeLessThanOrEqual(20);
    for (const other of routes.filter((candidate) => candidate !== edge)) {
      expect(distanceToPath(edge.labelPoint!, other.points), other.id).toBeGreaterThan(own);
    }
    expect(circleIntersectsRectForTest(edge.badge!, 10, edge.labelRect!, 4)).toBe(false);
    for (const route of routes.filter((candidate) => candidate.labelPoint)) {
      const label = doc.edges.find((candidate) => candidate.id === route.id)!.label!;
      expect(route.labelPoint, route.id).toEqual(
        getEdgeLabelPlacementOnPath(route.points, label, route.labelT!, route.labelSide!)!.point,
      );
    }
  });

  it("keeps order-flow labels visibly attached to their connectors", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/event-driven-order-fulfillment/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    const groups = layout.groups.map((group) => group.labelRect).filter((rect): rect is NonNullable<typeof rect> => Boolean(rect));

    for (const id of ["authorize_payment", "persist_order"]) {
      const edge = routes.find((candidate) => candidate.id === id)!;
      expect(edge.labelPoint).toBeDefined();
      expect(edge.labelRect).toBeDefined();
      expect(distanceToPath(edge.labelPoint!, edge.points)).toBeLessThanOrEqual(52);
      for (const node of layout.nodes) {
        expect(rectsOverlapForTest(edge.labelRect!, node.icon), `${id} overlaps ${node.id} icon`).toBe(false);
        expect(rectsOverlapForTest(edge.labelRect!, node.label), `${id} overlaps ${node.id} text`).toBe(false);
      }
      for (const header of groups) {
        expect(rectsOverlapForTest(edge.labelRect!, header), `${id} overlaps a group header`).toBe(false);
      }
      if (id === "authorize_payment") {
        const ownDistance = distanceToPath(edge.labelPoint!, edge.points);
        for (const other of routes.filter((candidate) => candidate.id !== id)) {
          expect(distanceToPath(edge.labelPoint!, other.points), `${id} is closer to ${other.id}`)
            .toBeGreaterThan(ownDistance);
        }
      }
    }

    const payment = nodes.get("payment_service")!;
    const paymentLabel = routes.find((candidate) => candidate.id === "authorize_payment")!.labelRect!;
    expect(paymentLabel.x + paymentLabel.w).toBeLessThanOrEqual(payment.icon.x);
    expect(routes.find((candidate) => candidate.id === "reserve_stock")!.points.length).toBeLessThanOrEqual(4);
  });

  it("keeps report-flow labels clear of resource and boundary copy", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/asynchronous-report-generation/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);

    for (const id of ["enqueue_report", "failed_jobs"]) {
      const edge = routes.find((candidate) => candidate.id === id)!;
      expect(edge.labelRect).toBeDefined();
      for (const node of layout.nodes) {
        expect(rectsOverlapForTest(edge.labelRect!, node.icon, 2), `${id} overlaps ${node.id} icon`).toBe(false);
        expect(rectsOverlapForTest(edge.labelRect!, node.label, 2), `${id} overlaps ${node.id} text`).toBe(false);
      }
      for (const group of layout.groups) {
        if (group.labelRect) {
          expect(rectsOverlapForTest(edge.labelRect!, group.labelRect, 2), `${id} overlaps ${group.id} header`).toBe(false);
        }
      }
    }
  });

  it.each([
    ["authorize", true],
    ["authorize payment", true],
    ["authorize payment with a longer audit trail", true],
    ["authorize", false],
    ["authorize payment", false],
    ["authorize payment with a longer audit trail", false],
  ] as const)("keeps a three-way fan-out label owned and deterministic for %s (neighbor labels: %s)", (label, neighborsLabelled) => {
    const secondaryLabel = neighborsLabelled ? ' label "side path"' : "";
    const tertiaryLabel = neighborsLabelled ? ' label "other path"' : "";
    const doc = parseDgm(`diagram synthetic-label-fanout {
  grammar cloud-agnostic
  flow lr
  cloud-agnostic.cloud application "Application" {
    cloud-agnostic.boundary source_boundary "Source" {
      cloud-agnostic.server source "Source"
    }
    cloud-agnostic.boundary target_boundary "Targets" {
      cloud-agnostic.server target_a "Target A"
      cloud-agnostic.server target_b "Target B"
      cloud-agnostic.server target_c "Target C"
    }
  }
  source -> target_b { id primary label "${label}" }
  source -> target_a { id secondary${secondaryLabel} }
  source -> target_c { id tertiary${tertiaryLabel} }
}`);
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);
    const primary = routes.find((edge) => edge.id === "primary")!;
    const otherRoutes = routes.filter((edge) => edge.id !== primary.id);

    expect(primary.labelPoint).toBeDefined();
    expect(primary.labelRect).toBeDefined();
    expect(distanceToPath(primary.labelPoint!, primary.points)).toBeLessThanOrEqual(52);
    expect(distanceToPath(primary.labelPoint!, primary.points)).toBeLessThan(
      Math.min(...otherRoutes.map((edge) => distanceToPath(primary.labelPoint!, edge.points))),
    );
    const center = {
      x: primary.labelRect!.x + primary.labelRect!.w / 2,
      y: primary.labelRect!.y + primary.labelRect!.h / 2,
    };
    expect(distanceToPath(center, primary.points)).toBeLessThan(
      Math.min(...otherRoutes.map((edge) => distanceToPath(center, edge.points))),
    );
    for (const node of layout.nodes) {
      expect(rectsOverlapForTest(primary.labelRect!, node.icon), `primary overlaps ${node.id} icon`).toBe(false);
      expect(rectsOverlapForTest(primary.labelRect!, node.label), `primary overlaps ${node.id} text`).toBe(false);
    }
    for (const group of layout.groups) {
      if (group.labelRect) {
        expect(rectsOverlapForTest(primary.labelRect!, group.labelRect), "primary overlaps a group header").toBe(false);
      }
    }

    const repeated = routeEdges(doc, layout).find((edge) => edge.id === "primary")!;
    expect({ points: repeated.points, labelPoint: repeated.labelPoint, labelRect: repeated.labelRect })
      .toEqual({ points: primary.points, labelPoint: primary.labelPoint, labelRect: primary.labelRect });
  });

  it("keeps cross-boundary labels visibly attached to their connectors", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/aws-high-availability-web-app/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const routes = routeEdges(doc, layoutDocument(doc));
    const edge = routes.find((candidate) => candidate.id === "pull_image_a")!;

    expect(edge.labelPoint).toBeDefined();
    expect(distanceToPath(edge.labelPoint!, edge.points)).toBeLessThanOrEqual(36);
  });

  it("routes the curated Bedrock workflow around extraction cards", () => {
    const doc = parseDgm(readFileSync(
      new URL("../../../../examples/curated/bedrock-claims-processing/diagram.dgm", import.meta.url),
      "utf8",
    ));
    const layout = layoutDocument(doc);
    const route = routeEdges(doc, layout).find((edge) => edge.id === "workflow_to_state")!;
    const protectedNodes = layout.nodes.filter((node) =>
      ["extractor", "fraud_model"].includes(node.id),
    );

    for (let index = 0; index < route.points.length - 1; index++) {
      for (const node of protectedNodes) {
        expect(
          segmentIntersects(route.points[index]!, route.points[index + 1]!, inflate(node.obstacle, 8)),
          `${route.id} segment ${index} intersects ${node.id}`,
        ).toBe(false);
      }
    }
    expect(route.points.length).toBeGreaterThan(2);
  });

  it("places connector labels at an explicit path position and side", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 160, y: 100 },
    ];
    const top = getEdgeLabelPlacementOnPath(points, "request", 0.25, "top");
    const bottom = getEdgeLabelPlacementOnPath(points, "request", 0.75, "bottom");

    expect(top?.t).toBeCloseTo(0.25);
    expect(top?.side).toBe("top");
    expect(top?.point).toEqual({ x: 40, y: 92 });
    expect(bottom?.t).toBeCloseTo(0.75);
    expect(bottom?.side).toBe("bottom");
    expect(bottom?.point).toEqual({ x: 120, y: 120 });
  });

  it("routes explicit ports to their exact visible face offsets", () => {
    const doc = createAsyncDocsFixture();
    const edge = doc.edges.find((candidate) => candidate.id === "e3")!;
    edge.sourcePort = "e";
    edge.targetPort = "w";
    edge.sourcePortOffset = 0.25;
    edge.targetPortOffset = 0.75;

    const layout = layoutDocument(doc);
    const source = layout.nodes.find((node) => node.id === edge.source)!;
    const target = layout.nodes.find((node) => node.id === edge.target)!;
    const route = routeEdges(doc, layout).find((candidate) => candidate.id === edge.id);

    expect(route?.points[0]).toEqual(portPoint(source.icon, "e", 0.25));
    expect(route?.points.at(-1)).toEqual(portPoint(target.icon, "w", 0.75));
  });

  it("rejects a face-only hint that would approach a target from the far side", () => {
    const doc = createEmptyDocument("short-side-routing");
    doc.resources = [
      routingResource("source", "cloud-agnostic.client", "Source"),
      routingResource("target", "azure.sql-database", "Target"),
    ];
    doc.edges = [{
      id: "source-target",
      source: "source",
      target: "target",
      sourcePort: "e",
      targetPort: "w",
      style: "solid",
      kind: "flow",
    }];
    const source = routingNode("source", 500, 100, 96);
    const target = routingNode("target", 100, 100, 96);
    const layout: LayoutResult = {
      nodes: [source, target],
      groups: [],
      edges: [],
      width: 680,
      height: 300,
      symmetries: [],
    };

    const route = routeEdges(doc, layout)[0]!;
    expect(route.points[0]).toEqual(portPoint(source.icon, "w", 0.5));
    expect(route.points.at(-1)).toEqual(portPoint(target.icon, "e", 0.5));
    expect(pathManhattanLength(route.points)).toBeLessThan(500);
  });

  it("goes straight past a facing display label, otherwise attaching away from it", () => {
    const doc = createEmptyDocument("label-clearance");
    doc.resources = [
      routingResource("source", "cloud-agnostic.client", "Source"),
      routingResource("target", "aws.cognito", "Target"),
    ];
    doc.edges = [{
      id: "source-target",
      source: "source",
      target: "target",
      sourcePort: "n",
      targetPort: "s",
      style: "solid",
    }];
    const source = routingNode("source", 60, 240, 100);
    const stacked = routingNode("target", 60, 80, 112);
    const layout: LayoutResult = {
      nodes: [source, stacked],
      groups: [],
      edges: [],
      width: 460,
      height: 400,
      symmetries: [],
    };
    expect(routeEdges(doc, layout)[0]!.points).toEqual([
      portPoint(source.icon, "n", 0.5),
      portPoint(stacked.icon, "s", 0.5),
    ]);

    const target = routingNode("target", 260, 80, 112);
    layout.nodes = [source, target];
    const route = routeEdges(doc, layout)[0]!;
    expect(route.points.at(-1)).not.toEqual(portPoint(target.icon, "s", 0.5));
    expect(route.points.at(-1)!.y).not.toBe(target.icon.y + target.icon.h);

    doc.resources[1]!.label.position = "top";
    target.labelPosition = "top";
    const clearBelow = routeEdges(doc, layout)[0]!;
    expect(clearBelow.points.at(-1)!.y).toBe(target.icon.y + target.icon.h);
  });

  it("keeps automatic dashed telemetry stems clear of a source label unless the line is straight", () => {
    const doc = createEmptyDocument("dashed-source-label-clearance");
    doc.resources = [
      routingResource("app", "azure.app-services", "App Service"),
      routingResource("insights", "azure.application-insights", "Application Insights"),
    ];
    doc.edges = [{
      id: "telemetry",
      source: "app",
      target: "insights",
      style: "dashed",
      kind: "peer",
    }];
    const source = routingNode("app", 120, 60, 104);
    const stacked = routingNode("insights", 120, 260, 104);
    const layout: LayoutResult = {
      nodes: [source, stacked],
      groups: [],
      edges: [],
      width: 560,
      height: 440,
      symmetries: [],
    };
    expect(routeEdges(doc, layout)[0]!.points).toEqual([
      portPoint(source.icon, "s", 0.5),
      portPoint(stacked.icon, "n", 0.5),
    ]);

    layout.nodes = [source, routingNode("insights", 320, 260, 104)];
    const route = routeEdges(doc, layout)[0]!;
    expect(segmentIntersects(route.points[0]!, route.points[1]!, source.label)).toBe(false);
  });

  it.each(["solid", "dashed"] as const)(
    "draws one straight %s connector between stacked icons that share any column",
    (style) => {
      const doc = createEmptyDocument("stacked-straight");
      doc.resources = [
        routingResource("jobs", "aws.simple-queue-service", "Processing jobs"),
        routingResource("dlq", "aws.simple-queue-service", "Dead-letter queue"),
      ];
      doc.edges = [{ id: "failed", source: "jobs", target: "dlq", style, kind: style === "dashed" ? "fail" : "flow" }];
      // Neither icon center lies inside the shared column [130, 148].
      const jobs = routingNode("jobs", 100, 60, 104);
      const dlq = routingNode("dlq", 130, 260, 104);
      const layout: LayoutResult = {
        nodes: [jobs, dlq], groups: [], edges: [], width: 400, height: 440, symmetries: [],
      };

      const [start, end, ...rest] = routeEdges(doc, layout)[0]!.points;
      expect(rest).toEqual([]);
      expect(start!.y).toBe(jobs.icon.y + jobs.icon.h);
      expect(end!.y).toBe(dlq.icon.y);
      expect(start!.x).toBe(end!.x);
      expect(start!.x).toBeGreaterThanOrEqual(dlq.icon.x);
      expect(start!.x).toBeLessThanOrEqual(jobs.icon.x + jobs.icon.w);
    },
  );

  it("enters a stacked dashed target through the face that looks back at its source", () => {
    const doc = createEmptyDocument("stacked-facing-entry");
    doc.resources = [
      routingResource("jobs", "aws.simple-queue-service", "Processing jobs"),
      routingResource("dlq", "aws.simple-queue-service", "Dead-letter queue"),
    ];
    doc.edges = [{ id: "failed", source: "jobs", target: "dlq", style: "dashed", kind: "fail" }];
    const jobs = routingNode("jobs", 100, 60, 104);
    const dlq = routingNode("dlq", 240, 260, 104);
    const layout: LayoutResult = {
      nodes: [jobs, dlq], groups: [], edges: [], width: 440, height: 440, symmetries: [],
    };

    const route = routeEdges(doc, layout)[0]!.points;
    expect(route).toHaveLength(3);
    expectTerminalLegOutward(route, route[0]!, "e", true);
    expectTerminalLegOutward(route, route.at(-1)!, "n", false);
    expect(route[0]!.x).toBe(jobs.icon.x + jobs.icon.w);
    expect(route.at(-1)!.y).toBe(dlq.icon.y);
  });

  it("gives up the straight stacked connector when another icon sits in between", () => {
    const doc = createEmptyDocument("stacked-blocked");
    doc.resources = [
      routingResource("jobs", "aws.simple-queue-service", "Processing jobs"),
      routingResource("worker", "aws.aws-lambda", "Worker"),
      routingResource("dlq", "aws.simple-queue-service", "Dead-letter queue"),
    ];
    doc.edges = [{ id: "failed", source: "jobs", target: "dlq", style: "dashed", kind: "fail" }];
    const blocker = routingNode("worker", 100, 200, 104);
    const layout: LayoutResult = {
      nodes: [routingNode("jobs", 100, 60, 104), blocker, routingNode("dlq", 100, 360, 104)],
      groups: [], edges: [], width: 440, height: 560, symmetries: [],
    };

    const route = routeEdges(doc, layout)[0]!.points;
    expect(route.length).toBeGreaterThan(2);
    for (let index = 0; index < route.length - 1; index++) {
      expect(segmentIntersects(route[index]!, route[index + 1]!, blocker.obstacle)).toBe(false);
    }
  });

  it("preserves an exact authored dashed attachment on a label side", () => {
    const doc = createEmptyDocument("dashed-authored-source-label");
    doc.resources = [
      routingResource("app", "azure.app-services", "App Service"),
      routingResource("insights", "azure.application-insights", "Application Insights"),
    ];
    doc.edges = [{
      id: "telemetry",
      source: "app",
      target: "insights",
      sourcePort: "s",
      sourcePortOffset: 0.25,
      targetPort: "n",
      targetPortOffset: 0.75,
      style: "dashed",
      kind: "peer",
    }];
    const source = routingNode("app", 120, 60, 104);
    const target = routingNode("insights", 120, 260, 104);
    const layout: LayoutResult = {
      nodes: [source, target],
      groups: [],
      edges: [],
      width: 360,
      height: 440,
      symmetries: [],
    };

    const route = routeEdges(doc, layout)[0]!;
    expect(route.points[0]).toEqual(portPoint(source.icon, "s", 0.25));
    expect(route.points.at(-1)).toEqual(portPoint(target.icon, "n", 0.75));
  });

  it("removes tiny alignment jogs between opposing horizontal ports", () => {
    const doc = createEmptyDocument("micro-jog");
    doc.resources = [
      {
        id: "ecs",
        type: "aws.elastic-container-service",
        parent: "subnet",
        label: { service: "ECS", role: "Service" },
        role: "primary",
        props: {},
      },
      {
        id: "fargate",
        type: "aws.aws-fargate",
        parent: "subnet",
        label: { service: "Fargate", role: "Tasks" },
        role: "secondary",
        props: {},
      },
    ];
    doc.groups = [
      { id: "region", kind: "region", label: "Region", children: ["subnet"] },
      {
        id: "subnet",
        kind: "subnet-private",
        parent: "region",
        label: "Private subnet",
        children: ["ecs", "fargate"],
      },
    ];
    doc.edges = [{
      id: "ecs_to_fargate",
      source: "ecs",
      target: "fargate",
      sourcePort: "e",
      targetPort: "w",
      style: "dashed",
      kind: "peer",
    }];

    const route = routeEdges(doc, layoutDocument(doc))[0]!;
    expect(route.points).toHaveLength(2);
    expect(route.points[0]!.y).toBe(route.points[1]!.y);
  });

  it("straightens near-aligned opposing ports across a full routing cell", () => {
    const doc = createEmptyDocument("near-aligned-ports");
    doc.resources = [
      routingResource("source", "aws.simple-storage-service", "Source"),
      routingResource("target", "aws.bedrock", "Target"),
    ];
    doc.edges = [{
      id: "source_to_target",
      source: "source",
      target: "target",
      sourcePort: "e",
      targetPort: "w",
      style: "solid",
      kind: "flow",
    }];
    const layout: LayoutResult = {
      nodes: [
        routingNode("source", 100, 100, 96),
        routingNode("target", 300, 105, 96),
      ],
      groups: [],
      edges: [],
      width: 480,
      height: 260,
      symmetries: [],
    };

    const route = routeEdges(doc, layout)[0]!;
    expect(route.points).toHaveLength(2);
    expect(route.points[0]!.y).toBe(route.points[1]!.y);
  });

  it("previews a new connection without adding it to the document", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const preview = routeConnectionPreview(doc, layout, "client", "api_alb", {
      sourcePort: "e",
      targetPort: "w",
      sourcePortOffset: 0.5,
      targetPortOffset: 0.5,
    });

    expect(preview).toBeTruthy();
    expect(preview!.length).toBeGreaterThan(1);
    expect(doc.edges.some((edge) => edge.source === "client" && edge.target === "api_alb")).toBe(true);
    expect(preview![0]).toEqual(
      portPoint(layout.nodes.find((node) => node.id === "client")!.icon, "e", 0.5),
    );
  });

  it("keeps generated connectors outside resource cards before turning", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);

    for (const route of routes) {
      const source = layout.nodes.find((node) => node.id === route.source);
      const target = layout.nodes.find((node) => node.id === route.target);
      expect(source, `${route.id} source geometry`).toBeDefined();
      expect(target, `${route.id} target geometry`).toBeDefined();
      if (!source || !target) continue;

      const sourceCard = inflate(source.obstacle, 8);
      const targetCard = inflate(target.obstacle, 8);
      if (route.points.length > 2) {
        expect(
          continuesAwayFromIcon(source.icon, route.points[0]!, route.points[1]!),
          `${route.id} leaves through a deliberate source face`,
        ).toBe(true);
        expect(
          continuesAwayFromIcon(target.icon, route.points.at(-1)!, route.points.at(-2)!),
          `${route.id} approaches through a deliberate target face`,
        ).toBe(true);
        expect(
          contains(sourceCard, route.points[1]!),
          `${route.id} turns before clearing its source card`,
        ).toBe(false);
        expect(
          contains(targetCard, route.points.at(-2)!),
          `${route.id} approaches its target from inside the card`,
        ).toBe(false);
      }

      for (let index = 0; index < route.points.length - 1; index++) {
        const a = route.points[index]!;
        const b = route.points[index + 1]!;
        for (const node of layout.nodes) {
          const card = inflate(node.obstacle, 8);
          const isSourceAttachment = node.id === source.id && index === 0;
          const isTargetAttachment = node.id === target.id && index === route.points.length - 2;
          if (isSourceAttachment || isTargetAttachment) continue;
          expect(
            segmentIntersects(a, b, card),
            `${route.id} segment ${index} intersects ${node.id}`,
          ).toBe(false);
        }
      }
    }

    const e3 = routes.find((route) => route.id === "e3");
    const e5 = routes.find((route) => route.id === "e5");
    expect(e3 && e5 ? sharedLength(e3.points, e5.points) : 1).toBe(0);
  });

  it("nudges a safe automatic route clear of a group boundary stroke", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const route = routeEdges(doc, layout).find((edge) => edge.id === "e3")!;
    const group = layout.groups.find((candidate) => candidate.id === "appA")!;

    for (let index = 0; index < route.points.length - 1; index++) {
      expect(
        segmentBoundaryOverlap(
          route.points[index]!,
          route.points[index + 1]!,
          group.bounds,
          4,
        ),
        `e3 segment ${index} follows appA boundary`,
      ).toBe(0);
    }
  });

  it("separates source fan-out stems as well as converging routes", () => {
    const fanoutDoc = createAsyncDocsFixture();
    fanoutDoc.edges.push({
      id: "fanout",
      source: "api_alb",
      target: "apiB",
      style: "solid",
      kind: "flow",
    });
    fanoutDoc.edges.push({
      id: "mixed_style_fanout",
      source: "api_alb",
      target: "apiB",
      style: "dashed",
      kind: "peer",
    });
    const fanoutLayout = layoutDocument(fanoutDoc);
    const fanoutRoutes = routeEdges(fanoutDoc, fanoutLayout);
    const originalBranch = fanoutRoutes.find((edge) => edge.id === "e2")!;
    const addedBranch = fanoutRoutes.find((edge) => edge.id === "fanout")!;
    const mixedStyleBranch = fanoutRoutes.find((edge) => edge.id === "mixed_style_fanout")!;
    expect(sharedLength(originalBranch.points, addedBranch.points)).toBe(0);
    expect(originalBranch.points[0]).not.toEqual(addedBranch.points[0]);
    expect(sharedLength(addedBranch.points, mixedStyleBranch.points)).toBe(0);
    expect(mixedStyleBranch.points[0]).not.toEqual(addedBranch.points[0]);

    const convergenceDoc = createAsyncDocsFixture();
    convergenceDoc.edges.push({
      id: "converge",
      source: "workerA",
      target: "jobs",
      style: "dashed",
      kind: "peer",
    });
    const convergenceLayout = layoutDocument(convergenceDoc);
    const convergenceRoutes = routeEdges(convergenceDoc, convergenceLayout);
    const existingRoute = convergenceRoutes.find((edge) => edge.id === "e3")!;
    const convergingRoute = convergenceRoutes.find((edge) => edge.id === "converge")!;
    expect(sharedLength(existingRoute.points, convergingRoute.points)).toBeLessThanOrEqual(12);
  });

  it("bounds a synthetic fan-out without dropping the best available routes", () => {
    const doc = createEmptyDocument("routing-budget-fanout");
    doc.flow = "lr";
    doc.resources = Array.from({ length: 10 }, (_, index) => ({
      id: `resource${index}`,
      type: "cloud-agnostic.actor",
      label: { service: `Resource ${index}` },
      role: "primary" as const,
      props: {},
    }));
    doc.edges = Array.from({ length: 9 }, (_, index) => ({
      id: `edge${index}`,
      source: "resource0",
      target: `resource${index + 1}`,
      style: "solid" as const,
      kind: "flow" as const,
    }));

    let diagnostics;
    const routes = routeEdges(doc, layoutDocument(doc), {
      maxScorePathCalls: 10,
      maxRouteConflictChecks: 10,
      maxAstarExpansions: 10,
      maxRepairCandidates: 10,
      onDiagnostics: (result) => { diagnostics = result; },
    });

    expect(routes).toHaveLength(doc.edges.length);
    expect(diagnostics?.exhausted).toBe(true);
    expect(diagnostics?.scorePathCalls).toBeLessThanOrEqual(11);
    expect(routes.every((route) => route.points.length >= 2)).toBe(true);

    let unbounded: { exhausted: boolean; scorePathCalls: number } | undefined;
    const pair = { ...doc, resources: doc.resources.slice(0, 2), edges: doc.edges.slice(0, 1) };
    routeEdges(pair, layoutDocument(pair), { onDiagnostics: (result) => { unbounded = result; } });
    expect(unbounded?.exhausted).toBe(false);
    expect(unbounded?.scorePathCalls).toBeGreaterThan(0);
  });

  it("degrades oversized grids while retaining an orthogonal route", () => {
    const doc = createEmptyDocument("oversized-routing-grid");
    doc.resources = [
      routingResource("source", "cloud-agnostic.actor", "Source"),
      routingResource("target", "cloud-agnostic.server", "Target"),
    ];
    doc.edges = [{
      id: "source_target",
      source: "source",
      target: "target",
      style: "solid",
      kind: "flow",
    }];
    const layout: LayoutResult = {
      nodes: [routingNode("source", 0, 0, 48), routingNode("target", 1_000_000, 1_000_000, 48)],
      groups: [],
      edges: [],
      width: 1_000_000,
      height: 1_000_000,
      symmetries: [],
    };

    let diagnostics;
    const route = routeEdges(doc, layout, { onDiagnostics: (result) => { diagnostics = result; } })[0]!;
    expect(diagnostics?.exhausted).toBe(true);
    expect(route.points.length).toBeGreaterThanOrEqual(2);
    expect(route.points.every((point, index, points) => {
      const previous = points[index - 1];
      return !previous || point.x === previous.x || point.y === previous.y;
    })).toBe(true);

    const preview = routeConnectionPreview(doc, layout, "source", "target");
    expect(preview?.length).toBeGreaterThanOrEqual(2);
    expect(preview?.every((point, index, points) => {
      const previous = points[index - 1];
      return !previous || point.x === previous.x || point.y === previous.y;
    })).toBe(true);
  });

  it("does not report grid degradation for an oversized canvas without edges", () => {
    const doc = createEmptyDocument("oversized-empty-routing-grid");
    const layout: LayoutResult = {
      nodes: [], groups: [], edges: [], width: 1_000_000, height: 1_000_000, symmetries: [],
    };
    let diagnostics;
    expect(routeEdges(doc, layout, { onDiagnostics: (result) => { diagnostics = result; } })).toEqual([]);
    expect(diagnostics?.exhausted).toBe(false);
  });

  it("takes the short top approach instead of crossing CloudFront like the example regression", () => {
    const { doc, layout } = gatewayRoutingRegressionLayout(false);
    const routes = routeEdges(doc, layout);
    const cloudfront = routes.find((edge) => edge.id === "cdn_to_api")!;
    const authorizer = routes.find((edge) => edge.id === "api_authorizer")!;
    const gateway = layout.nodes.find((node) => node.id === "gateway")!;

    expect(pathsCross(cloudfront.points, authorizer.points)).toBe(false);
    expect(sharedLength(cloudfront.points, authorizer.points)).toBe(0);
    expect(authorizer.points.at(-1)!.y).toBe(gateway.icon.y);
    expect(pathManhattanLength(authorizer.points)).toBeLessThan(300);
  });

  it("keeps intra-group connectors inside a shared availability zone boundary", () => {
    const doc = parseDgm(`diagram az-routing {
  grammar aws
  flow lr
  aws.cloud aws_cloud "AWS Cloud" {
    aws.az az "Availability Zone" {
      cloud-agnostic.boundary frontend "Frontend services" {
        aws.cloudfront cdn "Web delivery"
      }
      aws.api-gateway gateway
    }
  }
  cdn -> gateway { id cdn_to_api step 2 }
}`);
    const layout = layoutDocument(doc);
    const route = routeEdges(doc, layout).find((edge) => edge.id === "cdn_to_api")!;
    const zone = layout.groups.find((group) => group.id === "az")!;

    for (const point of route.points) {
      expect(contains(zone.bounds, point)).toBe(true);
    }
  });

  it("reselects clean faces after the API Gateway is moved above both sources", () => {
    const { doc, layout } = gatewayRoutingRegressionLayout(true);
    const routes = routeEdges(doc, layout);
    const cloudfront = routes.find((edge) => edge.id === "cdn_to_api")!;
    const authorizer = routes.find((edge) => edge.id === "api_authorizer")!;

    expect(pathsCross(cloudfront.points, authorizer.points)).toBe(false);
    expect(sharedLength(cloudfront.points, authorizer.points)).toBe(0);
    expect(pathManhattanLength(cloudfront.points)).toBeLessThan(520);
    expect(pathManhattanLength(authorizer.points)).toBeLessThan(360);
  });

  it("avoids the same crossing when connector declaration order is reversed", () => {
    const { doc, layout } = gatewayRoutingRegressionLayout(false);
    doc.edges = [doc.edges[0]!, doc.edges[2]!, doc.edges[1]!];
    const routes = routeEdges(doc, layout);
    const cloudfront = routes.find((edge) => edge.id === "cdn_to_api")!;
    const authorizer = routes.find((edge) => edge.id === "api_authorizer")!;

    expect(pathsCross(cloudfront.points, authorizer.points)).toBe(false);
    expect(sharedLength(cloudfront.points, authorizer.points)).toBe(0);
  });

  it("keeps exact dragged port offsets locked while face-only hints remain flexible", () => {
    const { doc, layout } = gatewayRoutingRegressionLayout(false);
    const edge = doc.edges.find((candidate) => candidate.id === "api_authorizer")!;
    edge.sourcePortOffset = 0.25;
    edge.targetPortOffset = 0.75;

    const route = routeEdges(doc, layout).find((candidate) => candidate.id === edge.id)!;
    const source = layout.nodes.find((node) => node.id === edge.source)!;
    const target = layout.nodes.find((node) => node.id === edge.target)!;
    expect(route.points[0]).toEqual(portPoint(source.icon, "e", 0.25));
    expect(route.points.at(-1)).toEqual(portPoint(target.icon, "s", 0.75));
  });

  it("keeps manual breakpoints orthogonal and preserves the authored breaks", () => {
    const manual = normalizeOrthogonalRoute([
      { x: 100, y: 100 },
      { x: 260, y: 148 },
      { x: 260, y: 320 },
      { x: 420, y: 320 },
    ]);

    expect(manual).toEqual([
      { x: 100, y: 100 },
      { x: 260, y: 100 },
      { x: 260, y: 148 },
      { x: 260, y: 320 },
      { x: 420, y: 320 },
    ]);
    expect(manual.slice(0, -1).every((point, index) => {
      const next = manual[index + 1]!;
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
  });

  it("canonicalizes collapsed edit points without changing the route endpoints", () => {
    expect(eraseOrthogonalRouteLoops([
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 64 },
      { x: 96, y: 64 },
      { x: 144, y: 64 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 64 },
      { x: 144, y: 64 },
    ]);
  });

  it("erases connector loops and backtracking spurs instead of rendering dead ends", () => {
    expect(eraseOrthogonalRouteLoops([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 80 },
      { x: 40, y: 80 },
      { x: 40, y: 144 },
      { x: 40, y: 80 },
      { x: 200, y: 80 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 80 },
      { x: 200, y: 80 },
    ]);

    const loop = eraseOrthogonalRouteLoops([
      { x: 0, y: 0 },
      { x: 160, y: 0 },
      { x: 160, y: 120 },
      { x: 48, y: 120 },
      { x: 48, y: 48 },
      { x: 200, y: 48 },
    ]);
    expect(loop).toEqual([
      { x: 0, y: 0 },
      { x: 160, y: 0 },
      { x: 160, y: 48 },
      { x: 200, y: 48 },
    ]);
  });

  it("merges fractional port artifacts but keeps deliberate straight breaks", () => {
    expect(collapseOrthogonalRouteArtifacts([
      { x: 168, y: 312 },
      { x: 381, y: 312 },
      { x: 381.25, y: 312 },
      { x: 381.25, y: 226 },
    ])).toEqual([
      { x: 168, y: 312 },
      { x: 381.25, y: 312 },
      { x: 381.25, y: 226 },
    ]);
    expect(collapseOrthogonalRouteArtifacts([
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 96, y: 0 },
    ])).toHaveLength(3);
  });

  it("normalizes pinned routes before rendering them", () => {
    const doc = createAsyncDocsFixture();
    const manual = [
      { x: 404, y: 400 },
      { x: 720, y: 520 },
      { x: 885, y: 128 },
    ];
    doc.views[0]!.routes.e3 = { pin: true, points: manual };

    const route = routeEdges(doc, layoutDocument(doc)).find((edge) => edge.id === "e3");
    const source = layoutDocument(doc).nodes.find((node) => node.id === "apiA")!;
    const target = layoutDocument(doc).nodes.find((node) => node.id === "jobs")!;
    const snapped = [
      nearestPortAnchor(source.icon, manual[0]!).point,
      manual[1]!,
      nearestPortAnchor(target.icon, manual.at(-1)!).point,
    ];
    expect(route?.points[0]).toEqual(snapped[0]);
    expect(route?.points.at(-1)).toEqual(snapped.at(-1));
    expect(route?.points.slice(0, -1).every((point, index) => {
      const next = route.points[index + 1]!;
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
    expectTerminalLegOutward(
      route!.points,
      route!.points[0]!,
      nearestPortAnchor(source.icon, route!.points[0]!).side,
      true,
    );
    expectTerminalLegOutward(
      route!.points,
      route!.points.at(-1)!,
      nearestPortAnchor(target.icon, route!.points.at(-1)!).side,
      false,
    );
  });

  it("preserves a manual endpoint already on the icon perimeter and reanchors it only after movement", () => {
    const doc = createEmptyDocument("manual-endpoint-stability");
    doc.resources = [routingResource("source", "cloud-agnostic.server", "Source"), routingResource("target", "cloud-agnostic.server", "Target")];
    doc.edges = [{ id: "connection", source: "source", target: "target", style: "solid" }];
    const points = [{ x: 68, y: 46 }, { x: 220, y: 46 }];
    doc.views[0]!.routes.connection = { pin: true, mode: "manual", points };
    const layout: LayoutResult = {
      nodes: [routingNode("source", 20, 20, 80), routingNode("target", 220, 22, 80)],
      groups: [], edges: [], width: 340, height: 160, symmetries: [],
    };
    expect(routeEdges(doc, layout)[0]!.points).toEqual(points);
    const moved = { ...layout, nodes: [routingNode("source", 36, 28, 80), layout.nodes[1]!] };
    const movedPoints = routeEdges(doc, moved)[0]!.points;
    expect(movedPoints[0]).toEqual(nearestPortAnchor(moved.nodes[0]!.icon, points[0]!).point);
    expect(movedPoints.at(-1)).toEqual(points.at(-1));
  });

  it.each(["n", "e", "s", "w"] as const)(
    "leaves and approaches every terminal face outward (%s)",
    (side) => {
      const sourceIcon = { x: 100, y: 100, w: 40, h: 40 };
      const targetIcon = { x: 240, y: 100, w: 40, h: 40 };
      const source = portPoint(sourceIcon, side, 0.5);
      const target = portPoint(targetIcon, side, 0.5);
      const inward = (point: { x: number; y: number }) => {
        switch (side) {
          case "n": return { x: point.x, y: point.y + 32 };
          case "e": return { x: point.x - 32, y: point.y };
          case "s": return { x: point.x, y: point.y - 32 };
          case "w": return { x: point.x + 32, y: point.y };
        }
      };
      const route = anchorRouteEndpoints(
        [source, inward(source), inward(target), target],
        sourceIcon,
        targetIcon,
      );
      expect(route[0]).toEqual(source);
      expect(route.at(-1)).toEqual(target);
      expectTerminalLegOutward(route, source, side, true);
      expectTerminalLegOutward(route, target, side, false);
      expectNoImmediateReversals(route);
      expect(anchorRouteEndpoints(route, sourceIcon, targetIcon)).toEqual(route);
      expect(route.slice(0, -1).every((point, index) => {
        const next = route[index + 1]!;
        return point.x === next.x || point.y === next.y;
      })).toBe(true);
    },
  );

  it("repairs a west terminal that approaches from the inside with a visible stem", () => {
    const sourceIcon = { x: 100, y: 100, w: 40, h: 40 };
    const targetIcon = { x: 240, y: 100, w: 40, h: 40 };
    const source = portPoint(sourceIcon, "w", 0.5);
    const target = portPoint(targetIcon, "e", 0.5);
    const route = anchorRouteEndpoints([
      source,
      { x: source.x + 48, y: source.y },
      { x: target.x + 32, y: target.y },
      target,
    ], sourceIcon, targetIcon);

    expectTerminalLegOutward(route, source, "w", true);
    expect(route[1]!.x).toBe(source.x - 16);
    expect(route[1]!.y).toBe(source.y);
    expectTerminalLegOutward(route, target, "e", false);
    expectNoImmediateReversals(route);
    expect(anchorRouteEndpoints(route, sourceIcon, targetIcon)).toEqual(route);
    expect(route.slice(0, -1).every((point, index) => {
      const next = route[index + 1]!;
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
  });

  it("reattaches detached endpoints while keeping a valid perimeter attachment exact", () => {
    const sourceIcon = { x: 100, y: 100, w: 40, h: 40 };
    const targetIcon = { x: 240, y: 100, w: 40, h: 40 };
    const source = portPoint(sourceIcon, "e", 0.25);
    const target = portPoint(targetIcon, "w", 0.75);
    const route = anchorRouteEndpoints([
      { x: source.x + 8, y: source.y },
      { x: 180, y: source.y },
      { x: 220, y: target.y },
      target,
    ], sourceIcon, targetIcon);
    expect(route[0]).toEqual(source);
    expect(route.at(-1)).toEqual(target);
    expect(anchorRouteEndpoints(route, sourceIcon, targetIcon)).toEqual(route);
  });

  it("keeps terminal repairs idempotent across face pairs and body bends", () => {
    const sourceIcon = { x: 100, y: 100, w: 40, h: 40 };
    const targetIcon = { x: 240, y: 200, w: 40, h: 40 };
    const sides = ["n", "e", "s", "w"] as const;
    for (const sourceSide of sides) {
      for (const targetSide of sides) {
        const source = portPoint(sourceIcon, sourceSide, 0.5);
        const target = portPoint(targetIcon, targetSide, 0.5);
        for (let x = 60; x <= 300; x += 40) {
          for (let y = 60; y <= 280; y += 40) {
            const route = anchorRouteEndpoints(
              [source, { x, y }, target],
              sourceIcon,
              targetIcon,
            );
            expect(anchorRouteEndpoints(route, sourceIcon, targetIcon)).toEqual(route);
            expectTerminalLegOutward(route, source, sourceSide, true);
            expectTerminalLegOutward(route, target, targetSide, false);
            expect(reversalCount(route)).toBeLessThanOrEqual(reversalCount(
              normalizeOrthogonalRoute([source, { x, y }, target]),
            ));
          }
        }
      }
    }
  });
});

function expectTerminalLegOutward(
  route: Array<{ x: number; y: number }>,
  endpoint: { x: number; y: number },
  side: "n" | "e" | "s" | "w",
  source: boolean,
): void {
  const neighbor = source ? route[1]! : route.at(-2)!;
  const delta = { x: neighbor.x - endpoint.x, y: neighbor.y - endpoint.y };
  const sign = side === "e" ? [1, 0] : side === "w" ? [-1, 0] : side === "s" ? [0, 1] : [0, -1];
  expect(delta.x * sign[0] + delta.y * sign[1]).toBeGreaterThan(0);
  expect(delta.x * sign[1] - delta.y * sign[0]).toBe(0);
}

function expectNoImmediateReversals(route: Array<{ x: number; y: number }>): void {
  for (let index = 1; index < route.length - 1; index++) {
    const before = route[index - 1]!;
    const current = route[index]!;
    const after = route[index + 1]!;
    const horizontal = before.y === current.y && current.y === after.y;
    const vertical = before.x === current.x && current.x === after.x;
    if (horizontal) {
      expect((current.x - before.x) * (after.x - current.x)).toBeGreaterThanOrEqual(0);
    }
    if (vertical) {
      expect((current.y - before.y) * (after.y - current.y)).toBeGreaterThanOrEqual(0);
    }
  }
}

function reversalCount(route: Array<{ x: number; y: number }>): number {
  let count = 0;
  for (let index = 1; index < route.length - 1; index++) {
    const before = route[index - 1]!;
    const current = route[index]!;
    const after = route[index + 1]!;
    if (
      before.y === current.y && current.y === after.y &&
      (current.x - before.x) * (after.x - current.x) < 0
    ) count++;
    if (
      before.x === current.x && current.x === after.x &&
      (current.y - before.y) * (after.y - current.y) < 0
    ) count++;
  }
  return count;
}

function gatewayRoutingRegressionLayout(movedGateway: boolean): {
  doc: DiagramDocument;
  layout: LayoutResult;
} {
  const doc = createEmptyDocument(movedGateway ? "gateway-moved" : "gateway-default");
  doc.resources = [
    routingResource("identity", "aws.cognito", "Cognito"),
    routingResource("cdn", "aws.cloudfront", "CloudFront"),
    routingResource("gateway", "aws.api-gateway", "API Gateway"),
  ];
  doc.edges = [
    {
      id: "identity_to_cdn",
      source: "identity",
      target: "cdn",
      sourcePort: "s",
      targetPort: "n",
      style: "solid",
      kind: "flow",
    },
    {
      id: "cdn_to_api",
      source: "cdn",
      target: "gateway",
      sourcePort: "e",
      targetPort: "w",
      style: "solid",
      kind: "flow",
    },
    {
      id: "api_authorizer",
      source: "identity",
      target: "gateway",
      sourcePort: "e",
      targetPort: "s",
      label: "JWT authorizer",
      style: "dashed",
      kind: "peer",
    },
  ];

  const nodes = movedGateway
    ? [
        routingNode("identity", 60, 100, 126),
        routingNode("cdn", 60, 300, 92),
        routingNode("gateway", 340, 40, 92),
      ]
    : [
        routingNode("identity", 60, 80, 126),
        routingNode("cdn", 60, 260, 92),
        routingNode("gateway", 280, 170, 92),
      ];
  return {
    doc,
    layout: { nodes, groups: [], edges: [], width: 560, height: 520, symmetries: [] },
  };
}

function routingResource(id: string, type: string, service: string) {
  return {
    id,
    type,
    label: { service },
    role: "primary" as const,
    props: {},
  };
}

function routingNode(id: string, x: number, y: number, obstacleHeight: number): NodeGeom {
  return {
    id,
    type: "resource",
    icon: { x, y, w: 48, h: 48 },
    label: { x: x - 20, y: y + 52, w: 88, h: obstacleHeight - 56 },
    obstacle: { x: x - 28, y, w: 104, h: obstacleHeight },
    role: "primary",
    resourceType: id,
    serviceLabel: id,
  };
}

function inflate(rect: { x: number; y: number; w: number; h: number }, pad: number) {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

function contains(rect: { x: number; y: number; w: number; h: number }, point: { x: number; y: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function continuesAwayFromIcon(
  icon: { x: number; y: number; w: number; h: number },
  port: { x: number; y: number },
  outside: { x: number; y: number },
) {
  if (port.x === icon.x) return outside.x < port.x && outside.y === port.y;
  if (port.x === icon.x + icon.w) return outside.x > port.x && outside.y === port.y;
  if (port.y === icon.y) return outside.y < port.y && outside.x === port.x;
  if (port.y === icon.y + icon.h) return outside.y > port.y && outside.x === port.x;
  return false;
}

function segmentIntersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
) {
  if (a.x === b.x) {
    return a.x >= rect.x && a.x <= rect.x + rect.w
      && Math.max(a.y, b.y) >= rect.y
      && Math.min(a.y, b.y) <= rect.y + rect.h;
  }
  if (a.y === b.y) {
    return a.y >= rect.y && a.y <= rect.y + rect.h
      && Math.max(a.x, b.x) >= rect.x
      && Math.min(a.x, b.x) <= rect.x + rect.w;
  }
  return true;
}

function sharedLength(
  first: Array<{ x: number; y: number }>,
  second: Array<{ x: number; y: number }>,
) {
  let total = 0;
  for (let i = 0; i < first.length - 1; i++) {
    const a = first[i]!;
    const b = first[i + 1]!;
    for (let j = 0; j < second.length - 1; j++) {
      const c = second[j]!;
      const d = second[j + 1]!;
      if (a.x === b.x && c.x === d.x && a.x === c.x) {
        total += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
          - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
      } else if (a.y === b.y && c.y === d.y && a.y === c.y) {
        total += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
          - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
      }
    }
  }
  return total;
}

function segmentBoundaryOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  bounds: { x: number; y: number; w: number; h: number },
  clearance: number,
) {
  if (a.x === b.x) {
    const gap = Math.min(
      Math.abs(a.x - bounds.x),
      Math.abs(a.x - (bounds.x + bounds.w)),
    );
    return gap < clearance
      ? Math.max(
          0,
          Math.min(Math.max(a.y, b.y), bounds.y + bounds.h) -
            Math.max(Math.min(a.y, b.y), bounds.y),
        )
      : 0;
  }
  if (a.y === b.y) {
    const gap = Math.min(
      Math.abs(a.y - bounds.y),
      Math.abs(a.y - (bounds.y + bounds.h)),
    );
    return gap < clearance
      ? Math.max(
          0,
          Math.min(Math.max(a.x, b.x), bounds.x + bounds.w) -
            Math.max(Math.min(a.x, b.x), bounds.x),
        )
      : 0;
  }
  return 0;
}

function distanceToPath(
  point: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
) {
  let distance = Infinity;
  for (let index = 0; index < path.length - 1; index++) {
    const a = path[index]!;
    const b = path[index + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    distance = Math.min(
      distance,
      Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)),
    );
  }
  return distance;
}

function circleIntersectsRectForTest(
  center: { x: number; y: number },
  radius: number,
  rect: { x: number; y: number; w: number; h: number },
  margin: number,
) {
  const x = Math.max(rect.x, Math.min(center.x, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(center.y, rect.y + rect.h));
  return Math.hypot(center.x - x, center.y - y) < radius + margin;
}

function rectsOverlapForTest(
  first: { x: number; y: number; w: number; h: number },
  second: { x: number; y: number; w: number; h: number },
  margin = 0,
) {
  return !(
    first.x + first.w + margin <= second.x ||
    second.x + second.w + margin <= first.x ||
    first.y + first.h + margin <= second.y ||
    second.y + second.h + margin <= first.y
  );
}

function pathsCross(
  first: Array<{ x: number; y: number }>,
  second: Array<{ x: number; y: number }>,
) {
  for (let i = 0; i < first.length - 1; i++) {
    for (let j = 0; j < second.length - 1; j++) {
      if (segmentsCross(first[i]!, first[i + 1]!, second[j]!, second[j + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsCross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
) {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical === secondVertical) return false;
  const verticalA = firstVertical ? a : c;
  const verticalB = firstVertical ? b : d;
  const horizontalA = firstVertical ? c : a;
  const horizontalB = firstVertical ? d : b;
  return horizontalA.y > Math.min(verticalA.y, verticalB.y) &&
    horizontalA.y < Math.max(verticalA.y, verticalB.y) &&
    verticalA.x > Math.min(horizontalA.x, horizontalB.x) &&
    verticalA.x < Math.max(horizontalA.x, horizontalB.x);
}

function pathManhattanLength(points: Array<{ x: number; y: number }>) {
  return points.slice(0, -1).reduce((total, point, index) => {
    const next = points[index + 1]!;
    return total + Math.abs(point.x - next.x) + Math.abs(point.y - next.y);
  }, 0);
}
