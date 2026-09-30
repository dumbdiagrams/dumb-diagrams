import { err, ok, type Result } from "neverthrow";

function invalidSvg(message: string): SvgSanitizeError {
  return { code: "invalid-svg", message };
}

function hashContent(content: string): string {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
  "desc",
  "image",
  "use",
  "symbol",
]);

const FORBIDDEN_ATTR = /^(on|xlink:href|href|style)$/i;
const ALLOWED_ATTRS = new Set([
  "id", "xmlns", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "fill", "fill-opacity",
  "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "opacity", "clip-path", "clip-rule", "mask",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "spreadmethod",
  "preserveaspectratio", "marker-start", "marker-mid", "marker-end", "href",
]);
const LOCAL_REFERENCE_ATTRS = new Set(["clip-path", "mask", "marker-start", "marker-mid", "marker-end"]);
const PAINT_REFERENCE_ATTRS = new Set(["fill", "stroke"]);
const MAX_INTRINSIC_SIZE = 10_000;
const EMBEDDED_RASTER_DATA = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export interface SanitizedSvg {
  content: string;
  intrinsicW: number;
  intrinsicH: number;
  hash: string;
}

export type SvgSanitizeError = {
  readonly code: "invalid-svg";
  readonly message: string;
};

/** @deprecated Prefer the workflow-oriented `SvgSanitizeError` name. */
export type SanitizeSvgError = SvgSanitizeError;

/** Safe boundary for untrusted SVG input; defects still propagate to the caller. */
export function sanitizeSvgResult(input: string): Result<SanitizedSvg, SvgSanitizeError> {
  const safety = validateMarkupSafety(input);
  if (safety.isErr()) return err(safety.error);
  if (typeof DOMParser === "undefined") return sanitizeSvgNode(input);
  const doc = new DOMParser().parseFromString(input, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") return err(invalidSvg("Invalid SVG: root element must be <svg>"));
  if (doc.querySelector("parsererror")) return err(invalidSvg("Invalid SVG markup"));
  walkAndSanitize(root);
  const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
  const width = boundedDimension(Number(root.getAttribute("width")) || viewBox[2] || 64, "width");
  if (width.isErr()) return err(width.error);
  const height = boundedDimension(Number(root.getAttribute("height")) || viewBox[3] || 64, "height");
  if (height.isErr()) return err(height.error);
  const content = new XMLSerializer().serializeToString(root);
  const hash = hashContent(content);
  return ok({
    content,
    intrinsicW: Math.max(16, Math.round(width.value)),
    intrinsicH: Math.max(16, Math.round(height.value)),
    hash,
  });
}

/** Compatibility adapter for callers that still use the throwing sanitizer. */
export function sanitizeSvg(input: string): SanitizedSvg {
  const result = sanitizeSvgResult(input);
  if (result.isErr()) throw new Error(result.error.message);
  return result.value;
}

function walkAndSanitize(node: Element): void {
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    node.remove();
    return;
  }
  for (const attr of [...node.attributes]) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name) || FORBIDDEN_ATTR.test(name) && name !== "href") node.removeAttribute(attr.name);
  }
  for (const child of [...node.children]) walkAndSanitize(child);
}

function sanitizeSvgNode(input: string): Result<SanitizedSvg, SvgSanitizeError> {
  if (!/<svg[\s>]/i.test(input)) return err(invalidSvg("Invalid SVG"));
  const viewBox = input.match(/viewBox=["']([^"']+)["']/i)?.[1]?.split(/\s+/).map(Number) ?? [];
  const width = boundedDimension(Number(input.match(/\bwidth=["']([^"']+)["']/i)?.[1]) || viewBox[2] || 64, "width");
  if (width.isErr()) return err(width.error);
  const height = boundedDimension(Number(input.match(/\bheight=["']([^"']+)["']/i)?.[1]) || viewBox[3] || 64, "height");
  if (height.isErr()) return err(height.error);
  const hash = hashContent(input);
  return ok({
    content: input,
    intrinsicW: Math.max(16, Math.round(width.value)),
    intrinsicH: Math.max(16, Math.round(height.value)),
    hash,
  });
}

