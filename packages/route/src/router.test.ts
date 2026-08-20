import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";
import { routeEdgePreview, routeEdges } from "./router.js";

describe("routeEdgePreview", () => {
  it("returns a routed polyline for an existing edge", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const preview = routeEdgePreview(doc, layout, "e1");
    const routed = routeEdges(doc, layout).find((edge) => edge.id === "e1");
    expect(preview?.length).toBeGreaterThan(1);
    expect(preview?.[0]).toEqual(routed?.points[0]);
    expect(preview?.at(-1)).toEqual(routed?.points.at(-1));
  });
});
