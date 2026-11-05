import { err, ok, type Result } from "neverthrow";
import { getCatalogEntry } from "../catalog/catalog.js";
import type { DiagramDocument, EdgeKind, FlowDirection, Grammar } from "../core/types.js";

export interface RequirementBasis {
  kind: "explicit" | "inferred";
  text: string;
}
export interface ComponentRequirement {
  id: string;
  kind: "resource" | "group";
  type?: string;
  basis: RequirementBasis;
}
export interface RelationshipRequirement {
  id: string;
  source: string;
  target: string;
  kind?: EdgeKind;
  basis: RequirementBasis;
}
export interface CountRequirement {
  id: string;
  kind: "resource" | "group";
  type: string;
  min?: number;
  max?: number;
  within?: string;
  basis: RequirementBasis;
}
export interface PlacementRequirement {
  id: string;
  component: string;
  relation: "inside" | "parent" | "outside" | "root";
  group?: string;
  basis: RequirementBasis;
}
/** Project style defaults from `.dumbdiagrams/preferences.json`. */
export interface DiagramPreferences {
  numberedSteps: boolean;
  edgeLabels: boolean;
  flow: FlowDirection;
}
export const DEFAULT_PREFERENCES: DiagramPreferences = { numberedSteps: true, edgeLabels: true, flow: "lr" };
/** Self-reported authoring model, recorded for debugging only. */
export interface GeneratedBy {
  model: string;
  reasoning?: string;
}
export interface RequirementsDocument {
  version: 1;
  grammar: Grammar;
  components: ComponentRequirement[];
  relationships: RelationshipRequirement[];
  counts: CountRequirement[];
  placement: PlacementRequirement[];
  allowAdditionalResources?: boolean;
  /** Per-diagram override recorded when the user explicitly asks for a different style. */
  preferences?: Partial<DiagramPreferences>;
  generatedBy?: GeneratedBy;
  $schema?: string;
}
export interface RequirementsIssue {
  code: string;
  message: string;
  requirementId?: string;
  elementIds: string[];
  path?: string;
}
export interface RequirementsParseError {
  code: string;
  message: string;
  issues: RequirementsIssue[];
}

const grammarValues = ["aws", "azure", "gcp", "cloud-agnostic"] as const;
const edgeKinds = ["flow", "fail", "peer", "bidirectional"] as const;
const rootKeys = [
  "version",
  "grammar",
  "components",
  "relationships",
  "counts",
  "placement",
  "allowAdditionalResources",
  "preferences",
  "generatedBy",
  "$schema",
];
const preferenceKeys = ["numberedSteps", "edgeLabels", "flow"];
const basisKeys = ["kind", "text"];

function issue(
  code: string,
  message: string,
  path?: string,
  requirementId?: string,
  elementIds: string[] = [],
): RequirementsIssue {
  return { code, message, elementIds, ...(requirementId ? { requirementId } : {}), ...(path ? { path } : {}) };
}

function fail(code: string, message: string, issues: RequirementsIssue[] = []): Result<never, RequirementsParseError> {
  return err({ code, message, issues });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: RequirementsIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) issues.push(issue("unknown-field", `Unknown field ${key}`, `${path}.${key}`));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseBasis(value: unknown, path: string, issues: RequirementsIssue[]): value is RequirementBasis {
  if (!isRecord(value)) {
    issues.push(issue("invalid-basis", "basis must be an object", path));
    return false;
  }
  unknownKeys(value, basisKeys, path, issues);
  if (value.kind !== "explicit" && value.kind !== "inferred")
    issues.push(issue("invalid-basis-kind", "basis.kind must be explicit or inferred", `${path}.kind`));
  if (!nonempty(value.text))
    issues.push(issue("invalid-basis-text", "basis.text must be a non-empty string", `${path}.text`));
  return (value.kind === "explicit" || value.kind === "inferred") && nonempty(value.text);
}

