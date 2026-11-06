/** Reference dark canvas used to decide whether a canonical stroke needs a halo. */
export const DARK_CANVAS = "#102033";

const CONTRAST_STROKE = "rgba(255,255,255,0.25)";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function parseRgb(color: string): Rgb | null {
  const trimmed = color.trim();
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1]!;
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : raw;
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return {
      r: Number.parseFloat(rgb[1]!),
      g: Number.parseFloat(rgb[2]!),
      b: Number.parseFloat(rgb[3]!),
    };
  }

  return null;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
  else h = ((rn - gn) / delta + 4) * 60;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return null;
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

/** True when a canonical stroke would disappear on the dark canvas. */
export function needsDarkContrastAid(stroke: string, background = DARK_CANVAS): boolean {
  const fg = parseRgb(stroke);
  const bg = parseRgb(background);
  if (!fg || !bg) return false;

  const ratio = contrastRatio(stroke, background);
  if (ratio === null || ratio >= 4.5) return false;

  const fgHsl = rgbToHsl(fg);
  const bgHsl = rgbToHsl(bg);

  // Desaturated structural strokes (cloud, logical, generic gray boundaries).
  if (fgHsl.s < 0.25) return true;

  // Same hue family as the canvas — dark blues that compete with the artboard.
  if (fgHsl.l < 0.45 && bgHsl.l < 0.15 && hueDistance(fgHsl.h, bgHsl.h) < 50) {
    return true;
  }

  return ratio < 3;
}

export function darkContrastStrokeMarkup(
  x: number,
  y: number,
  width: number,
  height: number,
  strokeWidth: number,
  dash: string,
  cornerRadius: number,
): string {
  const haloWidth = strokeWidth + 2;
  return `
  <rect class="group-border-contrast" x="${x}" y="${y}" width="${width}" height="${height}"
    fill="none" stroke="${CONTRAST_STROKE}" stroke-width="${haloWidth}" ${dash} rx="${cornerRadius}"/>`;
}
