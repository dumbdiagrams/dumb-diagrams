import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { describe, expect, it } from "vitest";

import { repoRoot } from "../../../scripts/lib/example-manifest.mjs";
import { loadReference, matchReference, parseReferenceEdge } from "../../../scripts/lib/reference-contract.mjs";

const root = repoRoot();
const prompts = readdirSync(resolve(root, "examples/prompts"))
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .map((name) => name.slice(0, -3));
const fixtureDirs = ["hard", "stable"].map((dir) => resolve(root, "tests/fixtures/readability", dir));
const fixtures = fixtureDirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".dgm"))
    .map((name) => ({ name, path: resolve(dir, name), prompt: name.replace(/^[a-z]+-/, "").slice(0, -4) })),
);
const KNOWN_MISSES: Record<string, string[]> = {
  "luna-cloud-agnostic-medium-team-project-portal.dgm": [
    "missing network (cloud-agnostic.network)",
    "cache is not inside network",
    "database is not inside network",
    "server is not inside network",
  ],
};

const parse = (source: string) => parseDgmResult(source)._unsafeUnwrap();

describe("prompt reference contracts", () => {
  it.each(prompts)("%s has a well-formed reference", (prompt) => {
    const reference = loadReference(prompt);
    expect(reference, `examples/prompts/${prompt}.reference.json`).toBeDefined();
    expect(prompt.startsWith(reference.grammar)).toBe(true);
    const roles = Object.keys(reference.roles);
    for (const [name, role] of Object.entries<{ types: string[]; within?: string; outside?: string }>(reference.roles)) {
      for (const type of role.types) expect(getCatalogEntry(type), `${name}: ${type}`).toBeDefined();
      for (const other of [role.within, role.outside].filter(Boolean)) expect(roles).toContain(other);
    }
    for (const edge of reference.edges) {
      for (const option of parseReferenceEdge(edge).alternatives) expect(roles).toEqual(expect.arrayContaining([option.from, option.to]));
    }
  });

  it.each(fixtures)("scores $name against its prompt", ({ name, path, prompt }) => {
    const result = matchReference(parse(readFileSync(path, "utf8")), loadReference(prompt));
    expect(result.exhausted).toBe(false);
    expect(result.failures).toEqual(KNOWN_MISSES[name] ?? []);
  });

  it("matches by role rather than authored IDs and rejects reversed or extra flow", () => {
    const reference = {
      grammar: "cloud-agnostic",
      exclusive: true,
      roles: {
        client: { types: ["cloud-agnostic.client"], outside: "network" },
        network: { types: ["cloud-agnostic.network"] },
        server: { types: ["cloud-agnostic.server"], within: "network" },
        database: { types: ["cloud-agnostic.database"], within: "network" },
      },
      edges: ["client -> server", "server -- database"],
    };
    const source = (flow: string, extra = "") => `dgm 1
diagram t {
  grammar cloud-agnostic
  cloud-agnostic.client user "User"
  cloud-agnostic.network net "Private network" {
    cloud-agnostic.server app "App"
    cloud-agnostic.database db "DB"
    ${extra}
  }
  ${flow}
}
`;
    expect(matchReference(parse(source("user -> app\n  db -> app")), reference).failures).toEqual([]);
    expect(matchReference(parse(source("app -> user\n  app -> db")), reference).failures).toEqual([
      "missing edge client -> server",
    ]);
    expect(
      matchReference(parse(source("user -> app\n  app -> db", 'cloud-agnostic.cache extra "Cache"')), reference).failures,
    ).toEqual(["unrequested resources: extra (cloud-agnostic.cache)"]);
  });
});
