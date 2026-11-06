import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getDefaultView, type LayoutResult } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramResult } from "@dumb-diagrams/runtime/render";
import { beforeAll, describe, expect, it } from "vitest";

import { frozenMemo } from "../helpers/frozen-memo";
import { compileDiagramSource, compileDocument } from "../../packages/editor/src/diagram-compiler";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const automaticQualitySources = [
  "aws-document-processing",
  "aws-factory-iot-telemetry",
  "aws-image-thumbnail-pipeline",
  "aws-static-website-delivery",
  "azure-asynchronous-order-processing",
  "azure-industrial-iot-telemetry",
  "azure-private-application-api",
  "azure-private-order-processing",
  "cloud-agnostic-customer-record-api",
  "cloud-agnostic-order-processing",
  "cloud-agnostic-team-project-portal",
  "cloud-agnostic-webhook-processing",
  "gcp-customer-record-api",
  "gcp-document-processing",
  "gcp-media-processing",
  "gcp-webhook-event-pipeline",
] as const;

const shortCaptionCloudFrontSource = `dgm 1
diagram static_website_delivery {
  grammar aws
  flow lr
  title "Static Website Delivery"
  cloud-agnostic.client visitor "Website Visitor"
  aws.cloud aws {
    aws.route-53 dns "DNS"
    aws.cloudfront cdn "CloudFront"
    aws.simple-storage-service-bucket site_bucket "Website Files"
  }
  visitor -> dns { id visit_dns label "DNS lookup" }
  dns -> cdn { id dns_cdn label "route" }
  cdn -> site_bucket { id cdn_bucket label "files" }
}
`;

const freshGcpMediaProcessingSource = `dgm 1
diagram media_processing { grammar gcp flow lr title "Media processing"
 gcp.organization org "Google Cloud organization" { gcp.project project "Project" {
 gcp.pub-sub jobs "Global jobs topic"
 gcp.pub-sub dlq "Global dead-letter topic"
 gcp.pub-sub completion "Global completion topic"
 gcp.region region "Primary region" {
 gcp.cloud-load-balancing lb "Cloud Load Balancing"
 gcp.cloud-run ingest "Cloud Run ingest"
 gcp.vpc vpc "VPC" {
 gcp.subnet subnet_b "Regional subnet B" { gcp.compute-engine worker_b "Compute Engine worker B" }
 gcp.subnet subnet_a "Regional subnet A" { gcp.compute-engine worker_a "Compute Engine worker A" }
 }
 gcp.cloud-storage input "Input bucket"
 gcp.cloud-storage output "Output bucket"
 gcp.cloud-sql sql "Cloud SQL job status"
 gcp.cloud-run notify "Cloud Run notification"
 } } }
 cloud-agnostic.actor producer "External media producer"
 cloud-agnostic.actor ops "Operations client"
 producer -> lb { id upload label "Upload" }
 lb -> ingest { id ingest_req label "Ingest" }
 ingest -> input { id store_input label "Store input" }
 ingest -> jobs { id enqueue label "Publish job" }
 jobs -> worker_a { id consume_a label "Jobs" }
 jobs -> worker_b { id consume_b label "Jobs" }
 worker_a -> input { id read_a label "Read input" }
 worker_b -> input { id read_b label "Read input" }
 worker_a -> output { id write_a label "Write output" }
 worker_b -> output { id write_b label "Write output" }
 worker_a -> sql { id status_a label "Update status" }
 worker_b -> sql { id status_b label "Update status" }
 worker_a -> completion { id done_a label "Completion" }
 worker_b -> completion { id done_b label "Completion" }
 completion -> notify { id deliver label "Completion event" }
 notify -> ops { id notify_ops label "Notify" }
 jobs -> dlq { id dead_letter label "After retries" kind fail }
 ops -> dlq { id inspect label "Inspect" style dashed kind peer }
 ops -> jobs { id redrive label "Redrive" }
}
`;

function parseDiagram(source: string) {
  return parseDgmResult(source)._unsafeUnwrap();
}

function successfulLayout(
  result: ReturnType<typeof compileDiagramResult> | ReturnType<typeof compileDiagramSource>,
): LayoutResult {
  if ("isErr" in result) {
    expect(
      result.isErr(),
      result.isErr()
        ? `${result.error.message}: ${result.error.issues.map((issue) => issue.message).join("; ")}`
        : undefined,
    ).toBe(false);
    if (result.isErr()) throw new Error(result.error.message);
    return result.value.layout;
  }
  expect(result.ok, result.ok ? undefined : result.issues.map((issue) => issue.message).join("; ")).toBe(true);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("; "));
  return result.layout;
}

function geometry(layout: LayoutResult) {
  return {
    nodes: [...layout.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => ({ id: node.id, icon: node.icon, label: node.label, obstacle: node.obstacle })),
    groups: [...layout.groups]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((group) => ({
        id: group.id,
        bounds: group.bounds,
        header: group.header,
        content: group.content,
        labelRect: group.labelRect,
      })),
    edges: [...layout.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points: edge.points,
        labelPoint: edge.labelPoint,
        labelRect: edge.labelRect,
        badge: edge.badge,
      })),
  };
}

