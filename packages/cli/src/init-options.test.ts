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
    const result = (
      await resolveInitOptions(args(), {
        interactive: true,
        askProjectName,
        now,
      })
    )._unsafeUnwrap();

    expect(askProjectName).toHaveBeenCalledWith("dumb-diagrams-2026-08-24-19-45-12");
    expect(result).toEqual({
      projectDirectory: "payments-platform",
      projectName: "Payments Platform",
    });
  });

  it("uses a timestamped folder in non-interactive mode", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const result = (
      await resolveInitOptions(args(), {
        interactive: false,
        now,
      })
    )._unsafeUnwrap();

    expect(result).toEqual({
      projectDirectory: "dumb-diagrams-2026-08-24-19-45-12",
      projectName: "dumb-diagrams-2026-08-24-19-45-12",
    });
  });

  it("uses a timestamped folder when the interactive prompt is blank", async () => {
    const now = new Date(2026, 7, 24, 19, 45, 12);
    const askProjectName = vi.fn().mockResolvedValue("  ");
    const result = (
      await resolveInitOptions(args(), {
        interactive: true,
        askProjectName,
        now,
      })
    )._unsafeUnwrap();

    expect(askProjectName).toHaveBeenCalledWith("dumb-diagrams-2026-08-24-19-45-12");
    expect(result).toEqual({
      projectDirectory: "dumb-diagrams-2026-08-24-19-45-12",
      projectName: "dumb-diagrams-2026-08-24-19-45-12",
    });
  });

  it("builds the fallback from the product name and timestamp", () => {
    expect(defaultProjectDirectory(new Date(2026, 7, 24, 19, 45, 12))).toBe("dumb-diagrams-2026-08-24-19-45-12");
  });

  it("rejects all positional arguments and flags", async () => {
    for (const input of [args(["nested"]), args([], { name: "Repository" })]) {
      expect((await resolveInitOptions(input, { interactive: false }))._unsafeUnwrapErr()).toMatchObject({
        code: "invalid-arguments",
        message: expect.stringMatching(/does not accept/),
      });
    }
  });

  it("returns typed errors for unusable names and a failed prompt", async () => {
    const ask = (answer: Promise<string>) =>
      resolveInitOptions(args(), { interactive: true, askProjectName: () => answer });
    expect((await ask(Promise.resolve("!!!")))._unsafeUnwrapErr().message).toMatch(/at least one letter/);
    expect((await ask(Promise.resolve("x".repeat(121))))._unsafeUnwrapErr().message).toMatch(/120 characters/);
    expect((await ask(Promise.reject(new Error("prompt closed"))))._unsafeUnwrapErr().message).toBe("prompt closed");
  });

  it("returns a typed error when the prompt throws synchronously", async () => {
    const result = await resolveInitOptions(args(), {
      interactive: true,
      askProjectName: () => {
        throw new Error("prompt unavailable");
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toMatchObject({
      code: "invalid-arguments",
      message: "prompt unavailable",
    });
  });
});
