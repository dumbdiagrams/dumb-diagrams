import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "@dumb-diagrams/core";
import { getDefaultView } from "@dumb-diagrams/core";

import { parseArch, printArch } from "./parse.js";

describe("parseArch / printArch round-trip", () => {
  it("preserves fixture edges with explicit ids", () => {
    const doc = createAsyncDocsFixture();
    const printed = printArch(doc);
    const parsed = parseArch(printed);
    expect(parsed.edges.map((edge) => edge.id)).toEqual(
      doc.edges.map((edge) => edge.id),
    );
  });

  it("round-trips title, labels, sizes, and view metadata", () => {
    const source = `diagram demo {
  grammar aws
  flow lr
  title "Async Docs"

  generic.user client "External Client"

  annotation note1 "Callout" { anchor client }

  client -> api { id e1 label "request" step 1 from e to w }
}

view default {
  place client { x 40 y 48 w 120 h 96 pin locked z 2 }
  route e1 { point 100 120 point 200 120 pin mode manual }
  annotation note1 { x 300 y 80 w 160 h 48 pin visible false }
}`;
    const parsed = parseArch(source);
    expect(parsed.title).toBe("Async Docs");
    expect(parsed.annotations[0]).toEqual({
      id: "note1",
      text: "Callout",
      anchor: "client",
    });
    expect(parsed.edges[0]).toMatchObject({
      id: "e1",
      label: "request",
      step: 1,
      sourcePort: "e",
      targetPort: "w",
    });
    const view = getDefaultView(parsed);
    expect(view.places.client).toMatchObject({
      x: 40,
      y: 48,
      w: 120,
      h: 96,
      pin: true,
      locked: true,
      zIndex: 2,
    });
    expect(view.routes.e1).toMatchObject({
      pin: true,
      mode: "manual",
    });
    expect(view.routes.e1?.points).toHaveLength(2);
    expect(view.annotations?.note1).toMatchObject({
      x: 300,
      y: 80,
      w: 160,
      h: 48,
      pin: true,
      visible: false,
    });

    const roundTrip = printArch(parsed);
    const reparsed = parseArch(roundTrip);
    expect(reparsed).toEqual(parsed);
  });
});
