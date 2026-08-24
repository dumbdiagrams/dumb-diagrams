import { describe, expect, it } from "vitest";

import { layoutDocument } from "../layout/index.js";
import type { DiagramDocument } from "../core/index.js";
import { renderSvg } from "./svg.js";

describe("provider group rendering", () => {
  it("uses catalog icons for azure groups", () => {
    const doc: DiagramDocument = {
      id: "azure-demo",
      grammar: "aws",
      flow: "lr",
      groups: [
        {
          id: "vnet",
          kind: "vpc",
          type: "azure.vnet",
          label: "Azure VNet",
          children: [],
        },
      ],
      resources: [],
      edges: [],
      annotations: [],
      views: [{ id: "default", places: {}, routes: {} }],
    };
    const layout = layoutDocument(doc);
    const svg = renderSvg(doc, layout, { resolveIconHref: (path) => path });
    expect(svg).toContain("catalog-icons/azure/");
  });
});
