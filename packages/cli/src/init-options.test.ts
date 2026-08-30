import { describe, expect, it, vi } from "vitest";

import { displayNameForDirectory, resolveInitOptions } from "./init-options.js";

const args = (positionals: string[] = [], flags: Record<string, string | true> = {}) => ({
  positionals,
  flags: new Map(Object.entries(flags)),
});

describe("init options", () => {
  it("prompts for a repository name using the current directory display name", async () => {
    const askProjectName = vi.fn().mockResolvedValue("Payments Platform");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askProjectName,
      currentName: "payments-platform",
    });

    expect(askProjectName).toHaveBeenCalledWith("Payments Platform");
    expect(result).toEqual({ projectName: "Payments Platform" });
  });

  it("uses the current directory display name in non-interactive mode", async () => {
    const result = await resolveInitOptions(args(), {
      interactive: false,
      currentName: "payments-platform",
    });

    expect(result).toEqual({ projectName: "Payments Platform" });
  });

  it("uses the default when the interactive prompt is blank", async () => {
    const askProjectName = vi.fn().mockResolvedValue("  ");
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askProjectName,
      currentName: "existing-repository",
    });

    expect(result.projectName).toBe("Existing Repository");
  });

  it("rejects all positional arguments and flags", async () => {
    await expect(resolveInitOptions(args(["nested"]), { interactive: false })).rejects.toThrow(/does not accept/);
    await expect(resolveInitOptions(args([], { name: "Repository" }), { interactive: false })).rejects.toThrow(/does not accept/);
  });

  it("formats directory names for the prompt", () => {
    expect(displayNameForDirectory("my-repository")).toBe("My Repository");
  });
});
