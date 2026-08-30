# Diagram bundles

Store new diagrams as a bundle:

```text
diagrams/<descriptive-slug>/
├── diagram.dgm
└── architecture-brief.md
```

`diagram.dgm` is the authoritative source. `architecture-brief.md` is the
concise, enriched interpretation produced from the user's request before the
diagram is authored. It follows the same format as the bundled examples.
Create or update both files together for new diagrams and meaningful semantic
revisions. Pure layout or style edits do not require a brief rewrite.

If a user explicitly names an existing or custom flat `.dgm` path, preserve it
and place `<stem>.architecture-brief.md` beside it unless directed otherwise.
Never store credentials, secrets, unrelated conversation, or chain-of-thought.

## Brief template

Use this Markdown shape, matching the bundled examples:

```markdown
# Architecture brief

## Goal

<A concise statement of the normalized workload and provider intent.>

## Explicit requirements

- <Requirements stated by the user, including important services and counts.>

## Relationships and containment

- <Directed flows, boundaries, placement, and public/private constraints.>

## Inferred decisions and exclusions

- <Each inferred decision with its rationale.>
- <Excluded services, unresolved choices, and semantic-first layout intent.>
```
