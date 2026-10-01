import type { DiagramDocument, LayoutResult, Rect } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, getDefaultView, normalizeSingleLineText, utf8ByteLength } from "@dumb-diagrams/runtime/core";
import { GRAMMAR } from "@dumb-diagrams/runtime/grammar-aws";
import type { PortableSvgError } from "@dumb-diagrams/runtime/render";
import { err, ok, ResultAsync, type Result } from "neverthrow";

export type ExportFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "gif"
  | "svg"
  | "pdf"
  | "html"
  | "xml"
  | "url"
  | "json"
  | "dgm";

export type ExportScope = "all" | "selection";
export type ExportSize = "diagram" | "selection" | "custom";
export type ExportAppearance = "light" | "dark";

/** Capabilities exposed by the export studio for each output format. */
export type ExportFormatCapabilities = Readonly<{
  visual: boolean;
  sourceOption: boolean;
}>;

export type ExportErrorCode =
  | "portable-svg-preparation"
  | "raster-dimensions"
  | "rasterization"
  | "canvas-context"
  | "encoding"
  | "download"
  | "url";

export type ExportError = Readonly<{
  code: ExportErrorCode;
  message: string;
  cause?: unknown;
}>;

export type ExportReceipt = Readonly<{
  filename: string;
  format: ExportFormat;
}>;

function exportError(code: ExportErrorCode, message: string, cause?: unknown): ExportError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

function captureExport<T>(code: ExportErrorCode, message: string, operation: () => T): Result<T, ExportError> {
  try {
    return ok(operation());
  } catch (cause) {
    return err(exportError(code, message, cause));
  }
}

const DIAGRAM_URL_HASH_KEY = "diagram";
const MAX_DIAGRAM_URL_PAYLOAD_CHARACTERS = Math.ceil(DIAGRAM_LIMITS.sourceBytes / 3) * 4;

export type DiagramUrlEncodeResult =
  | { ok: true; payload: string }
  | { ok: false; code: "empty" | "oversize"; message: string };

export type DiagramUrlDecodeResult =
  | { ok: true; source: string }
  | { ok: false; code: "empty" | "malformed" | "oversize"; message: string };

/** Encode source into the URL-safe payload used by the `#diagram=` format. */
export function encodeDiagramUrlPayload(source: string): DiagramUrlEncodeResult {
  if (!source) return { ok: false, code: "empty", message: "Diagram source cannot be empty." };
  if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) {
    return { ok: false, code: "oversize", message: "Diagram source exceeds the 1 MiB URL limit." };
  }
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return {
    ok: true,
    payload: btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
  };
}

/** Decode and size-check a URL-safe `#diagram=` payload without parsing it. */
export function decodeDiagramUrlPayload(payload: string): DiagramUrlDecodeResult {
  if (!payload) return { ok: false, code: "empty", message: "Diagram URL does not contain source." };
  if (payload.length > MAX_DIAGRAM_URL_PAYLOAD_CHARACTERS) {
    return { ok: false, code: "oversize", message: "Diagram URL source exceeds the 1 MiB limit." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) {
    return { ok: false, code: "malformed", message: "Diagram URL contains a malformed source payload." };
  }
  try {
    const padded = payload.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - payload.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > DIAGRAM_LIMITS.sourceBytes) {
      return { ok: false, code: "oversize", message: "Diagram URL source exceeds the 1 MiB limit." };
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!source) return { ok: false, code: "empty", message: "Diagram URL does not contain source." };
    return { ok: true, source };
  } catch {
    return { ok: false, code: "malformed", message: "Diagram URL contains a malformed source payload." };
  }
}

export interface ExportSelectionItem {
  kind: "resource" | "group" | "edge" | "annotation";
  id: string;
}

export interface ExportOptions {
  format: ExportFormat;
  scope: ExportScope;
  size: ExportSize;
  appearance: ExportAppearance;
  transparentBackground: boolean;
  includeSource: boolean;
  zoom: number;
  width: number;
  height: number;
  dpi: number;
  borderWidth: number;
  grid: boolean;
}

/** Safety limits applied to the final pixel-sized raster, before canvas allocation. */
export const RASTER_EXPORT_LIMITS = Object.freeze({
  maxAxisPixels: 16_384,
  maxPixels: 16_777_216,
  maxLogicalDimension: 16_384,
});

