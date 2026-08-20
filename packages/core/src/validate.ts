import { getGroup, getResource } from "./document.js";
import type { DiagramDocument, ValidationIssue, CatalogRule } from "./types.js";

export function validateDocument(
  doc: DiagramDocument,
  catalog: Map<string, CatalogRule>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const g of doc.groups) {
    if (ids.has(g.id)) {
      issues.push({
        level: "error",
        code: "duplicate-id",
        message: `Duplicate id: ${g.id}`,
        id: g.id,
      });
    }
    ids.add(g.id);
  }

  for (const r of doc.resources) {
    if (ids.has(r.id)) {
      issues.push({
        level: "error",
        code: "duplicate-id",
        message: `Duplicate id: ${r.id}`,
        id: r.id,
      });
    }
    ids.add(r.id);
  }

  for (const r of doc.resources) {
    const rule = catalog.get(r.type);
    if (!rule) {
      issues.push({
        level: "error",
        code: "unknown-type",
        message: `Unknown resource type: ${r.type}`,
        id: r.id,
      });
      continue;
    }

    if (!r.parent) {
      if (!rule.allowRoot) {
        issues.push({
          level: "error",
          code: "missing-parent",
          message: `Resource ${r.id} has no parent group`,
          id: r.id,
        });
      }
      continue;
    }

    const parent = getGroup(doc, r.parent);
    if (!parent) {
      issues.push({
        level: "error",
        code: "invalid-parent",
        message: `Resource ${r.id} parent ${r.parent} not found`,
        id: r.id,
      });
      continue;
    }

    if (!rule.allowedParents.includes(parent.kind)) {
      issues.push({
        level: "error",
        code: "invalid-containment",
        message: `${r.type} cannot be placed in ${parent.kind}`,
        id: r.id,
      });
    }

    if (rule.scope === "regional" && isInsideVpc(doc, r.parent)) {
      issues.push({
        level: "warning",
        code: "regional-in-vpc",
        message: `${r.type} (${r.id}) is nested inside a VPC; regional services should be outside VPC`,
        id: r.id,
      });
    }
  }

  for (const e of doc.edges) {
    if (!getResource(doc, e.source) && !getGroup(doc, e.source)) {
      issues.push({
        level: "error",
        code: "missing-source",
        message: `Edge ${e.id} source ${e.source} not found`,
        id: e.id,
      });
    }
    if (!getResource(doc, e.target) && !getGroup(doc, e.target)) {
      issues.push({
        level: "error",
        code: "missing-target",
        message: `Edge ${e.id} target ${e.target} not found`,
        id: e.id,
      });
    }
  }

  for (const g of doc.groups) {
    if (g.parent && !getGroup(doc, g.parent)) {
      issues.push({
        level: "error",
        code: "invalid-parent",
        message: `Group ${g.id} parent ${g.parent} not found`,
        id: g.id,
      });
    }
    const rule = g.type ? catalog.get(g.type) : undefined;
    if (g.type && !g.parent && rule && !rule.allowRoot) {
      issues.push({
        level: "error",
        code: "missing-parent",
        message: `Group ${g.id} has no parent group`,
        id: g.id,
      });
    }
    if (g.parent && rule) {
      const parent = getGroup(doc, g.parent);
      if (parent && !rule.allowedParents.includes(parent.kind)) {
        issues.push({
          level: "error",
          code: "invalid-containment",
          message: `${g.type} cannot be placed in ${parent.kind}`,
          id: g.id,
        });
      }
    }
    for (const childId of g.children) {
      if (!getGroup(doc, childId) && !getResource(doc, childId)) {
        issues.push({
          level: "error",
          code: "missing-child",
          message: `Group ${g.id} child ${childId} not found`,
          id: g.id,
      });
    }
    for (const child of g.borderChildren ?? []) {
      if (!getGroup(doc, child.id) && !getResource(doc, child.id)) {
        issues.push({
          level: "error",
          code: "missing-child",
          message: `Group ${g.id} border child ${child.id} not found`,
          id: g.id,
        });
      }
    }
  }
  }

  return issues;
}

function isInsideVpc(doc: DiagramDocument, groupId: string): boolean {
  let current = getGroup(doc, groupId);
  while (current) {
    if (current.kind === "vpc" || current.kind === "az" || current.kind === "subnet" || current.kind === "subnet-public" || current.kind === "subnet-private") {
      if (current.kind === "vpc") return true;
    }
    if (!current.parent) break;
    current = getGroup(doc, current.parent);
  }
  return false;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
