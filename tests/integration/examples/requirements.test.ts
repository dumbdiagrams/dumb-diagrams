import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { checkRequirements, parseRequirements, type RequirementsDocument } from "@dumb-diagrams/runtime/requirements";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const parseDgm = (path: string) => parseDgmResult(readFileSync(resolve(root, path), "utf8"))._unsafeUnwrap();
const parseContract = (path: string): RequirementsDocument =>
  parseRequirements(readFileSync(resolve(root, path), "utf8"))._unsafeUnwrap();

type Example = { name: string; source: string; contract: string };
function maintainedExamples(): Example[] {
  return globSync("examples/**/*.dgm", { cwd: root })
    .map((source) => ({
      name: source,
      source,
      contract: source.endsWith("/diagram.dgm")
        ? source.replace(/diagram\.dgm$/, "requirements.json")
        : source.replace(/\.dgm$/, ".requirements.json"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const examples = maintainedExamples();

describe("per-example requirements contracts", () => {
  it.each(examples)("validates and matches $name", ({ source, contract }) => {
    const parsedContract = parseContract(contract);
    const doc = parseDgm(source);
    expect(doc.grammar).toBe(parsedContract.grammar);
    expect(checkRequirements(doc, parsedContract)).toEqual([]);
  });

  it("detects removal of every required component and relationship", () => {
    for (const { name, source, contract: contractPath } of examples) {
      const original = parseDgm(source);
      const contract = parseContract(contractPath);
      for (const component of contract.components) {
        const changed = structuredClone(original);
        if (component.kind === "resource") changed.resources = changed.resources.filter((item) => item.id !== component.id);
        else changed.groups = changed.groups.filter((item) => item.id !== component.id);
        const issues = checkRequirements(changed, contract);
        expect(issues.some((item) => item.code === "missing-component" && item.requirementId === component.id), `${name} missing ${component.id}`).toBe(true);
      }
      for (const relationship of contract.relationships) {
        const changed = structuredClone(original);
        changed.edges = changed.edges.filter((edge) => edge.id !== relationship.id);
        const issues = checkRequirements(changed, contract);
        expect(issues.some((item) => item.code === "missing-relationship" && item.requirementId === relationship.id), `${name} missing ${relationship.id}`).toBe(true);
      }
    }
  });

  it("ignores source ordering and labels", () => {
    for (const { name, source, contract: contractPath } of examples) {
      const doc = structuredClone(parseDgm(source));
      doc.resources.reverse();
      doc.groups.reverse();
      doc.edges.reverse();
      for (const item of doc.resources) item.label = { service: `reworded ${item.id}`, role: "updated role" };
      for (const item of doc.groups) item.label = `reworded ${item.id}`;
      for (const view of doc.views) {
        view.places = {};
        view.routes = {};
      }
      expect(checkRequirements(doc, parseContract(contractPath)), name).toEqual([]);
    }
  });
});
