import { describe, expect, it, vi } from "vitest";

import { defaultProjectDirectory, resolveInitOptions } from "./init-options.js";

const args = (positionals: string[] = [], flags: Record<string, string | true> = {}) => ({
  positionals,
  flags: new Map(Object.entries(flags)),
});

describe("init options", () => {
  it("uses an interactive project name as both display name and safe directory", async () => {
    const askProjectName = vi.fn().mockResolvedValue("Payments Platform");
    const result = await resolveInitOptions(args(), { interactive: true, askProjectName });

    expect(askProjectName).toHaveBeenCalledWith("my-diagram-project");
    expect(result).toEqual({
      projectDirectory: "payments-platform",
      projectName: "Payments Platform",
      diagramName: "architecture",
      description: undefined,
      prompted: true,
    });
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
      prompted: false,
    });
  });

  it("preserves positional-directory compatibility", async () => {
    const result = await resolveInitOptions(args(["existing-name"]), { interactive: true });
    expect(result.projectDirectory).toBe("existing-name");
    expect(result.projectName).toBeUndefined();
    expect(result.prompted).toBe(false);
  });

  it("keeps timestamp naming as the non-interactive fallback", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const result = await resolveInitOptions(args([], { yes: true }), { interactive: true, now });
    expect(result.projectDirectory).toBe("dumb-diagrams-2026-08-24-19-45-12");
    expect(defaultProjectDirectory(now)).toBe(result.projectDirectory);
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
