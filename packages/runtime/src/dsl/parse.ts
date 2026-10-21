import type {
  AnnotationStyle,
  DiagramDocument,
  Edge,
  EdgeColor,
  Group,
  Resource,
  TextAlign,
  TextFontFamily,
  View,
} from "../core/index.js";
import { createEmptyDocument, createEmptyView, DIAGRAM_LIMITS, EDGE_COLOR_VALUES, normalizePortOffset, utf8ByteLength } from "../core/index.js";
import { err, ok, safeTry, type Result } from "neverthrow";

/** The `.dgm` format this parser reads and `printDgm` writes. */
export const DGM_FORMAT_VERSION = 1;

/** Option keywords accepted inside each block, in canonical print order. */
export const DGM_KEYWORDS = {
  topLevel: ["dgm", "diagram", "assets", "view"],
  diagram: ["grammar", "flow", "title", "annotation"],
  group: ["step", "label-position", "hide-icon", "style", "color", "fill"],
  resource: ["service", "label-position", "role", "icon"],
  annotation: ["anchor", "style", "font", "size", "align"],
  edge: ["id", "label", "step", "style", "kind", "color", "from", "to"],
  port: ["offset"],
  assets: ["asset"],
  asset: ["svg", "w", "h"],
  view: ["place", "route", "annotation"],
  place: ["x", "y", "w", "h", "pin", "manual", "locked", "visible", "z"],
  route: ["point", "mode", "pin", "badge", "label"],
} as const;

/** Allowed values for enumerated options. */
export const DGM_VALUES = {
  grammar: ["aws", "azure", "gcp", "cloud-agnostic"],
  flow: ["lr", "tb"],
  groupLabelPosition: ["top-left", "top-right"],
  groupStyle: ["solid", "dashed"],
  groupFill: ["subtle", "none"],
  color: Object.keys(EDGE_COLOR_VALUES) as EdgeColor[],
  resourceLabelPosition: ["top", "bottom"],
  resourceRole: ["primary", "secondary", "border"],
  annotationStyle: ["text", "paper", "code", "callout", "checklist"],
  annotationFont: ["sans", "serif", "mono"],
  annotationAlign: ["left", "center", "right"],
  edgeStyle: ["solid", "dashed"],
  edgeKind: ["flow", "bidirectional", "peer", "fail"],
  side: ["n", "s", "e", "w"],
  visible: ["true", "false"],
  routeMode: ["auto", "manual"],
  routeLabelSide: ["top", "bottom"],
} as const satisfies Record<string, readonly string[]>;

export const ANNOTATION_SIZE_RANGE = { min: 10, max: 48 } as const;

type Position = { line: number; column: number };
type Token = Position & (
  | { type: "id"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "arrow" }
  | { type: "lbrace" }
  | { type: "rbrace" }
);
type IdToken = Extract<Token, { type: "id" }>;

export type DgmParseError =
  | { readonly code: "source-too-large"; readonly message: string }
  | { readonly code: "invalid-syntax"; readonly message: string; readonly line: number; readonly column: number };

function parseError(at: Position, message: string): DgmParseError {
  return { code: "invalid-syntax", message, line: at.line, column: at.column };
}

function describe(token: Token): string {
  switch (token.type) {
    case "id": return JSON.stringify(token.value);
    case "string": return `string ${JSON.stringify(token.value)}`;
    case "number": return `number ${token.value}`;
    case "arrow": return '"->"';
    case "lbrace": return '"{"';
    case "rbrace": return '"}"';
  }
}

const TOKEN_NAMES: Record<Token["type"], string> = {
  id: "an identifier",
  string: "a quoted string",
  number: "a number",
  arrow: '"->"',
  lbrace: '"{"',
  rbrace: '"}"',
};

