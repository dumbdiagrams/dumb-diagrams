export type ID = string;

export type FlowDirection = "lr" | "tb";
export type Grammar = "aws";
export type ResourceRole = "primary" | "secondary" | "border";
export type ResourceLabelPosition = "top" | "bottom" | "left" | "right";
export type GroupLabelPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type EdgeStyle = "solid" | "dashed";
export type EdgeKind = "flow" | "peer" | "fail";
export type EdgeColor = "graphite" | "blue" | "teal" | "purple" | "amber" | "red" | "green";

/** Curated connector colors keep authored diagrams portable and predictable. */
export const EDGE_COLOR_VALUES: Record<EdgeColor, string> = {
  graphite: "#334155",
  blue: "#3154D4",
  teal: "#0F766E",
  purple: "#7C3AED",
  amber: "#B45309",
  red: "#C53B32",
  green: "#2F855A",
};

export function resolveEdgeColor(color?: EdgeColor, kind?: EdgeKind): string {
  if (color) return EDGE_COLOR_VALUES[color];
  if (kind === "fail") return EDGE_COLOR_VALUES.red;
  return EDGE_COLOR_VALUES.graphite;
}

export type GroupKind =
  | "cloud"
  | "account"
  | "region"
  | "vpc"
  | "az"
  | "subnet"
  | "subnet-public"
  | "subnet-private"
  | "logical"
  | "overlay";

export type Side = "n" | "s" | "e" | "w";
export type RouteMode = "auto" | "manual";
export type EdgeBadgeSide = "top" | "bottom";
export type EdgeLabelSide = "top" | "bottom";
export type AnnotationStyle = "text" | "paper" | "code" | "callout" | "checklist";
export type TextFontFamily = "sans" | "serif" | "mono";
export type TextAlign = "left" | "center" | "right";

export interface PortAnchor {
  side: Side;
  /** Fraction along the face, 0–1. Defaults to 0.5. */
  offset?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResourceLabel {
  service?: string;
  role?: string;
  /** Where the complete display label is placed relative to the icon. */
  position?: ResourceLabelPosition;
}

export interface Resource {
  id: ID;
  type: string;
  parent?: ID;
  label: ResourceLabel;
  role: ResourceRole;
  props: Record<string, unknown>;
}

export interface BorderChild {
  id: ID;
  side: Side;
}

export interface Group {
  id: ID;
  kind: GroupKind;
  /** Optional numbered callout rendered on the group boundary. */
  step?: number;
  type?: string;
  parent?: ID;
  label: string;
  /** Corner used for the boundary icon and display label. */
  labelPosition?: GroupLabelPosition;
  children: ID[];
  borderChildren?: BorderChild[];
  overlayTargets?: ID[];
}

export interface DiagramAsset {
  id: ID;
  kind: "svg";
  content: string;
  intrinsicW: number;
  intrinsicH: number;
  hash?: string;
}

export interface Edge {
  id: ID;
  source: ID;
  target: ID;
  sourcePort?: Side;
  targetPort?: Side;
  /** Fraction along the source face; normalized to one of the visible ports. */
  sourcePortOffset?: number;
  /** Fraction along the target face; normalized to one of the visible ports. */
  targetPortOffset?: number;
  step?: number;
  label?: string;
  style: EdgeStyle;
  kind?: EdgeKind;
  color?: EdgeColor;
}

export interface Annotation {
  id: ID;
  text: string;
  anchor?: ID;
  /** Visual treatment used when the annotation is rendered on the canvas. */
  style?: AnnotationStyle;
  /** Typography overrides for plain text annotations. */
  font?: TextFontFamily;
  fontSize?: number;
  align?: TextAlign;
}

export interface RouteOverride {
  waypoints?: Point[];
  /** Full polyline including endpoints when manually pinned. */
  points?: Point[];
  pin?: boolean;
  mode?: RouteMode;
  /** Normalized position along the connector path, from 0 to 1. */
  badgeT?: number;
  /** Which side of the connector should carry its numbered badge. */
  badgeSide?: EdgeBadgeSide;
  /** Normalized position of the connector label along the route. */
  labelT?: number;
  /** Which side of the connector should carry its label. */
  labelSide?: EdgeLabelSide;
}

export interface PlaceOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  pin?: boolean;
  /** Preserve the exact coordinates authored by an interactive move. */
  manual?: boolean;
  locked?: boolean;
  visible?: boolean;
  zIndex?: number;
}

export interface View {
  id: ID;
  places: Record<ID, PlaceOverride>;
  routes: Record<ID, RouteOverride>;
  annotations?: Record<ID, PlaceOverride>;
}

export interface DiagramDocument {
  id: ID;
  title?: string;
  grammar: Grammar;
  flow: FlowDirection;
  resources: Resource[];
  groups: Group[];
  edges: Edge[];
  annotations: Annotation[];
  assets?: DiagramAsset[];
  views: View[];
}

export interface NodeGeom {
  id: ID;
  type: "resource";
  icon: Rect;
  label: Rect;
  obstacle: Rect;
  role: ResourceRole;
  labelPosition?: ResourceLabelPosition;
  resourceType: string;
  serviceLabel: string;
  /** Pre-wrapped display lines used to keep long provider names compact. */
  serviceLines?: string[];
  roleLabel?: string;
  /** Pre-wrapped secondary-label lines matching the measured resource card. */
  roleLines?: string[];
}

export interface GroupGeom {
  id: ID;
  kind: GroupKind;
  bounds: Rect;
  header: Rect;
  labelRect?: Rect;
  content: Rect;
  label: string;
  labelPosition?: GroupLabelPosition;
}

export interface RoutedEdge {
  id: ID;
  source: ID;
  target: ID;
  points: Point[];
  step?: number;
  label?: string;
  labelPoint?: Point;
  labelRect?: Rect;
  style: EdgeStyle;
  kind?: EdgeKind;
  color?: EdgeColor;
  badge?: Point;
  badgeT?: number;
  badgeSide?: EdgeBadgeSide;
  labelT?: number;
  labelSide?: EdgeLabelSide;
}

export interface LayoutResult {
  nodes: NodeGeom[];
  groups: GroupGeom[];
  edges: RoutedEdge[];
  width: number;
  height: number;
  symmetries: ID[][];
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  id?: ID;
}

export interface CatalogRule {
  type: string;
  allowedParents: string[];
  scope: "regional" | "zonal" | "global" | "any";
  /** Root placement is explicit; an empty parent is not a generic escape hatch. */
  allowRoot?: boolean;
}
