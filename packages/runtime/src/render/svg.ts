import { getCatalogEntry } from "../catalog/index.js";
import type { AnnotationStyle, DiagramDocument, LayoutResult } from "../core/index.js";
import { EDGE_COLOR_VALUES, getDefaultView, resolveEdgeColor } from "../core/index.js";
import { GRAMMAR, GROUP_STYLES } from "../grammar-aws/index.js";
import { darkContrastStrokeMarkup, deriveAnnotationAccent, needsDarkContrastAid } from "./contrast.js";
import { resolveProviderGroupColors } from "./provider-group-colors.js";
import { annotationTextLayout, resolveAnnotationBounds } from "./annotation-bounds.js";
import { resolveAnnotationColors } from "./annotation-themes.js";
import type { ResultAsync } from "neverthrow";
import {
  embedAssetsInSvg,
  inlineCatalogIcons,
  resolveResourceIcon,
  type PortableSvgError,
  type PortableSvgOptions,
} from "./assets.js";

export interface RenderOptions {
  resolveIconHref?: (browserPath: string) => string;
}

const defaultResolve = (p: string) => p;

export function renderSvg(doc: DiagramDocument, layout: LayoutResult, options: RenderOptions = {}): string {
  const resolveHref = options.resolveIconHref ?? defaultResolve;
  const bounds = resolveAnnotationBounds(doc, layout);
  const authoredCanvas = layout.canvasBounds ?? {
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  };
  const noteRects = Object.values(bounds);
  const minX = Math.min(authoredCanvas.x, ...noteRects.map((r) => r.x));
  const minY = Math.min(authoredCanvas.y, ...noteRects.map((r) => r.y));
  const maxX = Math.max(authoredCanvas.x + authoredCanvas.w, ...noteRects.map((r) => r.x + r.w));
  const maxY = Math.max(authoredCanvas.y + authoredCanvas.h, ...noteRects.map((r) => r.y + r.h));
  const canvas = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${GRAMMAR.canvasFill}"/>`);
  const arrowMarkers = Object.entries(EDGE_COLOR_VALUES)
    .map(([name, color]) => {
      const markerId = name === "graphite" ? "arrow" : `arrow-${name}`;
      return `<marker id="${markerId}" markerWidth="10" markerHeight="10" refX="9.5" refY="5" viewBox="0 0 10 10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M0,0 L10,5 L0,10 Z" fill="${color}"/>
  </marker>
  <marker id="${markerId}-start" markerWidth="10" markerHeight="10" refX="9.5" refY="5" viewBox="0 0 10 10" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M0,0 L10,5 L0,10 Z" fill="${color}"/>
  </marker>`;
    })
    .join("\n  ");
  parts.push(`<defs>
  ${arrowMarkers}
  <style>text{font-family:${GRAMMAR.fontFamily};fill:${GRAMMAR.edgeColor}}.group-badge-text,.edge-badge-text{fill:${GRAMMAR.badgeText}} g[data-annotation-style="text"] text{font-family:${GRAMMAR.textFontFamily};font-size:14px}</style>
</defs>`);

  const view = getDefaultView(doc);
  const paintables = [
    ...layout.groups.map((group) => ({ kind: "group" as const, id: group.id, value: group })),
    ...layout.edges.map((edge) => ({ kind: "edge" as const, id: edge.id, value: edge })),
    ...layout.nodes.map((node) => ({ kind: "node" as const, id: node.id, value: node })),
    ...doc.annotations.map((annotation) => ({ kind: "annotation" as const, id: annotation.id, value: annotation })),
  ];
  const rank = { group: 0, edge: 1, node: 2, annotation: 3 };
  paintables
    .filter((item) => {
      const place = item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id];
      if (place?.visible === false) return false;
      if (item.kind === "edge") {
        const edge = doc.edges.find((candidate) => candidate.id === item.id);
        return Boolean(edge && isEntityVisible(doc, view, edge.source) && isEntityVisible(doc, view, edge.target));
      }
      return isEntityVisible(doc, view, item.id);
    })
    .sort((a, b) => {
      const az = view.places[a.id]?.zIndex ?? view.annotations?.[a.id]?.zIndex ?? 0;
      const bz = view.places[b.id]?.zIndex ?? view.annotations?.[b.id]?.zIndex ?? 0;
      return az - bz || rank[a.kind] - rank[b.kind];
    })
    .forEach((item) => {
      if (item.kind === "group") parts.push(renderGroup(doc, item.value, resolveHref));
      else if (item.kind === "node") parts.push(renderNode(doc, item.value, resolveHref));
      else if (item.kind === "edge") parts.push(renderEdge(item.value));
      else parts.push(renderAnnotation(item.value, bounds[item.id]));
    });

  parts.push("</svg>");
  return embedAssetsInSvg(parts.join("\n"), doc);
}

