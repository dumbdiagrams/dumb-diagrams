import { describe, expect, it } from "vitest";

import { toPosixPath } from "../../scripts/lib/example-manifest.mjs";

describe("manifest path keys", () => {
  it("uses forward slashes for Windows and POSIX paths", () => {
    expect(toPosixPath("tests\\fixtures\\engine\\async-docs.dgm")).toBe(
      "tests/fixtures/engine/async-docs.dgm",
    );
    expect(toPosixPath("tests/fixtures/engine/async-docs.dgm")).toBe(
      "tests/fixtures/engine/async-docs.dgm",
    );
  });
});
