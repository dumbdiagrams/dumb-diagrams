import type { DiagramDocument, LayoutResult, Rect } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, getDefaultView, normalizeSingleLineText } from "@dumb-diagrams/runtime/core";
import { GRAMMAR } from "@dumb-diagrams/runtime/grammar-aws";

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
  shadow: boolean;
  grid: boolean;
}

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

const SVG_NS = "http://www.w3.org/2000/svg";

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

export function downloadBlob(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(text: string, name: string, mime = "text/plain"): boolean {
  return downloadBlob(new Blob([text], { type: mime }), name);
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
  const foreground = dark ? "#F4EDE5" : GRAMMAR.edgeColor;
  const background = options.transparentBackground ? "none" : dark ? "#101E32" : "#FFFFFF";
  const foregroundTokens = ["#232F3E", GRAMMAR.edgeColor];
  for (const token of foregroundTokens) {
    for (const element of [...root.querySelectorAll(`[stroke='${token}']`)]) {
      element.setAttribute("stroke", foreground);
    }
    for (const element of [...root.querySelectorAll(`[fill='${token}']`)]) {
      element.setAttribute("fill", foreground);
    }
  }
  for (const style of [...root.querySelectorAll("style")]) {
    style.textContent = foregroundTokens.reduce(
      (value, token) => value.replaceAll(token, foreground),
      style.textContent ?? "",
    );
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
    const gridPath = parsed.createElementNS(SVG_NS, "path");
    gridPath.setAttribute("d", "M 24 0 L 0 0 0 24");
    gridPath.setAttribute("fill", "none");
    gridPath.setAttribute("stroke", foreground);
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
  if (options.shadow) {
    const filter = parsed.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", "export-shadow");
    filter.setAttribute("x", "-20%");
    filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%");
    filter.setAttribute("height", "140%");
    const dropShadow = parsed.createElementNS(SVG_NS, "feDropShadow");
    dropShadow.setAttribute("dx", "0");
    dropShadow.setAttribute("dy", "8");
    dropShadow.setAttribute("stdDeviation", "10");
    dropShadow.setAttribute("flood-color", dark ? "#000000" : GRAMMAR.edgeColor);
    dropShadow.setAttribute("flood-opacity", dark ? "0.42" : "0.18");
    filter.append(dropShadow);
    defs?.append(filter);
    content.setAttribute("filter", "url(#export-shadow)");
  }
  root.append(content);

  if (options.borderWidth > 0) {
    const border = parsed.createElementNS(SVG_NS, "rect");
    border.setAttribute("x", String(bounds.x));
    border.setAttribute("y", String(bounds.y));
    border.setAttribute("width", String(bounds.w));
    border.setAttribute("height", String(bounds.h));
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", foreground);
    border.setAttribute("stroke-width", String(Math.max(0, options.borderWidth)));
    border.setAttribute("pointer-events", "none");
    root.append(border);
  }

  if (options.includeSource) {
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

export async function exportDiagramFile(args: {
  title: string;
  source: string;
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: ExportSelectionItem[];
  options: ExportOptions;
  getPortableSvg: () => Promise<string>;
}): Promise<ExportResult> {
  const { title, source, doc, layout, selection, options, getPortableSvg } = args;
  const format = exportFormat(options.format);
  const filename = filenameWithExtension(title, format.extension);
  try {
    if (options.format === "dgm") {
      return { ok: downloadText(source, filename), filename };
    }
    if (options.format === "json") {
      return { ok: downloadText(JSON.stringify(doc, null, 2), filename, "application/json"), filename };
    }
    if (options.format === "xml") {
      return { ok: downloadText(toDiagramXml(doc, source), filename, "application/xml"), filename };
    }
    if (options.format === "url") {
      return { ok: downloadText(createDiagramUrl(source), filename, "text/plain"), filename };
    }

    const baseSvg = await getPortableSvg();
    const svg = prepareExportSvg(baseSvg, doc, layout, selection, options, source);
    if (options.format === "svg") {
      return { ok: downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename), filename };
    }
    if (options.format === "html") {
      return { ok: downloadText(toStandaloneHtml(title, svg, options.includeSource ? source : undefined), filename, "text/html"), filename };
    }

    const canvas = await rasterizeSvg(svg, options);
    if (options.format === "pdf") {
      const pdf = makeImagePdf(canvas, options.dpi);
      return { ok: downloadBlob(bytesToBlob(pdf, "application/pdf"), filename), filename };
    }
    if (options.format === "gif") {
      const gif = encodeGif(canvas);
      return { ok: downloadBlob(bytesToBlob(gif, "image/gif"), filename), filename };
    }
    const mime = options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`;
    const blob = await canvasToBlob(canvas, mime, options.format === "jpeg" ? 0.92 : 0.95);
    return { ok: Boolean(blob?.type === mime && downloadBlob(blob, filename)), filename };
  } catch {
    return { ok: false, filename };
  }
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

async function rasterizeSvg(svg: string, options: ExportOptions): Promise<HTMLCanvasElement> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize SVG"));
      image.src = url;
    });
    const logicalWidth = image.width || options.width;
    const logicalHeight = image.height || options.height;
    const scale = Math.max(0.25, options.dpi / 96);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(logicalWidth * scale));
    canvas.height = Math.max(1, Math.round(logicalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable");
    if (!options.transparentBackground || options.format === "jpeg") {
      context.fillStyle = options.appearance === "dark" ? "#101E32" : "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
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

function createDiagramUrl(source: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(source)) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${window.location.origin}${window.location.pathname}#diagram=${encoded}`;
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

function encodeGif(canvas: HTMLCanvasElement): Uint8Array {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
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
    const r = Math.max(0, Math.min(5, Math.round(pixels[pixel]! / 51)));
    const g = Math.max(0, Math.min(5, Math.round(pixels[pixel + 1]! / 51)));
    const b = Math.max(0, Math.min(5, Math.round(pixels[pixel + 2]! / 51)));
    indices[index] = r * 36 + g * 6 + b;
  }
  const compressed = lzwEncode(indices, 8);
  for (let offset = 0; offset < compressed.length; offset += 255) {
    const length = Math.min(255, compressed.length - offset);
    bytes.push(length, ...compressed.slice(offset, offset + length));
  }
  bytes.push(0, 0x3b);
  return Uint8Array.from(bytes);
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

export interface ExportResult {
  ok: boolean;
  filename: string;
}

export async function exportSvgFile(
  title: string,
  getPortableSvg: () => Promise<string>,
): Promise<ExportResult> {
  const filename = filenameWithExtension(title, "svg");
  try {
    const svg = await getPortableSvg();
    return {
      ok: downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename),
      filename,
    };
  } catch {
    return { ok: false, filename };
  }
}

export function exportDgmFile(source: string, title: string): ExportResult {
  const filename = filenameWithExtension(title, "dgm");
  return {
    ok: downloadText(source, filename),
    filename,
  };
}

export async function exportPngFile(
  title: string,
  getPortableSvg: () => Promise<string>,
): Promise<ExportResult> {
  const filename = filenameWithExtension(title, "png");
  let svg: string;
  try {
    svg = await getPortableSvg();
  } catch {
    return { ok: false, filename };
  }

  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve({ ok: Boolean(blob && downloadBlob(blob, filename)), filename });
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, filename });
    };
    image.src = url;
  });
}
