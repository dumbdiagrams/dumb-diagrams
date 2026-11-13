import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "../../test-fixtures.js";
import { getDefaultView } from "../core/index.js";
import { DIAGRAM_LIMITS } from "../core/index.js";

import { DGM_FORMAT_VERSION, formatParseError, parseDgmResult, printDgm } from "./index.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();
const parseError = (source: string) => formatParseError(parseDgmResult(source)._unsafeUnwrapErr());

describe("parseDgm / printDgm round-trip", () => {
  it.each([6, 8, 8.5, 13.25, 64, 96])("round-trips custom annotation font size %s for every style", (fontSize) => {
    for (const style of ["text", "paper", "code", "callout", "checklist"]) {
      const doc = parseDgm(`diagram sizes { annotation n "Custom size" { style ${style} size ${fontSize} } }`);
      expect(doc.annotations[0]?.fontSize).toBe(fontSize);
      expect(parseDgm(printDgm(doc)).annotations[0]?.fontSize).toBe(fontSize);
    }
  });

  it.each([0, 5.9, 96.1, 1_000])("rejects annotation font size %s outside the supported range", (fontSize) => {
    expect(parseDgmResult(`diagram sizes { annotation n "Invalid size" { size ${fontSize} } }`).isErr()).toBe(true);
  });

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
      line: 1,
      column: 21,
    });
  });

  it("accepts the supported format version and rejects others", () => {
    expect(parseDgm(`dgm ${DGM_FORMAT_VERSION}\ndiagram versioned {}`).id).toBe("versioned");
    expect(parseDgmResult("dgm 2\ndiagram future {}")._unsafeUnwrapErr()).toEqual({
      code: "invalid-syntax",
      message: "This diagram uses format 2; this dumbdiagrams supports format 1. Upgrade dumbdiagrams.",
      line: 1,
      column: 5,
    });
  });

  it.each([
    ["flow rl", "diagram d {\n  flow rl\n}", '2:8 Invalid flow "rl"; expected lr, tb'],
    [
      "resource option typo",
      "diagram d {\n  aws.aws-lambda fn { rolee secondary }\n}",
      '2:23 Unknown resource option "rolee"; expected service, label-position, role, icon',
    ],
    [
      "edge option typo",
      "diagram d {\n  a -> b { stpe 1 }\n}",
      '2:12 Unknown edge option "stpe"; expected id, label, step, style, kind, color, from, to',
    ],
    [
      "edge style",
      "diagram d {\n  a -> b { style dotted }\n}",
      '2:18 Invalid edge style "dotted"; expected solid, dashed',
    ],
    [
      "edge color",
      "diagram d {\n  a -> b { color pink }\n}",
      '2:18 Invalid edge color "pink"; expected graphite, blue, teal, purple, amber, coral, red, green',
    ],
    [
      "edge kind",
      "diagram d {\n  a -> b { kind flwo }\n}",
      '2:17 Invalid edge kind "flwo"; expected flow, bidirectional, peer, fail',
    ],
    [
      "bare port offset",
      "diagram d {\n  a -> b { from w 0.25 }\n}",
      "2:19 Unknown edge option number 0.25; expected id, label, step, style, kind, color, from, to",
    ],
    ["port side", "diagram d {\n  a -> b { to x }\n}", '2:15 Invalid edge to side "x"; expected n, s, e, w'],
    [
      "group option",
      "diagram d {\n  aws.region r { colour red }\n}",
      '2:18 Unknown group option "colour"; expected step, label-position, hide-icon, style, color, fill, or a nested typed declaration',
    ],
    [
      "group fill",
      "diagram d {\n  aws.region r { fill solid }\n}",
      '2:23 Invalid group fill "solid"; expected subtle, none',
    ],
    [
      "legacy group shorthand",
      'diagram d {\n  group g "G"\n}',
      '2:3 Unknown diagram option "group"; expected grammar, flow, title, hide-resource-labels, annotation, a typed declaration, or an edge',
    ],
    [
      "edge inside a group",
      "diagram d {\n  aws.region r {\n    a -> b\n  }\n}",
      '3:5 Unknown group option "a"; expected step, label-position, hide-icon, style, color, fill, or a nested typed declaration',
    ],
    [
      "annotation size",
      'diagram d {\n  annotation n "N" { size 97 }\n}',
      "2:27 Invalid annotation size 97; expected 6 to 96",
    ],
    [
      "annotation font",
      'diagram d {\n  annotation n "N" { font comic }\n}',
      '2:27 Invalid annotation font "comic"; expected sans, serif, mono',
    ],
    [
      "asset key",
      "diagram d {}\nassets {\n  asset a { width 4 }\n}",
      '3:13 Unknown asset option "width"; expected svg, w, h',
    ],
    [
      "place key",
      "diagram d {}\nview default {\n  place a { left 4 }\n}",
      '3:13 Unknown place option "left"; expected x, y, w, h, pin, manual, locked, visible, z',
    ],
    [
      "place visible",
      "diagram d {}\nview default {\n  place a { visible no }\n}",
      '3:21 Invalid visible "no"; expected true, false',
    ],
    [
      "route mode",
      "diagram d {}\nview default {\n  route e { mode magic }\n}",
      '3:18 Invalid route mode "magic"; expected auto, manual',
    ],
    [
      "route badge side",
      "diagram d {}\nview default {\n  route e { badge 0.5 left }\n}",
      '3:23 Invalid route badge side "left"; expected top, bottom',
    ],
    [
      "view entry",
      "diagram d {}\nview default {\n  edge e {}\n}",
      '3:3 Unknown view option "edge"; expected place, route, annotation',
    ],
    ["truncated block", "diagram d {\n  a -> b {", "2:11 Unterminated block; expected }"],
    ["missing value", "diagram d {\n  title\n}", '3:1 Expected a quoted string, got "}"'],
    ["unexpected character", 'diagram d {\n  title "x" !\n}', '2:13 Unexpected character "!"'],
  ])("rejects %s with its position and allowed values", (_name, source, message) => {
    expect(parseError(source)).toBe(message);
  });

  it("rejects every option of the audit's six-typo diagram instead of dropping it", () => {
    const source = `diagram typo {
  grammar aws
  flow rl
  aws.region region "Region" {
    aws.aws-lambda fn "Handler" { rolee secondary }
    aws.dynamodb db "Ledger"
  }
  fn -> db { stpe 1 style dotted color pink lable "writes" }
}`;
    const first = parseDgmResult(source)._unsafeUnwrapErr();
    expect(formatParseError(first)).toBe('3:8 Invalid flow "rl"; expected lr, tb');
    const fixedFlow = source.replace("flow rl", "flow lr");
    expect(parseError(fixedFlow)).toContain('5:35 Unknown resource option "rolee"');
    const fixedRole = fixedFlow.replace("rolee", "role");
    expect(parseError(fixedRole)).toContain('8:14 Unknown edge option "stpe"');
    expect(parseError(fixedRole.replace("stpe", "step"))).toContain('8:27 Invalid edge style "dotted"');
    expect(parseError(fixedRole.replace("stpe", "step").replace("dotted", "dashed"))).toContain(
      '8:40 Invalid edge color "pink"',
    );
    expect(parseError(fixedRole.replace("stpe", "step").replace("dotted", "dashed").replace("pink", "red"))).toContain(
      '8:44 Unknown edge option "lable"',
    );
  });

  it("does not classify parser defects as invalid syntax", () => {
    const originalPush = Array.prototype.push;
    Array.prototype.push = () => {
      throw new TypeError("parser defect");
    };
    let thrown: unknown;
    try {
      parseDgmResult("diagram safe {}");
    } catch (error) {
      thrown = error;
    } finally {
      Array.prototype.push = originalPush;
    }
    expect(thrown).toBeInstanceOf(TypeError);
  });

  it.each(["diagram truncated { cloud-agnostic.client client {", "diagram truncated { cloud-agnostic.client client"])(
    "returns an error for truncated blocks without fabricating tokens: %s",
    (source) => {
      const result = parseDgmResult(source);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.code).toBe("invalid-syntax");
    },
  );

  it("rejects input without a diagram declaration and trailing top-level tokens", () => {
    expect(parseError("hello world")).toMatch(/Expected diagram declaration/);
    expect(parseError("diagram valid {}\n}\nextra words")).toBe(
      '2:1 Unexpected "}" after diagram; expected assets or view',
    );
  });

  it("preserves the source-size error as a distinct typed result", () => {
    const result = parseDgmResult("x".repeat(DIAGRAM_LIMITS.sourceBytes + 1));
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe("source-too-large");
  });

  it.each(["aws", "azure", "gcp", "cloud-agnostic"] as const)("retains and prints the %s grammar", (grammar) => {
    const source = `diagram ${grammar.replace(/-/g, "_")} {
  grammar ${grammar}
  flow lr
  cloud-agnostic.boundary boundary "Boundary"
}`;

    const parsed = parseDgm(source);
    expect(parsed.grammar).toBe(grammar);
    expect(printDgm(parsed)).toContain(`  grammar ${grammar}`);
    expect(parseDgm(printDgm(parsed))).toEqual(parsed);
  });

  it("rejects unsupported grammar values", () => {
    expect(
      parseError(`diagram unsupported {
  grammar digitalocean
}`),
    ).toBe('2:11 Invalid grammar "digitalocean"; expected aws, azure, gcp, cloud-agnostic');
  });

  it("keeps nested logical groups and their children", () => {
    const doc = parseDgm(`diagram nested {
      grammar aws
      cloud-agnostic.boundary account "Account" {
        step 3
        cloud-agnostic.boundary storage "Storage" {
          aws.simple-storage-service bucket
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
    expect(printDgm(doc)).toContain("aws.simple-storage-service bucket\n");
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
    expect(Object.fromEntries(parsed.groups.map((group) => [group.type, group.kind]))).toEqual(expectedKinds);
    expect(parseDgm(printDgm(parsed))).toEqual(parsed);
  });

  it("preserves fixture edges with explicit ids", () => {
    const doc = createAsyncDocsFixture();
    const printed = printDgm(doc);
    const parsed = parseDgm(printed);
    expect(parsed.edges.map((edge) => edge.id)).toEqual(doc.edges.map((edge) => edge.id));
  });

  it("assigns stable unique IDs to parallel implicit edges", () => {
    const source = `diagram parallel_edges {
  grammar aws
  cloud-agnostic.server api "API"
  cloud-agnostic.server db "DB"
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

  it("round-trips dotted resource IDs used as edge endpoints", () => {
    const doc = parseDgm(`diagram dotted_id {
  grammar aws
  cloud-agnostic.server api.v1 "API"
  cloud-agnostic.server db "Database"
  api.v1 -> db { label "query" }
}`);

    expect(parseDgm(printDgm(doc))).toEqual(doc);
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
  cloud-agnostic.boundary shell "Shell" {
    label-position top-right
    aws.simple-notification-service notice "Claims notification" { service "Amazon SNS" label-position top }
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
    expect(
      parseError(`diagram old_resource_label {
  grammar aws
  aws.simple-notification-service notice { label-position right }
}`),
    ).toBe('3:59 Invalid resource label-position "right"; expected top, bottom');
    expect(
      parseError(`diagram old_group_label {
  grammar aws
  cloud-agnostic.boundary shell "Shell" { label-position bottom-left }
}`),
    ).toBe('3:58 Invalid group label-position "bottom-left"; expected top-left, top-right');
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
    aws.aws-lambda worker
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

  cloud-agnostic.actor client "External Client"

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
    aws.aws-lambda worker
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
    expect(getDefaultView(reparsed).places.services).toEqual(getDefaultView(parsed).places.services);
  });

  it("rejects a second view instead of merging authored placements", () => {
    expect(
      parseError(`diagram multiple_views {
  grammar aws
  cloud-agnostic.server service "Service"
}
view first { place service { x 100 y 100 pin } }
view second { place service { x 500 y 500 pin } }`),
    ).toMatch(/Only one view block is supported/);
  });

  it("preserves prototype-key placement IDs as own properties", () => {
    const parsed = parseDgm(`diagram reserved_key {
  grammar aws
  cloud-agnostic.server __proto__ "Reserved"
}
view default { place __proto__ { x 120 y 80 pin } }`);

    expect(Object.hasOwn(getDefaultView(parsed).places, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(getDefaultView(parsed).places, "__proto__")?.value).toMatchObject({
      x: 120,
      y: 80,
      pin: true,
    });
    const printed = printDgm(parsed);
    expect(printed).toContain("place __proto__");
    expect(parseDgm(printed)).toEqual(parsed);
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
    expect(parsed.annotations.map((annotation) => annotation.style)).toEqual(["code", "text", "callout", "checklist"]);
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
    expect(parsed.resources.find((resource) => resource.id === doc.resources[0]!.id)?.label.role).toBe(
      doc.resources[0]!.label.role,
    );
    expect(parsed.annotations.find((annotation) => annotation.id === "note-special")?.text).toBe("first\nsecond\t✓");
  });

  it("rejects oversized source and malformed quoted strings", () => {
    expect(parseError("x".repeat(DIAGRAM_LIMITS.sourceBytes + 1))).toMatch(/1 MiB/);
    expect(parseError('diagram bad { title "unterminated }')).toMatch(/Unterminated/);
    expect(parseError('diagram bad { title "bad\\q" }')).toMatch(/Unsupported escape/);
    expect(parseError("diagram bad {")).toMatch(/Unterminated block/);
    const nested = `diagram nested { ${Array.from({ length: DIAGRAM_LIMITS.hierarchyDepth + 1 }, (_, index) => `aws.region g${index} {`).join(" ")} ${"}".repeat(DIAGRAM_LIMITS.hierarchyDepth + 1)} }`;
    expect(parseError(nested)).toMatch(/hierarchy depth/);
  });
});
