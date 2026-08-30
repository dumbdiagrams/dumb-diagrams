# DGM source and layout

- Start with `diagram <stable-id>`, one `grammar` token, `flow`, and a concise
  `title`. Supported grammar tokens are `aws` (First-class), `azure`
  (Experimental), `gcp` (Experimental), and `cloud-agnostic` (Experimental).
  The grammar is single-provider; it must match the provider choice recorded in
  the architecture brief.
- Use exact canonical types from `catalog.md`/`catalog.json`; the type selects
  the icon and the quoted label changes only display text. Do not guess types
  or use legacy aliases when a canonical type exists.
- Use only catalog types matching the selected grammar, plus cloud-agnostic
  actors and logical boundaries. Do not silently mix provider catalogs.
- Nest resources inside the provider boundaries allowed by the catalog. Use
  `cloud-agnostic.boundary <id> "<label>" { ... }` for logical containers; do
  not author the legacy `group` shorthand or simulate boundaries with icons.
- Use stable, descriptive IDs for resources, boundaries, and important edges.
  Preserve explicit labels and counts.
- Express the primary flow with directed edges. Use concise edge labels and
  `step` for requested or useful numbered stages. Use dashed edges for peer or
  supporting relationships. Add `from`/`to` face hints only when the intended
  attachment is unambiguous and automatic routing needs help.
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