/** Parse JSON requirements text into the validated version 1 contract. */
export function parseRequirements(source: string): Result<RequirementsDocument, RequirementsParseError> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid JSON";
    return fail("invalid-json", `Requirements are not valid JSON: ${message}`, [issue("invalid-json", message, "$")]);
  }
  return validateRequirements(value);
}

/** Validate an untrusted requirements value. Never throws for malformed input. */
export function validateRequirements(value: unknown): Result<RequirementsDocument, RequirementsParseError> {
  try {
    if (!isRecord(value))
      return fail("invalid-document", "Requirements document must be an object", [
        issue("invalid-document", "Expected an object", "$"),
      ]);
    const issues: RequirementsIssue[] = [];
    unknownKeys(value, rootKeys, "$", issues);
    if (value.version !== 1)
      issues.push(
        issue("unsupported-version", `Unsupported requirements version: ${String(value.version)}`, "$.version"),
      );
    if (!(grammarValues as readonly unknown[]).includes(value.grammar))
      issues.push(issue("invalid-grammar", `Unknown grammar: ${String(value.grammar)}`, "$.grammar"));
    for (const key of ["components", "relationships", "counts", "placement"] as const) {
      if (!Array.isArray(value[key])) issues.push(issue("invalid-array", `${key} must be an array`, `$.${key}`));
    }
    if (value.allowAdditionalResources !== undefined && typeof value.allowAdditionalResources !== "boolean")
      issues.push(issue("invalid-boolean", "allowAdditionalResources must be a boolean", "$.allowAdditionalResources"));
    if (value.$schema !== undefined && typeof value.$schema !== "string")
      issues.push(issue("invalid-schema-uri", "$schema must be a string", "$.$schema"));
    if (value.preferences !== undefined) checkPreferenceValues(value.preferences, "$.preferences", issues);
    if (value.generatedBy !== undefined) {
      if (!isRecord(value.generatedBy))
        issues.push(issue("invalid-generated-by", "generatedBy must be an object", "$.generatedBy"));
      else {
        unknownKeys(value.generatedBy, ["model", "reasoning"], "$.generatedBy", issues);
        reqString(value.generatedBy.model, "$.generatedBy.model", issues);
        if (value.generatedBy.reasoning !== undefined)
          reqString(value.generatedBy.reasoning, "$.generatedBy.reasoning", issues);
      }
    }

    const components = Array.isArray(value.components) ? value.components : [];
    const relationships = Array.isArray(value.relationships) ? value.relationships : [];
    const counts = Array.isArray(value.counts) ? value.counts : [];
    const placement = Array.isArray(value.placement) ? value.placement : [];
    if (components.length < 1)
      issues.push(issue("missing-components", "At least one component requirement is required", "$.components"));
    const compIds = new Map<string, ComponentRequirement["kind"]>();
    const requirementIds: Array<{ id: string; path: string; section: string }> = [];
    for (let i = 0; i < components.length; i++) {
      const path = `$.components[${i}]`,
        item = components[i];
      if (!isRecord(item)) {
        issues.push(issue("invalid-component", "Component requirement must be an object", path));
        continue;
      }
      unknownKeys(item, ["id", "kind", "type", "basis"], path, issues);
      const validId = nonempty(item.id);
      if (!validId) issues.push(issue("invalid-id", "id must be a non-empty string", `${path}.id`));
      if (item.kind !== "resource" && item.kind !== "group")
        issues.push(issue("invalid-kind", "kind must be resource or group", `${path}.kind`));
      if (item.kind === "resource" && !nonempty(item.type))
        issues.push(issue("missing-type", "Resource components require a type", `${path}.type`));
      if (item.type !== undefined && !nonempty(item.type))
        issues.push(issue("invalid-type", "type must be a non-empty string", `${path}.type`));
      if (typeof item.kind === "string" && nonempty(item.id))
        compIds.set(item.id, item.kind as ComponentRequirement["kind"]);
      if (validId) requirementIds.push({ id: item.id as string, path: `${path}.id`, section: "components" });
      parseBasis(item.basis, `${path}.basis`, issues);
      if (nonempty(item.type)) checkCatalogType(item.type, item.kind, `${path}.type`, issues);
    }
    for (const [field, items] of [
      ["relationships", relationships],
      ["counts", counts],
      ["placement", placement],
    ] as const) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!isRecord(item)) {
          issues.push(
            issue(
              `invalid-${field.slice(0, -1)}`,
              `${field.slice(0, -1)} requirement must be an object`,
              `$.${field}[${i}]`,
            ),
          );
          continue;
        }
        if (nonempty(item.id)) requirementIds.push({ id: item.id, path: `$.${field}[${i}].id`, section: field });
      }
    }
    for (let i = 0; i < relationships.length; i++) {
      const p = `$.relationships[${i}]`,
        item = relationships[i];
      if (!isRecord(item)) continue;
      unknownKeys(item, ["id", "source", "target", "kind", "basis"], p, issues);
      reqString(item.id, `${p}.id`, issues);
      reqString(item.source, `${p}.source`, issues);
      reqString(item.target, `${p}.target`, issues);
      if (item.kind !== undefined && !(edgeKinds as readonly unknown[]).includes(item.kind))
        issues.push(issue("invalid-relationship-kind", `Unknown relationship kind: ${String(item.kind)}`, `${p}.kind`));
      if (nonempty(item.source) && compIds.get(item.source) !== "resource")
        issues.push(
          issue(
            "invalid-reference",
            `Relationship source ${item.source} must reference a listed resource component`,
            `${p}.source`,
          ),
        );
      if (nonempty(item.target) && compIds.get(item.target) !== "resource")
        issues.push(
          issue(
            "invalid-reference",
            `Relationship target ${item.target} must reference a listed resource component`,
            `${p}.target`,
          ),
        );
      parseBasis(item.basis, `${p}.basis`, issues);
    }
    for (let i = 0; i < counts.length; i++) {
      const p = `$.counts[${i}]`,
        item = counts[i];
      if (!isRecord(item)) continue;
      unknownKeys(item, ["id", "kind", "type", "min", "max", "within", "basis"], p, issues);
      reqString(item.id, `${p}.id`, issues);
      reqString(item.type, `${p}.type`, issues);
      if (item.kind !== "resource" && item.kind !== "group")
        issues.push(issue("invalid-kind", "kind must be resource or group", `${p}.kind`));
      if (nonempty(item.type)) checkCatalogType(item.type, item.kind, `${p}.type`, issues);
      for (const b of ["min", "max"] as const)
        if (item[b] !== undefined && (!Number.isInteger(item[b]) || (item[b] as number) < 0))
          issues.push(issue("invalid-bound", `${b} must be a non-negative integer`, `${p}.${b}`));
      if (item.min === undefined && item.max === undefined)
        issues.push(issue("missing-count-bound", "Count requirement needs min or max", p));
      if (Number.isInteger(item.min) && Number.isInteger(item.max) && (item.min as number) > (item.max as number))
        issues.push(issue("invalid-count-range", "min must not exceed max", p));
      if (item.within !== undefined && !nonempty(item.within))
        issues.push(issue("invalid-reference", "within must be a non-empty group ID", `${p}.within`));
      else if (nonempty(item.within) && compIds.get(item.within) !== "group")
        issues.push(
          issue("invalid-reference", `within ${item.within} must reference a listed group component`, `${p}.within`),
        );
      parseBasis(item.basis, `${p}.basis`, issues);
    }
    for (let i = 0; i < placement.length; i++) {
      const p = `$.placement[${i}]`,
        item = placement[i];
      if (!isRecord(item)) continue;
      unknownKeys(item, ["id", "component", "relation", "group", "basis"], p, issues);
      reqString(item.id, `${p}.id`, issues);
      reqString(item.component, `${p}.component`, issues);
      if (nonempty(item.component) && !compIds.has(item.component))
        issues.push(issue("invalid-reference", `component ${item.component} is not listed`, `${p}.component`));
      if (
        !(
          item.relation === "inside" ||
          item.relation === "parent" ||
          item.relation === "outside" ||
          item.relation === "root"
        )
      )
        issues.push(
          issue("invalid-placement-relation", `Unknown placement relation: ${String(item.relation)}`, `${p}.relation`),
        );
      if (item.relation === "root") {
        if (item.group !== undefined)
          issues.push(issue("invalid-placement-group", "root placement must not specify group", `${p}.group`));
      } else {
        if (!nonempty(item.group))
          issues.push(
            issue("missing-placement-group", "Placement requires a group unless relation is root", `${p}.group`),
          );
        else if (compIds.get(item.group) !== "group")
          issues.push(
            issue("invalid-reference", `group ${item.group} must reference a listed group component`, `${p}.group`),
          );
      }
      parseBasis(item.basis, `${p}.basis`, issues);
    }
    const seenBySection = new Map<string, Set<string>>();
    for (const entry of requirementIds) {
      const seen = seenBySection.get(entry.section) ?? new Set<string>();
      if (seen.has(entry.id))
        issues.push(issue("duplicate-requirement-id", `Duplicate requirement ID: ${entry.id}`, entry.path, entry.id));
      seen.add(entry.id);
      seenBySection.set(entry.section, seen);
    }
    if (issues.length) return fail("invalid-requirements", "Requirements document is invalid", issues);
    return ok(value as unknown as RequirementsDocument);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid requirements value";
    return fail("invalid-document", message, [issue("invalid-document", message, "$")]);
  }
}

