import { describe, expect, it } from "vitest";

import { createCliUi } from "./cli-ui.js";

describe("CLI presentation", () => {
  it("renders the full Dumb Diagrams wordmark in a normal terminal", () => {
    const output = createCliUi({ color: false, columns: 100 }).banner();
    expect(output).toContain("██████╗ ██╗   ██╗");
    expect(output).toContain("██████╗ ██╗ █████╗");
    expect(output).not.toContain("\u001B[");
  });

  it("uses a compact wordmark in narrow terminals", () => {
    const output = createCliUi({ color: false, columns: 60 }).banner();
    expect(output).toContain("╔╦╗╦ ╦╔╦╗╔╗");
    expect(Math.max(...output.split("\n").map((line) => line.length))).toBeLessThanOrEqual(60);
  });

  it("uses the logo palette when color is enabled", () => {
    const ui = createCliUi({ color: true, columns: 100 });
    expect(ui.banner()).toContain("\u001B[38;2;247;152;44m");
    expect(ui.banner()).toContain("\u001B[38;2;22;57;100m");
    expect(ui.brand()).toContain("\u001B[38;2;240;83;30m");
  });

  it("falls back to 256-color escapes for terminals without truecolor", () => {
    const ui = createCliUi({ color: true, truecolor: false, columns: 100 });
    expect(ui.banner()).toContain("\u001B[38;5;");
    expect(ui.banner()).not.toContain("\u001B[38;2;");
    expect(ui.banner()).toContain("\u001B[38;5;24m");
    expect(ui.brand()).toContain("\u001B[38;5;");
  });

  it("uses a high-contrast light orange for commands", () => {
    expect(createCliUi({ color: true }).command("dumbdiagrams studio"))
      .toBe("\u001B[38;2;247;152;44mdumbdiagrams studio\u001B[0m");
  });

  it("uses consistent status glyphs and indentation", () => {
    const ui = createCliUi({ color: false });
    expect(ui.success("Created architecture.dgm")).toBe("  ◆ Created architecture.dgm");
    expect(ui.error("Invalid source")).toBe("  ✖ Invalid source");
    expect(ui.info("studio", "http://127.0.0.1:4788")).toBe("  studio   http://127.0.0.1:4788");
  });

  it("uses the LLM-first brand tagline", () => {
    const ui = createCliUi({ color: false });
    expect(ui.brand()).toContain("LLM-first architecture diagrams that are hard to get wrong");
  });
});
