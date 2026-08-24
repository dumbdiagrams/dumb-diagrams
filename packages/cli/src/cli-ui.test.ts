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

  it("uses consistent status glyphs and indentation", () => {
    const ui = createCliUi({ color: false });
    expect(ui.success("Created architecture.dgm")).toBe("  ◆ Created architecture.dgm");
    expect(ui.error("Invalid source")).toBe("  ✖ Invalid source");
    expect(ui.info("studio", "http://127.0.0.1:4788")).toBe("  studio   http://127.0.0.1:4788");
  });
});