function tokenize(input: string): Result<{ tokens: Token[]; end: Position }, DgmParseError> {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const here = (): Position => ({ line, column: i - lineStart + 1 });
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      if (ch === "\n") {
        line++;
        lineStart = i;
      }
      continue;
    }
    const at = here();
    if (ch === "{" || ch === "}") {
      tokens.push({ type: ch === "{" ? "lbrace" : "rbrace", ...at });
      i++;
      continue;
    }
    if (ch === "-" && input[i + 1] === ">") {
      tokens.push({ type: "arrow", ...at });
      i += 2;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      let terminated = false;
      while (i < input.length) {
        const current = input[i++]!;
        if (current === '"') {
          terminated = true;
          break;
        }
        if (current === "\n") {
          line++;
          lineStart = i;
        }
        if (current !== "\\") {
          s += current;
          continue;
        }
        if (i >= input.length) return err(parseError(at, "Unterminated escape sequence in quoted string"));
        const escaped = input[i++]!;
        if (escaped === '"' || escaped === "\\") s += escaped;
        else if (escaped === "n") s += "\n";
        else if (escaped === "r") s += "\r";
        else if (escaped === "t") s += "\t";
        else return err(parseError(at, `Unsupported escape sequence \\${escaped}`));
      }
      if (!terminated) return err(parseError(at, "Unterminated quoted string"));
      tokens.push({ type: "string", value: s, ...at });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const match = input.slice(i).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!match) return err(parseError(at, "Invalid number"));
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return err(parseError(at, "Number is outside the supported range"));
      i += match[0].length;
      tokens.push({ type: "number", value, ...at });
      continue;
    }
    if (/[a-zA-Z_./-]/.test(ch)) {
      let id = "";
      while (i < input.length && /[a-zA-Z0-9_./-]/.test(input[i]!)) id += input[i++];
      tokens.push({ type: "id", value: id, ...at });
      continue;
    }
    return err(parseError(at, `Unexpected character ${JSON.stringify(ch)}`));
  }
  return ok({ tokens, end: here() });
}

type Place = NonNullable<View["places"][string]>;

class Parser {
  private pos = 0;
  private doc: DiagramDocument;
  private currentGroupStack: string[] = [];
  private view: View = createEmptyView();
  private viewParsed = false;

  constructor(private tokens: Token[], private end: Position) {
    this.doc = createEmptyDocument("diagram");
  }

  parse(): Result<DiagramDocument, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const first = parser.peek();
      if (first?.type === "id" && first.value === "dgm") {
        parser.pos++;
        const version = yield* parser.expect("number");
        if (version.value !== DGM_FORMAT_VERSION) {
          return err(parseError(version, `This diagram uses format ${version.value}; this dumbdiagrams supports format ${DGM_FORMAT_VERSION}. Upgrade dumbdiagrams.`));
        }
      }
      if (!parser.is("id", "diagram")) return err(parser.errorAtCurrent("Expected diagram declaration"));
      yield* parser.parseDiagramHeader();

