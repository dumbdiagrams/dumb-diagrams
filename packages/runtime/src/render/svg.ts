import { getCatalogEntry } from "../catalog/index.js";
import type { AnnotationStyle, DiagramDocument, LayoutResult } from "../core/index.js";
import { EDGE_COLOR_VALUES, getDefaultView, resolveEdgeColor } from "../core/index.js";
import { GRAMMAR, GROUP_STYLES } from "../grammar-aws/index.js";

import { embedAssetsInSvg, inlineCatalogIcons, resolveResourceIcon } from "./assets.js";

export interface RenderOptions {
  resolveIconHref?: (browserPath: string) => string;
}

const defaultResolve = (p: string) => p;

export function renderSvg(
  doc: DiagramDocument,
  layout: LayoutResult,
  options: RenderOptions = {},
): string {
  const resolveHref = options.resolveIconHref ?? defaultResolve;
  const canvas = layout.canvasBounds ?? {
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  };
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}">`,
  );
  parts.push(
    `<rect width="100%" height="100%" fill="${GRAMMAR.canvasFill}"/>`,
  );
  const arrowMarkers = Object.entries(EDGE_COLOR_VALUES)
    .map(([name, color]) => `<marker id="${name === "graphite" ? "arrow" : `arrow-${name}`}" markerWidth="10" markerHeight="10" refX="9.5" refY="5" viewBox="0 0 10 10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M0,0 L10,5 L0,10 Z" fill="${color}"/>
  </marker>`)
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
      else parts.push(renderAnnotation(item.value, view.annotations?.[item.id]));
    });

  parts.push("</svg>");
  return embedAssetsInSvg(parts.join("\n"), doc);
}

export async function renderPortableSvg(
  doc: DiagramDocument,
  layout: LayoutResult,
  options: { loadCatalogSvg?: (browserPath: string) => Promise<string> } = {},
): Promise<string> {
  const liveSvg = renderSvg(doc, layout, { resolveIconHref: (path) => path });
  return inlineCatalogIcons(liveSvg, options);
}

function renderGroup(
  doc: DiagramDocument,
  group: LayoutResult["groups"][number],
  resolveHref: (p: string) => string,
): string {
  const style = GROUP_STYLES[group.kind];
  const dash = style.dash ? `stroke-dasharray="${style.dash}"` : "";
  const iconPath = groupIconPath(doc, group);
  const labelRect = group.labelRect ?? group.header;
  const labelPosition = group.labelPosition ?? "top-left";
  const bottom = labelPosition.startsWith("bottom");
  const iconX = labelRect.x;
  const iconY = bottom ? group.bounds.y + group.bounds.h - style.iconSize : group.bounds.y;
  const iconTag = iconPath
    ? `<image href="${escapeAttr(resolveHref(iconPath))}" x="${iconX}" y="${iconY}" width="${style.iconSize}" height="${style.iconSize}" preserveAspectRatio="none"/>`
    : "";

  // Iconless source groups still carry the legacy full-header rect (which
  // reserves room for a possible icon). Anchor the visible text itself to the
  // right edge so that "top-right" and "bottom-right" are actual corners.
  const textOnRight = !iconPath && labelPosition.endsWith("right");
  const textX = iconPath
    ? iconX + style.iconSize + 8
    : textOnRight
      ? labelRect.x + labelRect.w - 8
      : labelRect.x + 8;
  const textY = (bottom ? group.bounds.y + group.bounds.h - (iconPath ? style.iconSize / 2 : style.headerHeight / 2) : iconY + (iconPath ? style.iconSize / 2 : style.headerHeight / 2)) + style.fontSize * 0.35;
  const model = doc.groups.find((candidate) => candidate.id === group.id);
  const badgeOnLeft = (group.labelPosition ?? model?.labelPosition ?? "top-left") === "top-right";
  const badgeX = badgeOnLeft ? group.bounds.x + 14 : group.bounds.x + group.bounds.w - 14;
  const badge = model?.step === undefined ? "" : `
  <circle class="group-badge-circle" cx="${badgeX}" cy="${group.bounds.y + 12}" r="10" fill="${GRAMMAR.badgeFill}"/>
  <text class="group-badge-text" x="${badgeX}" y="${group.bounds.y + 16}" text-anchor="middle" font-size="12" fill="${GRAMMAR.badgeText}" font-weight="700">${model.step}</text>`;

  return `
<g id="group-${group.id}">
  <rect x="${group.bounds.x}" y="${group.bounds.y}" width="${group.bounds.w}" height="${group.bounds.h}"
    fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" ${dash} rx="${style.cornerRadius}"/>
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
  const resolved = resolveResourceIcon(
    doc,
    node.resourceType,
    resource?.props ?? {},
  );
  let iconTag = "";
  if (resolved.kind === "asset" && resolved.assetId) {
    iconTag = `<use href="#asset-${resolved.assetId}" x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}"/>`;
  } else if (resolved.kind === "catalog" && resolved.href) {
    iconTag = `<image href="${escapeAttr(resolveHref(resolved.href))}" x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}"/>`;
  } else {
    iconTag = `<rect x="${node.icon.x}" y="${node.icon.y}" width="${node.icon.w}" height="${node.icon.h}" fill="#eee"/>`;
  }

  const serviceLines = node.serviceLines?.length ? node.serviceLines : [node.serviceLabel];
  const roleLines = node.roleLines?.length
    ? node.roleLines
    : node.roleLabel
      ? [node.roleLabel]
      : [];
  const labelX = node.label.x + node.label.w / 2;
  const labelFirstY = node.label.y + GRAMMAR.labelLineHeight - 4;
  const serviceText = serviceLines
    .map((line, index) =>
      `<text x="${labelX}" y="${labelFirstY + GRAMMAR.labelLineHeight * index}" text-anchor="middle" font-size="${GRAMMAR.serviceFontSize}" font-weight="500">${escapeXml(line)}</text>`
    )
    .join("\n  ");
  const roleStartY = labelFirstY + serviceLines.length * GRAMMAR.labelLineHeight + 2;
  const roleText = roleLines
    .map((line, index) =>
      `<text x="${labelX}" y="${roleStartY + index * GRAMMAR.labelLineHeight}" text-anchor="middle" font-size="${GRAMMAR.roleFontSize}" font-style="italic">${escapeXml(line)}</text>`
    )
    .join("\n  ");

  return `
<g id="res-${node.id}">
  ${iconTag}
  ${serviceText}
  ${roleText}
</g>`;
}

