import type { DiagramDocument, LayoutResult, Rect } from "../core/index.js";
import { getDefaultView } from "../core/index.js";
import { GRAMMAR } from "../grammar-aws/index.js";

const defaults: Record<string, Rect> = {
  paper: { x: 0, y: 0, w: 220, h: 96 },
  text: { x: 0, y: 0, w: 240, h: 48 },
  code: { x: 0, y: 0, w: 420, h: 160 },
  callout: { x: 0, y: 0, w: 280, h: 104 },
  checklist: { x: 0, y: 0, w: 260, h: 152 },
};
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const area = (r: Rect[]) => r.reduce((n, v) => n + v.w * v.h, 0);

function lines(text: string, chars: number, keepIndent = false): string[] {
  const result: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) {
      result.push("");
      continue;
    }
    let rest = raw;
    while (rest.length > chars) {
      if (keepIndent) {
        result.push(rest.slice(0, chars));
        rest = rest.slice(chars);
      } else {
        const cut = rest.lastIndexOf(" ", chars);
        const n = cut > chars * 0.45 ? cut : chars;
        result.push(rest.slice(0, n));
        rest = rest.slice(n).trimStart();
      }
    }
    result.push(rest);
  }
  return result;
}

export function annotationTextLayout(annotation: DiagramDocument["annotations"][number], width: number) {
  const style = annotation.style ?? "paper";
  const fontSize = annotation.fontSize ?? (style === "text" ? 14 : style === "code" ? 13 : 12);
  const mono = annotation.font === "mono" || (style === "code" && annotation.font === undefined);
  const fontFamily =
    annotation.font === "serif"
      ? "Georgia, Cambria, Times New Roman, serif"
      : mono
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : annotation.font === "sans"
          ? GRAMMAR.textFontFamily
          : style === "text"
            ? GRAMMAR.textFontFamily
            : GRAMMAR.fontFamily;
  const left =
    style === "code" ? 14 : style === "callout" ? 50 : style === "checklist" ? 40 : style === "text" ? 12 : 14;
  const right = style === "code" ? 14 : style === "callout" ? 14 : style === "checklist" ? 18 : 14;
  const availableWidth = Math.max(1, width - left - right);
  const chars = Math.max(1, Math.floor(availableWidth / (fontSize * (mono ? 0.62 : 0.56))));
  const lineHeight = Math.ceil(fontSize * (style === "code" ? 1.3 : 1.42));
  const textLines = lines(annotation.text, chars, style === "code");
  const top =
    style === "code"
      ? 28 + fontSize + 12
      : style === "callout"
        ? Math.max(30, fontSize + 16)
        : style === "checklist"
          ? Math.max(32, fontSize + 16)
          : style === "paper"
            ? fontSize + 12
            : fontSize + 10;
  const rowHeight = Math.max(24, Math.ceil(fontSize * 1.4));
  const contentHeight =
    style === "checklist"
      ? top + textLines.length * rowHeight + 12
      : top + textLines.length * lineHeight + (style === "code" ? 12 : 10);
  return { lines: textLines, fontSize, fontFamily, lineHeight, chars, top, rowHeight, contentHeight, left, right };
}

function minimumWidth(annotation: DiagramDocument["annotations"][number]): number {
  const style = annotation.style ?? "paper";
  const size = annotation.fontSize ?? (style === "text" ? 14 : style === "code" ? 13 : 12);
  const inset = style === "callout" ? 64 : style === "checklist" ? 58 : style === "code" ? 28 : 24;
  const monospace = annotation.font === "mono" || (style === "code" && annotation.font === undefined);
  return inset + size * (monospace ? 0.62 : 0.58);
}

function minimum(annotation: DiagramDocument["annotations"][number], width: number): number {
  return annotationTextLayout(annotation, width).contentHeight;
}

function annotationObstacles(layout: LayoutResult): Rect[] {
  return [...layout.nodes.map((n) => n.obstacle), ...layout.groups.map((g) => g.bounds)];
}

function isGroupAncestor(doc: DiagramDocument, groupId: string, entityId: string): boolean {
  let parent =
    doc.resources.find((r) => r.id === entityId)?.parent ?? doc.groups.find((g) => g.id === entityId)?.parent;
  while (parent) {
    if (parent === groupId) return true;
    parent = doc.groups.find((g) => g.id === parent)?.parent;
  }
  return false;
}