function checkPreferenceValues(
  value: unknown,
  path: string,
  issues: RequirementsIssue[],
  extraKeys: string[] = [],
): void {
  if (!isRecord(value)) {
    issues.push(issue("invalid-preferences", "preferences must be an object", path));
    return;
  }
  unknownKeys(value, [...preferenceKeys, ...extraKeys], path, issues);
  for (const key of ["numberedSteps", "edgeLabels"])
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      issues.push(issue("invalid-boolean", `${key} must be a boolean`, `${path}.${key}`));
  if (value.flow !== undefined && value.flow !== "lr" && value.flow !== "tb")
    issues.push(issue("invalid-flow", "flow must be lr or tb", `${path}.flow`));
}

/** Parse `.dumbdiagrams/preferences.json`; omitted values take the defaults. */
export function parsePreferences(source: string): Result<DiagramPreferences, RequirementsParseError> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid JSON";
    return fail("invalid-json", `Preferences are not valid JSON: ${message}`, [issue("invalid-json", message, "$")]);
  }
  const issues: RequirementsIssue[] = [];
  checkPreferenceValues(value, "$", issues, ["$schema"]);
  if (issues.length) return fail("invalid-preferences", "Preferences document is invalid", issues);
  const { $schema: _, ...preferences } = value as Record<string, unknown>;
  return ok({ ...DEFAULT_PREFERENCES, ...(preferences as Partial<DiagramPreferences>) });
}

