import type {
  DiagramDocument,
  Edge,
  Group,
  Resource,
  View,
} from "@dumb-diagrams/core";
import { createEmptyDocument } from "@dumb-diagrams/core";

type Token =
  | { type: "id"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "arrow" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "newline" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      if (ch === "\n") tokens.push({ type: "newline" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "lbrace" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "rbrace" });
      i++;
      continue;
    }
    if (ch === "-" && input[i + 1] === ">") {
      tokens.push({ type: "arrow" });
      i += 2;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      while (i < input.length && input[i] !== '"') {
        s += input[i++];
      }
      i++;
      tokens.push({ type: "string", value: s });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let n = "";
      while (i < input.length && /[0-9.]/.test(input[i]!)) n += input[i++];
      tokens.push({ type: "number", value: Number(n) });
      continue;
    }
    if (/[a-zA-Z_./-]/.test(ch)) {
      let id = "";
      while (i < input.length && /[a-zA-Z0-9_./-]/.test(input[i]!)) id += input[i++];
      tokens.push({ type: "id", value: id });
      continue;
    }
    i++;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private doc: DiagramDocument;
  private currentGroupStack: string[] = [];
  private view: View = { id: "default", places: {}, routes: {} };

  constructor(private tokens: Token[]) {
    this.doc = createEmptyDocument("diagram");
  }

  parse(): DiagramDocument {
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (!t || t.type === "newline") {
        this.pos++;
        continue;
      }
      if (t.type === "id" && t.value === "diagram") {
        this.parseDiagramHeader();
        continue;
      }
      if (t.type === "id" && t.value === "assets") {
        this.parseAssetsBlock();
        continue;
      }
      if (t.type === "id" && t.value === "view") {
        this.parseViewBlock();
        continue;
      }
      if (t.type === "id" && t.value.includes(".")) {
        this.parseResourceOrGroup();
        continue;
      }
      if (t.type === "id" && t.value === "group") {
        this.parseLogicalGroup();
        continue;
      }
      if (t.type === "id" && this.lookaheadArrow()) {
        this.parseEdge();
        continue;
      }
      this.pos++;
    }
    this.doc.views = [this.view];
    return this.doc;
  }

  private parseDiagramHeader(): void {
    this.expect("id", "diagram");
    const id = this.expect("id").value;
    this.doc.id = id;
    this.expect("lbrace");
    while (!this.is("rbrace")) {
      const t = this.peek();
      if (!t || t.type === "newline") {
        this.pos++;
        continue;
      }
      if (t.type === "id" && t.value === "grammar") {
        this.pos++;
        this.expect("id");
        continue;
      }
      if (t.type === "id" && t.value === "flow") {
        this.pos++;
        const flow = this.expect("id").value;
        if (flow === "lr" || flow === "tb") this.doc.flow = flow;
        continue;
      }
      if (t.type === "id" && t.value === "title") {
        this.pos++;
        this.doc.title = this.expect("string").value;
        continue;
      }
      if (t.type === "id" && t.value === "annotation") {
        this.parseAnnotation();
        continue;
      }
      if (t.type === "id" && t.value.includes(".")) {
        this.parseResourceOrGroup();
        continue;
      }
      if (t.type === "id" && t.value === "group") {
        this.parseLogicalGroup();
        continue;
      }
      if (t.type === "id" && this.lookaheadArrow()) {
        this.parseEdge();
        continue;
      }
      break;
    }
    this.expect("rbrace");
  }

  private parseResourceOrGroup(): void {
    const typeTok = this.expect("id");
    const idTok = this.expect("id");
    let label = idTok.value;
    if (this.peek()?.type === "string") {
      label = this.expect("string").value;
    }

    const kind = typeToGroupKind(typeTok.value);
    if (kind) {
      const group: Group = {
        id: idTok.value,
        kind,
        type: typeTok.value,
        parent: this.currentGroupStack.at(-1),
        label,
        children: [],
      };
      this.doc.groups.push(group);
      if (this.peek()?.type === "lbrace") {
        this.pos++;
        this.currentGroupStack.push(group.id);
        while (!this.is("rbrace")) {
          const t = this.peek();
          if (!t || t.type === "newline") {
            this.pos++;
            continue;
          }
          if (t.type === "id" && t.value.includes(".")) {
            this.parseResourceOrGroup();
            continue;
          }
          if (t.type === "id" && t.value === "group") {
            this.parseLogicalGroup();
            continue;
          }
          this.pos++;
        }
        this.expect("rbrace");
        this.currentGroupStack.pop();
      }
      const parentId = group.parent;
      if (parentId) {
        const parent = this.doc.groups.find((g) => g.id === parentId);
        parent?.children.push(group.id);
      }
      return;
    }

    const resource: Resource = {
      id: idTok.value,
      type: typeTok.value,
      parent: this.currentGroupStack.at(-1),
      label: { role: label },
      role: "primary",
      props: {},
    };

    if (this.peek()?.type === "lbrace") {
      this.pos++;
      while (!this.is("rbrace")) {
        const t = this.peek();
        if (!t || t.type === "newline") {
          this.pos++;
          continue;
        }
        if (t.type === "id" && t.value === "role") {
          this.pos++;
          const role = this.expect("id").value;
          if (role === "secondary" || role === "border") resource.role = role;
        } else if (t.type === "id" && t.value === "icon") {
          this.pos++;
          resource.props.iconAsset = this.expect("id").value;
        } else {
          this.pos++;
        }
      }
      this.expect("rbrace");
    }

    this.doc.resources.push(resource);
    const parentId = resource.parent;
    if (parentId) {
      const parent = this.doc.groups.find((g) => g.id === parentId);
      parent?.children.push(resource.id);
    }
  }

  private parseLogicalGroup(): void {
    this.expect("id", "group");
    const idTok = this.expect("id");
    let label = idTok.value;
    if (this.peek()?.type === "string") {
      label = this.expect("string").value;
    }
    const group: Group = {
      id: idTok.value,
      kind: "logical",
      parent: this.currentGroupStack.at(-1),
      label,
      children: [],
    };
    this.doc.groups.push(group);
    const parentId = group.parent;
    if (parentId) {
      const parent = this.doc.groups.find((g) => g.id === parentId);
      parent?.children.push(group.id);
    }
    if (this.peek()?.type === "lbrace") {
      this.pos++;
      this.currentGroupStack.push(group.id);
      while (!this.is("rbrace")) {
        const t = this.peek();
        if (!t || t.type === "newline") {
          this.pos++;
          continue;
        }
        if (t.type === "id" && t.value.includes(".")) {
          this.parseResourceOrGroup();
          continue;
        }
        this.pos++;
      }
      this.expect("rbrace");
      this.currentGroupStack.pop();
    }
  }

  private parseAnnotation(): void {
    this.expect("id", "annotation");
    const idTok = this.expect("id");
    let text = idTok.value;
    if (this.peek()?.type === "string") {
      text = this.expect("string").value;
    }
    const annotation: { id: string; text: string; anchor?: string } = {
      id: idTok.value,
      text,
    };
    if (this.peek()?.type === "lbrace") {
      this.pos++;
      while (!this.is("rbrace")) {
        const t = this.peek();
        if (!t || t.type === "newline") {
          this.pos++;
          continue;
        }
        if (t.type === "id" && t.value === "anchor") {
          this.pos++;
          annotation.anchor = this.expect("id").value;
        } else {
          this.pos++;
        }
      }
      this.expect("rbrace");
    }
    this.doc.annotations.push(annotation);
  }

  private parseEdge(): void {
    const source = this.expect("id").value;
    this.expect("arrow");
    const target = this.expect("id").value;
    const edge: Edge = {
      id: `${source}-${target}`,
      source,
      target,
      style: "solid",
    };
    if (this.peek()?.type === "lbrace") {
      this.pos++;
      while (!this.is("rbrace")) {
        const t = this.peek();
        if (!t || t.type === "newline") {
          this.pos++;
          continue;
        }
        if (t.type === "id" && t.value === "step") {
          this.pos++;
          edge.step = this.expect("number").value;
        } else if (t.type === "id" && t.value === "id") {
          this.pos++;
          edge.id = this.expect("id").value;
        } else if (t.type === "id" && t.value === "label") {
          this.pos++;
          edge.label = this.expect("string").value;
        } else if (t.type === "id" && t.value === "style") {
          this.pos++;
          const style = this.expect("id").value;
          if (style === "dashed" || style === "solid") edge.style = style;
        } else if (t.type === "id" && t.value === "kind") {
          this.pos++;
          const kind = this.expect("id").value;
          if (kind === "flow" || kind === "peer" || kind === "fail")
            edge.kind = kind;
        } else if (t.type === "id" && t.value === "from") {
          this.pos++;
          const side = this.expect("id").value;
          if (side === "n" || side === "s" || side === "e" || side === "w")
            edge.sourcePort = side;
        } else if (t.type === "id" && t.value === "to") {
          this.pos++;
          const side = this.expect("id").value;
          if (side === "n" || side === "s" || side === "e" || side === "w")
            edge.targetPort = side;
        } else {
          this.pos++;
        }
      }
      this.expect("rbrace");
    }
    this.doc.edges.push(edge);
  }

  private parseAssetsBlock(): void {
    this.expect("id", "assets");
    this.expect("lbrace");
    if (!this.doc.assets) this.doc.assets = [];
    while (!this.is("rbrace")) {
      const t = this.peek();
      if (!t || t.type === "newline") {
        this.pos++;
        continue;
      }
      if (t.type === "id" && t.value === "asset") {
        this.pos++;
        const id = this.expect("id").value;
        this.expect("lbrace");
        let content = "";
        let intrinsicW = 64;
        let intrinsicH = 64;
        while (!this.is("rbrace")) {
          const key = this.expect("id").value;
          if (key === "svg") content = this.expect("string").value;
          else if (key === "w") intrinsicW = this.expect("number").value;
          else if (key === "h") intrinsicH = this.expect("number").value;
        }
        this.expect("rbrace");
        this.doc.assets.push({ id, kind: "svg", content, intrinsicW, intrinsicH });
      } else {
        this.pos++;
      }
    }
    this.expect("rbrace");
  }

  private parseViewBlock(): void {
    this.expect("id", "view");
    const id = this.expect("id").value;
    this.view.id = id;
    this.expect("lbrace");
    while (!this.is("rbrace")) {
      const t = this.peek();
      if (!t || t.type === "newline") {
        this.pos++;
        continue;
      }
      if (t.type === "id" && t.value === "place") {
        this.pos++;
        const nodeId = this.expect("id").value;
        this.expect("lbrace");
        const place: NonNullable<View["places"][string]> = {};
        while (!this.is("rbrace")) {
          const k = this.expect("id").value;
          if (k === "x" || k === "y" || k === "w" || k === "h") {
            place[k] = this.expect("number").value;
          } else if (k === "pin") {
            place.pin = true;
          } else if (k === "locked") {
            place.locked = true;
          } else if (k === "visible") {
            const visible = this.expect("id").value;
            place.visible = visible !== "false";
          } else if (k === "z") {
            place.zIndex = this.expect("number").value;
          }
        }
        this.expect("rbrace");
        this.view.places[nodeId] = place;
        continue;
      }
      if (t.type === "id" && t.value === "route") {
        this.pos++;
        const edgeId = this.expect("id").value;
        this.expect("lbrace");
        const route: NonNullable<View["routes"][string]> = { waypoints: [] };
        while (!this.is("rbrace")) {
          const key = this.expect("id").value;
          if (key === "point") {
            route.waypoints!.push({
              x: this.expect("number").value,
              y: this.expect("number").value,
            });
          } else if (key === "pin") {
            route.pin = true;
          } else if (key === "mode") {
            const mode = this.expect("id").value;
            if (mode === "auto" || mode === "manual") route.mode = mode;
          }
        }
        this.expect("rbrace");
        if (route.pin && route.waypoints?.length) {
          route.points = [...route.waypoints];
        }
        this.view.routes[edgeId] = route;
        continue;
      }
      if (t.type === "id" && t.value === "annotation") {
        this.pos++;
        const annotationId = this.expect("id").value;
        this.expect("lbrace");
        const place: NonNullable<View["places"][string]> = {};
        while (!this.is("rbrace")) {
          const k = this.expect("id").value;
          if (k === "x" || k === "y" || k === "w" || k === "h") {
            place[k] = this.expect("number").value;
          } else if (k === "pin") {
            place.pin = true;
          } else if (k === "locked") {
            place.locked = true;
          } else if (k === "visible") {
            const visible = this.expect("id").value;
            place.visible = visible !== "false";
          } else if (k === "z") {
            place.zIndex = this.expect("number").value;
          }
        }
        this.expect("rbrace");
        if (!this.view.annotations) this.view.annotations = {};
        this.view.annotations[annotationId] = place;
        continue;
      }
      this.pos++;
    }
    this.expect("rbrace");
  }

  private lookaheadArrow(): boolean {
    for (let i = this.pos + 1; i < this.tokens.length; i++) {
      const t = this.tokens[i]!;
      if (t.type === "newline") continue;
      return t.type === "arrow";
    }
    return false;
  }

  private peek(): Token | undefined {
    while (this.pos < this.tokens.length && this.tokens[this.pos]?.type === "newline") {
      this.pos++;
    }
    return this.tokens[this.pos];
  }

  private is(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    if (!t || t.type !== type) return false;
    if (value !== undefined && "value" in t && t.value !== value) return false;
    return true;
  }

  private expect(type: "arrow"): Token;
  private expect(type: "lbrace"): Token;
  private expect(type: "rbrace"): Token;
  private expect(type: "string"): Token & { value: string };
  private expect(type: "number"): Token & { value: number };
  private expect(type: "id", value?: string): Token & { value: string };
  private expect(type: Token["type"], value?: string): Token {
    const t = this.peek();
    if (!t || t.type !== type) {
      throw new Error(`Expected ${type}${value ? ` ${value}` : ""}`);
    }
    if (value !== undefined && "value" in t && t.value !== value) {
      throw new Error(`Expected ${value}, got ${(t as { value: string }).value}`);
    }
    this.pos++;
    return t;
  }
}

