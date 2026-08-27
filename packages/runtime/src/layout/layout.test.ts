import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "../core/index.js";
import type { DiagramDocument, Resource } from "../core/index.js";
import { layoutDocument } from "./layout.js";

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
});