/** Check that a diagram follows the effective project style preferences. */
export function checkPreferences(doc: DiagramDocument, preferences: DiagramPreferences): RequirementsIssue[] {
  const issues: RequirementsIssue[] = [];
  if (doc.flow !== preferences.flow)
    issues.push(
      issue("preference-flow", `Diagram flow ${doc.flow} does not match preferred flow ${preferences.flow}`, "$.flow"),
    );
  const steps = new Set<number>();
  for (const edge of doc.edges) {
    const primary = edge.style !== "dashed" && edge.kind !== "fail" && edge.kind !== "peer";
    if (preferences.edgeLabels && !edge.label?.trim())
      issues.push(issue("preference-label-missing", `Edge ${edge.id} has no label`, undefined, undefined, [edge.id]));
    if (!preferences.numberedSteps) {
      if (edge.step !== undefined)
        issues.push(
          issue(
            "preference-step-unwanted",
            `Edge ${edge.id} is numbered but numberedSteps is false`,
            undefined,
            undefined,
            [edge.id],
          ),
        );
    } else if (primary && edge.step === undefined)
      issues.push(
        issue("preference-step-missing", `Flow edge ${edge.id} has no step`, undefined, undefined, [edge.id]),
      );
    else if (!primary && edge.step !== undefined)
      issues.push(
        issue(
          "preference-step-secondary",
          `Dashed, peer, or failure edge ${edge.id} should not be numbered`,
          undefined,
          undefined,
          [edge.id],
        ),
      );
    if (edge.step !== undefined) steps.add(edge.step);
  }
  const ordered = [...steps].sort((a, b) => a - b);
  const gap = ordered.findIndex((step, index) => step !== index + 1);
  if (preferences.numberedSteps && gap !== -1)
    issues.push(
      issue(
        "preference-step-sequence",
        `Steps must run 1..${ordered.length} without gaps; found ${ordered.join(", ")}`,
      ),
    );
  return issues;
}

