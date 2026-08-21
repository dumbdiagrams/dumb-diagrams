import { describe, expect, it } from "vitest";

import { filenameWithExtension, sanitizeFilename } from "./export-actions";

describe("export filenames", () => {
  it("removes path-like and unsupported filename characters", () => {
    expect(sanitizeFilename("../My Diagram: v2.dgm")).toBe("My-Diagram-v2.dgm");
    expect(sanitizeFilename("...")).toBe("diagram");
  });

  it("replaces an existing extension with the requested format", () => {
    expect(filenameWithExtension("My diagram.dgm", "svg")).toBe("My-diagram.svg");
    expect(filenameWithExtension("", ".dgm")).toBe("diagram.dgm");
  });
});
