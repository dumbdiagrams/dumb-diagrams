import {
  createAsyncDocsFixture,
} from "@dumb-diagrams/runtime/test-fixtures";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { describe, expect, it } from "vitest";

import { planAutoFix } from "./auto-fix";
import {
  compileDiagramSource,
  compileDocument,
  warmDiagramCompilationCache,
} from "./diagram-compiler";
import {
  clearView,
  setRoute,
} from "./editor-model";
import { DIAGRAM_EXAMPLES } from "./examples";

const FLAT_CLOUD_BRANCH = `diagram autofix-branch {
  grammar aws
  flow lr

  cloud-agnostic.client client "Client"
  aws.cloud aws_cloud "AWS Cloud" {
    aws.cloudfront cloudfront "CloudFront"
    aws.api-gateway api_gateway "API Gateway"
    aws.simple-storage-service s3 "S3"
    aws.aws-lambda lambda "Lambda"
    aws.dynamodb dynamodb "DynamoDB"
  }

  client -> cloudfront
  cloudfront -> s3
  cloudfront -> api_gateway
  api_gateway -> lambda
  lambda -> dynamodb
}`;

describe("planAutoFix", () => {
  it("leaves a clean manually positioned diagram unchanged", () => {
    const example = DIAGRAM_EXAMPLES.find(
      (candidate) => candidate.id === "simple-serverless-web-application",
    )!;
    const doc = parseDgm(example.source);
    const view = getDefaultView(doc);
    view.places.cdn = { x: 180, y: 96, pin: true, manual: true };
    view.places.gateway = { x: 420, y: 96, pin: true, manual: true };
    view.places.handler = { x: 560, y: 96, pin: true, manual: true };
    view.places.app_data = { x: 700, y: 96, pin: true, manual: true };
    const before = printDgm(doc);
    const plan = planAutoFix(doc, false);

    expect(plan.status).toBe("unchanged");
    expect(plan.strategy).toBe("unchanged");
    expect(printDgm(plan.doc)).toBe(before);
  });

  it("repairs flat-cloud branch topology with full layout when needed", { timeout: 15_000 }, () => {
    const doc = parseDgm(FLAT_CLOUD_BRANCH);
    const view = getDefaultView(doc);
    for (const id of ["cloudfront", "api_gateway", "s3", "lambda", "dynamodb"]) {
      view.places[id] = { x: 200, y: 80, pin: true, manual: true };
    }
    const plan = planAutoFix(doc, false);

    expect(plan.status).toBe("repaired");
    const compiled = compileDocument(plan.doc, false);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.invariantFailures).toEqual([]);
  });

  it("reuses the supplied baseline and winning compilation without changing the fix", () => {
    const doc = parseDgm(`diagram small_overlap {
  grammar aws
  cloud-agnostic.server api "API"
  cloud-agnostic.server db "Database"
  api -> db
}`);
    const view = getDefaultView(doc);
    for (const id of ["api", "db"]) {
      view.places[id] = { x: 200, y: 80, pin: true, manual: true };
    }
    const baseline = compileDocument(doc, false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const freshPlan = planAutoFix(doc, false);
    const reusedPlan = planAutoFix(doc, false, baseline);
    expect(freshPlan.status).toBe("repaired");
    expect(reusedPlan.status).toBe(freshPlan.status);
    expect(reusedPlan.strategy).toBe(freshPlan.strategy);
    expect(printDgm(reusedPlan.doc)).toBe(printDgm(freshPlan.doc));
    expect(reusedPlan.compilation?.ok).toBe(true);
    if (!reusedPlan.compilation?.ok) return;

    const final = compileDocument(reusedPlan.doc, false);
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    expect(reusedPlan.compilation.layout).toEqual(final.layout);
    expect(reusedPlan.compilation.issues).toEqual(final.issues);
    expect(reusedPlan.compilation.invariantFailures).toEqual(final.invariantFailures);

    const source = printDgm(reusedPlan.doc);
    const warmed = warmDiagramCompilationCache(source, false, reusedPlan.compilation);
    const cached = compileDiagramSource(source, false);
    expect(cached).toBe(warmed);
    expect(cached.layout).toBe(reusedPlan.compilation.layout);
  });

  it("prefers targeted route repair over clearing all placements", () => {
    const doc = parseDgm(FLAT_CLOUD_BRANCH);
    const view = getDefaultView(doc);
    view.places.cloudfront = { x: 160, y: 80, pin: true, manual: true };
    view.places.api_gateway = { x: 320, y: 80, pin: true, manual: true };
    view.places.s3 = { x: 520, y: 80, pin: true, manual: true };
    view.places.lambda = { x: 640, y: 80, pin: true, manual: true };
    view.places.dynamodb = { x: 760, y: 80, pin: true, manual: true };

    const edgeId = doc.edges.find(
      (edge) => edge.source === "cloudfront" && edge.target === "s3",
    )!.id;
    const routed = setRoute(doc, edgeId, [
      { x: 208, y: 104 },
      { x: 360, y: 104 },
      { x: 360, y: 104 },
      { x: 544, y: 104 },
    ]);
    const current = compileDocument(routed, false);
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.invariantFailures.length).toBeGreaterThan(0);

    const plan = planAutoFix(routed, false);

    expect(plan.status).toBe("repaired");
    expect(["clear-routes-targeted", "clear-routes-all"]).toContain(plan.strategy);
    expect(getDefaultView(plan.doc).places.cloudfront?.x).toBe(160);
    expect(getDefaultView(plan.doc).places.api_gateway?.x).toBe(320);
  });

  it("escalates to clear-view when overlapping pins cannot be route-only repaired", { timeout: 15_000 }, () => {
    const doc = parseDgm(FLAT_CLOUD_BRANCH);
    const view = getDefaultView(doc);
    for (const id of ["cloudfront", "api_gateway", "s3", "lambda"]) {
      view.places[id] = { x: 240, y: 120, pin: true, manual: true };
    }
    view.places.dynamodb = { x: 680, y: 120, pin: true, manual: true };
    const plan = planAutoFix(doc, false);

    expect(plan.status).toBe("repaired");
    expect(plan.strategy).toBe("clear-view");
    const compiled = compileDocument(plan.doc, false);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.invariantFailures).toEqual([]);
  });

  it("blocks Auto-fix when the diagram fails structural validation", () => {
    const doc = createAsyncDocsFixture();
    const duplicate = { ...doc.resources[0]! };
    doc.resources.push(duplicate);
    const plan = planAutoFix(doc, false);

    expect(plan.status).toBe("blocked");
    expect(plan.strategy).toBe("unchanged");
    expect(plan.message).toBeTruthy();
  });

  it("works with snap to grid enabled", () => {
    const doc = clearView(parseDgm(FLAT_CLOUD_BRANCH));
    const plan = planAutoFix(doc, true);
    expect(plan.status).toBe("unchanged");
  });
});
