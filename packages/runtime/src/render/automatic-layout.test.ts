import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createEmptyDocument, getDefaultView } from "../core/index.js";
import { parseDgmResult } from "../dsl/index.js";
import { attachRoutes, routeEdges } from "../route/index.js";
import { layoutDocument } from "../layout/index.js";
import { compileAutomaticLayout, checkInvariants, assessQuality, compareQuality, qualityFindings } from "./index.js";
import { describe, expect, it, vi } from "vitest";

function simpleDocument() {
  const doc = createEmptyDocument("automatic-layout-simple");
  doc.resources = [
    { id: "visitor", type: "cloud-agnostic.client", label: { service: "Visitor" }, role: "primary", props: {} },
    { id: "api", type: "aws.api-gateway", label: { service: "API" }, role: "primary", props: {} },
  ];
  doc.edges = [{ id: "request", source: "visitor", target: "api", style: "solid", kind: "flow" }];
  return doc;
}

function hardAzureFixture() {
  const source = readFileSync(
    resolve(process.cwd(), "tests/fixtures/automatic-quality/azure-private-order-processing/diagram.dgm"),
    "utf8",
  );
  const parsed = parseDgmResult(source);
  expect(parsed.isOk(), parsed.isErr() ? parsed.error.message : "").toBe(true);
  if (parsed.isErr()) throw parsed.error;
  return parsed.value;
}

describe("compileAutomaticLayout", () => {
  it("keeps a clean simple source on one pass and leaves the source graph unchanged", () => {
    const doc = simpleDocument();
    const before = structuredClone(doc);
    const prepareLayout = vi.fn((layout) => layout);

    const result = compileAutomaticLayout(doc, { prepareLayout });

    expect(prepareLayout).toHaveBeenCalledTimes(1);
    expect(result.invariantFailures).toEqual([]);
    expect(doc).toEqual(before);
    expect(result.layout.nodes.map(({ id }) => id).sort()).toEqual(["api", "visitor"]);
    expect(result.layout.edges.map(({ id, source, target }) => ({ id, source, target }))).toEqual([
      { id: "request", source: "visitor", target: "api" },
    ]);
  });

  it.each(["pinned placement", "pinned route"] as const)("does one bounded attempt for a %s", (pinKind) => {
    const doc = hardAzureFixture();
    const view = getDefaultView(doc);
    if (pinKind === "pinned placement") view.places.api = { x: 40, y: 40, pin: true };
    else view.routes["api-work-queue"] = { pin: true };
    const prepareLayout = vi.fn((layout) => layout);

    const result = compileAutomaticLayout(doc, { prepareLayout });

    expect(prepareLayout).toHaveBeenCalledTimes(1);
    expect(result.layout.edges.map(({ id }) => id).sort()).toEqual(doc.edges.map(({ id }) => id).sort());
  });

  it("does not multiply an explicitly supplied routing budget across attempts", () => {
    const doc = hardAzureFixture();
    const prepareLayout = vi.fn((layout) => layout);

    const result = compileAutomaticLayout(doc, {
      prepareLayout,
      routing: { maxAstarExpansions: 0 },
    });

    expect(prepareLayout).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.limits.maxAstarExpansions).toBe(0);
  });

  it("preserves graph components and edges and returns the same result on repeated runs", () => {
    const doc = hardAzureFixture();
    const before = structuredClone(doc);
    const first = compileAutomaticLayout(doc);
    const second = compileAutomaticLayout(doc);

    expect(doc).toEqual(before);
    expect(first.layout.nodes.map(({ id }) => id).sort()).toEqual(doc.resources.map(({ id }) => id).sort());
    expect(first.layout.groups.every(({ id }) => doc.groups.some((group) => group.id === id))).toBe(true);
    expect(
      first.layout.edges
        .map(({ id, source, target }) => ({ id, source, target }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      doc.edges.map(({ id, source, target }) => ({ id, source, target })).sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(first).toEqual(second);
  });

  it("does not trade content or corridor safety for fewer Azure crossings", () => {
    const doc = hardAzureFixture();
    const baselineLayout = layoutDocument(doc);
    const baselineRouted = attachRoutes(baselineLayout, routeEdges(doc, baselineLayout));
    const baselineFailures = checkInvariants(baselineRouted);
    const automatic = compileAutomaticLayout(doc);
    const baselineQuality = assessQuality(
      qualityFindings(
        [],
        baselineFailures.filter((finding) => finding.code !== "edge-crossing"),
      ),
    );
    const automaticQuality = assessQuality(
      qualityFindings(
        [],
        automatic.invariantFailures.filter((finding) => finding.code !== "edge-crossing"),
      ),
    );
    expect(compareQuality(automaticQuality, baselineQuality)).toBeLessThanOrEqual(0);
  });
});
