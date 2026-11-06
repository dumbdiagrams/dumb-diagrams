import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { checkRequirements, parseRequirements } from "@dumb-diagrams/runtime/requirements";
import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramResult } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { frozenMemo } from "../helpers/frozen-memo";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/automatic-quality");
const slugs = readdirSync(fixtureRoot).sort();
const hardDeterminismCases = [
  "aws-document-processing",
  "azure-private-order-processing",
  "gcp-media-processing",
  "cloud-agnostic-order-processing",
];
// One frozen compile per fixture; the determinism test compares it with a fresh one.
const compileOnce = frozenMemo((slug: string) => compileDiagramResult(loadFixture(slug).doc));
function loadFixture(slug: string) {
  const dir = resolve(fixtureRoot, slug);
  const source = readFileSync(resolve(dir, "diagram.dgm"), "utf8");
  const requirementsText = readFileSync(resolve(dir, "requirements.json"), "utf8");
  const parsed = parseDgmResult(source);
  expect(parsed.isOk(), `${slug}: ${parsed.isErr() ? parsed.error.message : ""}`).toBe(true);
  if (parsed.isErr()) throw parsed.error;
  const requirements = parseRequirements(requirementsText);
  expect(requirements.isOk(), `${slug}: ${requirements.isErr() ? requirements.error.message : ""}`).toBe(true);
  if (requirements.isErr()) throw requirements.error;
  return { doc: parsed.value, requirements: requirements.value };
}

describe("frozen automatic-quality inputs", () => {
  it("contains the complete set of sixteen four-file source bundles", () => {
    expect(slugs).toHaveLength(16);
    for (const slug of slugs) {
      expect(readdirSync(resolve(fixtureRoot, slug)).sort()).toEqual([
        "architecture-brief.md",
        "diagram.dgm",
        "requirements.json",
        "user-prompt.md",
      ]);
    }
  });

  for (const slug of slugs) {
    it(`${slug} parses and its contract covers every authored component and edge`, () => {
      const { doc, requirements } = loadFixture(slug);
      const componentIds = [
        ...requirements.components.filter((item) => item.kind === "group").map((item) => item.id),
        ...requirements.components.filter((item) => item.kind === "resource").map((item) => item.id),
      ].sort();
      expect(componentIds).toEqual([...doc.groups.map((item) => item.id), ...doc.resources.map((item) => item.id)].sort());
      expect(requirements.components.every((item) => item.basis.text.trim().length > 0)).toBe(true);
      expect(requirements.relationships.map(({ id, source, target }) => ({ id, source, target })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        doc.edges.map(({ id, source, target }) => ({ id, source, target })).sort((a, b) => a.id.localeCompare(b.id)),
      );
      expect(requirements.relationships.every((item) => item.basis.text.trim().length > 0)).toBe(true);
      expect(checkRequirements(doc, requirements)).toEqual([]);

      const compiled = compileOnce(slug);
      expect(compiled.isOk(), `${slug}: ${compiled.isErr() ? compiled.error.message : ""}`).toBe(true);
      if (compiled.isErr()) return;
      const { layout, invariantFailures, issues, svg } = compiled.value;
      expect(issues, `${slug}: compiler warnings`).toEqual([]);
      expect(invariantFailures.filter((finding) => finding.code !== "edge-crossing"), `${slug}: routing and decoration findings`).toEqual([]);
      expect(layout.nodes.map(({ id }) => id).sort()).toEqual(doc.resources.map(({ id }) => id).sort());
      expect(layout.edges.map(({ id, source, target }) => ({ id, source, target })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        doc.edges.map(({ id, source, target }) => ({ id, source, target })).sort((a, b) => a.id.localeCompare(b.id)),
      );
      for (const edge of layout.edges) {
        expect(edge.points.length, `${slug}: ${edge.id} must remain visibly connected`).toBeGreaterThanOrEqual(2);
        expect(new Set(edge.points.map((point) => `${point.x},${point.y}`)).size, `${slug}: ${edge.id} must have nonzero length`).toBeGreaterThanOrEqual(2);
      }
      expect(svg).not.toContain('class="edge-bridge"');
      if (hardDeterminismCases.includes(slug)) {
        for (const edge of layout.edges) {
          const source = layout.nodes.find((node) => node.id === edge.source)!;
          const target = layout.nodes.find((node) => node.id === edge.target)!;
          expect(hitsLabel(edge.points[0]!, edge.points[1]!, source.label), `${slug}: ${edge.id} source caption`).toBe(false);
          expect(hitsLabel(edge.points.at(-2)!, edge.points.at(-1)!, target.label), `${slug}: ${edge.id} target caption`).toBe(false);
        }
      }
    });
  }

  for (const slug of hardDeterminismCases) {
    it(`${slug} produces identical routes and layout on repeated compilation`, () => {
      const { doc } = loadFixture(slug);
      const first = compileOnce(slug);
      const second = compileDiagramResult(doc);
      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      if (first.isErr() || second.isErr()) return;
      expect(first.value.layout).toEqual(second.value.layout);
    });
  }

  it("routes the AWS static-site visitor to DNS in one straight horizontal segment", () => {
    const { doc } = loadFixture("aws-static-website-delivery");
    const compiled = compileDiagramResult(doc);
    expect(compiled.isOk()).toBe(true);
    if (compiled.isErr()) return;
    const route = compiled.value.layout.edges.find((edge) => edge.id === "resolve_site");
    expect(route).toBeDefined();
    expect(route!.points).toHaveLength(2);
    expect(route!.points[0]!.y).toBe(route!.points[1]!.y);
  });

  it("keeps the Azure private-application VNet compact", () => {
    const { doc } = loadFixture("azure-private-application-api");
    const compiled = compileDiagramResult(doc);
    expect(compiled.isOk()).toBe(true);
    if (compiled.isErr()) return;
    const network = compiled.value.layout.groups.find((group) => group.id === "app-network");
    expect(network).toBeDefined();
    expect(network!.bounds.w).toBeLessThan(300);
  });
});

function hitsLabel(a: { x: number; y: number }, b: { x: number; y: number }, rect: { x: number; y: number; w: number; h: number }) {
  if (!rect.w || !rect.h) return false;
  if (a.x === b.x) return a.x > rect.x && a.x < rect.x + rect.w && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.h;
  return a.y === b.y && a.y > rect.y && a.y < rect.y + rect.h && Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.w;
}
