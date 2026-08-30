---
title: Welcome to Dumb Diagrams
description: LLM-first architecture diagrams as code, with portable .dgm files, deterministic layout, and a generic local Studio.
section: Start here
order: 0
---
You know the important parts of your architecture: which services exist, where the boundaries are, and what happens when someone makes a request. Putting that understanding on the page should be straightforward.

Dumb Diagrams gives you a readable `.dgm` file to describe the system. The engine places the resources, draws the connections, and checks the result. Studio lets you refine it visually without losing the source.

**New here? [Make your first diagram](./quick-start/).** You need Node.js 24 or newer and a terminal. You do not need an account or a hosted workspace.

If you want to use a coding agent, set it up separately. Codex, Claude Code, Cursor, Antigravity, and open-source alternatives can all work with the project. [Work with an agent](./agent-workflow/) explains how to provide the project context.

## Diagrams as code: the file comes first

A diagram is a normal text file. It describes resources, the groups they belong to, and the connections between them. When you make a visual adjustment in Studio, that decision can be saved in the same file.

Keep `.dgm` files wherever they belong, review changes in Git, and ask a coding
agent to update a diagram when the system changes. Studio is a generic file
editor: use **Open** to select any local file.

## Choose your starting point

| Task | Start here |
| --- | --- |
| Prepare a repository and open Studio | [Quick start](./quick-start/) |
| Ask an agent for a first draft | [Work with an agent](./agent-workflow/) |
| Follow a complete AWS example | [Cross-account data transfer walkthrough](./aws-cross-account-data-transfer/) |
| Understand the source language | [The .dgm format](./source-format/) |
| Move things around and save your work | [Using Studio](./studio/) |
| Put a diagram in a document or review | [Export and share](./exports/) |
| Work on the visual identity or interface | [Brand and interface](./design-system/) |
| Understand what happens inside the engine | [How the engine works](./how-it-works/) |

## Where it fits

Dumb Diagrams takes a defined approach to architecture diagrams. Nested cloud boundaries, service icons, numbered request paths, and right-angle connectors are part of the model. The same source, catalog, and saved view produce the same layout and SVG.

AWS is the first-class provider path. Azure, Google Cloud, and cloud-agnostic authoring are experimental: they use their own catalog icons while currently sharing AWS composition, layout, and routing conventions.

## What it does not do

This is not a freeform illustration tool, a live inventory of your cloud account, or a hosted collaborative whiteboard. The editor is designed for desktop use; around 1280 pixels wide is a comfortable starting point.

Dense diagrams can still need a human decision about a connector. Studio gives you manual routes for those cases. An automatic layout is a first pass, not a claim that every system fits neatly into a rectangle.
