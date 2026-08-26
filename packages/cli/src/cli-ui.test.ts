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
    expect(ui.banner()).toContain("\u001B[38;2;248;162;63m");
    expect(ui.banner()).toContain("\u001B[38;2;36;64;104m");
    expect(ui.brand()).toContain("\u001B[38;2;230;98;49m");
  });

  it("uses a high-contrast amber for commands", () => {
    expect(createCliUi({ color: true }).command("npx create-dumb-diagrams@latest studio diagrams"))
      .toBe("\u001B[38;2;248;162;63mnpx create-dumb-diagrams@latest studio diagrams\u001B[0m");
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
