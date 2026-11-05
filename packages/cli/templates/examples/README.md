# Example diagrams

These read-only examples complement the canonical instructions in
`../instructions.md`. They provide patterns to adapt when a user's request
does not specify every detail; they never override the user's architecture.

Each bundle contains five files:

- `user-prompt.md` — a realistic architecture request.
- `architecture-brief.md` — the interpreted requirements and decisions.
- `reference-spec.md` — detailed composition and layout constraints.
- `diagram.dgm` — the portable source.
- `requirements.json` — machine-checkable architecture intent.

New agent-authored diagrams use the `diagrams/<descriptive-slug>/` bundle
documented in `diagrams/README.md`. The brief records architecture decisions
for review; it is not hidden model reasoning and does not replace the source.

Curated examples cover AWS, Azure, GCP, and cloud-agnostic workloads, including
API, asynchronous processing, IoT, and storage patterns. Inspect the provider-
specific folders for a relevant starting point.

Start from `user-prompt.md`, use the brief to understand the intended
normalization, and read `reference-spec.md` when exact composition or layout
constraints matter.

Before authoring:

1. Read `../instructions.md` and only the relevant linked guidance.
2. Inspect any existing `.dgm` source files relevant to the request.
3. Form the architecture brief and requirements contract before layout choices.
4. Search `../catalog.md` or `../catalog.json` for exact canonical types.
5. Create a descriptive new `.dgm` file, unless the user names an existing file
   to revise.
6. Run normal and strict validation, then visually inspect the result.

Reuse conventions—not architecture. Preserve stable IDs, nesting, explicit
steps, labels, or routing hints from a reference only when those details are
part of the requested architecture. Prefer automatic layout and never copy a
direction hint that makes the new route backtrack.
