import { describe, expect, it, vi } from "vitest";

import { defaultDiagramSpaceName, defaultProjectDirectory, resolveInitOptions } from "./init-options.js";

const args = (positionals: string[] = [], flags: Record<string, string | true> = {}) => ({
  positionals,
  flags: new Map(Object.entries(flags)),
});

describe("init options", () => {
  it("uses an interactive diagram space name as both display name and safe directory", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const askDiagramSpaceName = vi.fn().mockResolvedValue("Payments Platform");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askDiagramSpaceName,
      now,
    });

    expect(askDiagramSpaceName).toHaveBeenCalledWith("dumb-diagrams-2026-08-24-19-45-12");
    expect(result).toEqual({
      projectDirectory: "payments-platform",
      projectName: "Payments Platform",
      diagramName: "architecture",
      description: undefined,
    });
  });

  it("prompts with a timestamped default based on the current name", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const askDiagramSpaceName = vi.fn().mockResolvedValue("");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askDiagramSpaceName,
      currentName: "Payments Platform",
      now,
    });

    expect(askDiagramSpaceName).toHaveBeenCalledWith("payments-platform-2026-08-24-19-45-12");
    expect(result.projectDirectory).toBe("payments-platform-2026-08-24-19-45-12");
    expect(result.projectName).toBe("payments-platform-2026-08-24-19-45-12");
  });

  it("supports explicit directory, display name, diagram name, and description", async () => {
    const result = await resolveInitOptions(args([], {
      directory: "./projects/billing",
      name: "Billing Architecture",
      diagram: "System Overview.dgm",
      description: "  Event-driven   billing platform. ",
    }), { interactive: false });

    expect(result).toEqual({
      projectDirectory: "./projects/billing",
      projectName: "Billing Architecture",
      diagramName: "system-overview",
      description: "Event-driven billing platform.",
    });
  });

  it("preserves positional-directory compatibility", async () => {
    const result = await resolveInitOptions(args(["existing-name"]), { interactive: true });
    expect(result.projectDirectory).toBe("existing-name");
    expect(result.projectName).toBeUndefined();
  });

  it("keeps timestamp naming as the non-interactive fallback", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const result = await resolveInitOptions(args([], { yes: true }), { interactive: true, now });
    expect(result.projectDirectory).toBe("dumb-diagrams-2026-08-24-19-45-12");
    expect(defaultProjectDirectory(now)).toBe(result.projectDirectory);
    expect(defaultDiagramSpaceName(now, "Dumb Diagrams")).toBe(result.projectDirectory);
  });

  it("rejects conflicting directories and missing values", async () => {
    await expect(resolveInitOptions(
      args(["one"], { directory: "two" }),
      { interactive: false },
    )).rejects.toThrow("either the positional directory or --directory");
    await expect(resolveInitOptions(
      args([], { name: true }),
      { interactive: false },
    )).rejects.toThrow("--name requires a value");
  });
});