function reqString(value: unknown, path: string, issues: RequirementsIssue[]): void {
  if (!nonempty(value)) issues.push(issue("invalid-string", "Expected a non-empty string", path));
}
function checkCatalogType(type: string, kind: unknown, path: string, issues: RequirementsIssue[]): void {
  const entry = getCatalogEntry(type);
  if (!entry) issues.push(issue("unknown-type", `Unknown catalog type: ${type}`, path));
  else if ((kind === "resource" && entry.assetKind !== "resource") || (kind === "group" && entry.assetKind !== "group"))
    issues.push(
      issue("type-kind-mismatch", `Catalog type ${type} is a ${entry.assetKind}, not a ${String(kind)}`, path),
    );
}

/** Check a diagram against a previously validated requirements document. */
export function checkRequirements(doc: DiagramDocument, contract: RequirementsDocument): RequirementsIssue[] {
  const issues: RequirementsIssue[] = [];
  if (doc.grammar !== contract.grammar)
    issues.push(
      issue(
        "grammar-mismatch",
        `Diagram grammar ${doc.grammar} does not match required grammar ${contract.grammar}`,
        undefined,
        undefined,
        [],
      ),
    );
  const resources = new Map(doc.resources.map((r) => [r.id, r]));
  const groups = new Map(doc.groups.map((g) => [g.id, g]));
  const edges = new Map(doc.edges.map((e) => [e.id, e]));
  const nodeIds = new Set<string>();
  for (const el of [...doc.groups, ...doc.resources]) {
    if (nodeIds.has(el.id))
      issues.push(
        issue("duplicate-element-id", `Diagram contains duplicate resource/group ID ${el.id}`, undefined, undefined, [
          el.id,
        ]),
      );
    nodeIds.add(el.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of doc.edges) {
    if (edgeIds.has(edge.id))
      issues.push(
        issue("duplicate-element-id", `Diagram contains duplicate edge ID ${edge.id}`, undefined, undefined, [edge.id]),
      );
    edgeIds.add(edge.id);
  }
  for (const c of contract.components) {
    const actual = c.kind === "resource" ? resources.get(c.id) : groups.get(c.id);
    if (!actual) {
      const wrong = c.kind === "resource" ? groups.has(c.id) : resources.has(c.id);
      issues.push(
        issue(
          wrong ? "component-kind-mismatch" : "missing-component",
          wrong ? `Component ${c.id} exists with the wrong kind` : `Required ${c.kind} ${c.id} is missing`,
          undefined,
          c.id,
          [c.id],
        ),
      );
      continue;
    }
    if (c.type && (actual as { type?: string }).type !== c.type)
      issues.push(
        issue("component-type-mismatch", `Component ${c.id} must have type ${c.type}`, undefined, c.id, [c.id]),
      );
  }
  for (const r of contract.relationships) {
    const actual = edges.get(r.id);
    if (!actual) {
      issues.push(
        issue(
          "missing-relationship",
          `Required edge ${r.id}: expected ${r.source} → ${r.target}; edge missing`,
          undefined,
          r.id,
          [r.source, r.target],
        ),
      );
      continue;
    }
    if (actual.source !== r.source || actual.target !== r.target)
      issues.push(
        issue(
          "relationship-endpoints-mismatch",
          `Edge ${r.id} must connect ${r.source} → ${r.target} in that order`,
          undefined,
          r.id,
          [r.id, r.source, r.target],
        ),
      );
    if (r.kind !== undefined && (actual.kind ?? "flow") !== r.kind)
      issues.push(
        issue("relationship-kind-mismatch", `Relationship ${r.id} must have kind ${r.kind}`, undefined, r.id, [r.id]),
      );
  }
  for (const r of contract.counts) {
    const candidates = r.kind === "resource" ? [...doc.resources] : [...doc.groups];
    const matches = candidates.filter(
      (el) => el.type === r.type && (!r.within || isDescendant(doc, el.id, r.within, false)),
    );
    const n = matches.length;
    if ((r.min !== undefined && n < r.min) || (r.max !== undefined && n > r.max))
      issues.push(
        issue(
          "count-out-of-range",
          `Expected ${r.min === undefined ? "at most" : r.max === undefined ? "at least" : "between"} ${r.min ?? r.max}${r.min !== undefined && r.max !== undefined ? ` and ${r.max}` : ""} ${r.type} ${r.kind}${r.within ? ` within ${r.within}` : ""}; found ${n}`,
          undefined,
          r.id,
          matches.map((el) => el.id),
        ),
      );
  }
  for (const r of contract.placement) {
    const component = resources.get(r.component) ?? groups.get(r.component);
    if (!component) continue;
    const parent = (component as { parent?: string }).parent;
    let good = false;
    if (r.relation === "root") good = !parent;
    else if (r.relation === "parent") good = parent === r.group;
    else if (r.relation === "inside") good = isDescendant(doc, r.component, r.group!, false);
    else good = !isDescendant(doc, r.component, r.group!, true);
    if (!good)
      issues.push(
        issue(
          "placement-mismatch",
          `Component ${r.component} does not satisfy ${r.relation}${r.group ? ` ${r.group}` : ""}`,
          undefined,
          r.id,
          [r.component],
        ),
      );
  }
  if (contract.allowAdditionalResources === false) {
    const listed = new Set(contract.components.filter((c) => c.kind === "resource").map((c) => c.id));
    for (const r of doc.resources)
      if (!listed.has(r.id))
        issues.push(
          issue("additional-resource", `Unlisted resource ${r.id} is not allowed`, undefined, undefined, [r.id]),
        );
  }
  return issues;
}

function isDescendant(doc: DiagramDocument, id: string, ancestor: string, includeSelf: boolean): boolean {
  if (includeSelf && id === ancestor) return true;
  const groupParents = new Map(doc.groups.map((g) => [g.id, g.parent]));
  const resourceParents = new Map(doc.resources.map((r) => [r.id, r.parent]));
  const seen = new Set<string>();
  let parent = groupParents.has(id) ? groupParents.get(id) : resourceParents.get(id);
  while (parent && !seen.has(parent)) {
    if (parent === ancestor) return true;
    seen.add(parent);
    parent = groupParents.get(parent);
  }
  return false;
}

/** JSON Schema for the versioned requirements contract. */
export const requirementsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dumb-diagrams:requirements:1",
  title: "Dumb Diagrams requirements v1",
  type: "object",
  additionalProperties: false,
  required: ["version", "grammar", "components", "relationships", "counts", "placement"],
  properties: {
    version: { const: 1 },
    grammar: { enum: grammarValues },
    components: { type: "array", minItems: 1, items: { $ref: "#/$defs/component" } },
    relationships: { type: "array", items: { $ref: "#/$defs/relationship" } },
    counts: { type: "array", items: { $ref: "#/$defs/count" } },
    placement: { type: "array", items: { $ref: "#/$defs/placement" } },
    allowAdditionalResources: { type: "boolean", default: true },
    preferences: { $ref: "#/$defs/preferences" },
    generatedBy: {
      type: "object",
      additionalProperties: false,
      required: ["model"],
      properties: {
        model: { type: "string", minLength: 1, pattern: "\\S" },
        reasoning: { type: "string", minLength: 1, pattern: "\\S" },
      },
    },
    $schema: { type: "string" },
  },
  $defs: {
    preferences: {
      type: "object",
      additionalProperties: false,
      properties: {
        numberedSteps: { type: "boolean" },
        edgeLabels: { type: "boolean" },
        flow: { enum: ["lr", "tb"] },
      },
    },
    basis: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "text"],
      properties: { kind: { enum: ["explicit", "inferred"] }, text: { type: "string", minLength: 1, pattern: "\\S" } },
    },
    component: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "basis"],
      properties: {
        id: { type: "string", minLength: 1, pattern: "\\S" },
        kind: { enum: ["resource", "group"] },
        type: { type: "string", minLength: 1, pattern: "\\S" },
        basis: { $ref: "#/$defs/basis" },
      },
      allOf: [
        {
          if: { properties: { kind: { const: "resource" } }, required: ["kind"] },
          // biome-ignore lint/suspicious/noThenProperty: `then` is a JSON Schema conditional keyword.
          then: { required: ["type"] },
        },
      ],
    },
    relationship: {
      type: "object",
      additionalProperties: false,
      required: ["id", "source", "target", "basis"],
      properties: {
        id: { type: "string", minLength: 1, pattern: "\\S" },
        source: { type: "string", minLength: 1, pattern: "\\S" },
        target: { type: "string", minLength: 1, pattern: "\\S" },
        kind: { enum: edgeKinds },
        basis: { $ref: "#/$defs/basis" },
      },
    },
    count: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "type", "basis"],
      properties: {
        id: { type: "string", minLength: 1, pattern: "\\S" },
        kind: { enum: ["resource", "group"] },
        type: { type: "string", minLength: 1, pattern: "\\S" },
        min: { type: "integer", minimum: 0 },
        max: { type: "integer", minimum: 0 },
        within: { type: "string", minLength: 1, pattern: "\\S" },
        basis: { $ref: "#/$defs/basis" },
      },
      anyOf: [{ required: ["min"] }, { required: ["max"] }],
    },
    placement: {
      type: "object",
      additionalProperties: false,
      required: ["id", "component", "relation", "basis"],
      properties: {
        id: { type: "string", minLength: 1, pattern: "\\S" },
        component: { type: "string", minLength: 1, pattern: "\\S" },
        relation: { enum: ["inside", "parent", "outside", "root"] },
        group: { type: "string", minLength: 1, pattern: "\\S" },
        basis: { $ref: "#/$defs/basis" },
      },
      allOf: [
        {
          if: { properties: { relation: { const: "root" } }, required: ["relation"] },
          // biome-ignore lint/suspicious/noThenProperty: `then` is a JSON Schema conditional keyword.
          then: { not: { required: ["group"] } },
          else: { required: ["group"] },
        },
      ],
    },
  },
} as const;

/** JSON Schema for `.dumbdiagrams/preferences.json`. */
export const preferencesSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dumb-diagrams:preferences:1",
  title: "Dumb Diagrams project preferences",
  type: "object",
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    numberedSteps: { type: "boolean", default: DEFAULT_PREFERENCES.numberedSteps },
    edgeLabels: { type: "boolean", default: DEFAULT_PREFERENCES.edgeLabels },
    flow: { enum: ["lr", "tb"], default: DEFAULT_PREFERENCES.flow },
  },
} as const;
