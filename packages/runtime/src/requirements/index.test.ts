import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../core/document.js";
import { parseDgmResult } from "../dsl/index.js";
import {
  checkPreferences,
  checkRequirements,
  DEFAULT_PREFERENCES,
  parsePreferences,
  parseRequirements,
  requirementsSchema,
  validateRequirements,
  type RequirementsDocument,
} from "./index.js";

const basis = { kind: "explicit" as const, text: "User requested this component" };
const base = (): RequirementsDocument => ({
  version: 1,
  grammar: "aws",
  components: [{ id: "api", kind: "resource", type: "aws.aws-lambda", basis }],
  relationships: [],
  counts: [],
  placement: [],
});

function doc() {
  const value = createEmptyDocument("test");
  value.resources = [
    { id: "api", type: "aws.aws-lambda", parent: "app", label: {}, role: "primary", props: {} },
    { id: "api2", type: "aws.aws-lambda", parent: "app", label: {}, role: "primary", props: {} },
    { id: "db", type: "aws.simple-storage-service", parent: "archive", label: {}, role: "primary", props: {} },
  ];
  value.groups = [
    { id: "root", kind: "region", type: "aws.region", label: "Region", children: ["app", "data"] },
    { id: "app", kind: "logical", parent: "root", label: "App", children: ["api", "api2"] },
    { id: "data", kind: "logical", parent: "root", label: "Data", children: ["archive"] },
    { id: "archive", kind: "logical", parent: "data", label: "Archive", children: ["db"] },
  ];
  value.edges = [{ id: "e1", source: "api", target: "db", style: "solid" }];
  return value;
}

function validContract(value: unknown): RequirementsDocument {
  const result = validateRequirements(value);
  expect(result.isOk()).toBe(true);
  return result._unsafeUnwrap();
}

