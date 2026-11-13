# DGM source and layout

- Start with the `dgm 1` header, then `diagram <stable-id>`, one `grammar` token, `flow`, and a concise
  `title`. Supported grammar tokens are `aws` (First-class), `azure`
  (Experimental), `gcp` (Experimental), and `cloud-agnostic` (Experimental).
  The grammar is single-provider; it must match the provider choice recorded in
  the architecture brief.
- Use exact canonical types from `catalog.md`/`catalog.json`; the type selects
  the icon and the quoted label changes only display text. Do not guess types.
- Use only catalog types matching the selected grammar, plus cloud-agnostic
  actors and logical boundaries. Do not silently mix provider catalogs.
- Nest resources inside the provider boundaries allowed by the catalog. Use
  `cloud-agnostic.boundary <id> "<label>" { ... }` for logical containers; do
  not simulate boundaries with icons.
- Use stable, descriptive IDs for resources and boundaries, and give every
  edge an `id`. Preserve explicit labels and counts.
- The format has no comments. Put notes in an `annotation` or the brief.
- Express the primary flow with directed edges. Use concise, descriptive-only
  edge labels and put each sequence number in the edge's `step N` field, as
  the project-root `preferences.json` directs. Do not prefix labels with their
  step number: `label "Store input drawing" step 1` is correct;
  `label "1. Store input drawing"` is not. Use dashed edges for peer or
  supporting relationships. Add `from`/`to` face hints only when the intended
  attachment is unambiguous and automatic routing needs help.
- Default every new diagram to horizontal left-to-right layout (`flow lr`);
  use `flow tb` only when requested explicitly by the user. Use `flow lr` for
  primary sequential pipelines and order causally sequential children
  left-to-right, including inside nested boundaries. Stack vertically only
  parallel or same-level branches/resources. Preserve an existing diagram's
  orientation unless the user asks to change it.
- Use boundaries to explain containment or meaningful grouping. Avoid wrapping
  every stage in its own logical boundary or stacking sequential stage groups
  into a tall column; keep the main path readable in the requested direction.
- Separate the primary request/data path from IAM, Monitoring, Logging, and
  Telemetry. Put explicitly requested support services in a side/shared
  support boundary and connect them with dashed peer/support edges; keep them
  out of the primary path unless the user describes them as processing stages.
- Prefer automatic layout. Do not add a `view` block, manual node positions, or
  manual routes unless requested or revising an existing manually arranged
  diagram. Preserve existing view, positions, ports, and routes during semantic
  revisions unless they must change for the requested edit.
- Keep boundaries readable and connectors orthogonal, direct, and separated.
  Inspect the render for overlaps, crossings, loops, retraced segments,
  overshoots, and dead ends.

Every new architecture gets a new descriptive portable `.dgm` file; never
silently replace an unrelated diagram. Validation is mandatory, and visual
inspection is required whenever routing or layout changed.

## Syntax reference (format 1)

The parser is strict: an unknown keyword or value is an error reported as
`file:line:col`. `dumbdiagrams format --write <file>` prints canonical source.

```text
dgm 1
diagram <id> { grammar flow title hide-resource-labels annotation <declarations> <edges> }
<type> <id> "Label" { ... }            # boundary or resource, from the catalog
<from> -> <to> { ... }                 # edge
annotation <id> "Text" { ... }
assets { asset <id> { svg "<svg…>" w <n> h <n> } }
view <id> { place <id> { ... }  route <edge-id> { ... }  annotation <id> { ... } }
```

| Block | Keywords and values |
| --- | --- |
| `diagram` | `grammar` `aws`/`azure`/`gcp`/`cloud-agnostic`; `flow` `lr`/`tb`; `title`; `hide-resource-labels` (icons only, per `resourceLabels`) |
| `boundary` | `step`; `label-position` `top-left`/`top-right`; `hide-icon`; `style` `solid`/`dashed`; `color`; `fill` `subtle`/`none` |
| `resource` | `service`; `label-position` `top`/`bottom`; `role` `primary`/`secondary`/`border`; `icon` |
| `edge` | `id`; `label` (description only); `step` (native numbered badge); `style` `solid`/`dashed`; `kind` `flow`/`bidirectional`/`peer`/`fail`; `color`; `from`/`to` `n`/`s`/`e`/`w`, optionally `offset` 0-1 |
| `annotation` | `anchor`; `style` `text`/`paper`/`code`/`callout`/`checklist`; `font` `sans`/`serif`/`mono`; `size` 6 to 96 px (fractional values allowed); `align` `left`/`center`/`right`; `background`/`color` quoted hex colors (`"#feefdd"`) |
| `asset` (inside `assets`) | `svg`; `w`; `h` |
| `place` | `x`, `y`, `w`, `h`; `pin`; `manual`; `locked`; `visible` `true`/`false`; `z` |
| `route` | `point <x> <y>`; `mode` `auto`/`manual`; `pin`; `badge`/`label` `<0-1>` `top`/`bottom` |

Colors are `graphite`, `blue`, `teal`, `purple`, `amber`, `coral`, `red`, `green`.

Notes grow to fit all their text. Anchor each note to the one resource, boundary, or connection it explains; a note about an area (such as a team or shared layer) anchors to that boundary so it lands beside it. Do not create a \"Notes\" boundary or collect notes in one place, and do not author note sizes: notes size themselves to their text and Studio keeps their height fitted when you resize them. Give explanatory notes an `anchor` referencing the resource, boundary, or connection they describe. Omit view annotation coordinates to let Studio and exports place notes nearby without stacking. Author a view position or width only for intentional manual placement; never give multiple notes the same coordinates. Font, size, alignment, and colors apply to all note styles.