export const EXPORT_FORMATS: ReadonlyArray<{
  value: ExportFormat;
  label: string;
  extension: string;
  description: string;
}> = [
  { value: "png", label: "PNG", extension: "png", description: "Crisp image with transparency" },
  { value: "jpeg", label: "JPEG", extension: "jpg", description: "Compact image for sharing" },
  { value: "webp", label: "WebP", extension: "webp", description: "Lightweight modern image" },
  { value: "gif", label: "Animated GIF", extension: "gif", description: "Single-frame GIF snapshot" },
  { value: "svg", label: "SVG", extension: "svg", description: "Scalable, editable vector" },
  { value: "pdf", label: "PDF", extension: "pdf", description: "Print-ready document" },
  { value: "html", label: "HTML", extension: "html", description: "Standalone web page" },
  { value: "xml", label: "XML", extension: "xml", description: "Portable diagram wrapper" },
  { value: "url", label: "URL", extension: "url.txt", description: "Shareable local link" },
  { value: "json", label: "JSON", extension: "json", description: "Structured document data" },
  { value: "dgm", label: "DGM source", extension: "dgm", description: "Canonical source file" },
];

/**
 * Keep format-specific controls honest. `sourceOption` means the checkbox can
 * change the resulting file; formats such as DGM, XML, and URL always carry
 * source by definition and therefore do not expose that optional control.
 */
export const EXPORT_FORMAT_CAPABILITIES: Readonly<Record<ExportFormat, ExportFormatCapabilities>> = {
  png: { visual: true, sourceOption: false },
  jpeg: { visual: true, sourceOption: false },
  webp: { visual: true, sourceOption: false },
  gif: { visual: true, sourceOption: false },
  svg: { visual: true, sourceOption: true },
  pdf: { visual: true, sourceOption: false },
  html: { visual: true, sourceOption: true },
  xml: { visual: false, sourceOption: false },
  url: { visual: false, sourceOption: false },
  json: { visual: false, sourceOption: false },
  dgm: { visual: false, sourceOption: false },
};

export function isRasterExportFormat(value: ExportFormat): boolean {
  return value === "png" || value === "jpeg" || value === "webp" || value === "gif" || value === "pdf";
}

export function exportFormatCapabilities(value: ExportFormat): ExportFormatCapabilities {
  return EXPORT_FORMAT_CAPABILITIES[value];
}

export function supportsExportSourceOption(value: ExportFormat): boolean {
  return exportFormatCapabilities(value).sourceOption;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const DARK_EXPORT_BACKGROUND = "#102033";
const DARK_EXPORT_GRID_STROKE = "#ffffff";
const DARK_EXPORT_BORDER_STROKE = "#b8c2ce";
const DARK_EXPORT_INK = "#e6ebf0";
const DARK_EXPORT_EDGE = "#b8c2ce";
const DARK_EXPORT_BADGE_FILL = "#f7982c";
const DARK_EXPORT_BADGE_TEXT = "#112d51";

export function exportFormat(value: ExportFormat) {
  return EXPORT_FORMATS.find((format) => format.value === value) ?? EXPORT_FORMATS[0]!;
}

let webpSupported: boolean | undefined;

export function isExportFormatSupported(value: ExportFormat): boolean {
  if (value !== "webp" || typeof document === "undefined") return true;
  if (webpSupported !== undefined) return webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

export function sanitizeFilename(value: string): string {
  const clean = normalizeSingleLineText(value)
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || "diagram";
  return Array.from(clean).slice(0, DIAGRAM_LIMITS.filenameCharacters).join("");
}

function blobResult(parts: BlobPart[], type: string, formatLabel: string): Result<Blob, ExportError> {
  return captureExport("encoding", `Could not encode the ${formatLabel} export.`, () => new Blob(parts, { type }));
}

function bytesBlobResult(bytes: Uint8Array, type: string, formatLabel: string): Result<Blob, ExportError> {
  return captureExport("encoding", `Could not encode the ${formatLabel} export.`, () => {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  }).andThen((buffer) => blobResult([buffer], type, formatLabel));
}

function downloadPartsResult(parts: BlobPart[], type: string, formatLabel: string, name: string): Result<void, ExportError> {
  return blobResult(parts, type, formatLabel).andThen((blob) => downloadBlobResult(blob, name));
}

export function downloadBlobResult(blob: Blob, name: string): Result<void, ExportError> {
  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    return ok(undefined);
  } catch (cause) {
    return err(exportError("download", "Your browser blocked the export download.", cause));
  } finally {
    if (objectUrl) {
      const url = objectUrl;
      const revoke = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Cleanup failure must not mask the export outcome.
        }
      };
      try {
        window.setTimeout(revoke, 0);
      } catch {
        revoke();
      }
    }
  }
}