describe("requirements contract", () => {
  it("parses a valid contract and exposes a closed, identical template schema", () => {
    expect(parseRequirements(JSON.stringify(base())).isOk()).toBe(true);
    expect(requirementsSchema.additionalProperties).toBe(false);
    expect(requirementsSchema.properties.version.const).toBe(1);
    expect(requirementsSchema.$id).toBe("urn:dumb-diagrams:requirements:1");
    expect(requirementsSchema.$defs.basis.properties.text).toMatchObject({ pattern: "\\S" });
    const asset = JSON.parse(
      readFileSync(
        new URL("../../../cli/templates/project/.dumbdiagrams/requirements.schema.json", import.meta.url),
        "utf8",
      ),
    );
    expect(asset).toEqual(requirementsSchema);
  });

  it("rejects invalid JSON and collects root validation errors", () => {
    expect(parseRequirements("{")._unsafeUnwrapErr().code).toBe("invalid-json");
    const result = validateRequirements({
      version: 2,
      grammar: "wat",
      components: [],
      relationships: "bad",
      counts: [],
      placement: [],
      extra: true,
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "unsupported-version",
        "invalid-grammar",
        "missing-components",
        "invalid-array",
        "unknown-field",
      ]),
    );
  });

  it("collects nested validation errors and catalog kind/type errors", () => {
    const result = validateRequirements({
      version: 1,
      grammar: "aws",
      components: [
        { id: "same", kind: "resource", type: "not.a.catalog.type", basis: { kind: "guessed", text: " " } },
        { id: "same", kind: "group", type: "aws.aws-lambda", basis: { kind: "explicit", text: "ok", unexpected: 1 } },
      ],
      relationships: [{ id: "same", source: "missing", target: "same", kind: "mystery", basis, extra: true }],
      counts: [{ id: "count", kind: "resource", type: "aws.aws-lambda", min: 3, max: 0, within: "same", basis }],
      placement: [{ id: "place", component: "missing", relation: "root", group: "same", basis }],
      allowAdditionalResources: "no",
      unexpected: true,
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "unknown-field",
        "duplicate-requirement-id",
        "invalid-basis-kind",
        "invalid-basis-text",
        "unknown-type",
        "invalid-reference",
        "invalid-relationship-kind",
        "invalid-count-range",
        "type-kind-mismatch",
        "invalid-placement-group",
        "invalid-boolean",
      ]),
    );
  });

  it.each([
    ["null root", null],
    ["array root", []],
    ["null component item", { ...base(), components: [null] }],
    ["empty component ID", { ...base(), components: [{ ...base().components[0], id: " " }] }],
    ["invalid component kind", { ...base(), components: [{ ...base().components[0], kind: "edge" }] }],
    ["missing resource type", { ...base(), components: [{ id: "api", kind: "resource", basis }] }, "missing-type"],
    ["missing basis", { ...base(), components: [{ ...base().components[0], basis: undefined }] }],
    [
      "negative count bound",
      { ...base(), counts: [{ id: "count", kind: "resource", type: "aws.aws-lambda", max: -1, basis }] },
    ],
    ["count without bounds", { ...base(), counts: [{ id: "count", kind: "resource", type: "aws.aws-lambda", basis }] }],
    [
      "placement without group",
      { ...base(), placement: [{ id: "where", component: "api", relation: "parent", basis }] },
    ],
    [
      "root placement with group",
      { ...base(), placement: [{ id: "where", component: "api", relation: "root", group: "api", basis }] },
    ],
    [
      "placement group references resource",
      { ...base(), placement: [{ id: "where", component: "api", relation: "inside", group: "api", basis }] },
    ],
    ["whitespace-only component type", { ...base(), components: [{ ...base().components[0], type: "   " }] }],
  ])("rejects malformed input: %s", (_name, value, expectedCode) => {
    const result = validateRequirements(value);
    expect(result.isErr()).toBe(true);
    if (expectedCode) expect(result._unsafeUnwrapErr().issues.map((entry) => entry.code)).toContain(expectedCode);
  });

  it("matches exact resource identity even when another resource has the same type", () => {
    const diagram = doc();
    diagram.resources = diagram.resources.filter((resource) => resource.id !== "api");
    const missing = checkRequirements(diagram, validContract(base())).find(
      (entry) => entry.code === "missing-component",
    );
    expect(missing?.elementIds).toEqual(["api"]);
  });

  it("counts catalog types independently of explicit component IDs", () => {
    const contract = validContract({
      ...base(),
      counts: [{ id: "two-lambdas", kind: "resource", type: "aws.aws-lambda", min: 2, max: 2, basis }],
    });
    expect(checkRequirements(doc(), contract)).toEqual([]);
    contract.counts[0]!.min = 3;
    expect(checkRequirements(doc(), contract).map((entry) => entry.code)).toContain("count-out-of-range");
  });

  it("counts descendants in nested groups but excludes the scope group itself", () => {
    const contract = validContract({
      ...base(),
      components: [...base().components, { id: "root", kind: "group", type: "aws.region", basis }],
      counts: [
        {
          id: "nested-storage",
          kind: "resource",
          type: "aws.simple-storage-service",
          min: 1,
          max: 1,
          within: "root",
          basis,
        },
        { id: "no-regions-inside-region", kind: "group", type: "aws.region", max: 0, within: "root", basis },
        { id: "no-step-functions", kind: "resource", type: "aws.aws-step-functions", max: 0, basis },
      ],
    });
    expect(checkRequirements(doc(), contract)).toEqual([]);
  });

  it("rejects diagram duplicate node IDs and reversed relationship endpoints", () => {
    const contract = validContract({
      ...base(),
      components: [
        ...base().components,
        { id: "api2", kind: "resource", type: "aws.aws-lambda", basis },
        { id: "db", kind: "resource", type: "aws.simple-storage-service", basis },
      ],
      relationships: [{ id: "e1", source: "db", target: "api", basis }],
    });
    const diagram = doc();
    diagram.resources[1]!.id = "api";
    const issues = checkRequirements(diagram, contract);
    expect(issues.map((entry) => entry.code)).toContain("duplicate-element-id");
    expect(issues.map((entry) => entry.code)).toContain("relationship-endpoints-mismatch");
    expect(issues.find((entry) => entry.code === "relationship-endpoints-mismatch")?.elementIds).toEqual([
      "e1",
      "db",
      "api",
    ]);
  });

  it("reports actionable missing and mismatched relationship endpoints", () => {
    const contract = validContract({
      ...base(),
      components: [...base().components, { id: "db", kind: "resource", type: "aws.simple-storage-service", basis }],
      relationships: [{ id: "needed", source: "api", target: "db", basis }],
    });
    const missing = checkRequirements(doc(), contract).find((entry) => entry.code === "missing-relationship");
    expect(missing?.elementIds).toEqual(["api", "db"]);
    expect(missing?.message).toContain("Required edge needed: expected api → db; edge missing");

    contract.relationships[0]!.id = "e1";
    contract.relationships[0]!.source = "db";
    const mismatch = checkRequirements(doc(), contract).find(
      (entry) => entry.code === "relationship-endpoints-mismatch",
    );
    expect(mismatch?.elementIds).toEqual(["e1", "db", "db"]);
    expect(mismatch?.message).toContain("Edge e1 must connect db → db");
  });

  it("does not collapse separately required request and response edges into one bidirectional edge", () => {
    const contract = validContract({
      ...base(),
      components: [...base().components, { id: "db", kind: "resource", type: "aws.simple-storage-service", basis }],
      relationships: [
        { id: "request", source: "api", target: "db", basis },
        { id: "response", source: "db", target: "api", basis },
      ],
    });
    const diagram = doc();
    diagram.edges[0]!.kind = "bidirectional";
    const response = checkRequirements(diagram, contract).find((entry) => entry.requirementId === "response");
    expect(response?.code).toBe("missing-relationship");
    expect(response?.elementIds).toEqual(["db", "api"]);
  });

  it("checks edge kind only when constrained and treats omitted diagram kind as flow", () => {
    const contract = validContract({
      ...base(),
      components: [...base().components, { id: "db", kind: "resource", type: "aws.simple-storage-service", basis }],
      relationships: [{ id: "e1", source: "api", target: "db", kind: "flow", basis }],
    });
    expect(checkRequirements(doc(), contract)).toEqual([]);
    contract.relationships[0]!.kind = "fail";
    expect(checkRequirements(doc(), contract).map((entry) => entry.code)).toContain("relationship-kind-mismatch");
  });

  it("allows edge IDs to equal component IDs and rejects duplicate edges within their namespace", () => {
    const diagram = doc();
    diagram.resources.push({ id: "e1", type: "aws.aws-lambda", label: {}, role: "primary", props: {} });
    expect(checkRequirements(diagram, validContract(base())).map((entry) => entry.code)).not.toContain(
      "duplicate-element-id",
    );
    diagram.edges.push({ ...diagram.edges[0]!, source: "db", target: "api" });
    expect(checkRequirements(diagram, validContract(base())).map((entry) => entry.code)).toContain(
      "duplicate-element-id",
    );
  });

  it("matches grammar and component types", () => {
    const contract = validContract(base());
    const wrongGrammar = doc();
    wrongGrammar.grammar = "gcp";
    expect(checkRequirements(wrongGrammar, contract).map((entry) => entry.code)).toContain("grammar-mismatch");
    contract.components[0]!.type = "aws.simple-storage-service";
    expect(checkRequirements(doc(), contract).map((entry) => entry.code)).toContain("component-type-mismatch");
  });

  it("checks direct parent, transitive inside/outside, root, and cycle-safe hierarchy", () => {
    const contract = validContract({
      ...base(),
      components: [
        ...base().components,
        { id: "root", kind: "group", basis },
        { id: "app", kind: "group", basis },
        { id: "db", kind: "resource", type: "aws.simple-storage-service", basis },
      ],
      placement: [
        { id: "inside-root", component: "api", relation: "inside", group: "root", basis },
        { id: "parent-app", component: "api", relation: "parent", group: "app", basis },
        { id: "outside-app", component: "db", relation: "outside", group: "app", basis },
        { id: "root-is-root", component: "root", relation: "root", basis },
      ],
    });
    expect(checkRequirements(doc(), contract)).toEqual([]);

    const misplacedOutside = doc();
    misplacedOutside.resources.find((resource) => resource.id === "db")!.parent = "app";
    expect(checkRequirements(misplacedOutside, contract).map((entry) => entry.code)).toContain("placement-mismatch");

    const cycle = doc();
    cycle.groups.find((group) => group.id === "root")!.parent = "app";
    cycle.groups.find((group) => group.id === "app")!.parent = "root";
    expect(checkRequirements(cycle, contract).map((entry) => entry.code)).toContain("placement-mismatch");
  });

  it("forbids unlisted resources when requested", () => {
    const contract = validContract({ ...base(), allowAdditionalResources: false });
    expect(
      checkRequirements(doc(), contract)
        .filter((entry) => entry.code === "additional-resource")
        .map((entry) => entry.elementIds[0]),
    ).toEqual(["api2", "db"]);
  });
});

