import { describe, expect, it } from "vitest";

import { readDiagramUrlImport } from "./diagram-url-bootstrap";
import { encodeDiagramUrlPayload } from "./export-actions";

function hashFor(source: string): string {
  const encoded = encodeDiagramUrlPayload(source);
  if (!encoded.ok) throw new Error(encoded.message);
  return `#diagram=${encoded.payload}`;
}

const valid = 'diagram shared {\n  grammar aws\n  cloud-agnostic.client client "Client"\n}\n';

describe("readDiagramUrlImport", () => {
  it("opens a valid shared diagram", () => {
    expect(readDiagramUrlImport(hashFor(valid))).toEqual({ source: valid });
  });

  it("ignores an empty hash", () => {
    expect(readDiagramUrlImport("")).toEqual({});
  });

  it.each([
    ["an unsupported hash", "#other=1", "Diagram URL contains an unsupported hash."],
    ["extra parameters", `${hashFor(valid)}&x=1`, "Diagram URL contains an unsupported hash."],
    ["a malformed payload", "#diagram=***", "Diagram URL contains a malformed source payload."],
    ["invalid syntax", hashFor("diagram broken { flow rl }"), "Diagram URL contains invalid diagram source."],
    [
      "validation errors",
      hashFor("diagram dup {\n  cloud-agnostic.client a\n  cloud-agnostic.client a\n}"),
      "Diagram URL contains invalid diagram source.",
    ],
    [
      "an unsafe embedded asset",
      hashFor(
        `${valid}assets {\n  asset bad {\n    svg "<svg><script>alert(1)</script></svg>"\n    w 16\n    h 16\n  }\n}\n`,
      ),
      "Diagram URL contains invalid diagram source.",
    ],
  ])("rejects %s", (_name, hash, error) => {
    expect(readDiagramUrlImport(hash)).toEqual({ error });
  });
});