function typeToGroupKind(type: string): Group["kind"] | null {
  const map: Record<string, Group["kind"]> = {
    "aws.cloud": "cloud",
    "aws.account": "account",
    "aws.region": "region",
    "aws.vpc": "vpc",
    "aws.az": "az",
    "aws.subnet": "subnet",
    "aws.subnet.public": "subnet-public",
    "aws.subnet.private": "subnet-private",
    "azure.subscription": "account",
    "azure.region": "region",
    "azure.vnet": "vpc",
    "azure.az": "az",
    "azure.subnet": "subnet",
    "azure.resource-group": "logical",
    "gcp.organization": "cloud",
    "gcp.project": "account",
    "gcp.region": "region",
    "gcp.zone": "az",
    "gcp.vpc": "vpc",
    "gcp.subnet": "subnet",
    "neutral.cloud": "cloud",
    "neutral.tenant": "account",
    "neutral.region": "region",
    "neutral.zone": "az",
    "neutral.network": "vpc",
    "neutral.subnet": "subnet",
    "neutral.security-group": "logical",
    "neutral.cluster": "logical",
    "neutral.datacenter": "logical",
    "neutral.logical": "logical",
    "neutral.trust-boundary": "overlay",
  };
  return map[type] ?? null;
}

export function parseArch(source: string): DiagramDocument {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}