      for (let t = parser.peek(); t; t = parser.peek()) {
        if (t.type === "id" && t.value === "assets") {
          yield* parser.parseAssetsBlock();
        } else if (t.type === "id" && t.value === "view") {
          yield* parser.parseViewBlock();
        } else {
          return err(parseError(t, `Unexpected ${describe(t)} after diagram; expected assets or view`));
        }
      }
      parser.doc.views = [parser.view];
      return ok(parser.doc);
    });
  }

  private parseDiagramHeader(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      yield* parser.expect("id", "diagram");
      parser.doc.id = (yield* parser.expect("id")).value;
      yield* parser.parseBlock(
        "diagram",
        "a typed declaration, or an edge",
        DGM_KEYWORDS.diagram,
        (key) => safeTry(function* () {
          if (key === "grammar") parser.doc.grammar = yield* parser.oneOf("grammar", DGM_VALUES.grammar);
          else if (key === "flow") parser.doc.flow = yield* parser.oneOf("flow", DGM_VALUES.flow);
          else if (key === "title") parser.doc.title = (yield* parser.expect("string")).value;
          else yield* parser.parseAnnotation();
          return ok(undefined);
        }),
        (token) => parser.parseDeclarationOrEdge(token, true),
      );
      return ok(undefined);
    });
  }

  /** Parse a nested typed declaration, or an edge when allowed. Returns false for other tokens. */
  private parseDeclarationOrEdge(token: IdToken, allowEdges: boolean): Result<boolean, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      if (allowEdges && parser.lookaheadArrow()) {
        yield* parser.parseEdge();
        return ok(true);
      }
      if (!token.value.includes(".")) return ok(false);
      yield* parser.parseResourceOrGroup();
      return ok(true);
    });
  }

  private parseResourceOrGroup(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const typeTok = yield* parser.expect("id");
      const idTok = yield* parser.expect("id");
      let label: string | undefined;
      if (parser.peek()?.type === "string") {
        label = (yield* parser.expect("string")).value;
      }

      const kind = GROUP_KINDS[typeTok.value];
      if (kind) {
        const group: Group = {
          id: idTok.value,
          kind,
          type: typeTok.value,
          parent: parser.currentGroupStack.at(-1),
          label: label ?? idTok.value,
          children: [],
        };
        parser.doc.groups.push(group);
        const brace = parser.peek();
        if (brace?.type === "lbrace") {
          if (parser.currentGroupStack.length >= DIAGRAM_LIMITS.hierarchyDepth) {
            return err(parseError(brace, `Diagram exceeds the maximum hierarchy depth of ${DIAGRAM_LIMITS.hierarchyDepth}`));
          }
          parser.currentGroupStack.push(group.id);
          yield* parser.parseBlock(
            "group",
            "or a nested typed declaration",
            DGM_KEYWORDS.group,
            (key) => safeTry(function* () {
              if (key === "step") group.step = (yield* parser.expect("number")).value;
              else if (key === "label-position") group.labelPosition = yield* parser.oneOf("group label-position", DGM_VALUES.groupLabelPosition);
              else if (key === "hide-icon") group.hideIcon = true;
              else if (key === "style") group.style = yield* parser.oneOf("group style", DGM_VALUES.groupStyle);
              else if (key === "color") group.color = yield* parser.oneOf("group color", DGM_VALUES.color);
              else group.fill = yield* parser.oneOf("group fill", DGM_VALUES.groupFill);
              return ok(undefined);
            }),
            (token) => parser.parseDeclarationOrEdge(token, false),
          );
          parser.currentGroupStack.pop();
        }
        parser.attachToParent(group.parent, group.id);
        return ok(undefined);
      }

      const resource: Resource = {
        id: idTok.value,
        type: typeTok.value,
        parent: parser.currentGroupStack.at(-1),
        label: label ? { role: label } : {},
        role: "primary",
        props: {},
      };
      if (parser.peek()?.type === "lbrace") {
        yield* parser.parseBlock("resource", undefined, DGM_KEYWORDS.resource, (key) => safeTry(function* () {
          if (key === "role") resource.role = yield* parser.oneOf("resource role", DGM_VALUES.resourceRole);
          else if (key === "service") resource.label.service = (yield* parser.expect("string")).value;
          else if (key === "icon") resource.props.iconAsset = (yield* parser.expect("id")).value;
          else resource.label.position = yield* parser.oneOf("resource label-position", DGM_VALUES.resourceLabelPosition);
          return ok(undefined);
        }));
      }
      parser.doc.resources.push(resource);
      parser.attachToParent(resource.parent, resource.id);
      return ok(undefined);
    });
  }

  private attachToParent(parentId: string | undefined, id: string): void {
    if (!parentId) return;
    this.doc.groups.find((g) => g.id === parentId)?.children.push(id);
  }

  private parseAnnotation(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const idTok = yield* parser.expect("id");
      let text = idTok.value;
      if (parser.peek()?.type === "string") {
        text = (yield* parser.expect("string")).value;
      }
      const annotation: {
        id: string;
        text: string;
        anchor?: string;
        style?: AnnotationStyle;
        font?: TextFontFamily;
        fontSize?: number;
        align?: TextAlign;
      } = {
        id: idTok.value,
        text,
      };
      if (parser.peek()?.type === "lbrace") {
        yield* parser.parseBlock("annotation", undefined, DGM_KEYWORDS.annotation, (key) => safeTry(function* () {
          if (key === "anchor") annotation.anchor = (yield* parser.expect("id")).value;
          else if (key === "style") annotation.style = yield* parser.oneOf("annotation style", DGM_VALUES.annotationStyle);
          else if (key === "font") annotation.font = yield* parser.oneOf("annotation font", DGM_VALUES.annotationFont);
          else if (key === "align") annotation.align = yield* parser.oneOf("annotation align", DGM_VALUES.annotationAlign);
          else {
            const size = yield* parser.expect("number");
            if (size.value < ANNOTATION_SIZE_RANGE.min || size.value > ANNOTATION_SIZE_RANGE.max) {
              return err(parseError(size, `Invalid annotation size ${size.value}; expected ${ANNOTATION_SIZE_RANGE.min} to ${ANNOTATION_SIZE_RANGE.max}`));
            }
            annotation.fontSize = size.value;
          }
          return ok(undefined);
        }));
      }
      parser.doc.annotations.push(annotation);
      return ok(undefined);
    });
  }

  private parseEdge(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const source = (yield* parser.expect("id")).value;
      yield* parser.expect("arrow");
      const target = (yield* parser.expect("id")).value;
      const baseId = `${source}-${target}`;
      const usedIds = new Set(parser.doc.edges.map((candidate) => candidate.id));
      let id = baseId;
      for (let suffix = 2; usedIds.has(id); suffix++) id = `${baseId}-${suffix}`;
      const edge: Edge = { id, source, target, style: "solid" };
      if (parser.peek()?.type === "lbrace") {
        yield* parser.parseBlock("edge", undefined, DGM_KEYWORDS.edge, (key) => safeTry(function* () {
          if (key === "step") edge.step = (yield* parser.expect("number")).value;
          else if (key === "id") edge.id = (yield* parser.expect("id")).value;
          else if (key === "label") edge.label = (yield* parser.expect("string")).value;
          else if (key === "style") edge.style = yield* parser.oneOf("edge style", DGM_VALUES.edgeStyle);
          else if (key === "kind") edge.kind = yield* parser.oneOf("edge kind", DGM_VALUES.edgeKind);
          else if (key === "color") edge.color = yield* parser.oneOf("edge color", DGM_VALUES.color);
          else {
            const side = yield* parser.oneOf(`edge ${key} side`, DGM_VALUES.side);
            let offset: number | undefined;
            if (parser.is("id", "offset")) {
              parser.pos++;
              offset = normalizePortOffset((yield* parser.expect("number")).value);
            }
            if (key === "from") {
              edge.sourcePort = side;
              if (offset !== undefined) edge.sourcePortOffset = offset;
            } else {
              edge.targetPort = side;
              if (offset !== undefined) edge.targetPortOffset = offset;
            }
          }
          return ok(undefined);
        }));
      }
      parser.doc.edges.push(edge);
      return ok(undefined);
    });
  }

  private parseAssetsBlock(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      yield* parser.expect("id", "assets");
      const assets = parser.doc.assets ?? [];
      parser.doc.assets = assets;
      yield* parser.parseBlock("assets", undefined, DGM_KEYWORDS.assets, () => safeTry(function* () {
        const id = (yield* parser.expect("id")).value;
        let content = "";
        let intrinsicW = 64;
        let intrinsicH = 64;
        yield* parser.parseBlock("asset", undefined, DGM_KEYWORDS.asset, (key) => safeTry(function* () {
          if (key === "svg") content = (yield* parser.expect("string")).value;
          else if (key === "w") intrinsicW = (yield* parser.expect("number")).value;
          else intrinsicH = (yield* parser.expect("number")).value;
          return ok(undefined);
        }));
        assets.push({ id, kind: "svg", content, intrinsicW, intrinsicH });
        return ok(undefined);
      }));
      return ok(undefined);
    });
  }

  private parseViewBlock(): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const keyword = yield* parser.expect("id", "view");
      if (parser.viewParsed) return err(parseError(keyword, "Only one view block is supported"));
      parser.viewParsed = true;
      parser.view.id = (yield* parser.expect("id")).value;
      yield* parser.parseBlock("view", undefined, DGM_KEYWORDS.view, (key) => safeTry(function* () {
        const id = (yield* parser.expect("id")).value;
        if (key === "place") {
          parser.view.places[id] = yield* parser.parsePlaceBody("place");
        } else if (key === "annotation") {
          const place = yield* parser.parsePlaceBody("annotation place");
          parser.view.annotations ??= Object.create(null) as NonNullable<View["annotations"]>;
          parser.view.annotations[id] = place;
        } else {
          parser.view.routes[id] = yield* parser.parseRouteBody();
        }
        return ok(undefined);
      }));
      return ok(undefined);
    });
  }

  private parsePlaceBody(context: string): Result<Place, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const place: Place = {};
      yield* parser.parseBlock(context, undefined, DGM_KEYWORDS.place, (key) => safeTry(function* () {
        if (key === "x" || key === "y" || key === "w" || key === "h") place[key] = (yield* parser.expect("number")).value;
        else if (key === "z") place.zIndex = (yield* parser.expect("number")).value;
        else if (key === "visible") place.visible = (yield* parser.oneOf("visible", DGM_VALUES.visible)) === "true";
        else if (key === "pin") place.pin = true;
        else if (key === "manual") place.manual = true;
        else place.locked = true;
        return ok(undefined);
      }));
      return ok(place);
    });
  }

  private parseRouteBody(): Result<NonNullable<View["routes"][string]>, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      const route: NonNullable<View["routes"][string]> = { waypoints: [] };
      yield* parser.parseBlock("route", undefined, DGM_KEYWORDS.route, (key) => safeTry(function* () {
        if (key === "point") {
          route.waypoints!.push({
            x: (yield* parser.expect("number")).value,
            y: (yield* parser.expect("number")).value,
          });
        } else if (key === "pin") {
          route.pin = true;
        } else if (key === "mode") {
          route.mode = yield* parser.oneOf("route mode", DGM_VALUES.routeMode);
        } else {
          const t = Math.max(0, Math.min(1, (yield* parser.expect("number")).value));
          const side = yield* parser.oneOf(`route ${key} side`, DGM_VALUES.routeLabelSide);
          if (key === "badge") {
            route.badgeT = t;
            route.badgeSide = side;
          } else {
            route.labelT = t;
            route.labelSide = side;
          }
        }
        return ok(undefined);
      }));
      if (route.pin && route.waypoints?.length) {
        route.points = [...route.waypoints];
      }
      return ok(route);
    });
  }

  /**
   * Parse `{ ... }` where every entry is one of `keywords` or, when `other`
   * accepts it, a nested statement. Anything else is an error naming the
   * allowed keywords.
   */
  private parseBlock<K extends string>(
    context: string,
    otherDescription: string | undefined,
    keywords: readonly K[],
    option: (key: K) => Result<void, DgmParseError>,
    other?: (token: IdToken) => Result<boolean, DgmParseError>,
  ): Result<void, DgmParseError> {
    const parser = this;
    return safeTry(function* () {
      yield* parser.expect("lbrace");
      for (;;) {
        const t = parser.peek();
        if (!t) return err(parseError(parser.end, "Unterminated block; expected }"));
        if (t.type === "rbrace") break;
        if (t.type === "id" && (keywords as readonly string[]).includes(t.value)) {
          parser.pos++;
          yield* option(t.value as K);
          continue;
        }
        if (other && t.type === "id" && (yield* other(t))) continue;
        const expected = otherDescription ? `${keywords.join(", ")}, ${otherDescription}` : keywords.join(", ");
        return err(parseError(t, `Unknown ${context} option ${describe(t)}; expected ${expected}`));
      }
      parser.pos++;
      return ok(undefined);
    });
  }

  private oneOf<T extends string>(what: string, values: readonly T[]): Result<T, DgmParseError> {
    const t = this.peek();
    if (!t) return err(parseError(this.end, `Expected ${what}, reached end of file`));
    if (t.type !== "id" || !(values as readonly string[]).includes(t.value)) {
      return err(parseError(t, `Invalid ${what} ${describe(t)}; expected ${values.join(", ")}`));
    }
    this.pos++;
    return ok(t.value as T);
  }

  private lookaheadArrow(): boolean {
    return this.tokens[this.pos + 1]?.type === "arrow";
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private errorAtCurrent(message: string): DgmParseError {
    return parseError(this.peek() ?? this.end, message);
  }

  private is(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    if (!t || t.type !== type) return false;
    if (value !== undefined && "value" in t && t.value !== value) return false;
    return true;
  }

  private expect(type: "arrow"): Result<Extract<Token, { type: "arrow" }>, DgmParseError>;
  private expect(type: "lbrace"): Result<Extract<Token, { type: "lbrace" }>, DgmParseError>;
  private expect(type: "rbrace"): Result<Extract<Token, { type: "rbrace" }>, DgmParseError>;
  private expect(type: "string"): Result<Extract<Token, { type: "string" }>, DgmParseError>;
  private expect(type: "number"): Result<Extract<Token, { type: "number" }>, DgmParseError>;
  private expect(type: "id", value?: string): Result<IdToken, DgmParseError>;
  private expect(type: Token["type"], value?: string): Result<Token, DgmParseError> {
    const t = this.peek();
    const wanted = value ? JSON.stringify(value) : TOKEN_NAMES[type];
    if (!t) return err(parseError(this.end, `Expected ${wanted}, reached end of file`));
    if (t.type !== type || (value !== undefined && "value" in t && t.value !== value)) {
      return err(parseError(t, `Expected ${wanted}, got ${describe(t)}`));
    }
    this.pos++;
    return ok(t);
  }
}