export function downloadTextResult(text: string, name: string, mime = "text/plain"): Result<void, ExportError> {
  let blob: Blob;
  try {
    blob = new Blob([text], { type: mime });
  } catch (cause) {
    return err(exportError("encoding", `Could not encode the ${mime} export.`, cause));
  }
  return downloadBlobResult(blob, name);
}

export function createDiagramUrlResult(source: string): Result<string, ExportError> {
  const encoded = encodeDiagramUrlPayload(source);
  if (!encoded.ok) return err(exportError("url", encoded.message));
  try {
    return ok(`${window.location.origin}${window.location.pathname}#${DIAGRAM_URL_HASH_KEY}=${encoded.payload}`);
  } catch (cause) {
    return err(exportError("url", "The diagram URL could not be created.", cause));
  }
}

export function filenameWithExtension(value: string, extension: string): string {
  const clean = sanitizeFilename(value).replace(/\.[^/.]+$/, "");
  return `${clean}.${extension.replace(/^\./, "")}`;
}

/**
 * Return the live bounds that an export should use. Manual movement is already
 * reflected in the compiled layout, so this keeps export dimensions in sync
 * with the current canvas rather than with the original auto-layout.
 */
export function getExportBounds(
  doc: DiagramDocument,
  layout: LayoutResult,
  selection: ExportSelectionItem[],
  scope: ExportScope,
): Rect {
  if (scope === "all" || selection.length === 0) {
    return layout.canvasBounds ?? { x: 0, y: 0, w: layout.width, h: layout.height };
  }

  const included = collectSelectionEntities(doc, selection);
  const rects: Rect[] = [];
  for (const group of layout.groups) {
    if (included.groups.has(group.id)) rects.push(group.bounds);
  }
  for (const node of layout.nodes) {
    if (included.resources.has(node.id)) rects.push(node.obstacle);
  }
  for (const edge of layout.edges) {
    if (!included.edges.has(edge.id) || edge.points.length === 0) continue;
    const xs = edge.points.map((point) => point.x);
    const ys = edge.points.map((point) => point.y);
    rects.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    });
  }
  const view = getDefaultView(doc);
  for (const annotation of doc.annotations) {
    if (!included.annotations.has(annotation.id)) continue;
    const place = view.annotations?.[annotation.id];
    const dimensions = exportAnnotationDimensions(annotation.style);
    rects.push({
      x: place?.x ?? 48,
      y: place?.y ?? 48,
      w: place?.w ?? dimensions.w,
      h: place?.h ?? dimensions.h,
    });
  }

  if (!rects.length) {
    return layout.canvasBounds ?? { x: 0, y: 0, w: layout.width, h: layout.height };
  }
  const padding = 24;
  const left = Math.min(...rects.map((rect) => rect.x)) - padding;
  const top = Math.min(...rects.map((rect) => rect.y)) - padding;
  const right = Math.max(...rects.map((rect) => rect.x + rect.w)) + padding;
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h)) + padding;
  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

function exportAnnotationDimensions(style: string | undefined): { w: number; h: number } {
  switch (style) {
    case "text": return { w: 240, h: 48 };
    case "code": return { w: 300, h: 160 };
    case "callout": return { w: 280, h: 104 };
    case "checklist": return { w: 260, h: 152 };
    default: return { w: 220, h: 96 };
  }
}

