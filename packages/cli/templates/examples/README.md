# Example diagrams

These read-only examples complement the canonical instructions in
`../instructions.md`. They provide patterns to adapt when a user's request
does not specify every detail; they never override the user's architecture.

Each bundle contains four files:

- `user-prompt.md` — a realistic architecture request.
- `architecture-brief.md` — the interpreted requirements and decisions.
- `reference-spec.md` — detailed composition and layout constraints.
- `diagram.dgm` — the portable source.

New agent-authored diagrams use the `diagrams/<descriptive-slug>/` bundle
documented in `diagrams/README.md`. The brief records architecture decisions
for review; it is not hidden model reasoning and does not replace the source.

Ten curated examples are included: seven AWS, one Azure, one GCP, and one
cloud-agnostic.

- `simple-serverless-web-application/`, `image-thumbnail-pipeline/`,
  `aws-data-transfer-hub/`, `bedrock-claims-processing/`,
  `aws-high-availability-web-app/`, `asynchronous-report-generation/`,
  `event-driven-order-fulfillment/` (AWS)
- `azure-private-app-service/` (Azure)
- `gcp-streaming-analytics/` (GCP)
- `cloud-agnostic-order-processing/` (cloud-agnostic)

Start from `user-prompt.md`, use the brief to understand the intended
normalization, and read `reference-spec.md` when exact composition or layout
constraints matter.

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
