import type { GroupKind } from "../core/index.js";

export interface GroupStyle {
  stroke: string;
  fill: string;
  dash?: string;
  strokeWidth: number;
  headerHeight: number;
  padding: number;
  iconSize: number;
  fontSize: number;
  fontWeight: number;
  cornerRadius: number;
}

export const GRAMMAR = {
  grid: 8,
  iconPrimary: 48,
  iconSecondary: 36,
  labelPad: 14,
  labelLineHeight: 16,
  serviceFontSize: 12,
  roleFontSize: 11,
  groupIconInset: 0,
  edgeStroke: 1.5,
  edgeColor: "#232F3E",
  edgeDash: "6 4",
  badgeRadius: 10,
  badgeFill: "#232F3E",
  badgeText: "#FFFFFF",
  canvasFill: "#FFFFFF",
  fontFamily: "Amazon Ember, Helvetica Neue, Arial, sans-serif",
  // Plain user-authored text uses an open font stack rather than the AWS
  // product font used by the reference-architecture labels.
  textFontFamily: "Inter, Noto Sans, ui-sans-serif, system-ui, sans-serif",
};

export const GROUP_STYLES: Record<GroupKind, GroupStyle> = {
  cloud: {
    stroke: "#242F3E",
    fill: "rgba(36,47,62,0.03)",
    strokeWidth: 1.5,
    headerHeight: 24,
    padding: 16,
    iconSize: 24,
    fontSize: 14,
    fontWeight: 600,
    cornerRadius: 0,
  },
  account: {
    stroke: "#E7157B",
    fill: "rgba(231,21,123,0.04)",
    strokeWidth: 1.5,
    headerHeight: 24,
    padding: 18,
    iconSize: 24,
    fontSize: 14,
    fontWeight: 600,
    cornerRadius: 0,
  },
  region: {
    stroke: "#00A4A6",
    fill: "rgba(0,164,166,0.05)",
    dash: "6 4",
    strokeWidth: 1.5,
    headerHeight: 24,
    padding: 20,
    iconSize: 24,
    fontSize: 14,
    fontWeight: 600,
    cornerRadius: 0,
  },
  vpc: {
    stroke: "#8C4FFF",
    fill: "rgba(140,79,255,0.05)",
    strokeWidth: 1.5,
    headerHeight: 24,
    padding: 16,
    iconSize: 24,
    fontSize: 13,
    fontWeight: 600,
    cornerRadius: 0,
  },
  az: {
    stroke: "#00A4A6",
    fill: "rgba(0,164,166,0.04)",
    dash: "6 4",
    strokeWidth: 1.5,
    headerHeight: 20,
    padding: 14,
    iconSize: 20,
    fontSize: 12,
    fontWeight: 600,
    cornerRadius: 0,
  },
  subnet: {
    stroke: "#147EBA",
    fill: "rgba(20,126,186,0.03)",
    strokeWidth: 1,
    headerHeight: 18,
    padding: 12,
    iconSize: 18,
    fontSize: 11,
    fontWeight: 500,
    cornerRadius: 0,
  },
  "subnet-public": {
    stroke: "#7AA116",
    fill: "rgba(122,161,22,0.04)",
    strokeWidth: 1,
    headerHeight: 18,
    padding: 12,
    iconSize: 18,
    fontSize: 11,
    fontWeight: 500,
    cornerRadius: 0,
  },
  "subnet-private": {
    stroke: "#00A4A6",
    fill: "rgba(0,164,166,0.04)",
    strokeWidth: 1,
    headerHeight: 18,
    padding: 12,
    iconSize: 18,
    fontSize: 11,
    fontWeight: 500,
    cornerRadius: 0,
  },
  logical: {
    stroke: "#879196",
    fill: "rgba(135,145,150,0.03)",
    dash: "4 4",
    strokeWidth: 1,
    headerHeight: 22,
    padding: 12,
    iconSize: 24,
    fontSize: 12,
    fontWeight: 500,
    cornerRadius: 0,
  },
  overlay: {
    stroke: "#E7157B",
    fill: "rgba(231,21,123,0.03)",
    dash: "4 4",
    strokeWidth: 1.5,
    headerHeight: 20,
    padding: 12,
    iconSize: 20,
    fontSize: 12,
    fontWeight: 600,
    cornerRadius: 0,
  },
};

export function snap(value: number): number {
  return Math.round(value / GRAMMAR.grid) * GRAMMAR.grid;
}