export function prepareExportSvg(
  svg: string,
  doc: DiagramDocument,
  layout: LayoutResult,
  selection: ExportSelectionItem[],
  options: ExportOptions,
  source?: string,
): string {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return svg;
  }

  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = parsed.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return svg;

  const included = collectSelectionEntities(doc, selection);
  if (options.scope === "selection" && selection.length > 0) {
    const keep = new Set<string>([
      ...[...included.groups].map((id) => `group-${id}`),
      ...[...included.resources].map((id) => `res-${id}`),
      ...[...included.edges].map((id) => `edge-${id}`),
      ...[...included.annotations].map((id) => `annotation-${id}`),
    ]);
    for (const child of [...root.children]) {
      const id = child.getAttribute("id");
      if (id && /^(group|res|edge|annotation)-/.test(id) && !keep.has(id)) {
        child.remove();
      }
    }
  }

  const bounds = getExportBounds(doc, layout, selection, options.scope);
  const zoom = options.size === "custom"
    ? 1
    : Math.max(25, Math.min(400, Number.isFinite(options.zoom) ? options.zoom : 100)) / 100;
  const outputWidth = options.size === "custom"
    ? Math.max(1, Math.round(options.width))
    : Math.max(1, Math.round(bounds.w * zoom));
  const outputHeight = options.size === "custom"
    ? Math.max(1, Math.round(options.height))
    : Math.max(1, Math.round(bounds.h * zoom));
  root.setAttribute("width", String(outputWidth));
  root.setAttribute("height", String(outputHeight));
  root.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);

  const dark = options.appearance === "dark";
  const background = options.transparentBackground ? "none" : dark ? DARK_EXPORT_BACKGROUND : "#FFFFFF";
  const gridStroke = dark ? DARK_EXPORT_GRID_STROKE : GRAMMAR.edgeColor;
  const borderStroke = dark ? DARK_EXPORT_BORDER_STROKE : GRAMMAR.edgeColor;

  if (dark) {
    for (const style of [...root.querySelectorAll("style")]) {
      style.textContent = (style.textContent ?? "")
        .replaceAll(GRAMMAR.edgeColor, DARK_EXPORT_INK)
        .replaceAll(GRAMMAR.badgeText, DARK_EXPORT_BADGE_TEXT);
    }
    for (const path of [...root.querySelectorAll('path[stroke="#163964"]')]) {
      path.setAttribute("stroke", DARK_EXPORT_EDGE);
    }
    for (const path of [...root.querySelectorAll('path[fill="#163964"]')]) {
      path.setAttribute("fill", DARK_EXPORT_EDGE);
    }
    for (const circle of [...root.querySelectorAll('circle[fill="#163964"]:not(.edge-badge-circle):not(.group-badge-circle)')]) {
      circle.setAttribute("fill", DARK_EXPORT_EDGE);
    }
    for (const text of [...root.querySelectorAll("text")]) {
      if (text.classList.contains("edge-badge-text") || text.classList.contains("group-badge-text")) continue;
      const fill = text.getAttribute("fill");
      if (!fill || fill.toLowerCase() === GRAMMAR.edgeColor.toLowerCase()) {
        text.setAttribute("fill", DARK_EXPORT_INK);
      }
    }
    for (const circle of [...root.querySelectorAll(".edge-badge-circle, .group-badge-circle")]) {
      circle.setAttribute("fill", DARK_EXPORT_BADGE_FILL);
    }
    for (const text of [...root.querySelectorAll(".edge-badge-text, .group-badge-text")]) {
      text.setAttribute("fill", DARK_EXPORT_BADGE_TEXT);
    }
  } else {
    for (const halo of [...root.querySelectorAll(".group-border-contrast")]) {
      halo.remove();
    }
  }

  const backgroundRect = [...root.children].find(
    (child) => child.nodeName.toLowerCase() === "rect" && child.getAttribute("width") === "100%",
  );
  if (backgroundRect) {
    backgroundRect.setAttribute("x", String(bounds.x));
    backgroundRect.setAttribute("y", String(bounds.y));
    backgroundRect.setAttribute("width", String(bounds.w));
    backgroundRect.setAttribute("height", String(bounds.h));
    backgroundRect.setAttribute("fill", background);
  }

  const defs = [...root.children].find((child) => child.nodeName.toLowerCase() === "defs");
  if (defs && options.grid) {
    const pattern = parsed.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", "export-grid");
    pattern.setAttribute("width", "24");
    pattern.setAttribute("height", "24");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    if (background !== "none") {
      const patternBackground = parsed.createElementNS(SVG_NS, "rect");
      patternBackground.setAttribute("width", "24");
      patternBackground.setAttribute("height", "24");
      patternBackground.setAttribute("fill", background);
      pattern.append(patternBackground);
    }
    const gridPath = parsed.createElementNS(SVG_NS, "path");
    gridPath.setAttribute("d", "M 24 0 L 0 0 0 24");
    gridPath.setAttribute("fill", "none");
    gridPath.setAttribute("stroke", gridStroke);
    gridPath.setAttribute("stroke-opacity", "0.12");
    gridPath.setAttribute("stroke-width", "1");
    pattern.append(gridPath);
    defs.append(pattern);
    backgroundRect?.setAttribute("fill", "url(#export-grid)");
  }

  const content = parsed.createElementNS(SVG_NS, "g");
  content.setAttribute("id", "export-content");
  for (const child of [...root.children]) {
    const tag = child.nodeName.toLowerCase();
    if (tag === "defs" || child === backgroundRect || tag === "metadata") continue;
    content.append(child);
  }
  root.append(content);

  if (options.borderWidth > 0) {
    const border = parsed.createElementNS(SVG_NS, "rect");
    border.setAttribute("x", String(bounds.x));
    border.setAttribute("y", String(bounds.y));
    border.setAttribute("width", String(bounds.w));
    border.setAttribute("height", String(bounds.h));
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", borderStroke);
    border.setAttribute("stroke-width", String(Math.max(0, options.borderWidth)));
    border.setAttribute("pointer-events", "none");
    root.append(border);
  }

  if (options.includeSource && supportsExportSourceOption(options.format)) {
    const metadata = parsed.createElementNS(SVG_NS, "metadata");
    metadata.setAttribute("id", "dumb-diagrams-source");
    metadata.textContent = "DumbDiagrams\n" + (source ?? serializeSourceForMetadata(doc));
    root.append(metadata);
  }

  return new XMLSerializer().serializeToString(root);
}

