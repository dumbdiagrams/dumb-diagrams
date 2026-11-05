# Diagram bundles

Store new diagrams as a bundle:

```text
diagrams/<descriptive-slug>/
├── diagram.dgm
├── architecture-brief.md
└── requirements.json
```

`architecture-brief.md` records the interpretation of the user's request.
`requirements.json` makes its component, relationship, count, and placement
requirements checkable. Write both before `diagram.dgm`, which describes what
is actually drawn. See `../.dumbdiagrams/requirements.md` for the contract.
Update all three for semantic changes. Pure layout or style edits preserve
the brief and contract.

If a user explicitly names an existing or custom flat `.dgm` path, preserve it
and place `<stem>.architecture-brief.md` and `<stem>.requirements.json` beside it.
Never store credentials, secrets, unrelated conversation, or chain-of-thought.

Run `dumbdiagrams validate <source.dgm>` for validity and completeness, then
`dumbdiagrams validate --strict <source.dgm>` for routing quality. Do not remove
requirements to clear routing findings.

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
