# Example diagrams

These are read-only secondary references. Canonical instructions live in
`../instructions.md`; examples complement those rules and never override the
user's explicit architecture decisions.

The migrated pilot has four distinct roles:

- `simple-serverless-web-application/user-prompt.md` — a realistic user request.
- `simple-serverless-web-application/architecture-brief.md` — normalized architecture semantics.
- `simple-serverless-web-application/reference-spec.md` — the preserved expert reconstruction specification.
- `simple-serverless-web-application/diagram.dgm` — the unchanged curated source.

The seven examples not yet migrated remain reference pairs under `legacy/`:

- `legacy/prompts/aws-high-availability-web-app.md` + `legacy/aws-high-availability-web-app.dgm`
- `legacy/prompts/aws-data-transfer-hub.md` + `legacy/aws-data-transfer-hub.dgm`
- `legacy/prompts/bedrock-claims-processing.md` + `legacy/bedrock-claims-processing.dgm`
- `legacy/prompts/image-thumbnail-pipeline.md` + `legacy/image-thumbnail-pipeline.dgm`
- `legacy/prompts/asynchronous-report-generation.md` + `legacy/asynchronous-report-generation.dgm`
- `legacy/prompts/event-driven-order-fulfillment.md` + `legacy/event-driven-order-fulfillment.dgm`
- `legacy/prompts/azure-private-app-service.md` + `legacy/azure-private-app-service.dgm`

Those detailed prompts are reconstruction/reference specifications, not a
prompt language users must learn. Read a prompt and `.dgm` as a pair when its
architecture is relevant. Reuse conventions—not architecture—and inspect the
source rather than only its rendered view.

Before authoring:

1. Read `../instructions.md` and only the relevant linked guidance.
2. Read `../../diagrams/README.md` and inspect existing project diagrams.
3. Form the architecture brief before making layout choices.
4. Search `../catalog.md` or `../catalog.json` for exact canonical types.
5. Create a descriptive new file under `../../diagrams/`, unless the user names
   an existing file to revise.
6. Validate and visually inspect the result.

Preserve a reference's stable IDs, nesting, explicit steps, labels, and routing
hints only when those details are part of the requested architecture. Prefer
automatic layout and never copy a direction hint that makes the new route
backtrack.
