import type { WriteStream } from "node:tty";

interface CliUiOptions {
  color?: boolean;
  truecolor?: boolean;
  columns?: number;
}

const RESET = "\u001B[0m";
const BOLD = "\u001B[1m";
const DIM = "\u001B[2m";

const WIDE_LOGO = [
  "██████╗ ██╗   ██╗███╗   ███╗██████╗ ",
  "██╔══██╗██║   ██║████╗ ████║██╔══██╗",
  "██║  ██║██║   ██║██╔████╔██║██████╔╝",
  "██║  ██║██║   ██║██║╚██╔╝██║██╔══██╗",
  "██████╔╝╚██████╔╝██║ ╚═╝ ██║██████╔╝",
  "╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═════╝ ",
  "",
  "██████╗ ██╗ █████╗  ██████╗ ██████╗  █████╗ ███╗   ███╗███████╗",
  "██╔══██╗██║██╔══██╗██╔════╝ ██╔══██╗██╔══██╗████╗ ████║██╔════╝",
  "██║  ██║██║███████║██║  ███╗██████╔╝███████║██╔████╔██║███████╗",
  "██║  ██║██║██╔══██║██║   ██║██╔══██╗██╔══██║██║╚██╔╝██║╚════██║",
  "██████╔╝██║██║  ██║╚██████╔╝██║  ██║██║  ██║██║ ╚═╝ ██║███████║",
  "╚═════╝ ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝",
] as const;

const COMPACT_LOGO = [
  "╔╦╗╦ ╦╔╦╗╔╗   ╔╦╗╦╔═╗╔═╗╦═╗╔═╗╔╦╗╔═╗",
  " ║║║ ║║║║╠╩╗   ║║║╠═╣║ ╦╠╦╝╠═╣║║║╚═╗",
  "═╩╝╚═╝╩ ╩╚═╝  ═╩╝╩╩ ╩╚═╝╩╚═╩ ╩╩ ╩╚═╝",
] as const;

// Core Dumb Diagrams brand colors.
const PALETTE = {
  amber: [247, 152, 44],
  orange: [240, 83, 30],
  navy: [22, 57, 100],
  command: [247, 152, 44],
  red: [255, 99, 112],
} as const;

export function createCliUi(options: CliUiOptions = {}) {
  const color = options.color ?? supportsColor(process.stdout);
  const truecolor = options.truecolor ?? (options.color === true || supportsTruecolor(process.stdout));
  const columns = options.columns ?? process.stdout.columns ?? (Number(process.env.COLUMNS) || 80);
  const paint = (value: string, rgb: readonly [number, number, number]) =>
    color ? `${foreground(rgb, truecolor)}${value}${RESET}` : value;
  const bold = (value: string) => color ? `${BOLD}${value}${RESET}` : value;
  const dim = (value: string) => color ? `${DIM}${value}${RESET}` : value;

  return {
    banner(): string {
      const lines = columns >= 72 ? WIDE_LOGO : COMPACT_LOGO;
      return lines
        .map((line) => color && line ? gradient(line, PALETTE.amber, PALETTE.navy, truecolor) : line)
        .join("\n");
    },
    brand(): string {
      return `${bold(paint("DUMB DIAGRAMS", PALETTE.orange))} ${dim(": LLM-first architecture diagrams that are hard to get wrong")}`;
    },
    heading(value: string): string {
      return bold(paint(value, PALETTE.orange));
    },
    command(value: string): string {
      return paint(value, PALETTE.command);
    },
    muted: dim,
    info(label: string, value: string): string {
      return `  ${dim(label.padEnd(8))} ${value}`;
    },
    success(value: string): string {
      return `  ${paint("◆", PALETTE.orange)} ${value}`;
    },
    skip(value: string): string {
      return `  ${dim("◇")} ${dim(value)}`;
    },
    warning(value: string): string {
      return `  ${paint("▲", PALETTE.amber)} ${value}`;
    },
    error(value: string): string {
      return `  ${paint("✖", PALETTE.red)} ${value}`;
    },
    summary(value: string): string {
      return `\n${bold(paint("  ──", PALETTE.orange))} ${bold(value)}`;
    },
  };
}

function supportsColor(stream: WriteStream): boolean {
  if ("NO_COLOR" in process.env || process.env.TERM === "dumb") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  if (!stream.isTTY) return false;
  if (process.platform !== "win32") return true;
  // Legacy Windows consoles may not process ANSI sequences. These variables
  // identify Windows hosts with virtual-terminal support enabled.
  return Boolean(
    process.env.WT_SESSION
      || process.env.TERM_PROGRAM === "vscode"
      || process.env.ConEmuANSI === "ON"
      || process.env.ANSICON
      || process.env.TERM,
  );
}

function supportsTruecolor(stream: WriteStream): boolean {
  if (!supportsColor(stream)) return false;
  if (process.env.FORCE_COLOR === "3") return true;
  const terminalColor = `${process.env.COLORTERM ?? ""} ${process.env.TERM ?? ""}`.toLowerCase();
  return /truecolor|24bit|direct/.test(terminalColor);
}

function gradient(
  value: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  truecolor: boolean,
): string {
  const visible = [...value];
  const denominator = Math.max(1, visible.length - 1);
  return visible.map((character, index) => {
    if (character === " ") return character;
    const t = index / denominator;
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    return `${foreground([r, g, b], truecolor)}${character}`;
  }).join("") + RESET;
}

function foreground(rgb: readonly [number, number, number], truecolor: boolean): string {
  return truecolor
    ? `\u001B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
    : `\u001B[38;5;${ansi256(rgb)}m`;
}

function ansi256([red, green, blue]: readonly [number, number, number]): number {
  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (value: number) => levels.reduce((best, level, index) =>
    Math.abs(level - value) < Math.abs(levels[best]! - value) ? index : best, 0);
  // The nearest RGB cube swatch for the brand navy is [0, 95, 95], which
  // reads cyan in terminals without truecolor. Preserve the blue hue by
  // nudging blue-dominant colors toward the next blue cube level.
  const blueAdjusted = blue > green ? Math.min(255, blue + blue - green) : blue;
  return 16 + nearest(red) * 36 + nearest(green) * 6 + nearest(blueAdjusted);
}