function serializeSourceForMetadata(doc: DiagramDocument): string {
  return JSON.stringify(doc);
}

interface SelectionEntities {
  groups: Set<string>;
  resources: Set<string>;
  edges: Set<string>;
  annotations: Set<string>;
}

function collectSelectionEntities(
  doc: DiagramDocument,
  selection: ExportSelectionItem[],
): SelectionEntities {
  const groups = new Set<string>();
  const resources = new Set<string>();
  const edges = new Set<string>();
  const annotations = new Set<string>();
  const parentOf = new Map<string, string>();
  for (const group of doc.groups) {
    for (const child of group.children) parentOf.set(child, group.id);
    for (const child of group.borderChildren ?? []) parentOf.set(child.id, group.id);
  }
  const addAncestors = (id: string) => {
    let current = parentOf.get(id);
    while (current) {
      groups.add(current);
      current = parentOf.get(current);
    }
  };
  const addResource = (id: string) => {
    resources.add(id);
    addAncestors(id);
  };
  const addGroup = (id: string) => {
    if (groups.has(id)) return;
    groups.add(id);
    const group = doc.groups.find((candidate) => candidate.id === id);
    if (!group) return;
    for (const child of group.children) {
      if (doc.groups.some((candidate) => candidate.id === child)) addGroup(child);
      else addResource(child);
    }
    for (const child of group.borderChildren ?? []) {
      if (doc.groups.some((candidate) => candidate.id === child.id)) addGroup(child.id);
      else addResource(child.id);
    }
  };

  for (const item of selection) {
    if (item.kind === "group") addGroup(item.id);
    else if (item.kind === "resource") addResource(item.id);
    else if (item.kind === "edge") {
      edges.add(item.id);
      const edge = doc.edges.find((candidate) => candidate.id === item.id);
      if (edge) {
        addResource(edge.source);
        addResource(edge.target);
      }
    } else annotations.add(item.id);
  }

  for (const edge of doc.edges) {
    if (resources.has(edge.source) && resources.has(edge.target)) edges.add(edge.id);
  }
  return { groups, resources, edges, annotations };
}

export function exportDiagramFile(args: {
  title: string;
  source: string;
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: ExportSelectionItem[];
  options: ExportOptions;
  getPortableSvg: () => ResultAsync<string, PortableSvgError>;
}): ResultAsync<ExportReceipt, ExportError> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => exportDiagramFileResult(args)),
    (cause) => exportError("encoding", "The export could not be prepared.", cause),
  ).andThen((result) => result);
}

