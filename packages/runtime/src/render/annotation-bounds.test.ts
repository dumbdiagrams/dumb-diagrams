import { describe, expect, it } from "vitest";
import { createEmptyDocument, type LayoutResult } from "../core/index.js";
import { parseDgmResult, printDgm } from "../dsl/index.js";
import { compileDiagram } from "./compile.js";
import {
  annotationTextLayout,
  fitAnnotationRect,
  getAnnotationBounds,
  renderSvg,
  resolveAnnotationBounds,
} from "./index.js";

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

  describe("fitting notes to their text", () => {
    const longText = "Reliability: request and result DLQs handle exhausted consumer retries, not business outcomes.";
    const notes = (view: Record<string, { w?: number; h?: number; x?: number; y?: number }> = {}) => {
      const doc = createEmptyDocument("fit");
      doc.annotations = [
        { id: "short", text: "Status", style: "callout" },
        { id: "long", text: longText, style: "callout" },
      ];
      doc.views[0]!.annotations = view;
      return doc;
    };

    it("sizes unsized notes to their text instead of one shared default", () => {
      const bounds = resolveAnnotationBounds(notes(), emptyLayout);
      expect(bounds.short!.w).toBeLessThan(bounds.long!.w);
      expect(bounds.long!.w).toBeLessThanOrEqual(300);
      expect(bounds.short!.h).toBeLessThan(104);
      for (const id of ["short", "long"]) {
        const note = notes().annotations.find((a) => a.id === id)!;
        expect(bounds[id]!.h).toBe(annotationTextLayout(note, bounds[id]!.w).contentHeight);
      }
    });

    it("treats a pinned note at the untouched style default size as unsized", () => {
      const view = { short: { x: 10, y: 10, w: 280, h: 104, pin: true } };
      expect(resolveAnnotationBounds(notes(view), emptyLayout).short).toMatchObject({ x: 10, y: 10 });
      expect(resolveAnnotationBounds(notes(view), emptyLayout).short!.w).toBeLessThan(280);
    });

    it("keeps an authored width but fits the height, so widening shrinks and narrowing grows", () => {
      const at = (w: number) => resolveAnnotationBounds(notes({ long: { x: 0, y: 0, w } }), emptyLayout).long!;
      expect(at(120).h).toBeGreaterThan(at(200).h);
      expect(at(200).h).toBeGreaterThan(at(400).h);
      expect(at(400).w).toBe(400);
    });

    it("honours an authored height as a minimum and never clips the text", () => {
      const tall = resolveAnnotationBounds(notes({ short: { x: 0, y: 0, w: 200, h: 300 } }), emptyLayout).short!;
      expect(tall.h).toBe(300);
      const clipped = resolveAnnotationBounds(notes({ long: { x: 0, y: 0, w: 200, h: 20 } }), emptyLayout).long!;
      expect(clipped.h).toBeGreaterThan(20);
    });

    it("fits a resize drag: reflows height, preserves the opposite edge, and snaps to auto height", () => {
      const note = notes().annotations.find((a) => a.id === "long")!;
      const start = { x: 100, y: 100, w: 300, h: 80 };
      const narrow = fitAnnotationRect(note, { x: 100, y: 100, w: 140, h: 80 }, "se");
      expect(narrow.autoHeight).toBe(true);
      expect(narrow.h).toBe(annotationTextLayout(note, 140).contentHeight);
      expect(narrow.x).toBe(start.x);
      expect(narrow.y).toBe(start.y);

      const fromWest = fitAnnotationRect(note, { x: 260, y: 100, w: 140, h: 80 }, "w");
      expect(fromWest.x + fromWest.w).toBe(400);
      const fromNorth = fitAnnotationRect(note, { x: 100, y: 140, w: 300, h: 40 }, "n");
      expect(fromNorth.y + fromNorth.h).toBe(180);

      const tallerThanText = fitAnnotationRect(note, { x: 100, y: 100, w: 300, h: 260 }, "s");
      expect(tallerThanText).toMatchObject({ autoHeight: false, h: 260 });
      expect(fitAnnotationRect(note, { x: 0, y: 0, w: 10, h: 10 }, "se").w).toBeGreaterThanOrEqual(80);
    });

    it("places a note anchored to a nested group beside it, inside the enclosing boundaries", () => {
      const parsed = parseDgmResult(`diagram nested {
  grammar cloud-agnostic
  cloud-agnostic.boundary outer "Outer" {
    cloud-agnostic.boundary left "Left" { cloud-agnostic.server a "A" }
    cloud-agnostic.boundary right "Right" { cloud-agnostic.server b "B" }
  }
  annotation about_left "Left side does the work." { anchor left style callout }
  a -> b { id e1 }
}`);
      const doc = parsed._unsafeUnwrap();
      const { layout } = compileDiagram(doc);
      const note = getAnnotationBounds(doc, layout, "about_left")!;
      const outer = layout.groups.find((g) => g.id === "outer")!.bounds;
      const left = layout.groups.find((g) => g.id === "left")!.bounds;
      const hits = (r: typeof note, o: typeof note) =>
        r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y;
      const within = (r: typeof note, o: typeof note) =>
        r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;
      const right = layout.groups.find((g) => g.id === "right")!.bounds;
      expect(hits(note, left)).toBe(false);
      expect(hits(note, right)).toBe(false);
      // Never straddles the enclosing boundary: fully inside or fully outside.
      expect(!hits(note, outer) || within(note, outer)).toBe(true);
      const distance = Math.hypot(
        note.x + note.w / 2 - (left.x + left.w / 2),
        note.y + note.h / 2 - (left.y + left.h / 2),
      );
      expect(distance).toBeLessThan(500);
    });
  });
});