const GROUP_KINDS: Readonly<Record<string, Group["kind"]>> = Object.assign(Object.create(null), {
  "aws.cloud": "cloud",
  "aws.account": "account",
  "aws.region": "region",
  "aws.vpc": "vpc",
  "aws.az": "az",
  "aws.subnet": "subnet",
  "aws.subnet.public": "subnet-public",
  "aws.subnet.private": "subnet-private",
  "aws.auto-scaling-group": "auto-scaling",
  "aws.ec2-instance-contents": "ec2-instance",
  "aws.elastic-beanstalk-container": "elastic-beanstalk",
  "aws.spot-fleet": "spot-fleet",
  "aws.step-functions-workflow": "step-functions",
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
  "cloud-agnostic.cloud": "cloud",
  "cloud-agnostic.account": "account",
  "cloud-agnostic.region": "region",
  "cloud-agnostic.zone": "az",
  "cloud-agnostic.network": "vpc",
  "cloud-agnostic.subnet": "subnet",
  "cloud-agnostic.security-group": "logical",
  "cloud-agnostic.cluster": "logical",
  "cloud-agnostic.datacenter": "logical",
  "cloud-agnostic.boundary": "logical",
  "cloud-agnostic.trust-boundary": "overlay",
});

/** `line:column message` for syntax errors, or the plain message. */
export function formatParseError(error: DgmParseError): string {
  return error.code === "invalid-syntax" ? `${error.line}:${error.column} ${error.message}` : error.message;
}