function validateMarkupSafety(input: string): Result<void, SvgSanitizeError> {
  if (/<!doctype|<!entity|<\?xml-stylesheet/i.test(input)) return err(invalidSvg("SVG contains forbidden declarations"));
  const stack: string[] = [];
  let foundRoot = false;
  let closedRoot = false;
  let position = 0;

  while (position < input.length) {
    const open = input.indexOf("<", position);
    if (open < 0) {
      if (input.slice(position).trim() && stack.length === 0) return err(invalidSvg("Invalid SVG: content outside root element"));
      break;
    }
    if (input.slice(position, open).trim() && stack.length === 0) {
      return err(invalidSvg("Invalid SVG: content outside root element"));
    }
    if (input.startsWith("<!--", open)) {
      const end = input.indexOf("-->", open + 4);
      if (end < 0) return err(invalidSvg("Invalid SVG markup: unclosed comment"));
      position = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", open)) {
      const end = input.indexOf("]]>", open + 9);
      if (end < 0 || stack.length === 0) return err(invalidSvg("Invalid SVG markup: unclosed CDATA"));
      position = end + 3;
      continue;
    }
    if (input.startsWith("<?xml", open)) {
      const end = input.indexOf("?>", open + 5);
      if (end < 0 || foundRoot) return err(invalidSvg("Invalid SVG markup: malformed XML declaration"));
      position = end + 2;
      continue;
    }
    if (input.startsWith("<?", open) || input.startsWith("<!", open)) {
      return err(invalidSvg("SVG contains forbidden declarations"));
    }

    const end = findTagEnd(input, open);
    if (end < 0) return err(invalidSvg("Invalid SVG markup: unclosed tag"));
    const token = input.slice(open, end + 1);
    const closing = token.match(/^<\s*\/\s*([a-zA-Z][\w-]*)\s*>$/);
    if (closing) {
      const tag = closing[1]!.toLowerCase();
      if (!stack.length || stack[stack.length - 1] !== tag) return err(invalidSvg("Invalid SVG markup: unbalanced tags"));
      stack.pop();
      if (tag === "svg") closedRoot = true;
      position = end + 1;
      continue;
    }

    const opening = token.match(/^<\s*([a-zA-Z][\w-]*)([\s\S]*?)>$/);
    if (!opening) return err(invalidSvg("Invalid SVG markup: malformed tag"));
    const tag = opening[1]!.toLowerCase();
    if (!foundRoot) {
      if (tag !== "svg") return err(invalidSvg("Invalid SVG: root element must be <svg>"));
      foundRoot = true;
    } else if (closedRoot || stack.length === 0) {
      return err(invalidSvg("Invalid SVG: multiple root elements"));
    }
    if (!ALLOWED_TAGS.has(tag)) return err(invalidSvg(`SVG element <${tag}> is not allowed`));
    const rawAttributes = opening[2]!.replace(/\/\s*$/, "");
    const attributes = validateAttributes(rawAttributes);
    if (attributes.isErr()) return err(attributes.error);
    const selfClosing = /\/\s*$/.test(opening[2]!);
    if (!selfClosing) stack.push(tag);
    else if (tag === "svg") closedRoot = true;
    position = end + 1;
  }

  if (!foundRoot) return err(invalidSvg("Invalid SVG"));
  if (stack.length) return err(invalidSvg("Invalid SVG markup: unbalanced tags"));
  return ok(undefined);
}

function findTagEnd(input: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < input.length; index++) {
    const char = input[index]!;
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function validateAttributes(rawAttributes: string): Result<void, SvgSanitizeError> {
  const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/gs;
  let attribute: RegExpExecArray | null;
  let consumed = 0;
  while ((attribute = attributePattern.exec(rawAttributes))) {
    if (rawAttributes.slice(consumed, attribute.index).trim()) return err(invalidSvg("SVG contains malformed attributes"));
    const name = attribute[1]!.toLowerCase();
    const value = decodeReferenceEscapes(attribute[3]!);
    if (!ALLOWED_ATTRS.has(name) || FORBIDDEN_ATTR.test(name) && name !== "href") {
      return err(invalidSvg(`SVG attribute ${name} is not allowed`));
    }
    const embeddedRaster = name === "href" && EMBEDDED_RASTER_DATA.test(value);
    if (name === "href" && !embeddedRaster && !/^#[A-Za-z_][\w:.-]*$/.test(value)) {
      return err(invalidSvg("SVG href must be a local fragment or embedded raster image"));
    }
    if (LOCAL_REFERENCE_ATTRS.has(name) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) {
      return err(invalidSvg(`SVG ${name} must use a local fragment reference`));
    }
    if (PAINT_REFERENCE_ATTRS.has(name) && /url\s*\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) {
      return err(invalidSvg(`SVG ${name} must use a local fragment reference`));
    }
    if (!embeddedRaster && /javascript:|data:|https?:|\/\//i.test(value)) {
      return err(invalidSvg("SVG contains an external or executable reference"));
    }
    consumed = attributePattern.lastIndex;
  }
  if (rawAttributes.slice(consumed).trim()) return err(invalidSvg("SVG contains malformed attributes"));
  return ok(undefined);
}

function decodeReferenceEscapes(value: string): string {
  const xmlDecoded = value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      const named = entity.toLowerCase();
      if (named === "&amp;") return "&";
      if (named === "&lt;") return "<";
      if (named === "&gt;") return ">";
      if (named === "&quot;") return '"';
      return "'";
    },
  );
  return xmlDecoded.replace(/\\([\da-f]{1,6})(?:\s)?|\\(.)/gi, (_escape, hex: string | undefined, char: string | undefined) => (
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : (char ?? "")
  ));
}

function boundedDimension(value: number, name: string): Result<number, SvgSanitizeError> {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_INTRINSIC_SIZE) {
    return err(invalidSvg(`SVG ${name} must be between 1 and ${MAX_INTRINSIC_SIZE}`));
  }
  return ok(value);
}
