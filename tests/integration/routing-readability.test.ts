import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { parseDgmResult } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramResult } from "@dumb-diagrams/runtime/render";
import type { LayoutResult, Point, Rect } from "@dumb-diagrams/runtime/core";
import { describe, expect, it } from "vitest";

const fixtureRoot = resolve(process.cwd(), "tests/fixtures/routing-readability");

function compile(slug: string): LayoutResult {
  const parsed = parseDgmResult(readFileSync(resolve(fixtureRoot, slug, "diagram.dgm"), "utf8"));
  if (parsed.isErr()) throw parsed.error;
  const compiled = compileDiagramResult(parsed.value);
  if (compiled.isErr()) throw new Error(compiled.error.message);
  return compiled.value.layout;
}

const segments = (points: Point[]) =>
  points.slice(1).map((point, index) => Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y));
const bends = (layout: LayoutResult, id: string) => layout.edges.find((edge) => edge.id === id)!.points.length - 2;
const crossesFrame = (rect: Rect, frame: Rect) => {
  const inside = (x: number, y: number) => x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
  const spansX = rect.x < frame.x + frame.w && rect.x + rect.w > frame.x;
  const spansY = rect.y < frame.y + frame.h && rect.y + rect.h > frame.y;
  return (
    (spansX && (inside(rect.x + 1, frame.y) || inside(rect.x + 1, frame.y + frame.h))) ||
    (spansY && (inside(frame.x, rect.y + 1) || inside(frame.x + frame.w, rect.y + 1)))
  );
};

describe("routing readability review cases", () => {
  it("leaves no few-pixel jogs in any reviewed route", () => {
    for (const slug of readdirSync(fixtureRoot)) {
      for (const edge of compile(slug).edges) {
        expect(Math.min(...segments(edge.points)), `${slug}/${edge.id}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("keeps the telemetry label off the group frame", () => {
    const layout = compile("aws-factory-iot-telemetry");
    const label = layout.edges.find((edge) => edge.id === "ts_dashboard")!.labelRect!;
    expect(layout.groups.some((group) => crossesFrame(label, group.bounds))).toBe(false);
  });

  it("replaces detours with simple routes", () => {
    expect(bends(compile("aws-document-processing"), "ops_dlq")).toBeLessThanOrEqual(3);
    expect(bends(compile("azure-industrial-iot-telemetry"), "dashboard_cosmos")).toBeLessThanOrEqual(3);
    expect(bends(compile("azure-private-order-processing"), "api_bus")).toBeLessThanOrEqual(4);
    expect(bends(compile("cloud-agnostic-order-processing"), "rdb_app")).toBeLessThanOrEqual(2);
  });
});