/** Parse versioned source, returning typed syntax and source-limit failures. */
export function parseDgmResult(source: string): Result<DiagramDocument, DgmParseError> {
  if (utf8ByteLength(source) > DIAGRAM_LIMITS.sourceBytes) {
    return err({
      code: "source-too-large",
      message: "Diagram exceeds the 1 MiB source limit",
    });
  }
  const tokens = tokenize(source);
  if (tokens.isErr()) return err(tokens.error);
  return new Parser(tokens.value.tokens, tokens.value.end).parse();
}

/** Canonical source round-tripping through the parser is stable. */
export function printDgm(doc: DiagramDocument): string {
  const header = [`  grammar ${doc.grammar}`, `  flow ${doc.flow}`];
  if (doc.title) header.push(`  title "${escapeString(doc.title)}"`);
  const lines = [`dgm ${DGM_FORMAT_VERSION}`, `diagram ${doc.id} {`, ...header];
  const sections = [
    printSiblings(doc, findRoots(doc), 1),
    doc.annotations.map(printAnnotation),
    doc.edges.map(printEdge),
  ];
  for (const section of sections) {
    if (section.length) lines.push("", ...section);
  }
  lines.push("}");

  if (doc.assets?.length) {
    lines.push("", "assets {");
    for (const asset of doc.assets) {
      lines.push(
        `  asset ${asset.id} {`,
        `    svg "${escapeString(asset.content)}"`,
        `    w ${asset.intrinsicW}`,
        `    h ${asset.intrinsicH}`,
        "  }",
      );
    }
    lines.push("}");
  }

  const view = doc.views[0];
  const viewLines = view ? printView(view) : [];
  if (viewLines.length || (view && view.id !== "default")) {
    lines.push("", `view ${view?.id ?? "default"} {`, ...viewLines, "}");
  }
  return `${lines.join("\n")}\n`;
}

