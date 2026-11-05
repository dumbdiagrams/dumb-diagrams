import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const contracts = JSON.parse(readFileSync(resolve(root, "examples/evaluations/curated-providers.json"), "utf8"));
const awsContracts = JSON.parse(readFileSync(resolve(root, "examples/evaluations/curated-aws.json"), "utf8"));

describe("curated provider semantic contracts", () => {
  const curatedIds = readdirSync(resolve(root, "examples/curated"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  it("covers a curated semantic contract for each provider grammar", () => {
    expect([...new Set(Object.values(contracts.examples).map((contract) => contract.grammar))].sort()).toEqual([
      "aws", "azure", "cloud-agnostic", "gcp",
    ]);
    expect([...new Set([...Object.keys(awsContracts.examples), ...Object.keys(contracts.examples)])].sort()).toEqual(curatedIds);
    expect(curatedIds).toEqual(expect.arrayContaining(Object.keys(contracts.examples)));
  });

  it.each(curatedIds)("%s ships the prompt, brief, reference spec, and diagram", (id) => {
    expect(readdirSync(resolve(root, "examples/curated", id)).sort()).toEqual([
      "architecture-brief.md",
      "diagram.dgm",
      "reference-spec.md",
      "requirements.json",
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
      for (const [type, exact] of Object.entries(contract.exactCounts ?? {})) {
        expect(resourceCounts.get(type) ?? 0, `${id} ${type}`).toBe(exact);
      }
      if (contract.noUnexpectedTypes) {
        expect([...resourceCounts.keys()].sort(), `${id} resource types`).toEqual(
          Object.keys(contract.exactCounts ?? {}).sort(),
        );
      }
      const groupCounts = countTypes(doc.groups);
      for (const [type, minimum] of Object.entries(contract.minimumGroupCounts ?? {})) {
        expect(groupCounts.get(type) ?? 0, `${id} ${type}`).toBeGreaterThanOrEqual(minimum);
      }
      for (const [type, exact] of Object.entries(contract.exactGroupCounts ?? {})) {
        expect(groupCounts.get(type) ?? 0, `${id} ${type}`).toBe(exact);
      }
      if (contract.noUnexpectedGroupTypes) {
        expect([...groupCounts.keys()].sort(), `${id} group types`).toEqual(
          Object.keys(contract.exactGroupCounts ?? {}).sort(),
        );
      }

      for (const edge of doc.edges) {
        expect(doc.resources.some((resource) => resource.id === edge.source), `${id} edge source ${edge.source}`).toBe(true);
        expect(doc.resources.some((resource) => resource.id === edge.target), `${id} edge target ${edge.target}`).toBe(true);
      }

      const itemsById = new Map([
        ...doc.resources.map((resource) => [resource.id, resource] as const),
        ...doc.groups.map((group) => [group.id, group] as const),
      ]);
      const groupsById = new Map(doc.groups.map((group) => [group.id, group] as const));
      const ancestorTypes = (id: string) => {
        const ancestors: string[] = [];
        let parent = itemsById.get(id)?.parent;
        const seen = new Set<string>();
        while (parent && !seen.has(parent)) {
          seen.add(parent);
          const group = groupsById.get(parent);
          if (!group) break;
          ancestors.push(group.type ?? group.kind);
          parent = group.parent;
        }
        return ancestors;
      };
      for (const requirement of contract.containment ?? []) {
        const matching = doc.resources.filter((resource) => resource.type === requirement.childType);
        expect(matching.length, `${id} ${requirement.childType} exists`).toBeGreaterThan(0);
        for (const resource of matching) {
          expect(ancestorTypes(resource.id), `${id} ${resource.id} containment`).toContain(requirement.ancestorType);
        }
      }
      for (const requirement of contract.groupContainment ?? []) {
        const matching = doc.groups.filter((group) => (group.type ?? group.kind) === requirement.childGroupType);
        expect(matching.length, `${id} ${requirement.childGroupType} exists`).toBeGreaterThan(0);
        for (const group of matching) {
          expect(ancestorTypes(group.id), `${id} ${group.id} containment`).toContain(requirement.ancestorType);
        }
      }
      for (const requirement of contract.outsideContainment ?? []) {
        const matching = doc.resources.filter((resource) => resource.type === requirement.childType);
        expect(matching.length, `${id} ${requirement.childType} exists`).toBeGreaterThan(0);
        for (const resource of matching) {
          expect(ancestorTypes(resource.id), `${id} ${resource.id} outside containment`).not.toContain(
            requirement.ancestorType,
          );
        }
      }
      if (contract.relationships) {
        const typesById = new Map(doc.resources.map((resource) => [resource.id, resource.type] as const));
        const actualRelationships = new Map<string, number>();
        for (const edge of doc.edges) {
          const key = `${typesById.get(edge.source)}\0${typesById.get(edge.target)}`;
          actualRelationships.set(key, (actualRelationships.get(key) ?? 0) + 1);
        }
        const expectedRelationships = new Map<string, number>();
        for (const relationship of contract.relationships) {
          const key = `${relationship.sourceType}\0${relationship.targetType}`;
          expectedRelationships.set(key, relationship.count ?? 1);
          expect(actualRelationships.get(key) ?? 0, `${id} ${key.replaceAll("\0", " -> ")}`).toBe(relationship.count ?? 1);
        }
        if (contract.relationshipMode === "exact") {
          expect([...actualRelationships].sort(([a], [b]) => a.localeCompare(b)), `${id} relationships`).toEqual(
            [...expectedRelationships].sort(([a], [b]) => a.localeCompare(b)),
          );
        }
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