export function renderPortableSvg(
  doc: DiagramDocument,
  layout: LayoutResult,
  options: PortableSvgOptions = {},
): ResultAsync<string, PortableSvgError> {
  const liveSvg = renderSvg(doc, layout, { resolveIconHref: (path) => path });
  return inlineCatalogIcons(liveSvg, options);
}

function renderGroup(
  doc: DiagramDocument,
  group: LayoutResult["groups"][number],
  resolveHref: (p: string) => string,
): string {
  const model = doc.groups.find((candidate) => candidate.id === group.id);
  const baseStyle = GROUP_STYLES[group.kind];
  const providerColors = resolveProviderGroupColors(doc.grammar, model?.type);
  const style = providerColors ? { ...baseStyle, stroke: providerColors.stroke, fill: providerColors.fill } : baseStyle;
  const stroke = model?.color ? EDGE_COLOR_VALUES[model.color] : style.stroke;
  const fill = model?.fill === "none" ? "transparent" : model?.color ? colorWithAlpha(stroke, 0.045) : style.fill;
  const dashed = model?.style ? model.style === "dashed" : Boolean(style.dash);
  const dash = dashed ? `stroke-dasharray="${style.dash ?? GRAMMAR.edgeDash}"` : "";
  const iconPath = groupIconPath(doc, group);
  const labelRect = group.labelRect ?? group.header;
  const labelPosition = group.labelPosition ?? "top-left";
  const onRight = labelPosition.endsWith("right");
  const iconX = onRight ? group.bounds.x + group.bounds.w - style.iconSize : labelRect.x;
  const iconY = group.bounds.y;
  const iconTag = iconPath
    ? `<image href="${escapeAttr(resolveHref(iconPath))}" x="${iconX}" y="${iconY}" width="${style.iconSize}" height="${style.iconSize}" preserveAspectRatio="none"/>`
    : "";

  // Mirror the complete icon-and-copy composition at the right edge. This
  // keeps the group icon flush to that boundary and places its text directly
  // to the left, just as the default puts the icon flush to the left edge.
  const textOnRight = onRight;
  const textX = textOnRight
    ? iconPath
      ? iconX - 8
      : group.bounds.x + group.bounds.w - 8
    : iconPath
      ? iconX + style.iconSize + 8
      : labelRect.x + 8;
  const textY = iconY + (iconPath ? style.iconSize / 2 : style.headerHeight / 2) + style.fontSize * 0.35;
  const badgeOnLeft = (group.labelPosition ?? model?.labelPosition ?? "top-left").endsWith("right");
  const badgeX = badgeOnLeft ? group.bounds.x + 14 : group.bounds.x + group.bounds.w - 14;
  const badge =
    model?.step === undefined
      ? ""
      : `
  <circle class="group-badge-circle" cx="${badgeX}" cy="${group.bounds.y + 12}" r="10" fill="${GRAMMAR.badgeFill}"/>
  <text class="group-badge-text" x="${badgeX}" y="${group.bounds.y + 16}" text-anchor="middle" font-size="12" fill="${GRAMMAR.badgeText}" font-weight="700">${model.step}</text>`;
  const contrastStroke = needsDarkContrastAid(stroke)
    ? darkContrastStrokeMarkup(
        group.bounds.x,
        group.bounds.y,
        group.bounds.w,
        group.bounds.h,
        style.strokeWidth,
        dash,
        style.cornerRadius,
      )
    : "";

  return `
<g id="group-${group.id}">${contrastStroke}
  <rect class="group-border" x="${group.bounds.x}" y="${group.bounds.y}" width="${group.bounds.w}" height="${group.bounds.h}"
    fill="${fill}" stroke="${stroke}" stroke-width="${style.strokeWidth}" ${dash} rx="${style.cornerRadius}"/>
  ${iconTag}
  <text x="${textX}" y="${textY}"
    font-size="${style.fontSize}" font-weight="${style.fontWeight}" dominant-baseline="alphabetic"${textOnRight ? ' text-anchor="end"' : ""}>${escapeXml(group.label)}</text>
  ${badge}
</g>`;
}

