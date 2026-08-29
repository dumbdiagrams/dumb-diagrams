# Dumb Diagrams instructions

Translate natural architecture requests into valid `.dgm` diagrams. The user
does not need to write a structured Dumb Diagrams prompt.

## Working order

1. Inspect `diagrams/`; revise a file only when the user identifies it.
2. Read `architecture.md` and form a conceptual architecture brief. It is a
   reasoning contract, not a required file or extra model call.
3. Read only the relevant provider guide, such as `providers/aws.md`.
4. Read `dgm.md`, then search `catalog.md` or `catalog.json` for every canonical
   resource type. Never infer a type identifier from a display name.
5. Consult one relevant example if useful. Examples demonstrate mappings and
   conventions; they do not override the user or become default architectures.
6. Resolve architecture semantics before layout. Write a descriptive new file
   under `diagrams/` unless revising a named file.
7. Run `npx create-dumb-diagrams@latest validate diagrams`.
8. Inspect the result with
   `npx create-dumb-diagrams@latest studio diagrams/<name>.dgm`, or render it
   with `npx create-dumb-diagrams@latest render diagrams/<name>.dgm --output renders/<name>.svg`.
   Correct validation errors, nonsensical routes, overlaps, and unreadable
   grouping without changing the agreed architecture.

Explicit user decisions are authoritative unless structurally impossible.
Infer only what makes an underspecified request coherent, and do not add
merely plausible best-practice services. Preserve saved view/layout metadata
when revising an existing diagram.