async function exportDiagramFileResult(args: {
  title: string;
  source: string;
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: ExportSelectionItem[];
  options: ExportOptions;
  getPortableSvg: () => ResultAsync<string, PortableSvgError>;
}): Promise<Result<ExportReceipt, ExportError>> {
  const { title, source, doc, layout, selection, options, getPortableSvg } = args;
  const format = exportFormat(options.format);
  const filename = filenameWithExtension(title, format.extension);
  const receipt = (): ExportReceipt => ({ filename, format: options.format });
  if (options.format === "dgm") {
    return downloadPartsResult([source], "text/plain", "source", filename).map(receipt);
  }
  if (options.format === "json") {
    const json = captureExport("encoding", "Could not encode the JSON export.", () => JSON.stringify(doc, null, 2));
    return json.isErr()
      ? err(json.error)
      : downloadPartsResult([json.value], "application/json", "JSON", filename).map(receipt);
  }
  if (options.format === "xml") {
    const xml = captureExport("encoding", "Could not encode the XML export.", () => toDiagramXml(doc, source));
    return xml.isErr()
      ? err(xml.error)
      : downloadPartsResult([xml.value], "application/xml", "XML", filename).map(receipt);
  }
  if (options.format === "url") {
    return createDiagramUrlResult(source).andThen((diagramUrl) => downloadPartsResult([diagramUrl], "text/plain", "diagram URL", filename)).map(receipt);
  }

  const portableSvgError = (cause: unknown) => exportError("portable-svg-preparation", "The portable SVG could not be prepared.", cause);
  const baseSvg = await ResultAsync.fromPromise(Promise.resolve().then(() => getPortableSvg()), portableSvgError)
    .andThen((result) => result.mapErr(portableSvgError));
  if (baseSvg.isErr()) return err(baseSvg.error);
  const svg = captureExport(
    "portable-svg-preparation",
    "The portable SVG could not be prepared.",
    () => prepareExportSvg(baseSvg.value, doc, layout, selection, options, source),
  );
  if (svg.isErr()) return err(svg.error);
  if (options.format === "svg") {
    return downloadPartsResult([svg.value], "image/svg+xml", "SVG", filename).map(receipt);
  }
  if (options.format === "html") {
    const html = captureExport("encoding", "Could not encode the HTML export.", () => toStandaloneHtml(
        title,
        svg.value,
        supportsExportSourceOption(options.format) && options.includeSource ? source : undefined,
      ));
    return html.isErr()
      ? err(html.error)
      : downloadPartsResult([html.value], "text/html", "HTML", filename).map(receipt);
  }

  const canvas = await rasterizeSvg(svg.value, options);
  if (canvas.isErr()) return err(canvas.error);
  if (options.format === "pdf") {
    const pdf = captureExport("encoding", "Could not encode the PDF export.", () => makeImagePdf(canvas.value, options.dpi));
    if (pdf.isErr()) return err(pdf.error);
    const blob = bytesBlobResult(pdf.value, "application/pdf", "PDF");
    return blob.isErr()
      ? err(blob.error)
      : downloadBlobResult(blob.value, filename).map(receipt);
  }
  if (options.format === "gif") {
    const gif = encodeGif(canvas.value);
    if (gif.isErr()) return err(gif.error);
    const blob = bytesBlobResult(gif.value, "image/gif", "GIF");
    return blob.isErr()
      ? err(blob.error)
      : downloadBlobResult(blob.value, filename).map(receipt);
  }
  const mime = options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`;
  const blob = await canvasToBlob(canvas.value, mime, options.format === "jpeg" ? 0.92 : 0.95);
  return blob.andThen((encoded) => {
    if (encoded.type !== mime) return err(exportError("encoding", `The browser could not encode the ${format.label} export.`));
    return downloadBlobResult(encoded, filename);
  }).map(receipt);
}

async function rasterizeSvg(svg: string, options: ExportOptions): Promise<Result<HTMLCanvasElement, ExportError>> {
  const scale = Math.max(0.25, options.dpi / 96);
  const requestedDimensions = validateRasterDimensions(
    Math.round(options.width * scale),
    Math.round(options.height * scale),
  );
  if (!requestedDimensions.ok) return err(exportError("raster-dimensions", requestedDimensions.message));

  const image = captureExport("rasterization", "The exported SVG image could not be loaded.", () => new Image());
  if (image.isErr()) return err(image.error);
  const sourceBlob = blobResult([svg], "image/svg+xml", "SVG rasterization");
  if (sourceBlob.isErr()) return err(exportError("rasterization", "The exported SVG could not be encoded for rasterization.", sourceBlob.error));
  const objectUrl = captureExport("rasterization", "The exported SVG image URL could not be created.", () => URL.createObjectURL(sourceBlob.value));
  if (objectUrl.isErr()) return err(objectUrl.error);
  const url = objectUrl.value;
  try {
    const loaded = await ResultAsync.fromPromise(
      Promise.resolve().then(() => new Promise<void>((resolve, reject) => {
        image.value.onload = () => resolve();
        image.value.onerror = () => reject(new Error("Unable to rasterize SVG"));
        image.value.src = url;
      })),
      (cause) => exportError("rasterization", "The exported SVG image could not be loaded.", cause),
    );
    if (loaded.isErr()) return err(loaded.error);
    const logicalWidth = image.value.width || options.width;
    const logicalHeight = image.value.height || options.height;
    const pixelWidth = Math.round(logicalWidth * scale);
    const pixelHeight = Math.round(logicalHeight * scale);
    const dimensions = validateRasterDimensions(pixelWidth, pixelHeight);
    if (!dimensions.ok) return err(exportError("raster-dimensions", dimensions.message));
    const canvasResult = captureExport("rasterization", "The exported canvas could not be created.", () => document.createElement("canvas"));
    if (canvasResult.isErr()) return err(canvasResult.error);
    const canvas = canvasResult.value;
    const sized = captureExport("rasterization", "The exported canvas could not be sized.", () => {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      return canvas;
    });
    if (sized.isErr()) return err(sized.error);
    const contextResult = captureExport("canvas-context", "Your browser could not create a 2D canvas context.", () => canvas.getContext("2d"));
    if (contextResult.isErr()) return err(contextResult.error);
    const context = contextResult.value;
    if (!context) return err(exportError("canvas-context", "Your browser could not create a 2D canvas context."));
    const drawn = captureExport("rasterization", "The exported SVG image could not be rasterized.", () => {
      if (!options.transparentBackground || options.format === "jpeg") {
        context.fillStyle = options.appearance === "dark" ? DARK_EXPORT_BACKGROUND : "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image.value, 0, 0, canvas.width, canvas.height);
      return canvas;
    });
    return drawn;
  } finally {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Cleanup failure must not mask a successful or classified export.
    }
  }
}

export function validateRasterDimensions(
  width: number,
  height: number,
): { ok: true; width: number; height: number } | { ok: false; message: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, message: "Raster export dimensions must be finite positive values." };
  }
  if (width > RASTER_EXPORT_LIMITS.maxAxisPixels || height > RASTER_EXPORT_LIMITS.maxAxisPixels) {
    return {
      ok: false,
      message: `Raster export dimensions exceed the ${RASTER_EXPORT_LIMITS.maxAxisPixels}px per-axis limit.`,
    };
  }
  if (width * height > RASTER_EXPORT_LIMITS.maxPixels) {
    return {
      ok: false,
      message: `Raster export exceeds the ${RASTER_EXPORT_LIMITS.maxPixels.toLocaleString()} pixel limit.`,
    };
  }
  return { ok: true, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): ResultAsync<Blob, ExportError> {
  return ResultAsync.fromPromise(new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`The browser could not encode the ${mime} export.`));
      }, mime, quality);
    } catch (cause) {
      reject(cause);
    }
  }), (cause) => exportError("encoding", `The browser could not encode the ${mime} export.`, cause));
}

function toDiagramXml(doc: DiagramDocument, source: string): string {
  const title = escapeXml(doc.title ?? doc.id);
  const payload = source.replaceAll("]]>", "]]]]><![CDATA[>");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<diagram id="${escapeXml(doc.id)}" title="${title}"><source><![CDATA[${payload}]]></source></diagram>\n`;
}