function renderNode(
  doc: DiagramDocument,
  node: LayoutResult["nodes"][number],
  resolveHref: (p: string) => string,
): string {
  const resource = doc.resources.find((candidate) => candidate.id === node.id);
  const resolved = resolveResourceIcon(doc, node.resourceType, resource?.props ?? {});
  let iconTag = "";
  if (resolved.kind === "asset" && resolved.assetId) {
    iconTag = `<use href="#asset-${resolved.assetId}" x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}"/>`;
  } else if (resolved.kind === "catalog" && resolved.href) {
    iconTag = `<image href="${escapeAttr(resolveHref(resolved.href))}" x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}"/>`;
  } else {
    iconTag = `<rect x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}" fill="#eee"/>`;
  }

  const serviceLines = node.serviceLines?.length ? node.serviceLines : [node.serviceLabel];
  const roleLines = node.roleLines?.length ? node.roleLines : node.roleLabel ? [node.roleLabel] : [];
  const labelX = node.label.x + node.label.w / 2;
  const labelFirstY = node.label.y + GRAMMAR.labelLineHeight - 4;
  const serviceText = serviceLines
    .map(
      (line, index) =>
        `<text x="${labelX}" y="${labelFirstY + GRAMMAR.labelLineHeight * index}" text-anchor="middle" font-size="${GRAMMAR.serviceFontSize}" font-weight="500">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const roleStartY = labelFirstY + serviceLines.length * GRAMMAR.labelLineHeight + 2;
  const roleText = roleLines
    .map(
      (line, index) =>
        `<text x="${labelX}" y="${roleStartY + index * GRAMMAR.labelLineHeight}" text-anchor="middle" font-size="${GRAMMAR.roleFontSize}" font-style="italic">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  if (doc.hideResourceLabels) {
    const title = [node.serviceLabel, node.roleLabel].filter(Boolean).join(": ");
    return `
<g id="res-${node.id}">
  <title>${escapeXml(title)}</title>
  ${iconTag}
</g>`;
  }
  return `
<g id="res-${node.id}">
  ${iconTag}
  ${serviceText}
  ${roleText}
</g>`;
}

function renderEdge(edge: LayoutResult["edges"][number]): string {
  if (edge.points.length < 2) return "";
  const d = edge.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const color = resolveEdgeColor(edge.color, edge.kind);
  const colorName = edge.color ?? (edge.kind === "fail" ? "red" : "graphite");
  const markerId = colorName === "graphite" ? "arrow" : `arrow-${colorName}`;
  const hasArrow = edge.kind !== "peer";
  const isBidirectional = edge.kind === "bidirectional";
  const dash = edge.style === "dashed" ? `stroke-dasharray="${GRAMMAR.edgeDash}"` : "";
  const marker = [
    isBidirectional ? `marker-start="url(#${markerId}-start)"` : "",
    hasArrow ? `marker-end="url(#${markerId})"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const markerOverlay =
    edge.style === "dashed" && hasArrow
      ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="${GRAMMAR.edgeStroke}" ${marker}/>`
      : "";

  let badge = "";
  if (edge.badge && edge.step !== undefined) {
    badge = `
  <circle class="edge-badge-circle" cx="${edge.badge.x}" cy="${edge.badge.y}" r="${GRAMMAR.badgeRadius}" fill="${color}"/>
  <text class="edge-badge-text" x="${edge.badge.x}" y="${edge.badge.y + 4}" text-anchor="middle" font-size="12" fill="${GRAMMAR.badgeText}" font-weight="700">${edge.step}</text>`;
  }

  let label = "";
  if (edge.label && edge.points.length >= 2) {
    const point = edge.labelPoint ?? edge.points[Math.floor(edge.points.length / 2)]!;
    label = `<text class="edge-label" data-edge-label="${escapeXml(edge.id)}" x="${point.x}" y="${point.y}" text-anchor="middle" font-size="11" fill="${color}">${escapeXml(edge.label)}</text>`;
  }

  return `
<g id="edge-${edge.id}" class="edge edge-${edge.kind ?? "flow"} edge-${edge.style}">
  <path d="${d}" fill="none" stroke="${color}" stroke-width="${GRAMMAR.edgeStroke}" stroke-linecap="butt" stroke-linejoin="round" ${dash} ${marker}/>
  ${markerOverlay}
  ${badge}
  ${label}
</g>`;
}

function renderAnnotation(
  annotation: DiagramDocument["annotations"][number],
  place?: { x?: number; y?: number; w?: number; h?: number },
): string {
  const x = place?.x ?? 48;
  const y = place?.y ?? 48;
  const style: AnnotationStyle = annotation.style ?? "paper";
  const w = place?.w ?? { text: 240, paper: 220, code: 420, callout: 280, checklist: 260 }[style];
  const h = place?.h ?? 48;
  const fontSize = annotation.fontSize ?? (style === "code" ? 13 : 12);
  const textLayout = annotationTextLayout(annotation, w);
  const customFont = textLayout.fontFamily;
  const align = annotation.align ?? "left";
  const alignedX = (left: number, right: number) =>
    align === "center" ? x + left + (w - left - right) / 2 : align === "right" ? x + w - right : x + left;
  const { background: bg, color: ink } = resolveAnnotationColors(annotation);
  const accent = deriveAnnotationAccent(bg) ?? { stroke: "#d4c4b8", accent: "#a89588" };
  const groupStart = `<g id="annotation-${annotation.id}" data-annotation-style="${style}"${annotation.background || annotation.color ? ' data-custom-color="true"' : ""} class="annotation annotation-${style}">`;

  if (style === "text") {
    const fontSize = annotation.fontSize ?? 14;
    const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 12 : x + 12;
    return `
${groupStart}${annotation.background ? `\n  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${bg}"/>` : ""}
  ${renderAnnotationLines(textLayout.lines, textX, y + textLayout.top, textLayout.lineHeight, annotation.background ? ink : "var(--annotation-ink, #163964)", customFont, fontSize, align)}
</g>`;
  }

  if (style === "code") {
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${bg}" stroke="#163964" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="${w}" height="28" rx="10" fill="#163964"/>
  <rect x="${x}" y="${y + 18}" width="${w}" height="10" fill="#163964"/>
  <circle cx="${x + 14}" cy="${y + 14}" r="4" fill="#f0531e"/>
  <circle cx="${x + 28}" cy="${y + 14}" r="4" fill="#f7982c"/>
  <circle cx="${x + 42}" cy="${y + 14}" r="4" fill="#7BC4A0"/>
  ${renderAnnotationLines(textLayout.lines, alignedX(14, 14), y + textLayout.top, textLayout.lineHeight, ink, customFont, fontSize, align, true)}
</g>`;
  }

  if (style === "callout") {
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${bg}" stroke="${accent.stroke}" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${accent.accent}"/>
  <circle cx="${x + 28}" cy="${y + Math.max(28, textLayout.top / 2)}" r="12" fill="${accent.accent}"/>
  <text x="${x + 28}" y="${y + Math.max(33, textLayout.top / 2 + 5)}" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF" style="fill:#FFFFFF">i</text>
  ${renderAnnotationLines(textLayout.lines, alignedX(50, 14), y + textLayout.top, textLayout.lineHeight, ink, customFont, fontSize, align)}
</g>`;
  }

  if (style === "checklist") {
    const mark = accent.accent;
    const items = textLayout.lines
      .map((line, index) => {
        const itemY = y + textLayout.top + index * textLayout.rowHeight;
        const rowX = alignedX(40, 18);
        const rowAnchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
        return `
  <rect x="${x + 16}" y="${itemY - 12}" width="14" height="14" rx="3" fill="#ffffff" stroke="${mark}" stroke-width="1.4"/>
  <path d="M ${x + 19} ${itemY - 5} l 3 3 l 6 -7" fill="none" stroke="${mark}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <text data-annotation-content="true" x="${rowX}" y="${itemY}" text-anchor="${rowAnchor}" font-size="${fontSize}" font-family="${escapeAttr(customFont)}" fill="${ink}" style="fill:${ink};font-family:${escapeAttr(customFont)};font-size:${fontSize}px">${escapeXml(line || " ")}</text>`;
      })
      .join("");
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${bg}" stroke="${accent.stroke}" stroke-width="1.5"/>
  <text x="${x + 16}" y="${y + 18}" font-size="10" font-weight="700" letter-spacing="1.2" fill="${ink}">CHECKLIST</text>${items}
</g>`;
  }

  return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${bg}" stroke="${accent.stroke}" stroke-width="1.5"/>
  <path d="M ${x + w - 28} ${y} H ${x + w} V ${y + 28} Z" fill="${accent.stroke}"/>
  <path d="M ${x + w - 28} ${y} V ${y + 28} H ${x + w}" fill="none" stroke="${accent.stroke}" stroke-width="1"/>
  ${renderAnnotationLines(textLayout.lines, alignedX(14, 14), y + textLayout.top, textLayout.lineHeight, ink, customFont, fontSize, align)}
</g>`;
}

function renderAnnotationLines(
  lines: string[],
  x: number,
  firstY: number,
  lineHeight: number,
  fill: string,
  fontFamily: string,
  fontSize: number,
  align: "left" | "center" | "right" = "left",
  preserveWhitespace = false,
): string {
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  return `<text data-annotation-content="true" x="${x}" y="${firstY}" text-anchor="${anchor}" font-size="${fontSize}" font-family="${escapeAttr(fontFamily)}" xml:space="${preserveWhitespace ? "preserve" : "default"}" fill="${fill}" style="fill:${fill};font-family:${escapeAttr(fontFamily)};font-size:${fontSize}px">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line || " ")}</tspan>`)
    .join("")}</text>`;
}

function groupIconPath(doc: DiagramDocument, group: LayoutResult["groups"][number]): string | null {
  const model = doc.groups.find((candidate) => candidate.id === group.id);
  if (model?.type === "cloud-agnostic.boundary") return null;
  if (model?.hideIcon) return null;
  if (model?.type) {
    const entry = getCatalogEntry(model.type);
    if (entry?.browserPath) return entry.browserPath;
  }
  // Legacy shorthand logical/overlay groups are intentionally iconless.
  // Keep the historical AWS icon fallback for infrastructure groups authored
  // without an explicit catalog type.
  if (group.kind === "logical" || group.kind === "overlay") return null;
  const fallbackType = `aws.${group.kind === "subnet-public" ? "subnet.public" : group.kind === "subnet-private" ? "subnet.private" : group.kind}`;
  return getCatalogEntry(fallbackType)?.browserPath ?? null;
}

function colorWithAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  return `rgba(${Number.parseInt(match[1]!, 16)},${Number.parseInt(match[2]!, 16)},${Number.parseInt(match[3]!, 16)},${alpha})`;
}

function isEntityVisible(doc: DiagramDocument, view: ReturnType<typeof getDefaultView>, id: string): boolean {
  let parent =
    doc.resources.find((resource) => resource.id === id)?.parent ?? doc.groups.find((group) => group.id === id)?.parent;
  while (parent) {
    if (view.places[parent]?.visible === false) return false;
    parent = doc.groups.find((group) => group.id === parent)?.parent;
  }
  return true;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeXml(s);
}
