---
title: How the engine works
description: Trace a portable .dgm file through parsing, layout, and rendering in Studio.
section: Under the hood
order: 7
---
The project has three application packages: the runtime, the editor, and the CLI. The website is a separate static package and does not ship as part of the diagram engine.

The model is straightforward: **the file is durable, the runtime understands it, and Studio helps you edit it.**

## One document, six stages

```text
.dgm source
  → parse
  → validate
  → lay out resources and groups
  → route connections
  → check geometry
  → render SVG
```

The parser turns text into a `DiagramDocument`: resources, groups, edges, annotations, optional embedded assets, and views. Validation checks the meaning of that document before the engine tries to draw it.

Layout places and measures the resources. Routing plans connections around that geometry. Invariant checks look for collisions and other problems in the completed picture. Finally, the renderer produces SVG.

Studio follows these stages and adds editor concerns such as snap-to-grid, artboard expansion, browser icon URLs, and a compact compilation cache.

## The runtime owns the diagram

`@dumb-diagrams/runtime` has no React dependency. It is a private workspace
package bundled into the published CLI, not a separately supported npm API.
Its internal subpaths make repository responsibilities visible:

| Subpath | Responsibility |
| --- | --- |
| `core` | Document types, defaults, limits, validation, and port helpers |
| `dsl` | Parsing and canonical printing of .dgm source |
| `catalog` | Provider types, rules, and icon lookup |
| `grammar-aws` | Shared visual conventions; first-class for AWS and currently reused by experimental providers |
| `layout` | Nested group sizes, placement, and authored overrides |
| `route` | Deterministic right-angle connections |
| `render` | Compilation, geometry checks, SVG, and portable assets |

Keeping the model in one place means the editor and CLI do not invent different meanings for the same file.

## Studio owns the editing experience

`@dumb-diagrams/editor` is the React application. It coordinates panels, source editing, canvas interaction, workspace history, persistence, and export actions.

Document mutations live in the editor model. Workspace state owns tabs, undo/redo, and saved state. Interaction modules translate pointer intent into operations such as moving an item or pinning a route. The main UI connects those pieces rather than becoming the home for every rule.

## The CLI provides the local bridge

`create-dumb-diagrams` publishes the `dumbdiagrams` CLI. Its `init` command
creates a project folder for agents, including the convention that
persists each normalized architecture brief beside its diagram; its `studio`
command serves the generic file editor. Studio can open any `.dgm` file
selected by the user and does not infer ownership from the launch directory.

The local server has one narrow role: it serves the compiled editor on loopback.
The browser opens and saves selected files directly when file handles are
available, with file-input and download fallbacks elsewhere.

The published package bundles the runtime, compiled Studio, templates, catalog assets, and buildable corresponding source. Testing only the workspace is not enough: a missing file in the tarball is still a broken consumer experience.

## Why the output is SVG

Studio feels like a canvas because you can pan and zoom, but the diagram itself is an SVG tree. That keeps labels and icons sharp, makes individual items addressable, and lets the CLI and browser share one rendering contract.

PNG, PDF, HTML, and other exports are delivery formats for the same geometry. There is no second layout system hidden inside the export buttons.

Very large diagrams can put pressure on the browser’s document tree. The layout and routing stages are separate from SVG so another renderer remains possible if measurements justify it. Today, SVG provides a direct path from source to screen to a portable file.
