# Dumb Diagrams project

This directory is a local, source-first diagram project. Every `*.dgm` file
is an independent source of truth. Dumb Diagrams Studio is only a visual
editor for those source files.

## Project structure

```text
diagrams/                                 # writable diagram source folder
diagrams/{{diagramFilePadded}} # starter diagram only
diagrams/<name>.dgm                        # one file per new diagram
diagrams/README.md                         # file policy and naming rules
DUMB_DIAGRAMS.md                         # workflow and source conventions
AGENTS.md / CLAUDE.md                    # pointers for coding agents
examples/README.md                       # style guide and prompt recipe
examples/*.dgm                           # rendered-structure references
examples/prompts/*.md                    # matching natural-language prompts
CATALOG.md                                # searchable human-readable icon catalog
CATALOG.json                             # machine-readable canonical catalog
```

The files under `examples/` are read-only references. Authored diagrams belong
under `diagrams/`; do not edit the examples to satisfy a new request.

## Required reading order

1. Read this file completely.
2. Read `examples/README.md` for the deterministic prompt and source style.
3. Choose the closest matching pair: one file in `examples/prompts/` and its
   corresponding `.dgm` file in `examples/`.
4. When choosing service icons, search `CATALOG.md` or `CATALOG.json` for the
   exact canonical type. Never invent an icon type from a display label.
5. Inspect `diagrams/` before editing. If the user names an existing `.dgm`,
   edit that exact file. Otherwise create a new `diagrams/<name>.dgm` file.
6. Use the closest example pair as a style reference without overwriting it.

## Agent workflow

1. Read `diagrams/README.md` and list the existing files in `diagrams/`.
2. For a new diagram, create a new descriptive `.dgm` file in `diagrams/`;
   do not overwrite `{{diagramFile}}` or another existing file by default.
3. For a requested revision, edit only the named existing file.
4. Run `npx create-dumb-diagrams@latest validate diagrams` to validate every project diagram.
5. Run `npx create-dumb-diagrams@latest studio diagrams/<name>.dgm` to inspect one file,
   or `npx create-dumb-diagrams@latest studio diagrams` to choose a project file.
6. Render a review artifact with `npx create-dumb-diagrams@latest render diagrams/<name>.dgm --output renders/<name>.svg`.

## Source conventions

- Start with `diagram <id>`, `grammar`, `flow`, and `title`.
- Declare actors and resources inside explicit cloud, account, region, network,
  zone, subnet, and logical boundaries.
- Use stable ids for resources, boundaries, and edges. Use exact labels when the
  request specifies them; do not invent plausible services or relationships.
- The resource/boundary type is the icon identity. The quoted label is display
  text only. Use an exact canonical type from `CATALOG.md`; do not use a
  guessed type, a display name, or a legacy alias when a canonical type exists.
- Use `cloud-agnostic.boundary <id> "<label>" { ... }` for every general-purpose
  logical container. It is inherently iconless, fully movable/resizable in
  Studio, and is the only general logical-boundary form agents should author.
- Do not author the legacy `group` shorthand, `cloud-agnostic.logical`,
  `neutral.logical`, or `hide-icon` to simulate a boundary. Those forms exist
  only for reading older documents.
- Boundary options are `label-position top-left|top-right|bottom-left|bottom-right`,
  `style solid|dashed`, `color graphite|blue|teal|purple|amber|red|green`,
  `fill subtle|none`, and `step 0..99`.
- Use `icon ...` only for an explicitly embedded/custom asset. It is not how
  normal AWS, Azure, GCP, or cloud-agnostic catalog icons are selected.
- Number the primary flow with `step` edge metadata. Use `from` and `to` hints
  when the intended connector sides matter, and use dashed peer edges for
  supporting relationships.
- Preserve the document's view and layout information when making semantic
  changes so manual placement survives.
- Prefer automatic layout: do not add a `view` block, manual node positions,
  or manual edge routes unless the request explicitly requires them.
- A new diagram means a new `.dgm` file under `diagrams/`; never silently
  replace an existing diagram with unrelated architecture.

## Prompt recipe

Write requests in this order: title and grammar; composition and hierarchy;
connections and numbered stages; then routing constraints. The reference
prompts in `examples/prompts/` are complete examples of this format.
