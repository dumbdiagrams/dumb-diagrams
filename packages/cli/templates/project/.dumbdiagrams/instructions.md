# Dumb Diagrams instructions

Translate natural architecture requests into valid `.dgm` diagrams. The user
does not need to write a structured Dumb Diagrams prompt.

## Working order

1. Locate the `.dgm` file the user names, or choose a sensible location for a
   new portable source file. For a new diagram, use
   `diagrams/<descriptive-slug>/diagram.dgm` and keep its
   `architecture-brief.md` and `requirements.json` beside it. For a custom flat
   `.dgm` path, use `<stem>.architecture-brief.md` and
   `<stem>.requirements.json`. Revise an existing file only when identified.
2. Resolve provider intent using the rules below. If clarification is required,
   stop and ask the user before writing or updating either the brief or `.dgm`.
3. Read `architecture.md` and form the concise architecture brief before
   authoring. Persist it in the same change as every new diagram and meaningful
   semantic revision; pure layout or style edits need not rewrite it. This is
   a diagnostic normalization artifact, not an extra model call.
4. Read only the matching provider guide, such as `providers/aws.md`.
5. Read `dgm.md`, then search `catalog.md` or `catalog.json` for every canonical
   resource type. Never infer a type identifier from a display name.
6. Read `requirements.md` and write the requirements contract before the `.dgm`.
   Check it against the prompt: expand "both workers" and similar statements
   into individual components and relationships. Record short prompt evidence
   or an inference rationale. Add `generatedBy` with your model name and
   selected reasoning or thinking level when you know them; omit what you do
   not know.
7. Write the `.dgm` using the contract's component and edge IDs, applying
   the project-root `preferences.json` (see Project preferences below). Run
   `dumbdiagrams validate <path-to-diagram.dgm>` before layout repairs. Fix all
   source, catalog, provider, and completeness failures first.
8. Repair layout without changing requirements, then run normal validation and
   `dumbdiagrams validate --strict <path-to-diagram.dgm>`. Never remove,
   redirect, or leave a requested relationship implicit to eliminate a routing
   warning. An omission recorded in the brief does not satisfy a requirement.
9. Inspect the result in Studio. `dumbdiagrams studio` takes no file path:
   tell the user to run `dumbdiagrams studio`, choose **Open**, and pick the
   `.dgm` file (name its path). After two
   unsuccessful layout-repair attempts, preserve the complete graph and report
   remaining routing findings. Say "architecture complete; routing warnings
   remain" only when normal validation passes. Claim full completion only when
   strict validation and visual review also pass.

## Provider selection

Use exactly one grammar per authored diagram. Select it before forming the
brief:

- Explicit AWS, Amazon Web Services, or an unambiguous AWS service: `aws`
  (First-class).
- Explicit Azure or Microsoft Azure: `azure` (Experimental).
- Explicit GCP, Google Cloud, or Google Cloud Platform: `gcp` (Experimental).
- Explicit cloud-agnostic/provider-neutral language, or no provider signal:
  `cloud-agnostic` (Experimental). Do not ask merely because a provider is
  omitted.

If provider signals conflict, multiple providers are named without clear
multi-cloud intent, or the request is explicitly multi-cloud, stop and ask the
user to choose a provider. For explicit multi-cloud requests, ask how to scope
the request and which provider should be primary; the authored grammar is
single-provider, so never silently mix catalogs. Record the selected provider
in the brief's Goal and in the matching `grammar` line. Use only matching
provider catalog types, plus cloud-agnostic actors and logical boundaries.

Explicit user decisions are authoritative unless structurally impossible.
Infer only what makes an underspecified request coherent, and do not add
merely plausible best-practice services. Preserve saved view/layout metadata
when revising an existing diagram.

## Project preferences

The user's `preferences.json` at the project root (beside `.dumbdiagrams/`)
sets this project's default style, and `dumbdiagrams validate` fails when a
diagram does not follow it. An explicit user request
overrides any value: record that override in the diagram's requirements
contract as `preferences` (for example `{ "numberedSteps": false }`), never by
editing `preferences.json` for one diagram.

- `numberedSteps` (default `true`): give every solid flow arrow a native
  `step N` badge in the order the request or data moves. Keep the edge label
  descriptive only; never put the step number in the label. Steps run from 1
  without gaps; parallel branches may share a number. For example, author
  `client -> store { id save label "Store input drawing" step 1 }`, not
  `client -> store { id save label "1. Store input drawing" }` or
  `client -> store { id save label "1. Store input drawing" step 1 }`.
  Validation rejects a service (other than the flow's starter) that sends a
  step before every numbered arrow into it.
  Leave dashed, peer, and failure connectors unnumbered. When `false`, number
  no edges.
- `edgeLabels` (default `true`): give every connector a short label.
- `resourceLabels` (default `true`): when `false`, add `hide-resource-labels`
  to the diagram header so resources render as icons only. Still give every
  resource its descriptive label; it stays in the source and the SVG tooltip.

## Layout defaults and refinements

For every new diagram, use horizontal left-to-right layout (`flow lr`) unless
the user explicitly requests another direction.
Apply this default to every provider. Keep the primary sequence in that
direction inside nested boundaries too; a matching outer flow alone is not
enough.
Use vertical stacking for parallel branches and supporting resources, not
for successive stages of the main flow.

- Use only minimal provider-required containment; a simple chain needs no
  decorative logical wrapper. Keep resource and edge labels short, without
  repeating service names, and preserve a clean reading order for the main path.
- Keep required response, feedback, and operations relationships explicit even
  when they are secondary or use a secondary connector style. Do not add manual
  coordinates to compensate for engine layout behavior.

When editing an existing diagram, preserve its orientation unless the user
asks to change it. A request to switch orientation authorizes changing the
flow and adjusting saved positions, ports, or manual routes that conflict
with that request. Preserve unrelated view metadata and the architecture's
services, relationships, and labels unless the user also asks to change them.
Changing flow direction changes layout, not grid snapping.

Users can ask for visual refinements in ordinary language: change orientation,
simplify grouping, rename labels, distinguish connector styles, or move
supporting resources away from the main path. Make the requested edit in the
named `.dgm` file, validate it, and inspect the result using the working order
above. Pure visual refinements do not require rewriting the architecture brief.

Briefs must use the shape shown in `diagrams/README.md`: `Goal`, `Explicit
requirements`, `Relationships and containment`, and `Inferred decisions and
exclusions`. Capture the enriched interpretation—not a transcript or hidden
reasoning—and keep explicit and inferred choices distinguishable. Never
persist credentials, secrets, unrelated conversation, or chain-of-thought.
The `.dgm` is the drawn architecture; the requirements contract records the
intended architecture. Update the brief and contract for requested semantic
changes or genuine extraction corrections, explaining corrections in the brief.
Never weaken the contract to make validation pass. Layout-only edits leave it
unchanged. The checker verifies the contract, not natural-language understanding.
