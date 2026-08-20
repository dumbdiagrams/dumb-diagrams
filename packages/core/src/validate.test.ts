import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "./document.js";
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
});
