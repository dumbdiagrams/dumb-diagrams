import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { describe, expect, it } from "vitest";

import { planAutoFix } from "./auto-fix";
import { compileDocument } from "./diagram-compiler";
import { setRoute } from "./editor-model";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const INSIDE_CLOUD = `diagram crossed-fanout {
  grammar aws
  flow lr
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.client client "Client"
    aws.cloudfront cloudfront
    aws.api-gateway api-gateway
    aws.simple-storage-service simple-storage-service
    aws.aws-lambda lambda
    aws.dynamodb dynamodb
  }
  client -> cloudfront
  cloudfront -> simple-storage-service
  cloudfront -> api-gateway
  api-gateway -> lambda
  lambda -> dynamodb
}`;

function fanoutCrossingPins(api = { x: 280, y: 20 }, storage = { x: 280, y: 200 }) {
  const doc = parseDgm(INSIDE_CLOUD);
  const view = getDefaultView(doc);
  view.places.cloudfront = { x: 200, y: 140, pin: true, manual: true };
  view.places["api-gateway"] = { ...api, pin: true, manual: true };
  view.places["simple-storage-service"] = { ...storage, pin: true, manual: true };
  view.places.lambda = { x: 380, y: 20, pin: true, manual: true };
  view.places.dynamodb = { x: 480, y: 20, pin: true, manual: true };
  return doc;
}

describe("planAutoFix crossed fan-out", () => {
  it("repairs auto-routed CloudFront crossings by unpinning branch nodes", () => {
    const doc = fanoutCrossingPins({ x: 260, y: 80 }, { x: 260, y: 200 });
    const before = compileDocument(doc, true);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.invariantFailures).toContainEqual(
      expect.objectContaining({
        code: "edge-crossing",
        elementIds: ["client-cloudfront", "cloudfront-api-gateway"],
      }),
    );

    const plan = planAutoFix(doc, true);
    expect(plan.status).toBe("repaired");
    expect(plan.strategy).toBe("clear-places-targeted");

    const after = compileDocument(plan.doc, true);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.invariantFailures).toEqual([]);
    expect(getDefaultView(plan.doc).places.lambda?.x).toBe(380);
    expect(getDefaultView(plan.doc).places.dynamodb?.x).toBe(480);
  });

  it("repairs pinned crossing routes from a CloudFront branch layout", () => {
    const doc = fanoutCrossingPins();
    const base = compileDocument(doc, true);
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const s3Edge = base.layout.edges.find((edge) => edge.target === "simple-storage-service")!;
    const apiEdge = base.layout.edges.find((edge) => edge.target === "api-gateway")!;
    const routed = setRoute(setRoute(doc, s3Edge.id, s3Edge.points), apiEdge.id, [
      apiEdge.points[0]!,
      { x: 300, y: 144 },
      { x: 300, y: 190 },
      { x: 460, y: 190 },
      { x: 460, y: 84 },
      apiEdge.points.at(-1)!,
    ]);

    const plan = planAutoFix(routed, true);
    expect(plan.status).toBe("repaired");

    const after = compileDocument(plan.doc, true);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.invariantFailures).toEqual([]);
  });
});
