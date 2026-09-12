import { getGroup, getResource } from "./document.js";
import { validateDocumentConstraints } from "./constraints.js";
import type { DiagramDocument, ValidationIssue, CatalogRule } from "./types.js";

export interface ValidationOptions {
  /**
   * Keep catalog containment rules strict for authored/LLM diagrams. The
   * interactive editor can disable this while a user freely arranges items.
   */
  enforceCatalogRules?: boolean;
}

export function validateDocument(
  doc: DiagramDocument,
  catalog: Map<string, CatalogRule>,
  options: ValidationOptions = {},
): ValidationIssue[] {
  const enforceCatalogRules = options.enforceCatalogRules ?? true;
  const issues: ValidationIssue[] = validateDocumentConstraints(doc);
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

  const edgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (edgeIds.has(e.id)) {
      issues.push({
        level: "error",
        code: "duplicate-id",
        message: `Duplicate id: ${e.id}`,
        id: e.id,
      });
    }
    edgeIds.add(e.id);
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

    const providerIssue = validateProvider(doc.grammar, rule.provider, "Resource", r.id, r.type);
    if (providerIssue) issues.push(providerIssue);

    if (!r.parent) {
      if (enforceCatalogRules && !rule.allowRoot) {
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

    if (enforceCatalogRules && !rule.allowedParents.includes(parent.kind)) {
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
    if (!getResource(doc, e.source) && getGroup(doc, e.source)) {
      issues.push({
        level: "error",
        code: "invalid-edge-endpoint",
        message: `Edge ${e.id} source ${e.source} must reference a resource, not a group`,
        id: e.id,
      });
    } else if (!getResource(doc, e.source)) {
      issues.push({
        level: "error",
        code: "missing-source",
        message: `Edge ${e.id} source ${e.source} not found`,
        id: e.id,
      });
    }
    if (!getResource(doc, e.target) && getGroup(doc, e.target)) {
      issues.push({
        level: "error",
        code: "invalid-edge-endpoint",
        message: `Edge ${e.id} target ${e.target} must reference a resource, not a group`,
        id: e.id,
      });
    } else if (!getResource(doc, e.target)) {
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
    if (g.type && rule) {
      const providerIssue = validateProvider(doc.grammar, rule.provider, "Group", g.id, g.type);
      if (providerIssue) issues.push(providerIssue);
    }
    if (enforceCatalogRules && g.type && !g.parent && rule && !rule.allowRoot) {
      issues.push({
        level: "error",
        code: "missing-parent",
        message: `Group ${g.id} has no parent group`,
        id: g.id,
      });
    }
    if (enforceCatalogRules && g.parent && rule) {
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

  return issues;
}

function validateProvider(
  grammar: DiagramDocument["grammar"],
  provider: CatalogRule["provider"],
  entityKind: "Resource" | "Group",
  id: string,
  type: string,
): ValidationIssue | undefined {
  if (!provider || provider === "cloud-agnostic") return undefined;
  if (grammar !== provider) {
    return {
      level: "error",
      code: "provider-mismatch",
      message: `${entityKind} ${id} type ${type} belongs to ${provider}, but document grammar is ${grammar}`,
      id,
    };
  }
  return undefined;
}

function isInsideVpc(doc: DiagramDocument, groupId: string): boolean {
  let current = getGroup(doc, groupId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.kind === "vpc") return true;
    if (!current.parent) break;
    current = getGroup(doc, current.parent);
  }
  return false;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
