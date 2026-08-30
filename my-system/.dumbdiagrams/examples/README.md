# Example diagrams

These are read-only secondary references. Canonical instructions live in
`../instructions.md`; examples complement those rules and never override the
user's explicit architecture decisions.

Each migrated AWS example has four roles:

- `<name>/user-prompt.md` — a realistic architecture request.
- `<name>/architecture-brief.md` — normalized explicit and inferred semantics.
- `<name>/reference-spec.md` — the preserved expert reconstruction specification.
- `<name>/diagram.dgm` — the unchanged curated source.

Available migrated AWS examples:

- `simple-serverless-web-application/`
- `image-thumbnail-pipeline/`
- `aws-data-transfer-hub/`
- `bedrock-claims-processing/`
- `aws-high-availability-web-app/`
- `asynchronous-report-generation/`
- `event-driven-order-fulfillment/`

Azure is intentionally not migrated in this tranche. Its existing pair remains
under `legacy/prompts/azure-private-app-service.md` and
`legacy/azure-private-app-service.dgm`.

The detailed reference specifications are regression and advanced-documentation
material, not a prompt language users must learn. Start from `user-prompt.md`,
use `architecture-brief.md` to understand the intended normalization, and read
the reference specification only when exact composition or layout constraints
matter.

Before authoring:

1. Read `../instructions.md` and only the relevant linked guidance.
2. Inspect any existing `.dgm` source files relevant to the request.
3. Form the architecture brief before making layout choices.
4. Search `../catalog.md` or `../catalog.json` for exact canonical types.
5. Create a descriptive new `.dgm` file, unless the user names an existing file
   to revise.
6. Validate and visually inspect the result.

Reuse conventions—not architecture. Preserve stable IDs, nesting, explicit
steps, labels, or routing hints from a reference only when those details are
part of the requested architecture. Prefer automatic layout and never copy a
direction hint that makes the new route backtrack.
