import { describe, expect, it } from "vitest";
import { parseDgmResult } from "../dsl/index.js";
import { childFlowLayers } from "./flow-layers.js";

const parse = (source: string) => parseDgmResult(source)._unsafeUnwrap();

describe("compound causal tiers", () => {
  it("orders shuffled declarations by their connections without mutating source", () => {
    const doc = parse(`diagram causal { grammar cloud-agnostic flow lr
      cloud-agnostic.cloud cloud {
        cloud-agnostic.server c cloud-agnostic.server a cloud-agnostic.server b
      } a -> b b -> c
    }`);
    expect(childFlowLayers(doc, doc.groups[0]!)).toEqual([["a"], ["b"], ["c"]]);
    expect(doc.groups[0]!.children).toEqual(["c", "a", "b"]);
  });

  it("keeps the first request ahead of its separate response", () => {
    const doc = parse(`diagram feedback { grammar cloud-agnostic flow lr
      cloud-agnostic.cloud cloud {
        cloud-agnostic.database database cloud-agnostic.server api
      } api -> database database -> api
    }`);
    expect(childFlowLayers(doc, doc.groups[0]!)).toEqual([["api"], ["database"]]);
    expect(doc.edges).toHaveLength(2);
  });

  it("projects a regional path through a global service back onto its local stages", () => {
    const doc = parse(`diagram global_queue { grammar cloud-agnostic flow lr
      cloud-agnostic.cloud cloud {
        cloud-agnostic.queue queue
        cloud-agnostic.region region {
          cloud-agnostic.server worker cloud-agnostic.server ingest
          cloud-agnostic.database status
        }
      } ingest -> queue queue -> worker worker -> status
    }`);
    expect(childFlowLayers(doc, doc.groups.find((group) => group.id === "region")!)).toEqual([
      ["ingest"],
      ["worker"],
      ["status"],
    ]);
  });

  it("terminates deterministically on feedback cycles and external cycles", () => {
    const doc = parse(`diagram cyclic { grammar cloud-agnostic flow lr
      cloud-agnostic.cloud cloud {
        cloud-agnostic.queue external
        cloud-agnostic.boundary local {
          cloud-agnostic.server a cloud-agnostic.server b cloud-agnostic.server c
        }
      } a -> b b -> c c -> a c -> external external -> external
    }`);
    const group = doc.groups.find((item) => item.id === "local")!;
    const first = childFlowLayers(doc, group)!;
    expect(first.flat().sort()).toEqual(["a", "b", "c"]);
    expect(childFlowLayers(doc, group)).toEqual(first);
    expect(doc.edges).toHaveLength(5);
  });
});
