import type { Annotation, AnnotationStyle } from "../core/index.js";

export interface AnnotationTheme {
  id: string;
  label: string;
  background: string;
  color: string;
  styles: AnnotationStyle[];
}

/** Pastel note themes with paired background and accessible text (≥ 4.5:1 on background). */
export const ANNOTATION_THEMES: readonly AnnotationTheme[] = [
  {
    id: "peach",
    label: "Peach",
    background: "#fde8e2",
    color: "#4a2c28",
    styles: ["text", "paper", "callout"],
  },
  {
    id: "sand",
    label: "Sand",
    background: "#f5efe6",
    color: "#3d342c",
    styles: ["text", "paper", "callout"],
  },
  {
    id: "mint",
    label: "Mint",
    background: "#e4f5ec",
    color: "#1e4635",
    styles: ["text", "paper", "callout", "checklist"],
  },
  {
    id: "sage",
    label: "Sage",
    background: "#e8f0e4",
    color: "#2a4535",
    styles: ["text", "paper", "checklist"],
  },
  {
    id: "sky",
    label: "Sky",
    background: "#e0eef8",
    color: "#163964",
    styles: ["text", "paper", "callout", "checklist"],
  },
  {
    id: "rose",
    label: "Rose",
    background: "#fae8e8",
    color: "#5c2328",
    styles: ["text", "paper", "callout", "checklist"],
  },
  {
    id: "lavender",
    label: "Lavender",
    background: "#ebe6f5",
    color: "#3d2d5c",
    styles: ["text", "paper", "callout"],
  },
  {
    id: "slate",
    label: "Slate",
    background: "#eef1f4",
    color: "#1f2937",
    styles: ["text"],
  },
  {
    id: "code",
    label: "Terminal",
    background: "#112d51",
    color: "#d1fae5",
    styles: ["code"],
  },
] as const;

const SKY_DEFAULT = { background: "#e0eef8", color: "#163964" } as const;

const DEFAULT_BY_STYLE: Record<AnnotationStyle, { background: string; color: string }> = {
  text: { background: "#ffffff", color: SKY_DEFAULT.color },
  paper: SKY_DEFAULT,
  code: { background: "#112d51", color: "#d1fae5" },
  callout: SKY_DEFAULT,
  checklist: SKY_DEFAULT,
};

export function themesForStyle(style: AnnotationStyle): AnnotationTheme[] {
  return ANNOTATION_THEMES.filter((theme) => theme.styles.includes(style));
}

export function getAnnotationTheme(id: string): AnnotationTheme | undefined {
  return ANNOTATION_THEMES.find((theme) => theme.id === id);
}

export function matchAnnotationTheme(
  annotation: Pick<Annotation, "background" | "color" | "style">,
): AnnotationTheme | null {
  if (!annotation.background) return null;
  const bg = annotation.background.toLowerCase();
  const ink = annotation.color?.toLowerCase();
  return (
    ANNOTATION_THEMES.find(
      (theme) => theme.background.toLowerCase() === bg && (ink === undefined || theme.color.toLowerCase() === ink),
    ) ?? null
  );
}

export function themeColorsForStyle(style: AnnotationStyle): { background: string; color: string } {
  return DEFAULT_BY_STYLE[style];
}

export function resolveAnnotationColors(annotation: Annotation): { background: string; color: string } {
  const style = annotation.style ?? "paper";
  const matched = matchAnnotationTheme(annotation);
  if (matched) return { background: matched.background, color: matched.color };
  const defaults = DEFAULT_BY_STYLE[style];
  return {
    background: annotation.background ?? defaults.background,
    color: annotation.color ?? defaults.color,
  };
}