describe("project preferences", () => {
  const doc = parseDgmResult(`diagram prefs { grammar cloud-agnostic flow lr
    cloud-agnostic.server a cloud-agnostic.server b cloud-agnostic.server c
    a -> b { id ab label "send" step 1 }
    b -> c { id bc step 3 }
    c -> a { id ca label "retry" style dashed step 4 }
  }`)._unsafeUnwrap();
  const codes = (preferences = DEFAULT_PREFERENCES) => checkPreferences(doc, preferences).map((entry) => entry.code);

  it("defaults omitted values and rejects unknown or mistyped ones", () => {
    expect(parsePreferences('{ "$schema": "./preferences.schema.json" }')._unsafeUnwrap()).toEqual(DEFAULT_PREFERENCES);
    expect(
      parsePreferences('{ "numberedSteps": "yes", "badges": true }')
        ._unsafeUnwrapErr()
        .issues.map((entry) => entry.code),
    ).toEqual(["unknown-field", "invalid-boolean"]);
  });

  it("reports unlabeled edges, numbered secondary edges, step gaps, and flow", () => {
    expect(codes()).toEqual(["preference-label-missing", "preference-step-secondary", "preference-step-sequence"]);
    expect(codes({ numberedSteps: false, edgeLabels: false, flow: "tb" })).toEqual([
      "preference-flow",
      "preference-step-unwanted",
      "preference-step-unwanted",
      "preference-step-unwanted",
    ]);
  });

  it("accepts a contract override and model metadata", () => {
    const contract = {
      ...base(),
      preferences: { numberedSteps: false },
      generatedBy: { model: "claude-sonnet-5.5", reasoning: "low" },
    };
    expect(validateRequirements(contract).isOk()).toBe(true);
    expect(validateRequirements({ ...contract, generatedBy: { model: "" } }).isErr()).toBe(true);
  });
});