function printAnnotation(annotation: DiagramDocument["annotations"][number]): string {
  const options: string[] = [];
  if (annotation.anchor) options.push(`anchor ${annotation.anchor}`);
  if (annotation.style && annotation.style !== "paper") options.push(`style ${annotation.style}`);
  if (annotation.font) options.push(`font ${annotation.font}`);
  if (annotation.fontSize) options.push(`size ${annotation.fontSize}`);
  if (annotation.align) options.push(`align ${annotation.align}`);
  return `  annotation ${annotation.id} "${escapeString(annotation.text)}"${inlineOptions(options)}`;
}

function printEdge(edge: Edge): string {
  const options: string[] = [];
  if (edge.id !== `${edge.source}-${edge.target}`) options.push(`id ${edge.id}`);
  if (edge.label) options.push(`label "${escapeString(edge.label)}"`);
  if (edge.step !== undefined) options.push(`step ${edge.step}`);
  if (edge.style !== "solid") options.push(`style ${edge.style}`);
  if (edge.kind) options.push(`kind ${edge.kind}`);
  if (edge.color) options.push(`color ${edge.color}`);
  if (edge.sourcePort) options.push(`from ${edge.sourcePort}${printOffset(edge.sourcePortOffset)}`);
  if (edge.targetPort) options.push(`to ${edge.targetPort}${printOffset(edge.targetPortOffset)}`);
  return `  ${edge.source} -> ${edge.target}${inlineOptions(options)}`;
}

