# Dumb Diagrams instructions

Translate natural architecture requests into valid `.dgm` diagrams. The user
does not need to write a structured Dumb Diagrams prompt.

## Working order

1. Locate the `.dgm` file the user names, or choose a sensible location for a
   new portable source file. For a new diagram, use
   `diagrams/<descriptive-slug>/diagram.dgm` and keep its
   `architecture-brief.md` beside it. If the user names an existing or custom
   flat `.dgm` path, preserve it and place `<stem>.architecture-brief.md`
   beside it unless directed otherwise. Revise an existing file only when the
   user identifies it.
2. Resolve provider intent using the rules below. If clarification is required,
   stop and ask the user before writing or updating either the brief or `.dgm`.
3. Read `architecture.md` and form the concise architecture brief before
   authoring. Persist it in the same change as every new diagram and meaningful
   semantic revision; pure layout or style edits need not rewrite it. This is
   a diagnostic normalization artifact, not an extra model call.
4. Read only the matching provider guide, such as `providers/aws.md`.
5. Read `dgm.md`, then search `catalog.md` or `catalog.json` for every canonical
   resource type. Never infer a type identifier from a display name.
6. Consult one relevant example if useful. Examples demonstrate mappings and
   conventions; they do not override the user or become default architectures.
7. Resolve architecture semantics before layout. Write a descriptive `.dgm`
   source file unless revising a named file.
8. Run `dumbdiagrams validate <path-to-diagram.dgm>` after writing or revising
   the source. Do not report completion or hand the file to the user unless
   validation exits successfully; repair every reported parse, type, and
   containment error first.
9. Open the result with `dumbdiagrams studio` and use Open to choose the `.dgm`
   file. Correct validation errors, nonsensical routes, overlaps, and
   unreadable grouping without changing the agreed architecture.

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

Briefs must use the same shape as the bundled examples: `Goal`, `Explicit
requirements`, `Relationships and containment`, and `Inferred decisions and
exclusions`. Capture the enriched interpretation—not a transcript or hidden
reasoning—and keep explicit and inferred choices distinguishable. Never
persist credentials, secrets, unrelated conversation, or chain-of-thought.
The `.dgm` source remains authoritative; update the brief when its semantic
normalization changes.
