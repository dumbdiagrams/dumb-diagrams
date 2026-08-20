import { getCatalogEntry } from "@dumb-diagrams/catalog";
import type { DiagramDocument, LayoutResult } from "@dumb-diagrams/core";
import { getDefaultView } from "@dumb-diagrams/core";
import { GRAMMAR, GROUP_STYLES } from "@dumb-diagrams/grammar-aws";

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
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`,
  );
  parts.push(
    `<rect width="100%" height="100%" fill="${GRAMMAR.canvasFill}"/>`,
  );
  parts.push(`<defs>
  <marker id="arrow" markerWidth="10" markerHeight="10" refX="9.5" refY="5" viewBox="0 0 10 10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M0,0 L10,5 L0,10 Z" fill="${GRAMMAR.edgeColor}"/>
  </marker>
  <style>text{font-family:${GRAMMAR.fontFamily};fill:#232F3E}</style>
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
  const iconX = group.bounds.x;
  const iconY = group.bounds.y;
  const iconTag = iconPath
    ? `<image href="${escapeAttr(resolveHref(iconPath))}" x="${iconX}" y="${iconY}" width="${style.iconSize}" height="${style.iconSize}" preserveAspectRatio="none"/>`
    : "";

  const textX = iconPath ? iconX + style.iconSize + 8 : group.bounds.x + 8;
  const textY = iconY + (iconPath ? style.iconSize / 2 : style.headerHeight / 2) + style.fontSize * 0.35;

  return `
<g id="group-${group.id}">
  <rect x="${group.bounds.x}" y="${group.bounds.y}" width="${group.bounds.w}" height="${group.bounds.h}"
    fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" ${dash} rx="${style.cornerRadius}"/>
  ${iconTag}
  <text x="${textX}" y="${textY}"
    font-size="${style.fontSize}" font-weight="${style.fontWeight}" dominant-baseline="alphabetic">${escapeXml(group.label)}</text>
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

  const serviceY = node.icon.y + node.icon.h + GRAMMAR.labelLineHeight;
  const roleY = serviceY + GRAMMAR.labelLineHeight + 2;

  const roleLine = node.roleLabel
    ? `<text x="${node.label.x + node.label.w / 2}" y="${roleY}" text-anchor="middle" font-size="${GRAMMAR.roleFontSize}">${escapeXml(node.roleLabel)}</text>`
    : "";

  return `
<g id="res-${node.id}">
  ${iconTag}
  <text x="${node.label.x + node.label.w / 2}" y="${serviceY}" text-anchor="middle" font-size="${GRAMMAR.serviceFontSize}" font-weight="500">${escapeXml(node.serviceLabel)}</text>
  ${roleLine}
</g>`;
}

function renderEdge(edge: LayoutResult["edges"][number]): string {
  if (edge.points.length < 2) return "";
  const d = edge.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const dash =
    edge.style === "dashed" ? `stroke-dasharray="${GRAMMAR.edgeDash}"` : "";
  const marker = edge.style === "dashed" ? "" : `marker-end="url(#arrow)"`;
  const markerOverlay =
    edge.style === "dashed"
      ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="${GRAMMAR.edgeStroke}" marker-end="url(#arrow)"/>`
      : "";

  let badge = "";
  if (edge.badge && edge.step !== undefined) {
    badge = `
  <circle cx="${edge.badge.x}" cy="${edge.badge.y}" r="${GRAMMAR.badgeRadius}" fill="${GRAMMAR.badgeFill}"/>
  <text x="${edge.badge.x}" y="${edge.badge.y + 4}" text-anchor="middle" font-size="11" fill="${GRAMMAR.badgeText}" font-weight="600">${edge.step}</text>`;
  }

  let label = "";
  if (edge.label && edge.points.length >= 2) {
    const mid = edge.points[Math.floor(edge.points.length / 2)]!;
    label = `<text x="${mid.x}" y="${mid.y - 8}" text-anchor="middle" font-size="11" fill="${GRAMMAR.edgeColor}">${escapeXml(edge.label)}</text>`;
  }

  return `
<g id="edge-${edge.id}">
  <path d="${d}" fill="none" stroke="${GRAMMAR.edgeColor}" stroke-width="${GRAMMAR.edgeStroke}" stroke-linecap="butt" stroke-linejoin="round" ${dash} ${marker}/>
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
  return `
<g id="annotation-${annotation.id}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fff7d6" stroke="#d4a72c" stroke-width="1.5"/>
  <text x="${x + 12}" y="${y + 24}" font-size="12" fill="#232F3E">${escapeXml(annotation.text)}</text>
</g>`;
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
