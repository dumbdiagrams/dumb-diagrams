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
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
  "use",
  "symbol",
]);

const FORBIDDEN_ATTR = /^(on|xlink:href|href|style)$/i;

export interface SanitizedSvg {
  content: string;
  intrinsicW: number;
  intrinsicH: number;
  hash: string;
}

export function sanitizeSvg(input: string): SanitizedSvg {
  if (typeof DOMParser === "undefined") {
    return sanitizeSvgNode(input);
  }
  const doc = new DOMParser().parseFromString(input, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    throw new Error("Invalid SVG: root element must be <svg>");
  }
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid SVG markup");
  }
  walkAndSanitize(root);
  const viewBox = root.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
  const width = Number(root.getAttribute("width")) || viewBox[2] || 64;
  const height = Number(root.getAttribute("height")) || viewBox[3] || 64;
  const content = new XMLSerializer().serializeToString(root);
  const hash = hashContent(content);
  return {
    content,
    intrinsicW: Math.max(16, Math.round(width)),
    intrinsicH: Math.max(16, Math.round(height)),
    hash,
  };
}

function walkAndSanitize(node: Element): void {
  const tag = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    node.remove();
    return;
  }
  for (const attr of [...node.attributes]) {
    const name = attr.name.toLowerCase();
    if (FORBIDDEN_ATTR.test(name)) {
      node.removeAttribute(attr.name);
      continue;
    }
    if ((name === "href" || name === "xlink:href") && !attr.value.startsWith("#")) {
      node.removeAttribute(attr.name);
    }
    if (attr.value.toLowerCase().includes("javascript:")) {
      node.removeAttribute(attr.name);
    }
  }
  for (const child of [...node.children]) walkAndSanitize(child);
}

function sanitizeSvgNode(input: string): SanitizedSvg {
  if (!/<svg[\s>]/i.test(input)) throw new Error("Invalid SVG");
  if (/<script|foreignObject|on\w+=/i.test(input)) {
    throw new Error("SVG contains forbidden content");
  }
  const viewBox = input.match(/viewBox=["']([^"']+)["']/i)?.[1]?.split(/\s+/).map(Number) ?? [];
  const width = Number(input.match(/\bwidth=["']([^"']+)["']/i)?.[1]) || viewBox[2] || 64;
  const height = Number(input.match(/\bheight=["']([^"']+)["']/i)?.[1]) || viewBox[3] || 64;
  const hash = hashContent(input);
  return {
    content: input,
    intrinsicW: Math.max(16, Math.round(width)),
    intrinsicH: Math.max(16, Math.round(height)),
    hash,
  };
}
