import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "../core/index.js";
import type { DiagramDocument, Resource } from "../core/index.js";
import { snap } from "../grammar-aws/index.js";
import { layoutDocument } from "./layout.js";
import { findDiagramRoots, isEmptyRootBoundary, orderRootsForFlow } from "./roots.js";

function resource(id: string, parent?: string): Resource {
  return {
    id,
    type: "aws.lambda",
    parent,
    label: { service: id },
    role: "primary",
    props: {},
  };
}

function logicalGroupDocument(): DiagramDocument {
  const doc = createEmptyDocument("logical-group-layout");
  doc.resources = [
    resource("source"),
    resource("first", "services"),
    resource("second", "services"),
    resource("third", "services"),
  ];
  doc.groups = [{
    id: "services",
    kind: "logical",
    label: "Services",
    children: ["first", "second", "third"],
  }];
  return doc;
}

describe("logical group layout", () => {
  it("keeps authored group bounds after pinned-child collision repair", () => {
    const doc = logicalGroupDocument();
    const view = doc.views[0]!;
    view.places.services = {
      x: 104,
      y: 88,
      w: 216,
      h: 128,
      pin: true,
      manual: true,
    };
    for (const id of ["first", "second", "third"]) {
      view.places[id] = { x: 160, y: 176, pin: true, manual: true };
    }

    const group = layoutDocument(doc).groups.find((candidate) => candidate.id === "services")!;

    expect(group.bounds).toMatchObject({ x: 104, y: 88, w: 216, h: 128 });
  });

  it("auto-fits groups when authored dimensions are absent", () => {
    const doc = logicalGroupDocument();
    const group = layoutDocument(doc).groups.find((candidate) => candidate.id === "services")!;

    expect(doc.views[0]!.places.services).toBeUndefined();
    expect(group.bounds.w).toBeGreaterThan(100);
    expect(group.bounds.h).toBeGreaterThan(40);
  });

  it("keeps descendants fixed when authored group bounds move", () => {
    const doc = createEmptyDocument("manual-boundary-resize");
    doc.resources = [
      resource("direct", "services"),
      resource("nested-resource", "nested"),
    ];
    doc.groups = [
      {
        id: "services",
        kind: "logical",
        label: "Services",
        children: ["direct", "nested"],
      },
      {
        id: "nested",
        kind: "logical",
        label: "Nested",
        parent: "services",
        children: ["nested-resource"],
      },
    ];

    const before = layoutDocument(doc);
    const beforeGroup = before.groups.find((group) => group.id === "services")!;
    const beforeNested = before.groups.find((group) => group.id === "nested")!;
    const beforeNodes = new Map(
      before.nodes.map((node) => [node.id, { ...node.obstacle }]),
    );
    const place = doc.views[0]!.places.services = {
      x: beforeGroup.bounds.x + 32,
      y: beforeGroup.bounds.y + 24,
      w: beforeGroup.bounds.w + 64,
      h: beforeGroup.bounds.h + 48,
      pin: true,
      manual: true,
    };

    const after = layoutDocument(doc);
    const afterGroup = after.groups.find((group) => group.id === "services")!;
    const afterNested = after.groups.find((group) => group.id === "nested")!;

    expect(afterGroup.bounds).toMatchObject({
      x: snap(place.x!),
      y: snap(place.y!),
      w: Math.max(80, snap(place.w!)),
      h: Math.max(48, snap(place.h!)),
    });
    expect(afterNested.bounds).toEqual(beforeNested.bounds);
    for (const [id, obstacle] of beforeNodes) {
      expect(after.nodes.find((node) => node.id === id)!.obstacle).toEqual(obstacle);
    }
  });

  it("stacks parallel siblings fed by the same external source", () => {
    const doc = logicalGroupDocument();
    doc.edges = ["first", "second", "third"].map((target, index) => ({
      id: `fanout-${index}`,
      source: "source",
      target,
      style: "dashed",
      kind: "flow",
    }));

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.obstacle;
    const second = nodes.get("second")!.obstacle;
    const third = nodes.get("third")!.obstacle;
    const centerX = (rect: typeof first) => rect.x + rect.w / 2;

    expect(centerX(first)).toBe(centerX(second));
    expect(centerX(second)).toBe(centerX(third));
    expect(first.y).toBeLessThan(second.y);
    expect(second.y).toBeLessThan(third.y);
  });

  it("keeps a genuine child-to-child flow horizontal", () => {
    const doc = logicalGroupDocument();
    doc.edges = [
      { id: "first-second", source: "first", target: "second", style: "solid", kind: "flow" },
      { id: "second-third", source: "second", target: "third", style: "solid", kind: "flow" },
    ];

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.obstacle;
    const second = nodes.get("second")!.obstacle;
    const third = nodes.get("third")!.obstacle;

    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
    expect(first.y).toBe(second.y);
    expect(second.y).toBe(third.y);
  });

  it("reserves a readable run for labels between adjacent resources", () => {
    const doc = logicalGroupDocument();
    doc.edges = [{
      id: "first-second",
      source: "first",
      target: "second",
      label: "static content",
      style: "solid",
      kind: "flow",
    }];

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.icon;
    const second = nodes.get("second")!.icon;
    const visibleRun = second.x - (first.x + first.w);
    const labelWidth = "static content".length * 11 * 0.55;

    expect(visibleRun).toBeGreaterThanOrEqual(labelWidth + 16);
  });

  it("keeps explicit external peer alternatives horizontal", () => {
    const doc = logicalGroupDocument();
    doc.edges = ["first", "second", "third"].map((target, index) => ({
      id: `alternative-${index}`,
      source: "source",
      target,
      style: "dashed",
      kind: "peer",
    }));

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.obstacle;
    const second = nodes.get("second")!.obstacle;
    const third = nodes.get("third")!.obstacle;

    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
    expect(first.y).toBe(second.y);
    expect(second.y).toBe(third.y);
  });

  it("gives long subnet headers enough width for the full label", () => {
    const doc = createEmptyDocument("long-subnet-label");
    doc.resources = [resource("interface", "integration")];
    doc.groups = [{
      id: "integration",
      kind: "subnet",
      type: "azure.subnet",
      label: "App Service integration subnet",
      children: ["interface"],
    }];

    const integration = layoutDocument(doc).groups.find((group) => group.id === "integration")!;
    expect(integration.labelRect!.x + integration.labelRect!.w).toBeLessThanOrEqual(
      integration.bounds.x + integration.bounds.w,
    );
  });

  it("reserves decorated runs across mixed nested group kinds", () => {
    const doc = createEmptyDocument("mixed-nested-decorated-gap");
    doc.flow = "lr";
    doc.resources = [resource("left", "left_boundary"), resource("right", "right_boundary")];
    doc.groups = [
      {
        id: "cloud",
        kind: "cloud",
        label: "Cloud",
        children: ["left_boundary", "right_boundary"],
      },
      {
        id: "left_boundary",
        kind: "logical",
        label: "Left boundary",
        parent: "cloud",
        children: ["left"],
      },
      {
        id: "right_boundary",
        kind: "region",
        label: "Right region",
        parent: "cloud",
        children: ["right"],
      },
    ];
    doc.edges = [{
      id: "mixed-decorated-edge",
      source: "left",
      target: "right",
      label: "mixed nested route",
      step: 1,
      style: "solid",
      kind: "flow",
    }];

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const left = nodes.get("left")!.icon;
    const right = nodes.get("right")!.icon;
    const requiredRun = "mixed nested route".length * 11 * 0.55 + 36 + 16;

    expect(right.x - (left.x + left.w)).toBeGreaterThanOrEqual(requiredRun);
  });

  it("places Azure application boundaries before their private endpoint bank", () => {
    const doc = createEmptyDocument("azure-vnet-order");
    doc.resources = [
      resource("app", "application"),
      resource("redis_endpoint", "vnet"),
      resource("sql_endpoint", "vnet"),
    ];
    doc.groups = [
      {
        id: "vnet",
        kind: "vpc",
        type: "azure.vnet",
        label: "Virtual network",
        children: ["application", "redis_endpoint", "sql_endpoint"],
      },
      {
        id: "application",
        kind: "logical",
        label: "Application tier",
        parent: "vnet",
        children: ["app"],
      },
    ];

    const layout = layoutDocument(doc);
    const application = layout.groups.find((group) => group.id === "application")!;
    const redis = layout.nodes.find((node) => node.id === "redis_endpoint")!;
    const sql = layout.nodes.find((node) => node.id === "sql_endpoint")!;

    expect(application.bounds.x + application.bounds.w).toBeLessThan(redis.obstacle.x);
    expect(redis.obstacle.x).toBe(sql.obstacle.x);
    expect(redis.obstacle.y).toBeLessThan(sql.obstacle.y);
  });

  it("places dashed observability sinks below the primary logical flow", () => {
    const doc = createEmptyDocument("supporting-sink-layout");
    doc.resources = [
      resource("service", "architecture"),
      resource("database", "architecture"),
      resource("monitor", "architecture"),
    ];
    doc.groups = [{
      id: "architecture",
      kind: "logical",
      label: "Architecture",
      children: ["service", "database", "monitor"],
    }];
    doc.edges = [
      { id: "data", source: "service", target: "database", style: "solid", kind: "flow" },
      { id: "service-metrics", source: "service", target: "monitor", style: "dashed", kind: "peer" },
      { id: "database-metrics", source: "database", target: "monitor", style: "dashed", kind: "peer" },
    ];

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    expect(nodes.get("service")!.obstacle.x).toBeLessThan(nodes.get("database")!.obstacle.x);
    expect(nodes.get("monitor")!.obstacle.y).toBeGreaterThan(nodes.get("database")!.obstacle.y);
  });

  it("keeps sequential boundaries in a left-to-right region row", () => {
    const doc = createEmptyDocument("azure-region-pipeline");
    doc.grammar = "azure";
    doc.flow = "lr";
    const stages = ["api", "storage", "queue", "processing", "data"];
    doc.resources = stages.map((id) => ({
      ...resource(`${id}_service`, id),
      type: "azure.function-apps",
    }));
    doc.groups = [
      {
        id: "region",
        kind: "region",
        type: "azure.region",
        label: "Azure region",
        children: stages,
      },
      ...stages.map((id) => ({
        id,
        kind: "logical" as const,
        type: "cloud-agnostic.boundary",
        parent: "region",
        label: id,
        children: [`${id}_service`],
      })),
    ];
    doc.edges = [
      { id: "api-storage", source: "api_service", target: "storage_service", style: "solid", kind: "flow" },
      { id: "api-queue", source: "api_service", target: "queue_service", style: "solid", kind: "flow" },
      { id: "queue-processing", source: "queue_service", target: "processing_service", style: "solid", kind: "flow" },
      { id: "processing-data", source: "processing_service", target: "data_service", style: "solid", kind: "flow" },
    ];

    const layout = layoutDocument(doc);
    const groups = new Map(layout.groups.map((group) => [group.id, group]));
    const centersY = stages.map((id) => {
      const bounds = groups.get(id)!.bounds;
      return bounds.y + bounds.h / 2;
    });

    for (let index = 1; index < stages.length; index++) {
      expect(groups.get(stages[index - 1]!)!.bounds.x).toBeLessThan(
        groups.get(stages[index]!)!.bounds.x,
      );
    }
    expect(new Set(centersY)).toHaveLength(1);
    expect(groups.get("region")!.bounds.w).toBeGreaterThan(groups.get("region")!.bounds.h);
  });

  it("keeps parallel same-level boundaries vertically stacked in a region", () => {
    const doc = createEmptyDocument("azure-region-parallel");
    doc.grammar = "azure";
    doc.flow = "lr";
    doc.resources = [
      resource("source"),
      ...["first", "second", "third"].map((id) => ({
        ...resource(`${id}_service`, id),
        type: "azure.function-apps",
      })),
    ];
    doc.groups = [
      {
        id: "region",
        kind: "region",
        type: "azure.region",
        label: "Azure region",
        children: ["first", "second", "third"],
      },
      ...["first", "second", "third"].map((id) => ({
        id,
        kind: "logical" as const,
        type: "cloud-agnostic.boundary",
        parent: "region",
        label: id,
        children: [`${id}_service`],
      })),
    ];
    doc.edges = ["first", "second", "third"].map((id) => ({
      id: `source-${id}`,
      source: "source",
      target: `${id}_service`,
      style: "solid" as const,
      kind: "flow" as const,
    }));

    const groups = new Map(layoutDocument(doc).groups.map((group) => [group.id, group]));
    const first = groups.get("first")!.bounds;
    const second = groups.get("second")!.bounds;
    const third = groups.get("third")!.bounds;
    const centerX = (bounds: typeof first) => bounds.x + bounds.w / 2;

    expect(centerX(first)).toBe(centerX(second));
    expect(centerX(second)).toBe(centerX(third));
    expect(first.y).toBeLessThan(second.y);
    expect(second.y).toBeLessThan(third.y);
  });

  it("separates a GCP primary data path from dashed-only support boundaries", () => {
    const doc = createEmptyDocument("gcp-analytics-region");
    doc.grammar = "gcp";
    doc.flow = "lr";
    const primary = ["ingestion", "processing", "analytics", "visualization"];
    const allGroups = [...primary, "support"];
    doc.resources = allGroups.map((id) => ({
      ...resource(`${id}_service`, id),
      type: id === "analytics" ? "gcp.bigquery" : "gcp.dataflow",
    }));
    doc.groups = [
      {
        id: "region",
        kind: "region",
        type: "gcp.region",
        label: "GCP region",
        children: allGroups,
      },
      ...allGroups.map((id) => ({
        id,
        kind: "logical" as const,
        type: "cloud-agnostic.boundary",
        parent: "region",
        label: id,
        children: [`${id}_service`],
      })),
    ];
    doc.edges = [
      { id: "ingest-process", source: "ingestion_service", target: "processing_service", style: "solid", kind: "flow" },
      { id: "process-store", source: "processing_service", target: "analytics_service", style: "solid", kind: "flow" },
      { id: "store-view", source: "analytics_service", target: "visualization_service", style: "solid", kind: "flow" },
      { id: "iam", source: "support_service", target: "processing_service", style: "dashed", kind: "peer" },
      { id: "metrics", source: "analytics_service", target: "support_service", style: "dashed", kind: "peer" },
    ];

    const groups = new Map(layoutDocument(doc).groups.map((group) => [group.id, group]));
    for (let index = 1; index < primary.length; index++) {
      expect(groups.get(primary[index - 1]!)!.bounds.x).toBeLessThan(
        groups.get(primary[index]!)!.bounds.x,
      );
    }
    const primaryBottom = Math.max(
      ...primary.map((id) => {
        const bounds = groups.get(id)!.bounds;
        return bounds.y + bounds.h;
      }),
    );
    expect(groups.get("support")!.bounds.y).toBeGreaterThan(primaryBottom);
    expect(groups.get("region")!.bounds.w).toBeGreaterThan(groups.get("region")!.bounds.h);
  });
});