export function printArch(doc: DiagramDocument): string {
  const lines: string[] = [];
  lines.push(`diagram ${doc.id} {`);
  lines.push(`  grammar ${doc.grammar}`);
  lines.push(`  flow ${doc.flow}`);
  if (doc.title) lines.push(`  title "${escapeString(doc.title)}"`);
  lines.push("");

  const roots = findRoots(doc);
  for (const id of roots) {
    printNode(doc, id, 1, lines);
  }

  for (const annotation of doc.annotations) {
    let line = `  annotation ${annotation.id} "${escapeString(annotation.text)}"`;
    if (annotation.anchor) line += ` { anchor ${annotation.anchor} }`;
    lines.push(line);
  }

  if (doc.annotations.length) lines.push("");

  for (const edge of doc.edges) {
    let line = `  ${edge.source} -> ${edge.target}`;
    const opts: string[] = [];
    const defaultId = `${edge.source}-${edge.target}`;
    if (edge.id !== defaultId) opts.push(`id ${edge.id}`);
    if (edge.label) opts.push(`label "${escapeString(edge.label)}"`);
    if (edge.step !== undefined) opts.push(`step ${edge.step}`);
    if (edge.style !== "solid") opts.push(`style ${edge.style}`);
    if (edge.kind) opts.push(`kind ${edge.kind}`);
    if (edge.sourcePort) opts.push(`from ${edge.sourcePort}`);
    if (edge.targetPort) opts.push(`to ${edge.targetPort}`);
    if (opts.length) line += ` { ${opts.join(" ")} }`;
    lines.push(line);
  }

  lines.push("}");
  lines.push("");
  if (doc.assets?.length) {
    lines.push("assets {");
    for (const asset of doc.assets) {
      lines.push(`  asset ${asset.id} {`);
      lines.push(`    svg "${escapeString(asset.content)}"`);
      lines.push(`    w ${asset.intrinsicW}`);
      lines.push(`    h ${asset.intrinsicH}`);
      lines.push("  }");
    }
    lines.push("}");
    lines.push("");
  }
  lines.push(`view ${doc.views[0]?.id ?? "default"} {`);
  const view = doc.views[0];
  if (view) {
    for (const [id, place] of Object.entries(view.places)) {
      lines.push(`  ${formatPlace("place", id, place)}`);
    }
    for (const [id, route] of Object.entries(view.routes)) {
      const parts = ["route", id, "{"];
      const points = route.points?.length
        ? route.points
        : route.waypoints ?? [];
      for (const point of points) {
        parts.push(`point ${point.x} ${point.y}`);
      }
      if (route.mode && route.mode !== "auto") parts.push(`mode ${route.mode}`);
      if (route.pin) parts.push("pin");
      parts.push("}");
      lines.push(`  ${parts.join(" ")}`);
    }
    for (const [id, place] of Object.entries(view.annotations ?? {})) {
      lines.push(`  ${formatPlace("annotation", id, place)}`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function formatPlace(
  keyword: "place" | "annotation",
  id: string,
  place: NonNullable<View["places"][string]>,
): string {
  const parts = [keyword, id, "{"];
  if (place.x !== undefined) parts.push(`x ${place.x}`);
  if (place.y !== undefined) parts.push(`y ${place.y}`);
  if (place.w !== undefined) parts.push(`w ${place.w}`);
  if (place.h !== undefined) parts.push(`h ${place.h}`);
  if (place.pin) parts.push("pin");
  if (place.locked) parts.push("locked");
  if (place.visible === false) parts.push("visible false");
  if (place.zIndex !== undefined) parts.push(`z ${place.zIndex}`);
  parts.push("}");
  return parts.join(" ");
}

function escapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findRoots(doc: DiagramDocument): string[] {
  const referenced = new Set<string>();
  for (const g of doc.groups) {
    for (const c of g.children) referenced.add(c);
  }
  const roots: string[] = [];
  for (const r of doc.resources) {
    if (!referenced.has(r.id) && !r.parent) roots.push(r.id);
  }
  for (const g of doc.groups) {
    if (!referenced.has(g.id) && !g.parent) roots.push(g.id);
  }
  return roots;
}

function printNode(
  doc: DiagramDocument,
  id: string,
  indent: number,
  lines: string[],
): void {
  const pad = "  ".repeat(indent + 1);
  const group = doc.groups.find((g) => g.id === id);
  const resource = doc.resources.find((r) => r.id === id);
  if (group) {
    const type = group.type ?? groupKindToType(group.kind);
    lines.push(`${pad}${type} ${group.id} "${group.label}" {`);
    for (const child of group.children) {
      printNode(doc, child, indent + 1, lines);
    }
    lines.push(`${pad}}`);
  } else if (resource) {
    const label = resource.label.role ?? resource.label.service ?? resource.id;
    let line = `${pad}${resource.type} ${resource.id} "${label}"`;
    const opts: string[] = [];
    if (resource.role !== "primary") opts.push(`role ${resource.role}`);
    if (resource.props.iconAsset) opts.push(`icon ${resource.props.iconAsset}`);
    if (opts.length) line += ` { ${opts.join(" ")} }`;
    lines.push(line);
  }
}

function groupKindToType(kind: Group["kind"]): string {
  const map: Record<Group["kind"], string> = {
    cloud: "aws.cloud",
    account: "aws.account",
    region: "aws.region",
    vpc: "aws.vpc",
    az: "aws.az",
    subnet: "aws.subnet",
    "subnet-public": "aws.subnet.public",
    "subnet-private": "aws.subnet.private",
    logical: "group",
    overlay: "group",
  };
  return map[kind];
}
