import { getCatalogEntry, getCatalogEntryByBrowserPath } from "../catalog/index.js";
import { errAsync, okAsync, ResultAsync } from "neverthrow";

import type { DiagramDocument } from "../core/index.js";

import { sanitizeSvgResult } from "./sanitize-svg.js";

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
  // compileDiagram rejects unsafe assets first; direct renderSvg callers get them omitted, never embedded.
  const defs = doc.assets
    .flatMap((asset) =>
      sanitizeSvgResult(asset.content).match(
        (sanitized) => [
          `<symbol id="asset-${escapeAttr(asset.id)}" viewBox="0 0 ${sanitized.intrinsicW} ${sanitized.intrinsicH}">${stripOuterSvg(sanitized.content)}</symbol>`,
        ],
        () => [],
      ),
    )
    .join("\n");
  return svg.replace("<defs>", `<defs>\n${defs}\n`);
}

export interface PortableSvgOptions {
  /** Typed loader used by the CLI or a static export worker. */
  loadCatalogSvg?: (browserPath: string) => ResultAsync<string, PortableSvgError>;
}

export type PortableSvgError = {
  readonly code: "catalog-loader-required" | "catalog-icon-load-failed" | "catalog-icon-unsafe";
  readonly message: string;
  readonly browserPath: string;
  readonly cause?: unknown;
};

/** Replace catalog image hrefs with data URLs for portable exports. */
export function inlineCatalogIcons(
  svg: string,
  options: PortableSvgOptions = {},
): ResultAsync<string, PortableSvgError> {
  const baseUrl = typeof document !== "undefined" ? document.baseURI : undefined;
  const hrefs = [
    ...new Set(
      [...svg.matchAll(/<image\b[^>]*\bhref="([^"]+)"[^>]*\/?>(?:<\/image>)?/gi)]
        .map((match) => match[1]!)
        .filter((href) => !href.startsWith("data:")),
    ),
  ];
  const icons = hrefs.flatMap((href) => {
    const entry = getCatalogEntryByBrowserPath(browserPathFromHref(href));
    return entry ? [{ href, browserPath: entry.browserPath }] : [];
  });
  return ResultAsync.combine(
    icons.map(({ href, browserPath }) => {
      if (!options.loadCatalogSvg && (!baseUrl || typeof fetch === "undefined")) {
        return errAsync<[string, string], PortableSvgError>({
          code: "catalog-loader-required",
          message: `Catalog icon loader required for ${browserPath}; pass loadCatalogSvg when exporting outside a browser`,
          browserPath,
        });
      }
      return loadCatalogIcon(browserPath, options, baseUrl).andThen((content) => {
        const unsafe = unsafeIconReason(content);
        return unsafe
          ? errAsync<[string, string], PortableSvgError>({ code: "catalog-icon-unsafe", message: unsafe, browserPath })
          : okAsync<[string, string], PortableSvgError>([
              href,
              `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`,
            ]);
      });
    }),
  ).map((replacements) => {
    let output = svg;
    for (const [href, replacement] of replacements) {
      output = output.split(`href="${href}"`).join(`href="${replacement}"`);
    }
    return output;
  });
}

function loadCatalogIcon(
  browserPath: string,
  options: PortableSvgOptions,
  baseUrl: string | undefined,
): ResultAsync<string, PortableSvgError> {
  const loadError = (cause: unknown): PortableSvgError => ({
    code: "catalog-icon-load-failed",
    message: cause instanceof Error ? cause.message : `Unable to load catalog icon ${browserPath}`,
    browserPath,
    cause,
  });
  const customLoader = options.loadCatalogSvg;
  if (customLoader) {
    return ResultAsync.fromPromise(
      Promise.resolve().then(() => customLoader(browserPath)),
      loadError,
    ).andThen((result) => result);
  }
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => fetch(new URL(browserPath.replace(/^\/+/, ""), baseUrl).toString())),
    loadError,
  ).andThen((response) =>
    response.ok
      ? ResultAsync.fromPromise(
          Promise.resolve().then(() => response.text()),
          loadError,
        )
      : errAsync(loadError(new Error(`Unable to load catalog icon ${browserPath}`))),
  );
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

function unsafeIconReason(content: string): string | undefined {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(content)) return "Catalog icon is not an SVG document";
  if (/<(?:script|foreignObject)\b|\bon[a-z]+\s*=|javascript:/i.test(content))
    return "Catalog icon contains unsafe SVG content";
  return undefined;
}

function stripOuterSvg(content: string): string {
  return content.replace(/^\s*(?:<\?xml[^>]*>\s*)?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
