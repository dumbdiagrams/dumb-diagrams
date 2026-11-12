---
title: The .dgm format
description: The complete syntax reference for .dgm format 1.
seoTitle: Diagram as Code Syntax and DSL Reference
seoDescription: Reference for the .dgm format 1 syntax, including resources, connections, layout, and requirements.
section: Reference
order: 30
---
A `.dgm` file describes what exists and how it connects. It can also carry a
`view`, which records the visual decisions you made in Studio. This page lists
every keyword in format 1.

Each diagram also needs a sibling `<name>.requirements.json` file. Extract its
component, relationship, count, and placement requirements from the request
before authoring `.dgm`; assign stable IDs in the contract and use the same IDs
in the source. Keep the contract beside the diagram during layout changes.
`dumbdiagrams validate` checks completeness against that contract, while
`--strict` also treats routing findings as failures. A passing completeness
check does not establish that the written contract understood the original
request.

## A complete example

```dgm
dgm 1
diagram payments {
  grammar aws
  flow lr
  title "Payments platform"

  cloud-agnostic.actor customer "Customer"

  aws.region region "AWS Region" {
    aws.api-gateway api "Payments API"
    aws.aws-lambda handler "Payment handler"
    aws.dynamodb ledger "Payment ledger"
  }

  customer -> api { id request step 1 }
  api -> handler { id invoke step 2 }
  handler -> ledger { id persist step 3 }
}
```

## File structure

| Part | Required | Meaning |
| --- | --- | --- |
| `dgm 1` | No; a file without it is format 1 | Format version. A newer version than your CLI supports is rejected with an upgrade message. |
| `diagram <id> { … }` | Yes | The architecture: settings, declarations, annotations, and edges |
| `assets { … }` | No | Embedded SVG icons |
| `view <id> { … }` | No | Saved positions, routes, and visibility |

Strings use double quotes and support the `\"`, `\\`, `\n`, `\r`, and `\t`
escapes. IDs start with a letter or `_` and contain letters, digits, `_`, and
`-`.

## Diagram settings

| Keyword | Values |
| --- | --- |
| `grammar` | `aws`, `azure`, `gcp`, `cloud-agnostic`. Selects the provider catalog and its rules. |
| `flow` | `lr` (left to right) or `tb` (top to bottom) |
| `title` | A quoted string |
| `hide-resource-labels` | No value; draws resources as icons only. Labels stay in the source and appear as SVG tooltips. |

## Declarations

A declaration is `<catalog-type> <id> "Label"`. The label is optional. The type
decides whether the item is a resource or a boundary. Boundaries contain
declarations in braces:

```text
aws.region region "AWS Region" {
  aws.aws-lambda handler "Handler" { role secondary }
}
```

Boundaries take these options before their children:

| Option | Values |
| --- | --- |
| `step` | A number shown on the boundary |
| `label-position` | `top-left`, `top-right` |
| `hide-icon` | No value; hides the boundary icon |
| `style` | `solid`, `dashed` |
| `color` | `graphite`, `blue`, `teal`, `purple`, `amber`, `coral`, `red`, `green` |
| `fill` | `subtle`, `none` |

Resources take options in braces after the label:

| Option | Values |
| --- | --- |
| `service` | A quoted service name shown under the label |
| `label-position` | `top`, `bottom` |
| `role` | `primary`, `secondary`, or `border` (sits on the parent's edge) |
| `icon` | The ID of an embedded asset |

Use `cloud-agnostic.boundary` for a logical container without provider
meaning.

## Edges

```text
api -> handler { id invoke label "Store input drawing" step 2 from e to w }
```

With `numberedSteps: true`, the native `step N` field creates the badge and
the label contains only its description. For example,
`label "Store input drawing" step 1` is correct; `label "1. Store input drawing"`
is not a step badge. Validation reports an obvious leading sequence prefix in
an edge label.

| Option | Values |
| --- | --- |
| `id` | Stable edge ID. Saved routes refer to it, so always set one. |
| `label` | A quoted, descriptive-only string; do not prefix it with the step number |
| `step` | A number in the main flow, rendered as the native numbered badge |
| `style` | `solid`, `dashed` |
| `kind` | `flow`, `bidirectional`, `peer`, `fail` |
| `color` | `graphite`, `blue`, `teal`, `purple`, `amber`, `coral`, `red`, `green` |
| `from`, `to` | A side: `n`, `s`, `e`, `w`, optionally followed by `offset 0.25` (an exact point between 0 and 1 along that side) |

## Annotations

```text
annotation note "Retries use exponential backoff" { anchor handler style callout }
```

| Option | Values |
| --- | --- |
| `anchor` | The ID of the item the note points at |
| `style` | `text`, `paper`, `code`, `callout`, `checklist` |
| `font` | `sans`, `serif`, `mono` |
| `size` | 10 to 48 |
| `align` | `left`, `center`, `right` |
| `background` | A quoted hex color, such as `"#feefdd"` |
| `color` | A quoted text color, such as `"#163964"` |

Notes grow to fit their complete text. Set `anchor` to the resource, boundary, or connection the note explains; notes without an authored position are placed nearby with space between them. A note about an area, such as a team or shared layer, anchors to that boundary and lands beside it; don't gather notes into a "Notes" boundary. Resizing a note in Studio keeps its height fitted to its text. Use view annotation placements only when you need a specific position or width. Font, size, alignment, and colors apply to every note style.

## Assets

```text
assets {
  asset logo { svg "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\">…</svg>" w 16 h 16 }
}
```

Each `asset <id>` has `svg` markup and its intrinsic size, `w` and `h`. A resource uses it with `icon <id>`. Assets are
sanitized: scripts, event handlers, external references, and non-standard
namespaces are rejected.

## Views

Studio writes the view for you. Each entry refers to an existing ID:

```text
view default {
  place handler { x 320 y 120 w 96 h 96 pin }
  place cache { visible false }
  route invoke { point 200 160 point 320 160 mode manual pin badge 0.25 top label 0.75 bottom }
  annotation note { x 300 y 80 w 160 h 48 }
}
```

| Entry | Options |
| --- | --- |
| `place <id>` | `x`, `y`, `w`, `h`; `pin`, `manual`, and `locked` (no value); `visible` `true`/`false`; `z` (a number) |
| `route <id>` | Repeated `point <x> <y>`; `mode` `auto`/`manual`; `pin`; `badge <0-1> <side>` and `label <0-1> <side>`, where the side is `top` or `bottom` |
| `annotation <id>` | `x`, `y`, `w`, `h`, `pin` |

## Errors and warnings

Errors stop the diagram from rendering. They include the line and column:

```text
diagram.dgm:3:8: Invalid flow "sideways"; expected lr, tb
```

Warnings render but point at something worth fixing. Provider rules are
specific to each grammar. For example, `managed-service-in-network` flags
DynamoDB inside a VPC, Key Vault inside a VNet, or BigQuery inside a VPC
network, because those managed services sit outside the network. The error
`generic-cloud-boundary` rejects `cloud-agnostic.cloud` in a provider diagram;
use `aws.cloud`, `azure.subscription`, or `gcp.organization` instead.
`dumbdiagrams validate --strict` turns warnings into failures for CI.

## Formatting

`dumbdiagrams format` prints the canonical form: a `dgm 1` header, two-space
indentation, one declaration per line, and options in a fixed order. Studio
saves canonical source too, so diffs stay small. The format has no comments;
put notes in an `annotation` or in the architecture brief beside the file.
