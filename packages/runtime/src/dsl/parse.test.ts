import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "../core/index.js";
import { getDefaultView } from "../core/index.js";
import { DIAGRAM_LIMITS } from "../core/index.js";

import { parseDgm, parseDgmResult, printDgm } from "./index.js";

describe("parseDgm / printDgm round-trip", () => {
  it("returns typed results for valid and invalid source", () => {
    const valid = parseDgmResult("diagram safe {}");
    expect(valid.isOk()).toBe(true);
    if (valid.isErr()) return;
    expect(valid.value.id).toBe("safe");

    const invalid = parseDgmResult('diagram bad { title "unterminated }');
    expect(invalid.isErr()).toBe(true);
    if (invalid.isOk()) return;
    expect(invalid.error).toEqual({
      code: "invalid-syntax",
      message: "Unterminated quoted string",
    });
  });

  it("rejects input without a diagram declaration and trailing top-level tokens", () => {
    expect(() => parseDgm("hello world")).toThrow(/Expected diagram declaration/);
    expect(() => parseDgm("diagram valid {}\n}\nextra words")).toThrow(/Unexpected token/);
  });

  it("preserves the source-size error as a distinct typed result", () => {
    const result = parseDgmResult("x".repeat(DIAGRAM_LIMITS.sourceBytes + 1));
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("source-too-large");
  });

  it.each(["aws", "azure", "gcp", "cloud-agnostic"] as const)(
    "retains and prints the %s grammar",
    (grammar) => {
      const source = `diagram ${grammar.replace(/-/g, "_")} {
  grammar ${grammar}
  flow lr
  cloud-agnostic.boundary boundary "Boundary"
}`;

      const parsed = parseDgm(source);
      expect(parsed.grammar).toBe(grammar);
      expect(printDgm(parsed)).toContain(`  grammar ${grammar}`);
      expect(parseDgm(printDgm(parsed))).toEqual(parsed);
    },
  );

  it("rejects unsupported grammar values", () => {
    expect(() => parseDgm(`diagram unsupported {
  grammar digitalocean
}`)).toThrow(
      'Invalid grammar "digitalocean"; expected aws, azure, gcp, or cloud-agnostic',
    );
  });

  it("keeps nested logical groups and their children", () => {
    const doc = parseDgm(`diagram nested {
      grammar aws
      group account "Account" {
        step 3
        group storage "Storage" {
          aws.s3 bucket
        }
      }
    }`);

    expect(doc.groups.map((group) => [group.id, group.parent])).toEqual([
      ["account", undefined],
      ["storage", "account"],
    ]);
    expect(doc.groups[0]?.children).toEqual(["storage"]);
    expect(doc.groups[0]?.step).toBe(3);
    expect(doc.groups[0]?.type).toBe("cloud-agnostic.boundary");
    expect(doc.groups[1]?.children).toEqual(["bucket"]);
    expect(doc.resources[0]?.parent).toBe("storage");
    expect(doc.resources[0]?.label.role).toBeUndefined();
    expect(printDgm(doc)).toContain('cloud-agnostic.boundary account "Account" {');
    expect(printDgm(doc)).not.toContain("  group account");
    expect(printDgm(doc)).toContain("aws.s3 bucket\n");
    expect(parseDgm(printDgm(doc))).toEqual(doc);
  });

  it("keeps every canonical cloud-agnostic boundary as an expandable group", () => {
    const expectedKinds = {
      "cloud-agnostic.cloud": "cloud",
      "cloud-agnostic.account": "account",
      "cloud-agnostic.region": "region",
      "cloud-agnostic.zone": "az",
      "cloud-agnostic.network": "vpc",
      "cloud-agnostic.subnet": "subnet",
      "cloud-agnostic.security-group": "logical",
      "cloud-agnostic.cluster": "logical",
      "cloud-agnostic.datacenter": "logical",
      "cloud-agnostic.boundary": "logical",
      "cloud-agnostic.logical": "logical",
      "cloud-agnostic.trust-boundary": "overlay",
    } as const;
    const declarations = Object.keys(expectedKinds)
      .map((type, index) => `  ${type} group${index} "Group ${index}"`)
      .join("\n");

    const parsed = parseDgm(`diagram cloud_groups {
  grammar aws
  flow lr

${declarations}
}`);

    expect(parsed.resources).toHaveLength(0);
    expect(parsed.groups).toHaveLength(Object.keys(expectedKinds).length);
    expect(
      Object.fromEntries(parsed.groups.map((group) => [group.type, group.kind])),
    ).toEqual(expectedKinds);
    expect(parseDgm(printDgm(parsed))).toEqual(parsed);
  });

  it("preserves fixture edges with explicit ids", () => {
    const doc = createAsyncDocsFixture();
    const printed = printDgm(doc);
    const parsed = parseDgm(printed);
    expect(parsed.edges.map((edge) => edge.id)).toEqual(
      doc.edges.map((edge) => edge.id),
    );
  });

  it("assigns stable unique IDs to parallel implicit edges", () => {
    const source = `diagram parallel_edges {
  grammar aws
  generic.custom api "API"
  generic.custom db "DB"
  api -> db { label "read" }
  api -> db { label "write" }
}`;

    const parsed = parseDgm(source);
    expect(parsed.edges.map((edge) => [edge.id, edge.label])).toEqual([
      ["api-db", "read"],
      ["api-db-2", "write"],
    ]);
    expect(parseDgm(printDgm(parsed))).toEqual(parsed);
  });

  it("round-trips the bidirectional connector meaning", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.kind = "bidirectional";

    const parsed = parseDgm(printDgm(doc));
    expect(parsed.edges.find((edge) => edge.id === doc.edges[0]!.id)?.kind).toBe("bidirectional");
  });

  it("round-trips custom service labels", () => {
    const doc = parseDgm(`diagram labels {
  grammar aws
  group shell "Shell" {
    label-position top-right
    aws.sns notice "Claims notification" { service "Amazon SNS" label-position top }
  }
}`);

    expect(doc.groups[0]?.labelPosition).toBe("top-right");
    expect(doc.resources[0]?.label).toEqual({
      service: "Amazon SNS",
      role: "Claims notification",
      position: "top",
    });
    expect(parseDgm(printDgm(doc))).toEqual(doc);
  });

  it("rejects deprecated resource and group label positions", () => {
    expect(() => parseDgm(`diagram old_resource_label {
  grammar aws
  aws.sns notice { label-position right }
}`)).toThrow(/Invalid resource label position right; expected top or bottom/);
    expect(() => parseDgm(`diagram old_group_label {
  grammar aws
  group shell "Shell" { label-position bottom-left }
}`)).toThrow(/Invalid group label position bottom-left; expected top-left or top-right/);
  });

  it("round-trips hidden icons on typed groups", () => {
    const doc = parseDgm(`diagram hidden_icon {
  grammar aws
  cloud-agnostic.boundary boundary "Boundary" { hide-icon }
}`);

    expect(doc.groups[0]?.hideIcon).toBe(true);
    expect(parseDgm(printDgm(doc))).toEqual(doc);
  });

  it("round-trips boundary appearance options", () => {
    const doc = parseDgm(`diagram styled_boundary {
  grammar aws
  cloud-agnostic.boundary platform "Platform" {
    label-position top-right
    style solid
    color purple
    fill none
    step 4
    aws.lambda worker
  }
}`);

    expect(doc.groups[0]).toMatchObject({
      type: "cloud-agnostic.boundary",
      labelPosition: "top-right",
      style: "solid",
      color: "purple",
      fill: "none",
      step: 4,
    });
    expect(parseDgm(printDgm(doc))).toEqual(doc);
  });

  it("round-trips title, labels, sizes, and view metadata", () => {
    const source = `diagram demo {
  grammar aws
  flow lr
  title "Async Docs"

  generic.user client "External Client"

  annotation note1 "Callout" { anchor client }

  client -> api { id e1 label "request" step 1 color teal from e offset 0.25 to w offset 0.75 }
}

view default {
  place client { x 40 y 48 w 120 h 96 pin manual locked z 2 }
  route e1 { point 100 120 point 200 120 pin mode manual badge 0.75 bottom label 0.35 top }
  annotation note1 { x 300 y 80 w 160 h 48 pin visible false }
}`;
    const parsed = parseDgm(source);
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
      color: "teal",
      sourcePort: "e",
      targetPort: "w",
      sourcePortOffset: 0.25,
      targetPortOffset: 0.75,
    });
    const view = getDefaultView(parsed);
    expect(view.places.client).toMatchObject({
      x: 40,
      y: 48,
      w: 120,
      h: 96,
      pin: true,
      manual: true,
      locked: true,
      zIndex: 2,
    });
    expect(view.routes.e1).toMatchObject({
      pin: true,
      mode: "manual",
      badgeT: 0.75,
      badgeSide: "bottom",
      labelT: 0.35,
      labelSide: "top",
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

    const roundTrip = printDgm(parsed);
    const reparsed = parseDgm(roundTrip);
    expect(reparsed).toEqual(parsed);
  });

  it("round-trips authored manual group bounds without changing the hierarchy", () => {
    const source = `diagram manual_group {
  grammar aws
  flow lr

  cloud-agnostic.boundary services "Services" {
    aws.lambda worker
  }
}

view default {
  place services { x 104 y 88 w 216 h 128 pin manual }
}`;

    const parsed = parseDgm(source);
    const printed = printDgm(parsed);
    const reparsed = parseDgm(printed);

    expect(reparsed.groups).toEqual(parsed.groups);
    expect(getDefaultView(reparsed).places.services).toEqual({
      x: 104,
      y: 88,
      w: 216,
      h: 128,
      pin: true,
      manual: true,
    });
    expect(getDefaultView(reparsed).places.services).toEqual(
      getDefaultView(parsed).places.services,
    );
  });

  it("round-trips note style variants", () => {
    const source = `diagram notes {
  grammar aws
  flow lr

  annotation codeNote "const queue = await receive()" { style code }
  annotation textNote "Add a manual label" { style text font serif size 20 align center }
  annotation calloutNote "Keep the worker private" { style callout }
  annotation checklistNote "Review IAM / Run smoke test" { style checklist }
}`;

    const parsed = parseDgm(source);
    expect(parsed.annotations.map((annotation) => annotation.style)).toEqual([
      "code",
      "text",
      "callout",
      "checklist",
    ]);
    expect(parsed.annotations[1]).toMatchObject({
      font: "serif",
      fontSize: 20,
      align: "center",
    });
    expect(parseDgm(printDgm(parsed))).toEqual(parsed);
  });

  it("round-trips quotes, backslashes, unicode, and multiline text", () => {
    const doc = createAsyncDocsFixture();
    doc.title = 'Quoted "title" \\ Żółw';
    doc.groups[0]!.label = 'Group "one" \\ path';
    doc.resources[0]!.label.role = 'Client "A" \\ B';
    doc.annotations.push({ id: "note-special", text: "first\nsecond\t✓" });
    const parsed = parseDgm(printDgm(doc));
    expect(parsed.title).toBe(doc.title);
    expect(parsed.groups.find((group) => group.id === doc.groups[0]!.id)?.label).toBe(doc.groups[0]!.label);
    expect(parsed.resources.find((resource) => resource.id === doc.resources[0]!.id)?.label.role).toBe(doc.resources[0]!.label.role);
    expect(parsed.annotations.find((annotation) => annotation.id === "note-special")?.text).toBe("first\nsecond\t✓");
  });

  it("rejects oversized source and malformed quoted strings", () => {
    expect(() => parseDgm("x".repeat(DIAGRAM_LIMITS.sourceBytes + 1))).toThrow(/1 MiB/);
    expect(() => parseDgm('diagram bad { title "unterminated }')).toThrow(/Unterminated/);
    expect(() => parseDgm('diagram bad { title "bad\\q" }')).toThrow(/Unsupported escape/);
    expect(() => parseDgm("diagram bad {")).toThrow(/Unterminated block/);
    const nested = `diagram nested { ${Array.from({ length: DIAGRAM_LIMITS.hierarchyDepth + 1 }, (_, index) => `aws.region g${index} {`).join(" ")} ${"}".repeat(DIAGRAM_LIMITS.hierarchyDepth + 1)} }`;
    expect(() => parseDgm(nested)).toThrow(/hierarchy depth/);
  });
});