export function resolveAnnotationBounds(doc: DiagramDocument, layout: LayoutResult): Record<string, Rect> {
  const view = getDefaultView(doc);
  const obstacles = annotationObstacles(layout);
  const result: Record<string, Rect> = Object.create(null) as Record<string, Rect>;
  const placed: Rect[] = [];
  // Reserve authored positions before placing any automatic note.
  for (const annotation of doc.annotations) {
    const place = view.annotations?.[annotation.id];
    const implicitDefault = place?.x === 48 && place?.y === 48 && !place.manual && !place.pin && !place.locked;
    if (place?.x !== undefined && place.y !== undefined && !implicitDefault) {
      const base = defaults[annotation.style ?? "paper"] ?? defaults.paper!;
      const w = Math.max(80, minimumWidth(annotation), place.w ?? base.w);
      const h = Math.max(minimum(annotation, w), place.h ?? base.h);
      const rect = { x: place.x, y: place.y, w, h };
      result[annotation.id] = rect;
      placed.push(rect);
    }
  }
  for (const annotation of doc.annotations) {
    const place = view.annotations?.[annotation.id];
    const style = annotation.style ?? "paper";
    const base = defaults[style] ?? defaults.paper!;
    const w = Math.max(80, minimumWidth(annotation), place?.w ?? base.w);
    const h = Math.max(minimum(annotation, w), place?.h ?? base.h);
    const implicitDefault = place?.x === 48 && place?.y === 48 && !place.manual && !place.pin && !place.locked;
    const explicitlyPlaced = place?.x !== undefined && place?.y !== undefined && !implicitDefault;
    if (explicitlyPlaced) continue;
    const anchor = annotation.anchor;
    const node = layout.nodes.find((n) => n.id === anchor);
    const group = layout.groups.find((g) => g.id === anchor);
    const edge = layout.edges.find((e) => e.id === anchor);
    const point = node
      ? { x: node.obstacle.x + node.obstacle.w, y: node.obstacle.y + node.obstacle.h / 2 }
      : group
        ? { x: group.bounds.x + group.bounds.w, y: group.bounds.y + group.bounds.h / 2 }
        : edge?.points.length
          ? edge.points[Math.floor(edge.points.length / 2)]!
          : { x: Math.max(0, ...obstacles.map((r) => r.x + r.w)) + 32, y: 48 };
    const candidates = [
      { x: point.x + 24, y: point.y - h / 2 },
      { x: point.x - w - 24, y: point.y - h / 2 },
      { x: point.x - w / 2, y: point.y + 28 },
      { x: point.x - w / 2, y: point.y - h - 28 },
    ];
    const permittedGroups = node ? layout.groups.filter((g) => isGroupAncestor(doc, g.id, node.id)) : [];
    const occupied = [
      ...layout.nodes.map((n) => n.obstacle),
      ...layout.groups.filter((g) => !permittedGroups.some((permitted) => permitted.id === g.id)).map((g) => g.bounds),
      ...placed,
    ];
    const search: Rect[] = [...candidates.map((r) => ({ ...r, w, h }))];
    const step = Math.max(24, Math.min(w, h) / 3);
    for (let ring = 1; ring <= 18; ring++) {
      const d = ring * step;
      search.push(
        { x: point.x + 24 + d, y: point.y - h / 2, w, h },
        { x: point.x - w - 24 - d, y: point.y - h / 2, w, h },
        { x: point.x - w / 2, y: point.y + 28 + d, w, h },
        { x: point.x - w / 2, y: point.y - h - 28 - d, w, h },
        { x: point.x + 24 + d, y: point.y - h / 2 - d, w, h },
        { x: point.x - w - 24 - d, y: point.y - h / 2 + d, w, h },
      );
    }
    const scored = search.map((r) => {
      const collisions = area(occupied.filter((o) => overlap(r, o)));
      const distance = Math.hypot(r.x + r.w / 2 - point.x, r.y + r.h / 2 - point.y);
      return { r, cost: collisions * 1000 + distance };
    });
    scored.sort((a, b) => a.cost - b.cost);
    let chosen: Rect | undefined = scored.find(({ r }) => !occupied.some((o) => overlap(r, o)))?.r;
    if (!chosen) {
      const x = Math.max(point.x + 24, ...occupied.map((r) => r.x + r.w + 24));
      let y = Math.max(0, point.y - h / 2);
      let fallback = { x, y, w, h };
      while (occupied.some((r) => overlap(fallback, r))) {
        y = Math.max(y + h + 24, ...occupied.filter((r) => overlap(fallback, r)).map((r) => r.y + r.h + 24));
        fallback = { x, y, w, h };
      }
      chosen = fallback;
    }
    result[annotation.id] = chosen;
    placed.push(chosen);
  }
  return result;
}

export function getAnnotationBounds(doc: DiagramDocument, layout: LayoutResult, id: string): Rect | null {
  return resolveAnnotationBounds(doc, layout)[id] ?? null;
}
