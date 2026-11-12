import { describe, expect, it } from "vitest";
import { createEmptyDocument, type LayoutResult } from "../core/index.js";
import { parseDgmResult, printDgm } from "../dsl/index.js";
import { getAnnotationBounds, renderSvg, resolveAnnotationBounds } from "./index.js";

const emptyLayout: LayoutResult = { nodes: [], groups: [], edges: [], width: 320, height: 240, symmetries: [] };

describe("annotation bounds and rendering", () => {
  it("sizes long note content without clipping and separates notes sharing generated defaults", () => {
    const doc = createEmptyDocument("notes");
    doc.annotations = ["paper", "code", "callout", "checklist", "text", "paper"].map((style, i) => ({
      id: `n${i}`,
      style: style as "paper",
      text: `${"line of text ".repeat(30)}\nsecond line`,
    }));
    const before = structuredClone(doc);
    const bounds = resolveAnnotationBounds(doc, emptyLayout);
    expect(doc).toEqual(before);
    for (const note of doc.annotations) expect(bounds[note.id]!.h).toBeGreaterThan(48);
    const rects = Object.values(bounds);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!,
          b = rects[j]!;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    expect(renderSvg(doc, emptyLayout)).toContain("line of text");
    expect(getAnnotationBounds(doc, emptyLayout, "n0")).toEqual(bounds.n0);
  });

  it("preserves authored positions and round-trips validated custom colors", async () => {
    const source = `diagram notes {\n annotation n "full content" { style callout background "#112233" color "#abcdef" }\n}\nview default { annotation n { x 17 y 23 w 300 h 40 } }`;
    const doc = parseDgmResult(source)._unsafeUnwrap();
    expect(doc.annotations[0]).toMatchObject({ background: "#112233", color: "#abcdef" });
    const printed = printDgm(doc);
    expect(parseDgmResult(printed)._unsafeUnwrap().annotations[0]).toMatchObject({
      background: "#112233",
      color: "#abcdef",
    });
    expect(parseDgmResult(source.replace("#abcdef", "red")).isErr()).toBe(true);
    const layout = { ...emptyLayout, canvasBounds: { x: 0, y: 0, w: 320, h: 240 } };
    expect(getAnnotationBounds(doc, layout, "n")).toEqual({ x: 17, y: 23, w: 300, h: 58 });
    expect(renderSvg(doc, layout)).toContain('fill="#112233"');
  });

  it("uses shared wrapping and typography for narrow, large-font styles and text colors", () => {
    const doc = createEmptyDocument("large-notes");
    doc.annotations = [
      {
        id: "text",
        style: "text",
        text: "small narrow text content",
        font: "serif",
        fontSize: 48,
        color: "#abcdef",
        background: "#112233",
      },
      { id: "callout", style: "callout", text: "large callout text that wraps", font: "mono", fontSize: 48 },
      { id: "checklist", style: "checklist", text: "large checklist text that wraps", font: "serif", fontSize: 48 },
      { id: "code", style: "code", text: "  first\n    second", font: "serif", fontSize: 48 },
    ];
    const view = doc.views[0]!;
    view.annotations = Object.fromEntries(doc.annotations.map(({ id }) => [id, { x: 0, y: 0, w: 80 }]));
    const bounds = resolveAnnotationBounds(doc, emptyLayout);
    for (const note of doc.annotations) expect(bounds[note.id]!.h).toBeGreaterThan(100);
    const svg = renderSvg(doc, emptyLayout);
    expect(svg).toContain('data-custom-color="true"');
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('font-family="Georgia, Cambria, Times New Roman, serif"');
    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain('<tspan x="14" dy="0"> </tspan>');
  });

  it("keeps a cluster of generated notes near the graph and apart", () => {
    const doc = createEmptyDocument("note-cluster");
    doc.annotations = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`,
      text: `note ${i}`,
      style: "paper" as const,
    }));
    doc.views[0]!.annotations = Object.fromEntries(doc.annotations.map(({ id }) => [id, { x: 48, y: 48 }]));
    const boxes = Object.values(resolveAnnotationBounds(doc, emptyLayout));
    const centerX = boxes.reduce((sum, r) => sum + r.x + r.w / 2, 0) / boxes.length;
    const centerY = boxes.reduce((sum, r) => sum + r.y + r.h / 2, 0) / boxes.length;
    expect(Math.hypot(centerX - 32, centerY - 48)).toBeLessThan(600);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!,
          b = boxes[j]!;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
  });
});