function toStandaloneHtml(title: string, svg: string, source?: string): string {
  const sourceBlock = source
    ? `<details><summary>Diagram source</summary><pre>${escapeHtml(source)}</pre></details>`
    : "";
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>html,body{margin:0;min-height:100%;background:#f4f7fb;color:#172033;font-family:system-ui,sans-serif}main{display:grid;gap:24px;justify-items:center;padding:32px}svg{max-width:100%;height:auto;box-shadow:0 18px 50px rgba(18,32,58,.14);border-radius:12px}details{width:min(1100px,100%);background:#fff;border:1px solid #dbe3ee;border-radius:12px;padding:14px 18px}pre{white-space:pre-wrap;overflow:auto;font:12px/1.5 ui-monospace,monospace}</style></head><body><main>${svg}${sourceBlock}</main></body></html>\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function writeU16(target: number[], value: number): void {
  target.push(value & 0xff, (value >> 8) & 0xff);
}

function encodeGif(canvas: HTMLCanvasElement): Result<Uint8Array, ExportError> {
  const contextResult = captureExport("canvas-context", "Your browser could not create a 2D canvas context.", () => canvas.getContext("2d"));
  if (contextResult.isErr()) return err(contextResult.error);
  const context = contextResult.value;
  if (!context) return err(exportError("canvas-context", "Your browser could not create a 2D canvas context."));
  const pixels = captureExport("encoding", "Could not encode the GIF export.", () => context.getImageData(0, 0, canvas.width, canvas.height).data);
  if (pixels.isErr()) return err(pixels.error);
  const bytes: number[] = [];
  for (const char of "GIF89a") bytes.push(char.charCodeAt(0));
  writeU16(bytes, canvas.width);
  writeU16(bytes, canvas.height);
  bytes.push(0xf7, 0, 0);
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) bytes.push(r * 51, g * 51, b * 51);
    }
  }
  while (bytes.length < 13 + 256 * 3) bytes.push(0);
  bytes.push(0x2c, 0, 0, 0, 0);
  writeU16(bytes, canvas.width);
  writeU16(bytes, canvas.height);
  bytes.push(0, 8);
  const indices = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0, pixel = 0; index < indices.length; index++, pixel += 4) {
    const r = Math.max(0, Math.min(5, Math.round(pixels.value[pixel]! / 51)));
    const g = Math.max(0, Math.min(5, Math.round(pixels.value[pixel + 1]! / 51)));
    const b = Math.max(0, Math.min(5, Math.round(pixels.value[pixel + 2]! / 51)));
    indices[index] = r * 36 + g * 6 + b;
  }
  const compressed = lzwEncode(indices, 8);
  for (let offset = 0; offset < compressed.length; offset += 255) {
    const length = Math.min(255, compressed.length - offset);
    bytes.push(length, ...compressed.slice(offset, offset + length));
  }
  bytes.push(0, 0x3b);
  return ok(Uint8Array.from(bytes));
}

