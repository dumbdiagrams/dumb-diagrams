import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import {
  checkRequirements,
  parsePreferences,
  parseRequirements,
  preferencesSchema,
  requirementsSchema,
} from "@dumb-diagrams/runtime/requirements";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const template = resolve(root, "packages/cli/templates/project/.dumbdiagrams");

describe("initialized architecture requirements", () => {
  it("ships the runtime schema unchanged", () => {
    expect(JSON.parse(readFileSync(resolve(template, "requirements.schema.json"), "utf8"))).toEqual(requirementsSchema);
    expect(JSON.parse(readFileSync(resolve(template, "preferences.schema.json"), "utf8"))).toEqual(preferencesSchema);
    expect(parsePreferences(readFileSync(resolve(template, "../preferences.json"), "utf8")).isOk()).toBe(true);
  });

  it("provides a valid contract example with distinct intent and source", () => {
    const requirements = parseRequirements(readFileSync(resolve(template, "requirements.example.json"), "utf8"));
    const source = parseDgmResult(`dgm 1
diagram example {
  grammar cloud-agnostic
  cloud-agnostic.client client "External client"
  cloud-agnostic.cloud cloud "Cloud" {
    cloud-agnostic.server api "API server"
  }
  client -> api { id request kind flow }
}`);
    expect(requirements.isOk()).toBe(true);
    expect(source.isOk()).toBe(true);
    if (requirements.isErr() || source.isErr()) return;
    expect(checkRequirements(source.value, requirements.value)).toEqual([]);
    const incomplete = { ...source.value, edges: [] };
    expect(checkRequirements(incomplete, requirements.value)).toEqual(
      expect.arrayContaining([expect.objectContaining({ requirementId: "request", elementIds: ["client", "api"] })]),
    );
  });

  it("keeps completeness ahead of bounded layout repairs", () => {
    const instructions = readFileSync(resolve(template, "instructions.md"), "utf8");
    expect(instructions).toContain("write the requirements contract before the `.dgm`");
    expect(instructions).toContain("two");
    expect(instructions).toContain("Never weaken the contract");
    expect(instructions).toContain("An omission recorded in the brief does not satisfy a requirement");
  });
});
