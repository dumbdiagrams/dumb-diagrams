import { describe, expect, it } from "vitest";

import { catalogIconUrl } from "./icon-url.js";

describe("catalogIconUrl", () => {
  it("encodes path segments with spaces", () => {
    expect(catalogIconUrl("gcp-icons/Category Icons/Management Tools/SVG/icon.svg")).toBe(
      "/gcp-icons/Category%20Icons/Management%20Tools/SVG/icon.svg",
    );
  });
});
