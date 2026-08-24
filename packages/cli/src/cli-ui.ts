import type { WriteStream } from "node:tty";

interface CliUiOptions {
  color?: boolean;
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

const PALETTE = {
  cyan: [80, 188, 255],
  mint: [78, 230, 159],
  pink: [238, 105, 168],
  red: [255, 99, 112],
  yellow: [245, 193, 92],
} as const;

export function createCliUi(options: CliUiOptions = {}) {
  const color = options.color ?? supportsColor(process.stdout);
  const columns = options.columns ?? process.stdout.columns ?? (Number(process.env.COLUMNS) || 80);
  const paint = (value: string, rgb: readonly [number, number, number]) =>
    color ? `\u001B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${value}${RESET}` : value;
  const bold = (value: string) => color ? `${BOLD}${value}${RESET}` : value;
  const dim = (value: string) => color ? `${DIM}${value}${RESET}` : value;

  return {
    banner(): string {
      const lines = columns >= 72 ? WIDE_LOGO : COMPACT_LOGO;
      return lines
        .map((line) => color && line ? gradient(line, PALETTE.cyan, PALETTE.pink) : line)
        .join("\n");
    },
    brand(): string {
      return `${bold(paint("DUMB DIAGRAMS", PALETTE.mint))} ${dim("— LLM-first architecture diagrams that are hard to get wrong")}`;
    },
    heading(value: string): string {
      return bold(paint(value, PALETTE.mint));
    },
    command(value: string): string {
      return paint(value, PALETTE.cyan);
    },
    muted: dim,
    info(label: string, value: string): string {
      return `  ${dim(label.padEnd(8))} ${value}`;
    },
    success(value: string): string {
      return `  ${paint("◆", PALETTE.mint)} ${value}`;
    },
    skip(value: string): string {
      return `  ${dim("◇")} ${dim(value)}`;
    },
    warning(value: string): string {
      return `  ${paint("▲", PALETTE.yellow)} ${value}`;
    },
    error(value: string): string {
      return `  ${paint("✖", PALETTE.red)} ${value}`;
    },
    summary(value: string): string {
      return `\n${bold(paint("  ──", PALETTE.mint))} ${bold(value)}`;
    },
  };
}

function supportsColor(stream: WriteStream): boolean {
  if ("NO_COLOR" in process.env || process.env.TERM === "dumb") return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(stream.isTTY);
}

function gradient(
  value: string,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): string {
  const visible = [...value];
  const denominator = Math.max(1, visible.length - 1);
  return visible.map((character, index) => {
    if (character === " ") return character;
    const t = index / denominator;
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    return `\u001B[38;2;${r};${g};${b}m${character}`;
  }).join("") + RESET;
}
