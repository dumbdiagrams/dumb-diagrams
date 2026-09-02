import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "./document.js";
import { DIAGRAM_LIMITS } from "./constraints.js";
import type { CatalogRule } from "./types.js";
import { validateDocument } from "./validate.js";

function stagedDocument(parent?: string) {
  const doc = createEmptyDocument("validation-modes");
  doc.groups = [
    {
      id: "region",
      kind: "region",
      label: "Region",
      children: parent ? ["service"] : [],
    },
    {
      id: "vpc",
      kind: "vpc",
      parent: "region",
      label: "VPC",
      children: [],
    },
  ];
  doc.resources = [
    {
      id: "service",
      type: "example.service",
      ...(parent ? { parent } : {}),
      label: { service: "Example service" },
      role: "primary",
      props: {},
    },
  ];
  return doc;
}

describe("document validation modes", () => {
  const catalog = new Map<string, CatalogRule>([
    [
      "example.service",
      {
        type: "example.service",
        allowedParents: ["vpc"],
        scope: "any",
        allowRoot: false,
      },
    ],
  ]);

  it("keeps generated containment rules strict by default", () => {
    const issues = validateDocument(stagedDocument("region"), catalog);

    expect(issues.map((issue) => issue.code)).toContain("invalid-containment");
  });

  it("allows the editor to stage unparented or incompatible items", () => {
    const rootIssues = validateDocument(stagedDocument(), catalog, {
      enforceCatalogRules: false,
    });
    const incompatibleIssues = validateDocument(stagedDocument("region"), catalog, {
      enforceCatalogRules: false,
    });

    expect(rootIssues).toEqual([]);
    expect(incompatibleIssues).toEqual([]);
  });

  it("reports stable limit and numeric-range issues", () => {
    const doc = stagedDocument();
    doc.title = "x".repeat(DIAGRAM_LIMITS.titleCharacters + 1);
    doc.views[0]!.places.service = { x: Number.POSITIVE_INFINITY, w: 0 };
    doc.views[0]!.routes.route = {
      points: Array.from({ length: DIAGRAM_LIMITS.routePoints + 1 }, () => ({ x: 0, y: 0 })),
    };
    const codes = validateDocument(doc, catalog, { enforceCatalogRules: false }).map((issue) => issue.code);
    expect(codes).toContain("text-limit");
    expect(codes).toContain("numeric-range");
    expect(codes).toContain("dimension-range");
    expect(codes).toContain("route-point-limit");
  });

  it("accepts text at the boundary and rejects object and asset size overflow", () => {
    const doc = createEmptyDocument("limits");
    doc.title = "x".repeat(DIAGRAM_LIMITS.titleCharacters);
    expect(validateDocument(doc, new Map()).map((issue) => issue.code)).not.toContain("text-limit");

    doc.resources = Array.from({ length: DIAGRAM_LIMITS.resources + 1 }, (_, index) => ({
      id: `r${index}`,
      type: "example.service",
      label: { role: `Resource ${index}` },
      role: "primary" as const,
      props: {},
    }));
    doc.assets = [{
      id: "large-asset",
      kind: "svg",
      content: "x".repeat(DIAGRAM_LIMITS.svgBytes + 1),
      intrinsicW: 64,
      intrinsicH: 64,
    }];
    const codes = validateDocument(doc, new Map(), { enforceCatalogRules: false }).map((issue) => issue.code);
    expect(codes).toContain("object-count-limit");
    expect(codes).toContain("asset-size-limit");
  });

  it("limits every display label to 120 characters", () => {
    expect(DIAGRAM_LIMITS.labelCharacters).toBe(120);
    const doc = stagedDocument();
    doc.resources[0]!.label.role = "x".repeat(121);
    expect(validateDocument(doc, catalog, { enforceCatalogRules: false })).toContainEqual(
      expect.objectContaining({ code: "text-limit", id: "service" }),
    );
  });

  it("detects cycles and excessive hierarchy depth without hanging", () => {
    const doc = createEmptyDocument("hierarchy");
    doc.groups = Array.from({ length: DIAGRAM_LIMITS.hierarchyDepth + 1 }, (_, index) => ({
      id: `g${index}`,
      kind: "logical" as const,
      label: `Group ${index}`,
      parent: index === 0 ? undefined : `g${index - 1}`,
      children: index === DIAGRAM_LIMITS.hierarchyDepth ? [] : [`g${index + 1}`],
    }));
    let codes = validateDocument(doc, new Map(), { enforceCatalogRules: false }).map((issue) => issue.code);
    expect(codes).toContain("hierarchy-depth-limit");

    doc.groups[0]!.parent = doc.groups.at(-1)!.id;
    codes = validateDocument(doc, new Map(), { enforceCatalogRules: false }).map((issue) => issue.code);
    expect(codes).toContain("hierarchy-cycle");
  });

  it("rejects group edge endpoints with a stable error", () => {
    const doc = createEmptyDocument("group-edges");
    doc.groups = [
      { id: "source-group", kind: "logical", label: "Source", children: [] },
      { id: "target-group", kind: "logical", label: "Target", children: [] },
    ];
    doc.edges = [{ id: "edge", source: "source-group", target: "target-group", style: "solid" }];

    expect(validateDocument(doc, new Map(), { enforceCatalogRules: false })).toEqual([
      expect.objectContaining({ code: "invalid-edge-endpoint", id: "edge" }),
      expect.objectContaining({ code: "invalid-edge-endpoint", id: "edge" }),
    ]);
  });

  it("enforces provider grammar while allowing neutral entries in provider documents", () => {
    const doc = createEmptyDocument("providers");
    doc.grammar = "aws";
    doc.groups = [
      { id: "region", kind: "region", label: "Region", children: ["neutral-group", "azure-resource", "azure-group"] },
      { id: "neutral-group", kind: "logical", label: "Neutral", children: [] },
      { id: "azure-group", kind: "logical", label: "Azure group", children: [] },
    ];
    doc.resources = [
      { id: "neutral", type: "neutral.service", parent: "region", label: {}, role: "primary", props: {} },
      { id: "azure-resource", type: "azure.service", parent: "region", label: {}, role: "primary", props: {} },
    ];
    const catalog = new Map<string, CatalogRule>([
      ["neutral.service", { type: "neutral.service", provider: "cloud-agnostic", allowedParents: ["region"], scope: "any" }],
      ["azure.service", { type: "azure.service", provider: "azure", allowedParents: ["region"], scope: "any" }],
      ["azure.group", { type: "azure.group", provider: "azure", allowedParents: ["region"], scope: "any" }],
    ]);
    doc.groups[2]!.type = "azure.group";
    doc.groups[2]!.parent = "region";

    const issues = validateDocument(doc, catalog, { enforceCatalogRules: false });
    expect(issues.filter((issue) => issue.code === "provider-mismatch")).toEqual([
      expect.objectContaining({ id: "azure-resource" }),
      expect.objectContaining({ id: "azure-group" }),
    ]);
    expect(issues.some((issue) => issue.id === "neutral" && issue.code === "provider-mismatch")).toBe(false);
  });

  it("enforces that a cloud-agnostic document contains only neutral catalog entries", () => {
    const doc = createEmptyDocument("neutral-only");
    doc.grammar = "cloud-agnostic";
    doc.resources = [{ id: "aws-resource", type: "aws.service", label: {}, role: "primary", props: {} }];
    const catalog = new Map<string, CatalogRule>([
      ["aws.service", { type: "aws.service", provider: "aws", allowedParents: [], scope: "any", allowRoot: true }],
    ]);
    expect(validateDocument(doc, catalog, { enforceCatalogRules: false })).toContainEqual(
      expect.objectContaining({ code: "provider-mismatch", id: "aws-resource" }),
    );
  });
});
