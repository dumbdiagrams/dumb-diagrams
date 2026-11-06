import { describe, expect, it } from "vitest";

import { parseTarballListing } from "../../scripts/lib/tarball-entries.mjs";

describe("tarball listing parser", () => {
  it("parses Unix and Windows line endings without retaining carriage returns", () => {
    expect(parseTarballListing("package/dist/index.js\npackage/package.json\n")).toEqual([
      "package/dist/index.js",
      "package/package.json",
    ]);
    expect(parseTarballListing("package/dist/index.js\r\npackage/package.json\r\n")).toEqual([
      "package/dist/index.js",
      "package/package.json",
    ]);
  });
});