function printOffset(offset: number | undefined): string {
  return offset === undefined ? "" : ` offset ${normalizePortOffset(offset)}`;
}

function inlineOptions(options: string[]): string {
  return options.length ? ` { ${options.join(" ")} }` : "";
}

function printView(view: View): string[] {
  const lines: string[] = [];
  for (const [id, place] of Object.entries(view.places)) {
    const line = formatPlace("place", id, place);
    if (line) lines.push(`  ${line}`);
  }
  for (const [id, route] of Object.entries(view.routes)) {
    const parts = ["route", id, "{"];
    const points = route.points?.length ? route.points : route.waypoints ?? [];
    for (const point of points) parts.push(`point ${point.x} ${point.y}`);
    if (route.mode && route.mode !== "auto") parts.push(`mode ${route.mode}`);
    if (route.pin) parts.push("pin");
    if (route.badgeT !== undefined || route.badgeSide !== undefined) {
      parts.push(`badge ${route.badgeT ?? 0.5} ${route.badgeSide ?? "top"}`);
    }
    if (route.labelT !== undefined || route.labelSide !== undefined) {
      parts.push(`label ${route.labelT ?? 0.5} ${route.labelSide ?? "top"}`);
    }
    parts.push("}");
    lines.push(`  ${parts.join(" ")}`);
  }
  for (const [id, place] of Object.entries(view.annotations ?? {})) {
    const line = formatPlace("annotation", id, place);
    if (line) lines.push(`  ${line}`);
  }
  return lines;
}