function lzwEncode(values: Uint8Array, minimumCodeSize: number): number[] {
  const clear = 1 << minimumCodeSize;
  const end = clear + 1;
  let nextCode = end + 1;
  let codeSize = minimumCodeSize + 1;
  const dictionary = new Map<string, number>();
  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };
  const reset = () => {
    dictionary.clear();
    nextCode = end + 1;
    codeSize = minimumCodeSize + 1;
  };
  emit(clear);
  if (values.length === 0) {
    emit(end);
    if (bitCount) output.push(bitBuffer & 0xff);
    return output;
  }
  let prefix = values[0]!;
  for (let index = 1; index < values.length; index++) {
    const value = values[index]!;
    const key = `${prefix}:${value}`;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }
    emit(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      reset();
    }
    prefix = value;
  }
  emit(prefix);
  emit(end);
  if (bitCount) output.push(bitBuffer & 0xff);
  return output;
}

function makeImagePdf(canvas: HTMLCanvasElement, dpi: number): Uint8Array {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const imageBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const pageWidth = (canvas.width * 72) / Math.max(1, dpi);
  const pageHeight = (canvas.height * 72) / Math.max(1, dpi);
  const imageObject = ascii(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  const imageStream = concatBytes(imageObject, imageBytes, ascii("\nendstream"));
  const content = ascii(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  const objects = [
    ascii("<< /Type /Catalog /Pages 2 0 R >>"),
    ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    imageStream,
    concatBytes(ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")),
  ];
  const header = ascii("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  const offsets = [0];
  let cursor = header.length;
  const body: Uint8Array[] = [header];
  objects.forEach((object, index) => {
    offsets.push(cursor);
    const wrapped = concatBytes(ascii(`${index + 1} 0 obj\n`), object, ascii("\nendobj\n"));
    body.push(wrapped);
    cursor += wrapped.length;
  });
  const xrefOffset = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  body.push(ascii(xref));
  return concatBytes(...body);
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const total = values.reduce((sum, value) => sum + value.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

export function exportDgmFileResult(source: string, title: string): Result<ExportReceipt, ExportError> {
  const filename = filenameWithExtension(title, "dgm");
  return downloadTextResult(source, filename).map(() => ({ filename, format: "dgm" }));
}
