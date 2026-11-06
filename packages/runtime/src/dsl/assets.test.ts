import { describe, expect, it } from "vitest";

import { parseDgmResult, printDgm } from "./parse.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

describe("assets round-trip", () => {
  it("preserves embedded svg assets and icon references", () => {
    const source = `diagram demo {
  grammar aws
  flow lr

  cloud-agnostic.server box "Custom" { icon logo1 }
}

assets {
  asset logo1 {
    svg "<svg viewBox='0 0 32 32'><rect width='32' height='32'/></svg>"
    w 32
    h 32
  }
}

view default {
}`;
    const parsed = parseDgm(source);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.resources[0]?.props.iconAsset).toBe("logo1");
    const roundTrip = printDgm(parsed);
    const reparsed = parseDgm(roundTrip);
    expect(reparsed.assets?.[0]?.id).toBe("logo1");
    expect(reparsed.resources[0]?.props.iconAsset).toBe("logo1");
  });
});