function formatPlace(
  keyword: "place" | "annotation",
  id: string,
  place: NonNullable<View["places"][string]>,
): string | undefined {
  const parts = [keyword, id, "{"];
  if (place.x !== undefined) parts.push(`x ${place.x}`);
  if (place.y !== undefined) parts.push(`y ${place.y}`);
  if (place.w !== undefined) parts.push(`w ${place.w}`);
  if (place.h !== undefined) parts.push(`h ${place.h}`);
  if (place.pin) parts.push("pin");
  if (place.manual) parts.push("manual");
  if (place.locked) parts.push("locked");
  if (place.visible === false) parts.push("visible false");
  if (place.zIndex !== undefined) parts.push(`z ${place.zIndex}`);
  if (parts.length === 3) return undefined;
  parts.push("}");
  return parts.join(" ");
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
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

/** Siblings with a multi-line body are separated from their neighbours by a blank line. */
function printSiblings(doc: DiagramDocument, ids: readonly string[], depth: number): string[] {
  const chunks = ids.map((id) => printNode(doc, id, depth)).filter((chunk) => chunk.length);
  return chunks.flatMap((chunk, index) =>
    index > 0 && (chunk.length > 1 || chunks[index - 1]!.length > 1) ? ["", ...chunk] : chunk,
  );
}

function printNode(doc: DiagramDocument, id: string, depth: number): string[] {
  const pad = "  ".repeat(depth);
  const group = doc.groups.find((g) => g.id === id);
  if (group) {
    const declaration = `${pad}${group.type ?? groupKindToType(group.kind)} ${group.id} "${escapeString(group.label)}"`;
    const body: string[] = [];
    if (group.step !== undefined) body.push(`${pad}  step ${group.step}`);
    if (group.labelPosition) body.push(`${pad}  label-position ${group.labelPosition}`);
    if (group.hideIcon) body.push(`${pad}  hide-icon`);
    if (group.style) body.push(`${pad}  style ${group.style}`);
    if (group.color) body.push(`${pad}  color ${group.color}`);
    if (group.fill) body.push(`${pad}  fill ${group.fill}`);
    body.push(...printSiblings(doc, group.children, depth + 1));
    return body.length ? [`${declaration} {`, ...body, `${pad}}`] : [declaration];
  }
  const resource = doc.resources.find((r) => r.id === id);
  if (!resource) return [];
  const options: string[] = [];
  if (resource.label.service) options.push(`service "${escapeString(resource.label.service)}"`);
  if (resource.label.position) options.push(`label-position ${resource.label.position}`);
  if (resource.role !== "primary") options.push(`role ${resource.role}`);
  if (resource.props.iconAsset) options.push(`icon ${resource.props.iconAsset}`);
  const label = resource.label.role ? ` "${escapeString(resource.label.role)}"` : "";
  return [`${pad}${resource.type} ${resource.id}${label}${inlineOptions(options)}`];
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
    "auto-scaling": "aws.auto-scaling-group",
    "ec2-instance": "aws.ec2-instance-contents",
    "elastic-beanstalk": "aws.elastic-beanstalk-container",
    "spot-fleet": "aws.spot-fleet",
    "step-functions": "aws.step-functions-workflow",
    logical: "cloud-agnostic.boundary",
    overlay: "cloud-agnostic.trust-boundary",
  };
  return map[kind];
}
