import {
  getCatalogEntry,
  getCatalogEntryByBrowserPath,
} from "../catalog/index.js";
import type { DiagramDocument } from "../core/index.js";

import { sanitizeSvg } from "./sanitize-svg.js";

export function resolveResourceIcon(
  doc: DiagramDocument,
  resourceType: string,
  props: Record<string, unknown>,
): {
  kind: "catalog" | "asset" | "none";
  href?: string;
  assetId?: string;
  content?: string;
} {
  const assetId = props.iconAsset as string | undefined;
  if (assetId) {
    const asset = doc.assets?.find((candidate) => candidate.id === assetId);
    if (asset) return { kind: "asset", assetId, content: asset.content };
  }
  const entry = getCatalogEntry(resourceType);
  if (entry) return { kind: "catalog", href: entry.browserPath };
  return { kind: "none" };
}

export function embedAssetsInSvg(svg: string, doc: DiagramDocument): string {
  if (!doc.assets?.length) return svg;
  const defs = doc.assets
    .map((asset) => {
      const sanitized = sanitizeSvg(asset.content);
      return `<symbol id="asset-${escapeAttr(asset.id)}" viewBox="0 0 ${sanitized.intrinsicW} ${sanitized.intrinsicH}">${stripOuterSvg(sanitized.content)}</symbol>`;
    })
    .join("\n");
  return svg.replace("<defs>", `<defs>\n${defs}\n`);
}

export interface PortableSvgOptions {
  /** Optional loader used by the CLI or a static export worker. */
  loadCatalogSvg?: (browserPath: string) => Promise<string>;
}

/** A portable export cannot resolve relative catalog paths without a loader/base URL. */
export class PortableSvgError extends Error {
  readonly code = "catalog-loader-required";

  constructor(browserPath: string) {
    super(`Catalog icon loader required for ${browserPath}; pass loadCatalogSvg when exporting outside a browser`);
    this.name = "PortableSvgError";
  }
}

/** Replace catalog image hrefs with data URLs for portable exports. */
export async function inlineCatalogIcons(
  svg: string,
  options: PortableSvgOptions = {},
): Promise<string> {
  const load = options.loadCatalogSvg ?? (async (browserPath: string) => {
    const baseUrl = typeof document !== "undefined" ? document.baseURI : undefined;
    if (!baseUrl) throw new PortableSvgError(browserPath);
    if (typeof fetch === "undefined") {
      throw new Error(`No browser loader is available for ${browserPath}`);
    }
    const url = new URL(browserPath.replace(/^\/+/, ""), baseUrl).toString();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load catalog icon ${browserPath}`);
    return response.text();
  });
  const hrefs = [...svg.matchAll(/<image\b[^>]*\bhref="([^"]+)"[^>]*\/?>(?:<\/image>)?/gi)]
    .map((match) => match[1]!)
    .filter((href) => !href.startsWith("data:"));
  const replacements = new Map<string, string>();
  for (const href of [...new Set(hrefs)]) {
    const browserPath = browserPathFromHref(href);
    const entry = getCatalogEntryByBrowserPath(browserPath);
    if (!entry) continue;
    const sanitized = sanitizeIconSvg(await load(entry.browserPath));
    replacements.set(href, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`);
  }
  let output = svg;
  for (const [href, replacement] of replacements) {
    output = output.split(`href="${href}"`).join(`href="${replacement}"`);
  }
  return output;
}

function browserPathFromHref(href: string): string {
  try {
    const parsed = new URL(href, "http://dumb-diagrams.invalid/");
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const marker = path.indexOf("catalog-icons/");
    return marker >= 0 ? path.slice(marker) : path;
  } catch {
    return href.replace(/^\/+/, "");
  }
}

function sanitizeIconSvg(content: string): string {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(content)) {
    throw new Error("Catalog icon is not an SVG document");
  }
  if (/<(?:script|foreignObject)\b|\bon[a-z]+\s*=|javascript:/i.test(content)) {
    throw new Error("Catalog icon contains unsafe SVG content");
  }
  return content;
}

function stripOuterSvg(content: string): string {
  return content
    .replace(/^\s*(?:<\?xml[^>]*>\s*)?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
