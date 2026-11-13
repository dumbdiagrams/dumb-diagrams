import { describe, expect, it } from "vitest";

import { isStrictGoogleChrome } from "./BrowserCompatibilityNotice";

describe("isStrictGoogleChrome", () => {
  it("accepts the Google Chrome UA Client Hint brand", () => {
    expect(
      isStrictGoogleChrome({
        userAgentData: { brands: [{ brand: "Not_A Brand" }, { brand: "Google Chrome" }, { brand: "Chromium" }] },
      }),
    ).toBe(true);
  });

  it("rejects Chromium and alternate Chromium browser brands", () => {
    for (const brand of ["Chromium", "Brave", "Microsoft Edge", "Opera", "Vivaldi"]) {
      expect(isStrictGoogleChrome({ userAgentData: { brands: [{ brand }] } })).toBe(false);
    }
  });

  it("rejects Brave even when Chrome is also reported", () => {
    expect(
      isStrictGoogleChrome({
        userAgentData: { brands: [{ brand: "Google Chrome" }] },
        brave: true,
      }),
    ).toBe(false);
  });

  it("does not treat legacy Chrome tokens as proof of Google Chrome", () => {
    expect(isStrictGoogleChrome({ userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" })).toBe(false);
    expect(isStrictGoogleChrome({ userAgent: "Mozilla/5.0 Chromium/130.0.0.0 Chrome/130.0.0.0 Safari/537.36" })).toBe(
      false,
    );
    expect(isStrictGoogleChrome({ userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Edg/130.0.0.0 Safari/537.36" })).toBe(false);
    expect(isStrictGoogleChrome({ userAgent: "Mozilla/5.0 Chrome/130.0.0.0 OPR/115.0.0.0 Safari/537.36" })).toBe(false);
  });

  it("does not fall back to UA when Client Hints are present but do not identify Chrome", () => {
    expect(
      isStrictGoogleChrome({
        userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
        userAgentData: { brands: [{ brand: "Chromium" }] },
      }),
    ).toBe(false);
  });
});
