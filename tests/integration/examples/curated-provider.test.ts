import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { parseDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const contracts = JSON.parse(readFileSync(resolve(root, "examples/evaluations/curated-providers.json"), "utf8"));

describe("curated provider semantic contracts", () => {
  const curatedIds = readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("covers a curated semantic contract for each provider grammar", () => {
    expect(Object.keys(contracts.examples).sort()).toEqual([
      "azure-private-app-service",
      "cloud-agnostic-order-processing",
      "gcp-streaming-analytics",
      "simple-serverless-web-application",
    ]);
    expect(curatedIds).toEqual(expect.arrayContaining(Object.keys(contracts.examples)));
  });

  it.each(curatedIds)("%s ships the prompt, brief, reference spec, and diagram", (id) => {
    expect(readdirSync(resolve(root, "examples/curated", id)).sort()).toEqual([
      "architecture-brief.md",
      "diagram.dgm",
      "reference-spec.md",
      "user-prompt.md",
    ]);
  });

  it.each(curatedIds)("%s emits no provider warnings", (id) => {
    const result = compileDiagram(parseDgm(readFileSync(resolve(root, "examples/curated", id, "diagram.dgm"), "utf8")));
    const warnings = result.issues.filter((issue) => issue.level === "warning").map((issue) => `${issue.code} ${issue.id}`);
    expect(warnings).toEqual([]);
  });

  it("keeps Dataflow workers in the VPC and global services at project scope", () => {
    const doc = parseDgm(readFileSync(resolve(root, "examples/curated/gcp-streaming-analytics/diagram.dgm"), "utf8"));
    const ancestorTypes = (id: string) => {
      const types: string[] = [];
      let parent = doc.resources.find((resource) => resource.id === id)!.parent;
      while (parent) {
        const group = doc.groups.find((candidate) => candidate.id === parent)!;
        types.push(group.type ?? group.kind);
        parent = group.parent;
      }
      return types;
    };
    expect(ancestorTypes("dataflow")).toContain("gcp.vpc");
    for (const id of ["iam", "events"]) {
      expect(ancestorTypes(id)).toContain("gcp.project");
      expect(ancestorTypes(id)).not.toContain("gcp.region");
    }
  });

  for (const [id, contract] of Object.entries(contracts.examples)) {
    it(`compiles ${id} with provider-valid catalog types`, () => {
      const source = readFileSync(resolve(root, "examples/curated", id, "diagram.dgm"), "utf8");
      const doc = parseDgm(source);
      expect(doc.grammar, `${id} grammar`).toBe(contract.grammar);

      for (const item of [...doc.resources, ...doc.groups]) {
        const type = item.type ?? item.kind;
        const entry = getCatalogEntry(type);
        expect(entry, `${id} catalog entry ${type}`).toBeDefined();
        if (entry) {
          expect(
            entry.provider === doc.grammar || entry.provider === "cloud-agnostic",
            `${id} provider mismatch for ${type}`,
          ).toBe(true);
        }
      }

      const result = compileDiagram(doc);
      expect(result.ok, result.ok ? undefined : result.issues.map((issue) => issue.message).join("; ")).toBe(true);
      if (!result.ok) return;

      const resourceCounts = countTypes(doc.resources);
      for (const [type, minimum] of Object.entries(contract.minimumCounts ?? {})) {
        expect(resourceCounts.get(type) ?? 0, `${id} ${type}`).toBeGreaterThanOrEqual(minimum);
      }
      const groupCounts = countTypes(doc.groups);
      for (const [type, minimum] of Object.entries(contract.minimumGroupCounts ?? {})) {
        expect(groupCounts.get(type) ?? 0, `${id} ${type}`).toBeGreaterThanOrEqual(minimum);
      }

      for (const edge of doc.edges) {
        expect(doc.resources.some((resource) => resource.id === edge.source), `${id} edge source ${edge.source}`).toBe(true);
        expect(doc.resources.some((resource) => resource.id === edge.target), `${id} edge target ${edge.target}`).toBe(true);
      }
    });
  }
});

function countTypes(items: Array<{ type?: string; kind?: string }>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const type = item.type ?? item.kind;
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}
