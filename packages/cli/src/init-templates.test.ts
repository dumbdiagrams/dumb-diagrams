import { describe, expect, it } from "vitest";

import { renderInitTemplate } from "./init-templates.js";

describe("renderInitTemplate", () => {
  it("returns a typed error for a missing template", () => {
    const result = renderInitTemplate("missing-template.md", { projectName: "demo" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "missing-template",
        fileName: "missing-template.md",
        message: "Missing init template: missing-template.md",
      });
    }
  });

  it("returns a typed error when a resolved template cannot be read", () => {
    const result = renderInitTemplate("..", { projectName: "demo" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("template-read-failed");
      expect(result.error.fileName).toBe("..");
      expect(result.error.message).toContain("Unable to read init template ..");
    }
  });

  it("reads bundled template contents", () => {
    const result = renderInitTemplate("CLAUDE.md", { projectName: "demo" });

    expect(result._unsafeUnwrap()).toBe("@AGENTS.md\n");
  });
});