// Studio geometry assertions reuse the frozen result from each parity case.
const cliGeometry = (source: string) => geometry(successfulLayout(compileDiagramResult(parseDiagram(source))));
const studioCompiles = [false, true].map((snap) => frozenMemo((source: string) => compileDiagramSource(source, snap)));
const studioCompile = (source: string, snapToGrid: boolean) => studioCompiles[Number(snapToGrid)]!(source);

function expectParity(source: string, label: string, snapToGrid: boolean, expected: ReturnType<typeof geometry>) {
  expect(geometry(successfulLayout(studioCompile(source, snapToGrid))), `${label}, snapToGrid=${snapToGrid}`).toEqual(
    expected,
  );
}

describe("CLI and Studio automatic geometry parity", () => {
  const sources = [
    { label: "the short-caption CloudFront source", source: shortCaptionCloudFrontSource },
    { label: "the fresh GCP media source", source: freshGcpMediaProcessingSource },
    ...automaticQualitySources.map((id) => ({
      label: `frozen automatic-quality source ${id}`,
      source: readFileSync(resolve(root, "tests/fixtures/automatic-quality", id, "diagram.dgm"), "utf8"),
    })),
  ];

  for (const { label, source } of sources) {
    describe(label, () => {
      let expected: ReturnType<typeof geometry>;
      // Reference and Studio compilation each get a separate timed phase. Even
      // filtered runs compile the CLI reference in setup, never inside parity.
      beforeAll(() => {
        expected = cliGeometry(source);
      }, 30_000);

      it.each([false, true])("matches the CLI (snapToGrid=%s)", (snapToGrid) => {
        expectParity(source, label, snapToGrid, expected);
      });
    });
  }

  it("keeps a short-caption CloudFront centered on its AWS service row", () => {
    const layout = successfulLayout(studioCompile(shortCaptionCloudFrontSource, false));
    const nodes = new Map(layout.nodes.map((node: { id: string; icon: { y: number; h: number } }) => [node.id, node]));
    const rowMidpoints = ["dns", "cdn", "site_bucket"].map((id) => {
      const icon = nodes.get(id)!.icon;
      return icon.y + icon.h / 2;
    });
    expect(new Set(rowMidpoints).size).toBe(1);
    for (const node of layout.nodes) {
      expect((node.icon.x + node.icon.w / 2) % 24).toBe(0);
      expect((node.icon.y + node.icon.h / 2) % 24).toBe(0);
    }
  });

  it("keeps the fresh GCP producer to regional load-balancer route horizontal and direct", () => {
    const layout = successfulLayout(studioCompile(freshGcpMediaProcessingSource, false));
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    const producer = byId.get("producer")!.icon;
    const loadBalancer = byId.get("lb")!.icon;
    expect(producer.y + producer.h / 2).toBe(loadBalancer.y + loadBalancer.h / 2);
    const edge = layout.edges.find((item) => item.id === "upload")!;
    expect(edge.points).toHaveLength(2);
    expect(edge.points[0]!.y).toBe(edge.points[1]!.y);
    expect(edge.points[0]!.y).toBe(producer.y + producer.h / 2);
  });

  it("preserves authored pinned group, resource, and route geometry with either snap setting", () => {
    const doc = parseDiagram(`dgm 1
diagram pinned_geometry {
  grammar aws
  flow lr
  aws.cloud cloud "Cloud" {
    aws.aws-lambda source "Source"
    aws.simple-queue-service queue "Queue"
  }
  source -> queue { id send label "send" }
}`);
    const view = getDefaultView(doc);
    view.places.cloud = { x: 37, y: 53, w: 511, h: 301, pin: true, manual: true };
    view.places.source = { x: 103, y: 127, w: 64, h: 64, pin: true, manual: true };
    view.places.queue = { x: 363, y: 181, w: 64, h: 64, pin: true, manual: true };
    view.routes.send = {
      pin: true,
      mode: "manual",
      points: [
        { x: 167, y: 159 },
        { x: 250, y: 159 },
        { x: 250, y: 213 },
        { x: 363, y: 213 },
      ],
      labelT: 0.5,
      badgeT: 0.75,
    };

    const cli = successfulLayout(compileDiagramResult(doc));
    const expected = geometry(cli);
    for (const snapToGrid of [false, true]) {
      expect(geometry(successfulLayout(compileDocument(doc, snapToGrid))), `snapToGrid=${snapToGrid}`).toEqual(
        expected,
      );
    }
    expect(expected.groups.find((group: { id: string }) => group.id === "cloud")!.bounds).toMatchObject({
      x: 37,
      y: 53,
      w: 511,
      h: 301,
    });
    expect(expected.nodes.find((node: { id: string }) => node.id === "source")!.obstacle).toMatchObject({
      x: 103,
      y: 127,
    });
  });
});