describe("diagram root ordering", () => {
  it("orders mixed architecture roots by flow instead of entity type", () => {
    const doc = createEmptyDocument("mixed-roots");
    doc.flow = "lr";
    doc.resources = [
      resource("cdn", "frontend"),
      resource("gateway"),
      resource("web_client"),
    ];
    doc.groups = [
      {
        id: "frontend",
        kind: "logical",
        label: "Frontend",
        children: ["cdn"],
      },
      {
        id: "empty_cloud",
        kind: "cloud",
        type: "aws.cloud",
        label: "AWS Cloud",
        children: [],
      },
    ];
    doc.edges = [
      { id: "client_to_cdn", source: "web_client", target: "cdn", style: "solid", kind: "flow" },
      { id: "cdn_to_gateway", source: "cdn", target: "gateway", style: "solid", kind: "flow" },
    ];
    const view = doc.views[0]!;
    view.places.web_client = { x: 40, y: 80 };
    view.places.frontend = { x: 120, y: 72, w: 160, h: 96 };
    view.places.cdn = { x: 136, y: 96 };
    view.places.gateway = { x: 320, y: 80 };
    view.places.empty_cloud = { x: 520, y: 40, w: 240, h: 180 };

    const roots = findDiagramRoots(doc);
    expect(isEmptyRootBoundary(doc, "empty_cloud")).toBe(true);
    expect(orderRootsForFlow(doc, roots)).toEqual([
      "web_client",
      "frontend",
      "gateway",
      "empty_cloud",
    ]);
  });

  it("places disconnected decorative boundaries after connected architecture", () => {
    const doc = createEmptyDocument("decorative-root");
    doc.flow = "tb";
    doc.resources = [resource("first"), resource("second")];
    doc.groups = [{
      id: "decorative",
      kind: "cloud",
      type: "aws.cloud",
      label: "Decorative",
      children: [],
    }];
    doc.edges = [
      { id: "flow", source: "first", target: "second", style: "solid", kind: "flow" },
    ];
    const view = doc.views[0]!;
    view.places.first = { x: 80, y: 40 };
    view.places.second = { x: 80, y: 160 };
    view.places.decorative = { x: 40, y: 280, w: 200, h: 120 };

    expect(orderRootsForFlow(doc, findDiagramRoots(doc))).toEqual([
      "first",
      "second",
      "decorative",
    ]);
  });

  it("appends disconnected decorative boundaries after cyclic architecture roots", () => {
    const doc = createEmptyDocument("cyclic-roots");
    doc.flow = "lr";
    doc.resources = [resource("alpha"), resource("beta")];
    doc.groups = [{
      id: "wrapper",
      kind: "logical",
      label: "Wrapper",
      children: [],
    }];
    doc.edges = [
      { id: "ab", source: "alpha", target: "beta", style: "solid", kind: "flow" },
      { id: "ba", source: "beta", target: "alpha", style: "solid", kind: "flow" },
    ];
    const view = doc.views[0]!;
    view.places.alpha = { x: 40, y: 80 };
    view.places.wrapper = { x: 120, y: 72, w: 96, h: 64 };
    view.places.beta = { x: 240, y: 80 };

    expect(orderRootsForFlow(doc, findDiagramRoots(doc))).toEqual([
      "alpha",
      "beta",
      "wrapper",
    ]);
  });
});