function renderEdge(edge: LayoutResult["edges"][number]): string {
  if (edge.points.length < 2) return "";
  const d = edge.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const color = resolveEdgeColor(edge.color, edge.kind);
  const colorName = edge.color ?? (edge.kind === "fail" ? "red" : "graphite");
  const markerId = colorName === "graphite" ? "arrow" : `arrow-${colorName}`;
  const hasArrow = edge.kind !== "peer";
  const isBidirectional = edge.kind === "bidirectional";
  const dash =
    edge.style === "dashed" ? `stroke-dasharray="${GRAMMAR.edgeDash}"` : "";
  const marker = [
    isBidirectional ? `marker-start="url(#${markerId})"` : "",
    hasArrow ? `marker-end="url(#${markerId})"` : "",
  ].filter(Boolean).join(" ");
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
  const w = place?.w ?? 160;
  const h = place?.h ?? 48;
  const style: AnnotationStyle = annotation.style ?? "paper";
  const groupStart = `<g id="annotation-${annotation.id}" data-annotation-style="${style}" class="annotation annotation-${style}">`;

  if (style === "text") {
    const fontSize = annotation.fontSize ?? 14;
    const lineHeight = Math.round(fontSize * 1.42);
    const fontFamily = annotation.font === "serif"
      ? "Georgia, Cambria, Times New Roman, serif"
      : annotation.font === "mono"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : GRAMMAR.textFontFamily;
    const align = annotation.align ?? "left";
    const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
    const maxChars = Math.max(8, Math.floor(Math.max(24, w - 4) / (fontSize * 0.56)));
    const maxLines = Math.max(1, Math.floor(Math.max(fontSize, h - 8) / lineHeight));
    return `
${groupStart}
  ${renderAnnotationLines(annotation.text, textX, y + fontSize + 3, maxChars, lineHeight, maxLines, GRAMMAR.edgeColor, fontFamily, fontSize, align)}
</g>`;
  }

  if (style === "code") {
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#183452" stroke="#244068" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="${w}" height="28" rx="10" fill="#244068"/>
  <rect x="${x}" y="${y + 18}" width="${w}" height="10" fill="#244068"/>
  <circle cx="${x + 14}" cy="${y + 14}" r="4" fill="#E66231"/>
  <circle cx="${x + 28}" cy="${y + 14}" r="4" fill="#F8A23F"/>
  <circle cx="${x + 42}" cy="${y + 14}" r="4" fill="#7BC4A0"/>
  ${renderAnnotationLines(annotation.text, x + 14, y + 50, Math.max(12, Math.floor((w - 28) / 8.1)), 17, 10, "#d1fae5", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")}
</g>`;
  }

  if (style === "callout") {
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FBE4DA" stroke="#E3A489" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="#C94F2C"/>
  <circle cx="${x + 28}" cy="${y + 28}" r="12" fill="#C94F2C"/>
  <text x="${x + 28}" y="${y + 33}" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">i</text>
  ${renderAnnotationLines(annotation.text, x + 50, y + 27, Math.max(12, Math.floor((w - 64) / 7.1)), 18, 4, "#244068")}
</g>`;
  }

  if (style === "checklist") {
    const lines = annotationLines(annotation.text, Math.max(10, Math.floor((w - 58) / 7.2)), 5);
    const items = lines
      .map((line, index) => {
        const itemY = y + 28 + index * 24;
        return `
  <rect x="${x + 16}" y="${itemY - 12}" width="14" height="14" rx="3" fill="#ffffff" stroke="#4f9b69" stroke-width="1.4"/>
  <path d="M ${x + 19} ${itemY - 5} l 3 3 l 6 -7" fill="none" stroke="#4f9b69" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${x + 40}" y="${itemY}" font-size="12" fill="#2F6E56">${escapeXml(line || " ")}</text>`;
      })
      .join("");
    return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#eff9f2" stroke="#71a987" stroke-width="1.5"/>
  <text x="${x + 16}" y="${y + 18}" font-size="10" font-weight="700" letter-spacing="1.2" fill="#4f7658">CHECKLIST</text>${items}
</g>`;
  }

  return `
${groupStart}
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FFF0D5" stroke="#F8A23F" stroke-width="1.5"/>
  <path d="M ${x + w - 28} ${y} H ${x + w} V ${y + 28} Z" fill="#F7D391"/>
  <path d="M ${x + w - 28} ${y} V ${y + 28} H ${x + w}" fill="none" stroke="#F8A23F" stroke-width="1"/>
  ${renderAnnotationLines(annotation.text, x + 14, y + 25, Math.max(12, Math.floor((w - 28) / 7.1)), 18, 5, "#244068")}
</g>`;
}

function annotationLines(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) {
      lines.push("");
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > maxChars) {
      const splitAt = remaining.lastIndexOf(" ", maxChars);
      const take = splitAt > Math.floor(maxChars * 0.45) ? splitAt : maxChars;
      lines.push(remaining.slice(0, take));
      remaining = remaining.slice(take).trimStart();
    }
    lines.push(remaining);
  }
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  const last = visible[maxLines - 1] ?? "";
  visible[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
  return visible;
}

function renderAnnotationLines(
  text: string,
  x: number,
  firstY: number,
  maxChars: number,
  lineHeight: number,
  maxLines: number,
  fill: string,
  fontFamily?: string,
  fontSize = 12,
  align: "left" | "center" | "right" = "left",
): string {
  const lines = annotationLines(text, maxChars, maxLines);
  const family = fontFamily ? ` font-family="${fontFamily}"` : "";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  return `<text x="${x}" y="${firstY}" text-anchor="${anchor}" font-size="${fontSize}" fill="${fill}"${family}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line || " ")}</tspan>`)
    .join("")}</text>`;
}

function groupIconPath(
  doc: DiagramDocument,
  group: LayoutResult["groups"][number],
): string | null {
  const model = doc.groups.find((candidate) => candidate.id === group.id);
  if (model?.type) {
    const entry = getCatalogEntry(model.type);
    if (entry?.browserPath) return entry.browserPath;
  }
  const fallbackType = `aws.${group.kind === "subnet-public" ? "subnet.public" : group.kind === "subnet-private" ? "subnet.private" : group.kind}`;
  return getCatalogEntry(fallbackType)?.browserPath ?? null;
}

function isEntityVisible(
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  id: string,
): boolean {
  let parent = doc.resources.find((resource) => resource.id === id)?.parent
    ?? doc.groups.find((group) => group.id === id)?.parent;
  while (parent) {
    if (view.places[parent]?.visible === false) return false;
    parent = doc.groups.find((group) => group.id === parent)?.parent;
  }
  return true;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeXml(s);
}
