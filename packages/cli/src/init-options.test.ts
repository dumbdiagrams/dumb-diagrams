import { describe, expect, it, vi } from "vitest";

import { defaultProjectDirectory, resolveInitOptions } from "./init-options.js";

const args = (positionals: string[] = [], flags: Record<string, string | true> = {}) => ({
  positionals,
  flags: new Map(Object.entries(flags)),
});

describe("init options", () => {
  it("uses a project name as the new folder name", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const askProjectName = vi.fn().mockResolvedValue("Payments Platform");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askProjectName,
      now,
    });

    expect(askProjectName).toHaveBeenCalledWith("dumb-diagrams-2026-08-24-19-45-12");
    expect(result).toEqual({
      projectDirectory: "payments-platform",
      projectName: "Payments Platform",
    });
  });

  it("uses a timestamped folder in non-interactive mode", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const result = await resolveInitOptions(args(), {
      interactive: false,
      now,
    });

    expect(result).toEqual({
      projectDirectory: "dumb-diagrams-2026-08-24-19-45-12",
      projectName: "dumb-diagrams-2026-08-24-19-45-12",
    });
  });

  it("uses a timestamped folder when the interactive prompt is blank", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const askProjectName = vi.fn().mockResolvedValue("  ");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askProjectName,
      now,
    });

    expect(askProjectName).toHaveBeenCalledWith("dumb-diagrams-2026-08-24-19-45-12");
    expect(result).toEqual({
      projectDirectory: "dumb-diagrams-2026-08-24-19-45-12",
      projectName: "dumb-diagrams-2026-08-24-19-45-12",
    });
  });

  it("builds the fallback from the product name and timestamp", () => {
    expect(defaultProjectDirectory(new Date(2026, 7, 24, 19, 45, 12)))
      .toBe("dumb-diagrams-2026-08-24-19-45-12");
  });

  it("rejects all positional arguments and flags", async () => {
    await expect(resolveInitOptions(args(["nested"]), { interactive: false })).rejects.toThrow(/does not accept/);
    await expect(resolveInitOptions(args([], { name: "Repository" }), { interactive: false })).rejects.toThrow(/does not accept/);
  });
});
